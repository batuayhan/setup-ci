#!/usr/bin/env node

/**
 * Syncs config files from @neron/setup-ci templates to the project.
 * Runs automatically on npm install/update (postinstall hook).
 * Can also be run manually: npx setup-ci-sync
 */

const fs = require('fs');
const path = require('path');

// Walk up from node_modules/@neron/setup-ci to find project root
let CWD = process.env.INIT_CWD || process.cwd();
// If running from node_modules, go up to project root
if (CWD.includes('node_modules')) {
  CWD = CWD.split('node_modules')[0].replace(/\/+$/, '');
}

const TEMPLATES = path.join(__dirname, '..', 'templates');

// Files that are ALWAYS synced (owned by setup-ci)
const MANAGED_FILES = [
  '.gitleaks.toml',
  '.github/workflows/ci.yml',
  '.github/workflows/release.yml',
  '.github/dependabot.yml',
  '.husky/pre-commit',
  '.husky/pre-push',
  '.husky/post-merge',
  '.maestro/smoke.yaml',
  '.maestro/onboarding.yaml',
  'scripts/generate-icons.js',
  'scripts/generate-store-metadata.js',
  'scripts/generate-store-visuals.js',
  'scripts/generate-screenshots.js',
  'scripts/setup-revenuecat.js',
  'scripts/check-i18n.js',
];

// Files that are only created if they DON'T exist (user may customize)
const INIT_ONLY_FILES = ['.eslintrc.js', '.prettierrc', '.prettierignore', 'jest.config.js'];

function copyTemplate(src, dest, overwrite = true) {
  const destPath = path.join(CWD, dest || src);
  const srcPath = path.join(TEMPLATES, src);
  if (!fs.existsSync(srcPath)) return false;
  if (!overwrite && fs.existsSync(destPath)) return false;
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.copyFileSync(srcPath, destPath);
  return true;
}

const isPostInstall = process.env.npm_lifecycle_event === 'postinstall';
const isVerbose = process.argv.includes('--verbose') || !isPostInstall;

let synced = 0;
let skipped = 0;

// Always sync managed files
for (const file of MANAGED_FILES) {
  if (copyTemplate(file)) {
    synced++;
    if (isVerbose) console.log(`  \x1b[32m✓\x1b[0m ${file}`);
  }
}

// Init-only files (don't overwrite user customizations)
for (const file of INIT_ONLY_FILES) {
  if (copyTemplate(file, file, false)) {
    synced++;
    if (isVerbose) console.log(`  \x1b[32m✓\x1b[0m ${file} (created)`);
  } else {
    skipped++;
    if (isVerbose) console.log(`  \x1b[33m~\x1b[0m ${file} (kept existing)`);
  }
}

if (isVerbose) {
  console.log(`\n\x1b[32m✓\x1b[0m setup-ci sync: ${synced} files synced, ${skipped} kept existing`);
} else if (synced > 0) {
  console.log(`\x1b[32m✓\x1b[0m @neron/setup-ci: ${synced} config files synced`);
}
