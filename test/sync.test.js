// Runs bin/sync.js as the postinstall hook does, in a throwaway project directory, and checks what lands in it.
// node --test test/
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SYNC = path.join(__dirname, '..', 'bin', 'sync.js');
const TEMPLATES = path.join(__dirname, '..', 'templates');
const MANAGED = [
  '.gitleaks.toml', '.github/workflows/ci.yml', '.github/workflows/release.yml', '.github/dependabot.yml',
  '.husky/pre-commit', '.husky/pre-push', '.husky/post-merge', '.maestro/smoke.yaml', '.maestro/onboarding.yaml',
  'scripts/generate-icons.js', 'scripts/generate-store-metadata.js', 'scripts/generate-store-visuals.js',
  'scripts/generate-screenshots.js', 'scripts/setup-revenuecat.js', 'scripts/check-i18n.js',
];

function project(pkg, files = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'setup-ci-test-'));
  if (pkg !== undefined) fs.writeFileSync(path.join(dir, 'package.json'), typeof pkg === 'string' ? pkg : JSON.stringify(pkg));
  for (const [f, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.writeFileSync(path.join(dir, f), body);
  }
  return dir;
}
function run(dir, env = {}) {
  const e = { ...process.env, ...env };
  delete e.INIT_CWD;
  const r = spawnSync(process.execPath, [SYNC], { cwd: dir, env: e, encoding: 'utf8' });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}
const read = (dir, f) => fs.readFileSync(path.join(dir, f), 'utf8');
const tpl = (f) => fs.readFileSync(path.join(TEMPLATES, f), 'utf8');
const exists = (dir, f) => fs.existsSync(path.join(dir, f));
const skippedLines = (out) => out.split('\n').filter((l) => /skipped/i.test(l));

test('a repo that sets nothing gets every managed file, exactly as before', () => {
  const dir = project({ name: 'x' });
  const r = run(dir);
  assert.equal(r.code, 0);
  for (const f of MANAGED) assert.equal(read(dir, f), tpl(f), f);
  assert.deepEqual(skippedLines(r.out), []);
});

test('no package.json at all is the same as setting nothing', () => {
  const dir = project(undefined);
  assert.equal(run(dir).code, 0);
  for (const f of MANAGED) assert.equal(read(dir, f), tpl(f), f);
});

test('setupCi.skip leaves the named managed files alone and still syncs the rest', () => {
  const own = { '.github/workflows/ci.yml': 'pod-owned ci\n', '.husky/pre-push': 'pod-owned hook\n' };
  const dir = project({ name: 'x', setupCi: { skip: ['.github/workflows/ci.yml', '.husky/pre-push'] } }, own);
  const r = run(dir);
  assert.equal(r.code, 0);
  assert.equal(read(dir, '.github/workflows/ci.yml'), 'pod-owned ci\n');
  assert.equal(read(dir, '.husky/pre-push'), 'pod-owned hook\n');
  for (const f of MANAGED.filter((m) => !(m in own))) assert.equal(read(dir, f), tpl(f), f);
});

test('every skipped file prints exactly one note, so a skip is never silent', () => {
  const dir = project({ name: 'x', setupCi: { skip: ['.github/workflows/ci.yml', '.husky/pre-push'] } });
  const lines = skippedLines(run(dir).out);
  assert.equal(lines.length, 2);
  assert.match(lines.find((l) => l.includes('.github/workflows/ci.yml')), /setupCi\.skip/);
  assert.ok(lines.some((l) => l.includes('.husky/pre-push')));
});

test('a skipped file the repo does not have is not created', () => {
  const dir = project({ name: 'x', setupCi: { skip: ['.github/dependabot.yml'] } });
  run(dir);
  assert.equal(exists(dir, '.github/dependabot.yml'), false);
});

test('the notes are printed in postinstall mode too, where the per-file ticks are not', () => {
  const dir = project({ name: 'x', setupCi: { skip: ['.husky/pre-push'] } });
  const r = run(dir, { npm_lifecycle_event: 'postinstall' });
  assert.equal(skippedLines(r.out).length, 1);
  assert.ok(!r.out.includes('✓ .gitleaks.toml'), 'postinstall stays terse for synced files');
});

test('./ prefixes are accepted, and an entry that names no managed file is reported, never silently ignored', () => {
  const dir = project({ name: 'x', setupCi: { skip: ['./.husky/pre-push', '.husky/pre-pus', '../outside', '/etc/passwd', '.eslintrc.js'] } }, { '.husky/pre-push': 'own\n' });
  const r = run(dir);
  assert.equal(r.code, 0);
  assert.equal(read(dir, '.husky/pre-push'), 'own\n');
  const notManaged = r.out.split('\n').filter((l) => /not a managed file/i.test(l));
  assert.equal(notManaged.length, 4, r.out);
  for (const bad of ['.husky/pre-pus', '../outside', '/etc/passwd', '.eslintrc.js']) assert.ok(notManaged.some((l) => l.includes(bad)), bad);
});

test('a malformed setupCi.skip fails closed: nothing managed is written, the problem is printed, exit 0', () => {
  for (const skip of ['ci.yml', [1, 2], { a: 1 }, null]) {
    const dir = project({ name: 'x', setupCi: { skip } }, { '.husky/pre-push': 'own\n' });
    const r = run(dir);
    assert.equal(r.code, 0, JSON.stringify(skip));
    assert.equal(read(dir, '.husky/pre-push'), 'own\n', JSON.stringify(skip));
    assert.equal(exists(dir, '.gitleaks.toml'), false, JSON.stringify(skip));
    assert.match(r.out, /setupCi\.skip must be a list of file paths/);
  }
});

test('a package.json that cannot be parsed fails closed too', () => {
  const dir = project('{ not json', { '.husky/pre-push': 'own\n' });
  const r = run(dir);
  assert.equal(r.code, 0);
  assert.equal(read(dir, '.husky/pre-push'), 'own\n');
  assert.equal(exists(dir, '.gitleaks.toml'), false);
  assert.match(r.out, /package\.json/);
});

test('setupCi without a skip list changes nothing', () => {
  const dir = project({ name: 'x', setupCi: {} });
  run(dir);
  for (const f of MANAGED) assert.equal(read(dir, f), tpl(f), f);
});

test('init-only files are still never overwritten', () => {
  const dir = project({ name: 'x' }, { '.prettierrc': 'mine\n' });
  run(dir);
  assert.equal(read(dir, '.prettierrc'), 'mine\n');
});
