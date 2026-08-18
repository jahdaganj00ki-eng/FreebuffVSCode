// Central version reference for FreebuffVSIX.
// Loaded from package.json at build time. Kept as a const so the
// bundle does not depend on a runtime fs read in the extension host.

export const EXTENSION_VERSION = '0.7.0';
export const EXTENSION_NAME = 'Freebuff';
export const EXTENSION_PUBLISHER = 'freebuff-local';

export const CLI_PACKAGE_NAME = 'freebuff';
export const CLI_MIN_NODE_MAJOR = 18;
export const CLI_RECOMMENDED_INSTALL = 'npm install -g freebuff';
