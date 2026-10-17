/**
 * Metro, configured for the monorepo.
 *
 * The app imports `@mirror/ui` from the workspace, which lives outside this
 * package. Metro must watch the repository root and resolve node_modules from
 * both levels; hierarchical lookup is disabled so a stray nested copy of react
 * cannot produce two Reacts in one bundle.
 */
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');
const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
