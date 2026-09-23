const base = require("./app.json").expo;

module.exports = () => {
  const relyingParty = process.env.EXPO_PUBLIC_PRIVY_RELYING_PARTY || "https://ennoia.app";
  const host = new URL(relyingParty).hostname;
  return {
    ...base,
    ios: {
      ...base.ios,
      associatedDomains: [`webcredentials:${host}`],
      infoPlist: {
        NSCameraUsageDescription: "ENNOIA uses your camera when you choose to host a live stream.",
        NSMicrophoneUsageDescription: "ENNOIA uses your microphone when you choose to host a live stream.",
      },
    },
    android: {
      ...base.android,
      permissions: ["CAMERA", "RECORD_AUDIO", "INTERNET"],
      intentFilters: [{
        action: "VIEW",
        autoVerify: true,
        data: [{ scheme: "https", host }],
        category: ["BROWSABLE", "DEFAULT"],
      }],
    },
  };
};
