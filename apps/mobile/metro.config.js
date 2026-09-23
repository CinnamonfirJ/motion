// Metro config for a pnpm monorepo (Expo SDK 57). Watch the repo root and resolve both the
// app's node_modules and the workspace root, while letting Metro walk pnpm's nested store to
// find transitive deps (e.g. @react-navigation/core). Symlink resolution stays enabled so
// pnpm's isolated layout works.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];
// Expo SDK 57 enables package exports and symlink support by default. Privy's dependencies
// still need targeted conditions for packages whose export maps are not React Native-safe.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "isows" || moduleName.startsWith("zustand")) {
    const next = { ...context, unstable_enablePackageExports: false };
    return next.resolveRequest(next, moduleName, platform);
  }
  if (moduleName === "jose") {
    const next = { ...context, unstable_conditionNames: ["browser"] };
    return next.resolveRequest(next, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
