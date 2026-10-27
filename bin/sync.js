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

// Per-repo opt-out. A repo that owns one of the managed files itself (a self-hosted runs-on, a hardened hook, its own
// dependabot ignores) lists it in its package.json and the sync leaves it alone:
//
//   "setupCi": { "skip": [".github/workflows/ci.yml", ".husky/pre-push"] }
//
// Nothing changes for a repo that sets nothing. A skip is never silent (one line per skipped file, also in postinstall
// mode); an entry that names no managed file is reported; and a setting that cannot be read -- a package.json that does
// not parse, a skip that is not a list of paths -- fails CLOSED: no managed file is written at all, because guessing
// "sync everything" is what overwrites a repo's own files.
// Retired files: setup-ci no longer ships them (founder rule 2026-10-27: no Dependabot version updates, they run as
// Actions jobs). The sync deletes one only when its content is byte-identical to a version setup-ci itself once
// wrote (templates/retired/); a file the repo edited is its own and is left, with a note. setupCi.skip still works.
const RETIRED = { '.github/dependabot.yml': ['dependabot-1.0.x.yml', 'dependabot-1.1.x.yml', 'dependabot-1.2.0.yml'] };
const MANAGED_SET = new Set([...MANAGED_FILES, ...Object.keys(RETIRED)]);

function loadSkip() {
  const pkgPath = path.join(CWD, 'package.json');
  if (!fs.existsSync(pkgPath)) return { skip: new Set(), problems: [] };
  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  } catch (e) {
    return { invalid: `package.json cannot be read (${e.message}), so setupCi.skip is unknown` };
  }
  const cfg = pkg && typeof pkg === 'object' ? pkg.setupCi : undefined;
  if (cfg === undefined) return { skip: new Set(), problems: [] };
  if (cfg === null || typeof cfg !== 'object' || Array.isArray(cfg)) return { invalid: 'setupCi must be an object like { "skip": [...] }' };
  if (cfg.skip === undefined) return { skip: new Set(), problems: [] };
  if (!Array.isArray(cfg.skip) || cfg.skip.some((e) => typeof e !== 'string' || e === '')) {
    return { invalid: 'setupCi.skip must be a list of file paths, e.g. [".husky/pre-push"]' };
  }
  const skip = new Set();
  const problems = [];
  for (const entry of cfg.skip) {
    const file = entry.replace(/^(\.\/)+/, '');
    if (MANAGED_SET.has(file)) skip.add(file);
    else problems.push(`  \x1b[33m!\x1b[0m setupCi.skip: ${entry} is not a managed file, ignored`);
  }
  return { skip, problems };
}


function retire(file) {
  const target = path.join(CWD, file);
  if (!fs.existsSync(target)) return;
  if (optOut.skip.has(file)) {
    console.log(`  \x1b[33m~\x1b[0m ${file} (retired, but skipped: setupCi.skip in package.json)`);
    return;
  }
  const body = fs.readFileSync(target, 'utf8');
  const shipped = RETIRED[file].some((n) => fs.readFileSync(path.join(TEMPLATES, 'retired', n), 'utf8') === body);
  if (shipped) {
    fs.unlinkSync(target);
    console.log(`  \x1b[32m-\x1b[0m ${file} (retired: no longer managed, removed)`);
  } else {
    console.log(`  \x1b[33m~\x1b[0m ${file} (retired, but edited by this repo: left alone)`);
  }
}

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
let leftAlone = 0;

const optOut = loadSkip();
if (optOut.invalid) {
  console.log(`\x1b[31m✗\x1b[0m @neron/setup-ci: ${optOut.invalid}; no managed file was synced.`);
  process.exit(0);
}
for (const line of optOut.problems) console.log(line);

// Always sync managed files (except the ones this repo opted out of)
for (const file of MANAGED_FILES) {
  if (optOut.skip.has(file)) {
    leftAlone++;
    console.log(`  \x1b[33m~\x1b[0m ${file} (skipped: setupCi.skip in package.json)`);
    continue;
  }
  if (copyTemplate(file)) {
    synced++;
    if (isVerbose) console.log(`  \x1b[32m✓\x1b[0m ${file}`);
  }
}

for (const file of Object.keys(RETIRED)) retire(file);

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
  console.log(`\n\x1b[32m✓\x1b[0m setup-ci sync: ${synced} files synced, ${skipped} kept existing${leftAlone ? `, ${leftAlone} left alone by setupCi.skip` : ''}`);
} else if (synced > 0) {
  console.log(`\x1b[32m✓\x1b[0m @neron/setup-ci: ${synced} config files synced`);
}
