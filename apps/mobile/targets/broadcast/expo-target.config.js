/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: "broadcast-upload",
  name: "EnnoiaBroadcast",
  displayName: "ENNOIA Screen Share",
  bundleIdentifier: ".broadcast",
  deploymentTarget: "15.1",
  exportJs: false,
  entitlements: {
    "com.apple.security.application-groups": [`group.${config.ios.bundleIdentifier}`],
  },
});
