import Foundation
import ReplayKit
import CoreImage
import CoreMedia
import CFNetwork
import ImageIO
import Darwin

// LiveKit's React Native WebRTC capturer listens for JPEG frames on this App Group socket.
// The framing protocol and Darwin notification names are documented by its upstream
// iOS screen-sharing integration: https://jitsi.github.io/handbook/docs/dev-guide/dev-guide-ios-sdk/#screen-sharing-integration
private final class BroadcastSocket {
  private let path: String
  private var descriptor: Int32 = -1

  init(path: String) { self.path = path }

  func connect() -> Bool {
    guard descriptor < 0, FileManager.default.fileExists(atPath: path) else { return descriptor >= 0 }
    var address = sockaddr_un()
    address.sun_family = sa_family_t(AF_UNIX)
    let capacity = MemoryLayout.size(ofValue: address.sun_path)
    guard path.utf8.count < capacity else { return false }
    withUnsafeMutablePointer(to: &address.sun_path.0) { pointer in
      path.withCString { source in _ = strncpy(pointer, source, capacity - 1) }
    }
    let socket = Darwin.socket(AF_UNIX, SOCK_STREAM, 0)
    guard socket >= 0 else { return false }
    var noSignal: Int32 = 1
    _ = setsockopt(socket, SOL_SOCKET, SO_NOSIGPIPE, &noSignal, socklen_t(MemoryLayout<Int32>.size))
    let result = withUnsafePointer(to: &address) { pointer in
      pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) {
        Darwin.connect(socket, $0, socklen_t(MemoryLayout<sockaddr_un>.size))
      }
    }
    guard result == 0 else { Darwin.close(socket); return false }
    descriptor = socket
    return true
  }

  func send(_ payload: Data) -> Bool {
    guard descriptor >= 0 else { return false }
    return payload.withUnsafeBytes { bytes in
      guard let base = bytes.baseAddress else { return false }
      var offset = 0
      while offset < bytes.count {
        let written = Darwin.send(descriptor, base.advanced(by: offset), bytes.count - offset, 0)
        if written <= 0 { return false }
        offset += written
      }
      return true
    }
  }

  func close() {
    if descriptor >= 0 { Darwin.close(descriptor); descriptor = -1 }
  }
}

class SampleHandler: RPBroadcastSampleHandler {
  private let queue = DispatchQueue(label: "com.ennoia.broadcast.frames", qos: .userInitiated)
  private let imageContext = CIContext(options: nil)
  private let stateLock = NSLock()
  private var socket: BroadcastSocket?
  private var frameNumber = 0
  private var framePending = false
  private var stopped = false

  private var socketPath: String? {
    guard let bundleId = Bundle.main.bundleIdentifier else { return nil }
    let appBundleId = bundleId.components(separatedBy: ".").dropLast().joined(separator: ".")
    guard let container = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: "group.\(appBundleId)") else { return nil }
    return container.appendingPathComponent("rtc_SSFD").path
  }

  private func notify(_ name: String) {
    CFNotificationCenterPostNotification(
      CFNotificationCenterGetDarwinNotifyCenter(),
      CFNotificationName(rawValue: name as CFString), nil, nil, true
    )
  }

  private func isStopped() -> Bool {
    stateLock.lock(); defer { stateLock.unlock() }
    return stopped
  }

  private func setPending(_ value: Bool) {
    stateLock.lock(); framePending = value; stateLock.unlock()
  }

  private func claimFrame() -> Bool {
    stateLock.lock(); defer { stateLock.unlock() }
    if stopped || framePending { return false }
    framePending = true
    return true
  }

  override func broadcastStarted(withSetupInfo setupInfo: [String: NSObject]?) {
    stateLock.lock(); stopped = false; framePending = false; stateLock.unlock()
    frameNumber = 0
    guard let path = socketPath else {
      finishBroadcastWithError(NSError(domain: "com.ennoia.broadcast", code: 1,
        userInfo: [NSLocalizedDescriptionKey: "Screen-share App Group is unavailable."]))
      return
    }
    notify("iOS_BroadcastStarted")
    queue.async { [weak self] in
      guard let self else { return }
      let connection = BroadcastSocket(path: path)
      for _ in 0..<100 {
        if self.isStopped() { return }
        if connection.connect() { self.socket = connection; return }
        Thread.sleep(forTimeInterval: 0.1)
      }
      DispatchQueue.main.async { [weak self] in
        self?.finishBroadcastWithError(NSError(domain: "com.ennoia.broadcast", code: 2,
          userInfo: [NSLocalizedDescriptionKey: "Could not connect screen sharing to the live room."]))
      }
    }
  }

  override func processSampleBuffer(_ sampleBuffer: CMSampleBuffer, with sampleBufferType: RPSampleBufferType) {
    guard sampleBufferType == .video else { return } // Microphone is published by LiveKit separately.
    frameNumber += 1
    guard frameNumber % 3 == 0, claimFrame() else { return }
    queue.async { [weak self] in
      guard let self else { return }
      defer { self.setPending(false) }
      guard !self.isStopped(), let socket = self.socket,
            let frame = self.encode(sampleBuffer), socket.send(frame) else {
        if !self.isStopped(), self.socket != nil {
          DispatchQueue.main.async { [weak self] in
            self?.finishBroadcastWithError(NSError(domain: "com.ennoia.broadcast", code: 3,
              userInfo: [NSLocalizedDescriptionKey: "Screen sharing stopped because the live room disconnected."]))
          }
        }
        return
      }
    }
  }

  private func encode(_ sample: CMSampleBuffer) -> Data? {
    guard let buffer = CMSampleBufferGetImageBuffer(sample) else { return nil }
    let sourceWidth = CVPixelBufferGetWidth(buffer)
    let sourceHeight = CVPixelBufferGetHeight(buffer)
    let scale = min(1.0, 1280.0 / Double(max(sourceWidth, sourceHeight)))
    let width = Int(Double(sourceWidth) * scale)
    let height = Int(Double(sourceHeight) * scale)
    let image = CIImage(cvPixelBuffer: buffer).transformed(by: CGAffineTransform(scaleX: CGFloat(scale), y: CGFloat(scale)))
    let quality = CIImageRepresentationOption(rawValue: kCGImageDestinationLossyCompressionQuality as String)
    guard let jpeg = imageContext.jpegRepresentation(of: image, colorSpace: CGColorSpaceCreateDeviceRGB(),
      options: [quality: 0.72]) else { return nil }
    let orientation = (CMGetAttachment(sample, key: RPVideoSampleOrientationKey as CFString,
      attachmentModeOut: nil) as? NSNumber)?.intValue ?? 0
    let message = CFHTTPMessageCreateResponse(nil, 200, nil, kCFHTTPVersion1_1).takeRetainedValue()
    CFHTTPMessageSetHeaderFieldValue(message, "Content-Length" as CFString, "\(jpeg.count)" as CFString)
    CFHTTPMessageSetHeaderFieldValue(message, "Buffer-Width" as CFString, "\(width)" as CFString)
    CFHTTPMessageSetHeaderFieldValue(message, "Buffer-Height" as CFString, "\(height)" as CFString)
    CFHTTPMessageSetHeaderFieldValue(message, "Buffer-Orientation" as CFString, "\(orientation)" as CFString)
    CFHTTPMessageSetBody(message, jpeg as CFData)
    guard let serialized = CFHTTPMessageCopySerializedMessage(message) else { return nil }
    return serialized.takeRetainedValue() as Data
  }

  override func broadcastFinished() {
    stateLock.lock(); stopped = true; stateLock.unlock()
    notify("iOS_BroadcastStopped")
    queue.async { [weak self] in self?.socket?.close(); self?.socket = nil }
  }
}
