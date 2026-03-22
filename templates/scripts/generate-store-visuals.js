#!/usr/bin/env node

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

/**
 * Generates store visuals:
 * - Google Play Feature Graphic (1024x500)
 * - App Store promotional banner (1032x600 suggested)
 *
 * Usage:
 *   node scripts/generate-store-visuals.js [--icon assets/icon.png] [--bg "#1a1a2e"]
 */

const args = process.argv.slice(2);
function getArg(name, fallback) {
  const idx = args.indexOf(name);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback;
}

async function generateVisuals() {
  // Find icon
  let iconPath = getArg('--icon', null);
  if (!iconPath) {
    const candidates = ['assets/icon.png', 'assets/icon-source.png', 'icon.png'];
    for (const c of candidates) {
      if (fs.existsSync(c)) {
        iconPath = c;
        break;
      }
    }
  }

  if (!iconPath || !fs.existsSync(iconPath)) {
    console.error('No icon found. Use: node scripts/generate-store-visuals.js --icon <path>');
    process.exit(1);
  }

  // Get app name from app.json
  let appName = 'My App';
  if (fs.existsSync('app.json')) {
    const appJson = JSON.parse(fs.readFileSync('app.json', 'utf8'));
    appName = appJson.expo?.name || appJson.name || appName;
  }

  const bgColor = getArg('--bg', '#1a1a2e');
  const outDir = path.join('assets', 'store-visuals');
  fs.mkdirSync(outDir, { recursive: true });

  // --- Google Play Feature Graphic (1024x500) ---
  const fgWidth = 1024;
  const fgHeight = 500;
  const iconSize = 280;
  const iconX = Math.floor((fgWidth - iconSize) / 2);
  const iconY = Math.floor((fgHeight - iconSize) / 2) - 20;

  const iconBuffer = await sharp(iconPath)
    .resize(iconSize, iconSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: fgWidth,
      height: fgHeight,
      channels: 4,
      background: bgColor,
    },
  })
    .composite([{ input: iconBuffer, left: iconX, top: iconY }])
    .png()
    .toFile(path.join(outDir, 'feature-graphic.png'));

  // --- App Store Promo Banner (1032x600) ---
  const abWidth = 1032;
  const abHeight = 600;
  const abIconSize = 320;
  const abIconX = Math.floor((abWidth - abIconSize) / 2);
  const abIconY = Math.floor((abHeight - abIconSize) / 2) - 20;

  const abIconBuffer = await sharp(iconPath)
    .resize(abIconSize, abIconSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: abWidth,
      height: abHeight,
      channels: 4,
      background: bgColor,
    },
  })
    .composite([{ input: abIconBuffer, left: abIconX, top: abIconY }])
    .png()
    .toFile(path.join(outDir, 'promo-banner.png'));

  console.log(`\x1b[32m✓\x1b[0m Generated store visuals for ${appName}`);
  console.log(`  ${outDir}/feature-graphic.png (1024x500 — Google Play)`);
  console.log(`  ${outDir}/promo-banner.png (1032x600 — App Store)`);
}

generateVisuals().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
