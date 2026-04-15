/**
 * standard-version custom updater for ui/src/app/version.ts.
 *
 * standard-version's built-in updaters handle JSON (package.json) and
 * plaintext. For a TypeScript file with a single `export const APP_VERSION`
 * line, we supply read/write hooks that pattern-match the version literal.
 *
 * Wired up via .versionrc "bumpFiles".
 */

const VERSION_RE = /(APP_VERSION\s*=\s*['"])([^'"]+)(['"])/;

module.exports.readVersion = function readVersion(contents) {
  const match = contents.match(VERSION_RE);
  if (!match) {
    throw new Error('version-updater: could not find APP_VERSION literal');
  }
  return match[2];
};

module.exports.writeVersion = function writeVersion(contents, version) {
  return contents.replace(VERSION_RE, `$1${version}$3`);
};
