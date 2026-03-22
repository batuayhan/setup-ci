#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const CWD = process.cwd();
const TEMPLATES = path.join(__dirname, '..', 'templates');

function log(msg) {
  console.log(`\x1b[36m>\x1b[0m ${msg}`);
}

function success(msg) {
  console.log(`\x1b[32m✓\x1b[0m ${msg}`);
}

function warn(msg) {
  console.log(`\x1b[33m!\x1b[0m ${msg}`);
}

function run(cmd, args) {
  execFileSync(cmd, args, { cwd: CWD, stdio: 'inherit' });
}

// --- Checks ---

const pkgPath = path.join(CWD, 'package.json');
if (!fs.existsSync(pkgPath)) {
  console.error('No package.json found. Run this in an Expo/React Native project.');
  process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const appJsonPath = path.join(CWD, 'app.json');
const hasAppJson = fs.existsSync(appJsonPath);
const hasI18n = fs.existsSync(path.join(CWD, 'src', 'i18n', 'en.json'));
const hasPathAlias =
  fs.existsSync(path.join(CWD, 'tsconfig.json')) &&
  fs.readFileSync(path.join(CWD, 'tsconfig.json'), 'utf8').includes('"@/*"');

let projectName = pkg.name || 'project';
if (hasAppJson) {
  const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
  projectName = appJson.expo?.name || appJson.name || projectName;
}

console.log(`\n\x1b[1mSetup CI/CD for: ${projectName}\x1b[0m\n`);

// --- 1. Install devDependencies ---

log('Installing devDependencies...');
const devDeps = [
  'eslint@^8',
  '@typescript-eslint/parser',
  '@typescript-eslint/eslint-plugin',
  'eslint-plugin-react',
  'eslint-plugin-react-hooks',
  'eslint-config-prettier',
  'prettier',
  'husky',
  'lint-staged',
  'jest',
  'jest-expo',
  '@testing-library/react-native',
  '@types/jest',
];

run('npm', ['install', '--save-dev', '--legacy-peer-deps', ...devDeps]);
success('DevDependencies installed');

// --- 2. Copy config files ---

function copyTemplate(src, dest) {
  const destPath = path.join(CWD, dest || src);
  const srcPath = path.join(TEMPLATES, src);
  if (!fs.existsSync(srcPath)) return;
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.copyFileSync(srcPath, destPath);
}

log('Creating config files...');

copyTemplate('.eslintrc.js');
copyTemplate('.prettierrc');
copyTemplate('.prettierignore');
copyTemplate('.husky/pre-commit');
copyTemplate('.gitleaks.toml');

// Jest config — adjust moduleNameMapper based on tsconfig
const jestConfig = fs.readFileSync(path.join(TEMPLATES, 'jest.config.js'), 'utf8');
if (!hasPathAlias) {
  const adjusted = jestConfig.replace(
    "  moduleNameMapper: {\n    '^@/(.*)$': '<rootDir>/src/$1',\n  },\n",
    ''
  );
  fs.writeFileSync(path.join(CWD, 'jest.config.js'), adjusted);
} else {
  fs.writeFileSync(path.join(CWD, 'jest.config.js'), jestConfig);
}

success('Config files created');

// --- 3. Copy GitHub Actions workflows ---

log('Creating GitHub Actions workflows...');
copyTemplate('.github/workflows/ci.yml');
copyTemplate('.github/workflows/release.yml');
copyTemplate('.github/dependabot.yml');
success('Workflows created');

// --- 4. i18n check (only if project has i18n) ---

if (hasI18n) {
  log('i18n detected — adding check script...');
  fs.mkdirSync(path.join(CWD, 'scripts'), { recursive: true });
  copyTemplate('scripts/check-i18n.js');
  success('i18n check script added');
} else {
  warn('No src/i18n/en.json found — skipping i18n check');
}

// --- 4b. Icon generator ---

log('Adding automation scripts...');
fs.mkdirSync(path.join(CWD, 'scripts'), { recursive: true });
copyTemplate('scripts/generate-icons.js');
copyTemplate('scripts/generate-store-metadata.js');
copyTemplate('scripts/generate-store-visuals.js');
copyTemplate('scripts/generate-screenshots.js');
copyTemplate('scripts/setup-revenuecat.js');
success('Automation scripts added');

// --- 4c. Maestro E2E tests ---
log('Adding Maestro E2E test templates...');
copyTemplate('.maestro/smoke.yaml');
copyTemplate('.maestro/onboarding.yaml');
success('Maestro E2E templates added');

// --- 5. Update package.json scripts ---

log('Adding scripts to package.json...');

const currentPkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const scripts = currentPkg.scripts || {};

scripts['lint'] = 'eslint . --ext .ts,.tsx';
scripts['format'] = 'prettier --write "**/*.{ts,tsx,js,json}"';
scripts['format:check'] = 'prettier --check "**/*.{ts,tsx,js,json}"';
scripts['type-check'] = 'tsc --noEmit';
scripts['test'] = 'jest';
scripts['test:ci'] = 'jest --ci --coverage';
scripts['prepare'] = 'husky';

if (hasAppJson) {
  scripts['release'] =
    'VERSION=$(node -p "require(\'./app.json\').expo.version") && git tag "v$VERSION" && git push --tags && echo "Tagged and pushed v$VERSION"';
  scripts['ota'] =
    'VERSION=$(node -p "require(\'./app.json\').expo.version") && eas update --channel production --message "v$VERSION OTA" && echo "OTA update pushed for v$VERSION"';
}

if (hasI18n) {
  scripts['check:i18n'] = 'node scripts/check-i18n.js';
}

scripts['icons'] = 'node scripts/generate-icons.js';
scripts['store:metadata'] = 'node scripts/generate-store-metadata.js';
scripts['store:visuals'] = 'node scripts/generate-store-visuals.js';
scripts['screenshots'] = 'node scripts/generate-screenshots.js';
scripts['revenuecat'] = 'node scripts/setup-revenuecat.js';
scripts['e2e'] = 'maestro test .maestro/';

currentPkg.scripts = scripts;

// Add lint-staged config
currentPkg['lint-staged'] = {
  '*.{ts,tsx}': ['eslint --fix', 'prettier --write'],
  '*.{js,json,md}': ['prettier --write'],
};

fs.writeFileSync(pkgPath, JSON.stringify(currentPkg, null, 2) + '\n');
success('Scripts added to package.json');

// --- 6. Initialize Husky ---

log('Initializing Husky...');
run('npx', ['husky', 'init']);
// Overwrite default pre-commit with our lint-staged version
fs.writeFileSync(path.join(CWD, '.husky', 'pre-commit'), 'npx lint-staged\n');
success('Husky initialized');

// --- 7. Format existing code ---

log('Formatting existing code with Prettier...');
try {
  run('npx', ['prettier', '--write', '**/*.{ts,tsx,js,json}', '--log-level', 'warn']);
  success('Code formatted');
} catch {
  warn('Some files could not be formatted (non-critical)');
}

// --- Done ---

console.log(`
\x1b[32m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m
\x1b[1m  CI/CD setup complete for ${projectName}\x1b[0m
\x1b[32m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m

  \x1b[36mCode quality:\x1b[0m
    npm run lint          Lint code
    npm run format        Format code
    npm run test          Run tests
    npm run type-check    TypeScript check${hasI18n ? '\n    npm run check:i18n    Check translations' : ''}

  \x1b[36mBuild & deploy:\x1b[0m${hasAppJson ? '\n    npm run ota           OTA update (JS-only)\n    npm run release       Full build + store submit' : ''}
    npm run e2e           Run Maestro E2E tests

  \x1b[36mAsset generation:\x1b[0m
    npm run icons         Generate all icon variants
    npm run store:metadata  Generate store descriptions (Claude API)
    npm run store:visuals   Generate feature graphic + promo banner
    npm run screenshots     Generate App Store screenshots
    npm run revenuecat      Setup RevenueCat subscriptions

  \x1b[36mWhat happens automatically:\x1b[0m
    git commit    → Husky runs lint + format
    git push      → CI runs type-check, lint, tests
    git tag vX.Y.Z → Build + store submit + GitHub Release

  \x1b[36mSecret scanning:\x1b[0m
    CI: gitleaks runs automatically on every push
    Local: install gitleaks for pre-commit scanning:
      brew install gitleaks

  \x1b[33mOne-time setup:\x1b[0m
    1. Add EXPO_TOKEN to GitHub repo secrets
    2. Configure store credentials: eas credentials
    3. Install gitleaks: brew install gitleaks
    4. Install Maestro: curl -Ls https://get.maestro.mobile.dev | bash
    5. Commit: git add -A && git commit -m "chore: add CI/CD automation"
`);
