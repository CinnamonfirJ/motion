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
// Do NOT disable hierarchical lookup: Metro must be able to walk into pnpm's .pnpm store to
// resolve a package's own dependencies (transitive deps). Keep symlink resolution on.
config.resolver.unstable_enableSymlinks = true;
config.resolver.unstable_enablePackageExports = true;

module.exports = config;
