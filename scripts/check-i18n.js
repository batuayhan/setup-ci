const fs = require('fs');
const path = require('path');

const i18nDir = path.join(__dirname, '..', 'src', 'i18n');
const baseFile = 'en.json';

function getKeys(obj, prefix = '') {
  const keys = [];
  for (const [k, v] of Object.entries(obj)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'object' && v !== null) {
      keys.push(...getKeys(v, p));
    } else {
      keys.push(p);
    }
  }
  return keys;
}

const base = JSON.parse(fs.readFileSync(path.join(i18nDir, baseFile), 'utf8'));
const baseKeys = new Set(getKeys(base));

const files = fs.readdirSync(i18nDir).filter((f) => f.endsWith('.json') && f !== baseFile);

let hasErrors = false;

for (const file of files) {
  const lang = JSON.parse(fs.readFileSync(path.join(i18nDir, file), 'utf8'));
  const langKeys = new Set(getKeys(lang));
  const langCode = file.replace('.json', '');

  const missing = [...baseKeys].filter((k) => !langKeys.has(k));
  const extra = [...langKeys].filter((k) => !baseKeys.has(k));

  if (missing.length > 0) {
    hasErrors = true;
    console.error(`\n${langCode}: ${missing.length} missing key(s)`);
    missing.forEach((k) => console.error(`  - ${k}`));
  }

  if (extra.length > 0) {
    console.warn(`\n${langCode}: ${extra.length} extra key(s)`);
    extra.forEach((k) => console.warn(`  + ${k}`));
  }
}

if (hasErrors) {
  console.error('\ni18n check FAILED: missing translations found');
  process.exit(1);
} else {
  console.log(`i18n check passed: all ${baseKeys.size} keys present in ${files.length} languages`);
}
