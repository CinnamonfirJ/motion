const base = require("./app.json").expo;

module.exports = () => {
  const relyingParty = process.env.EXPO_PUBLIC_PRIVY_RELYING_PARTY || "https://ennoia.app";
  const host = new URL(relyingParty).hostname;
  const bundleId = base.ios.bundleIdentifier;
  const appGroup = `group.${bundleId}`;
  return {
    ...base,
    ios: {
      ...base.ios,
      associatedDomains: [`webcredentials:${host}`],
      entitlements: {
        ...base.ios.entitlements,
        "com.apple.security.application-groups": [appGroup],
      },
      infoPlist: {
        ...base.ios.infoPlist,
        NSCameraUsageDescription: "ENNOIA uses your camera when you choose to host a live stream.",
        NSMicrophoneUsageDescription: "ENNOIA uses your microphone when you choose to host a live stream.",
        RTCAppGroupIdentifier: appGroup,
        RTCScreenSharingExtension: `${bundleId}.broadcast`,
        UIBackgroundModes: ["audio", "voip"],
      },
    },
    android: {
      ...base.android,
      permissions: ["CAMERA", "RECORD_AUDIO", "INTERNET", "FOREGROUND_SERVICE", "FOREGROUND_SERVICE_MEDIA_PROJECTION"],
      intentFilters: [{
        action: "VIEW",
        autoVerify: true,
        data: [{ scheme: "https", host }],
        category: ["BROWSABLE", "DEFAULT"],
      }],
    },
  };
};
