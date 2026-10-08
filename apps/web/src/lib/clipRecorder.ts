/**
 * Rolling video buffer in the browser (PRD §24 "Rolling Video Buffer", §10 step 6).
 *
 * LiveKit Egress isn't available, so the client that is already playing the stream records it.
 * Two MediaRecorders run staggered by PERIOD_MS, each living LIFETIME_MS, so at any instant one
 * of them began at least PRE_MS ago. capture(T) extends that recorder until T + POST_MS and
 * resolves with the recording plus the [T-15s, T+20s] offsets inside it; the server stores the
 * trim as a media fragment (#t=start,end) that the existing players already understand.
 */
const PRE_MS = 15_000;
const POST_MS = 20_000;
const PERIOD_MS = 15_000;
const LIFETIME_MS = 30_000;
const MAX_BYTES = 15_500_000; // server body limit is 16MB

export interface CapturedClip {
  blob: Blob;
  startSec: number;
  endSec: number;
}

interface Rec {
  recorder: MediaRecorder;
  startedAt: number;
  stopAt: number;
  done: Promise<Blob>;
}

function pickMimeType(): string {
  const options = ["video/webm;codecs=vp8,opus", "video/webm", "video/mp4"];
  return options.find((type) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) ?? "";
}

/** The stream's on-screen video plus whatever room audio is playing. */
function sourceStream(root: HTMLElement | null): MediaStream | null {
  const video = root?.querySelector("video");
  if (!video) return null;
  const tracks: MediaStreamTrack[] = [];
  const src = video.srcObject instanceof MediaStream ? video.srcObject : (video as any).captureStream?.() as MediaStream | undefined;
  src?.getVideoTracks().forEach((track) => track.readyState === "live" && tracks.push(track));
  if (!tracks.length) return null;
  document.querySelectorAll("audio").forEach((audio) => {
    if (audio.srcObject instanceof MediaStream) audio.srcObject.getAudioTracks().forEach((track) => track.readyState === "live" && tracks.push(track));
  });
  return new MediaStream(tracks);
}

export class ClipRecorder {
  private recs: Rec[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly mimeType = pickMimeType();

  constructor(private readonly getRoot: () => HTMLElement | null) {}

  static supported(): boolean {
    return typeof MediaRecorder !== "undefined" && pickMimeType() !== "";
  }

  start() {
    if (this.timer || !ClipRecorder.supported()) return;
    this.timer = setInterval(() => this.manage(), 1000);
    this.manage();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const rec of this.recs) if (rec.recorder.state !== "inactive") rec.recorder.stop();
    this.recs = [];
  }

  /** Clip around `at` (epoch ms, default now). Resolves once the post-roll has been recorded. */
  capture(at = Date.now()): Promise<CapturedClip> | null {
    const live = this.recs.filter((rec) => rec.recorder.state === "recording");
    if (!live.length) return null;
    // Latest recorder that already holds the full pre-roll; else the oldest (shorter pre-roll).
    const full = live.filter((rec) => rec.startedAt <= at - PRE_MS).sort((a, b) => b.startedAt - a.startedAt)[0];
    const rec = full ?? live.sort((a, b) => a.startedAt - b.startedAt)[0]!;
    rec.stopAt = Math.max(rec.stopAt, at + POST_MS);
    return rec.done.then((blob) => {
      if (blob.size === 0 || blob.size > MAX_BYTES) throw new Error("clip-size");
      return {
        blob,
        startSec: Math.max(0, (at - PRE_MS - rec.startedAt) / 1000),
        endSec: Math.max(1, (at + POST_MS - rec.startedAt) / 1000),
      };
    });
  }

  private manage() {
    const now = Date.now();
    for (const rec of this.recs) if (now >= rec.stopAt && rec.recorder.state === "recording") rec.recorder.stop();
    this.recs = this.recs.filter((rec) => rec.recorder.state !== "inactive");
    const newest = Math.max(0, ...this.recs.map((rec) => rec.startedAt));
    if (now - newest >= PERIOD_MS) this.spawn(now);
  }

  private spawn(now: number) {
    const stream = sourceStream(this.getRoot());
    if (!stream) return;
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, { mimeType: this.mimeType, videoBitsPerSecond: 1_000_000, audioBitsPerSecond: 64_000 });
    } catch {
      return;
    }
    const chunks: Blob[] = [];
    const rec: Rec = {
      recorder,
      startedAt: now,
      stopAt: now + LIFETIME_MS,
      done: new Promise<Blob>((resolve) => {
        recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
        recorder.onstop = () => resolve(new Blob(chunks, { type: this.mimeType.split(";")[0] }));
      }),
    };
    recorder.onstart = () => { rec.startedAt = Date.now(); };
    rec.done.catch(() => {});
    recorder.start(1000);
    this.recs.push(rec);
  }
}
