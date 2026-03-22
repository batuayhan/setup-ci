#!/usr/bin/env node

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const SIZES = {
  ios: [
    { name: 'icon-20.png', size: 20 },
    { name: 'icon-20@2x.png', size: 40 },
    { name: 'icon-20@3x.png', size: 60 },
    { name: 'icon-29.png', size: 29 },
    { name: 'icon-29@2x.png', size: 58 },
    { name: 'icon-29@3x.png', size: 87 },
    { name: 'icon-40.png', size: 40 },
    { name: 'icon-40@2x.png', size: 80 },
    { name: 'icon-40@3x.png', size: 120 },
    { name: 'icon-60@2x.png', size: 120 },
    { name: 'icon-60@3x.png', size: 180 },
    { name: 'icon-76.png', size: 76 },
    { name: 'icon-76@2x.png', size: 152 },
    { name: 'icon-83.5@2x.png', size: 167 },
    { name: 'icon-1024.png', size: 1024 },
  ],
  android: [
    { name: 'mipmap-mdpi/ic_launcher.png', size: 48 },
    { name: 'mipmap-hdpi/ic_launcher.png', size: 72 },
    { name: 'mipmap-xhdpi/ic_launcher.png', size: 96 },
    { name: 'mipmap-xxhdpi/ic_launcher.png', size: 144 },
    { name: 'mipmap-xxxhdpi/ic_launcher.png', size: 192 },
    { name: 'adaptive-icon-foreground.png', size: 432 },
    { name: 'adaptive-icon-background.png', size: 432 },
    { name: 'adaptive-icon-monochrome.png', size: 432 },
  ],
  web: [
    { name: 'favicon-16.png', size: 16 },
    { name: 'favicon-32.png', size: 32 },
    { name: 'favicon-48.png', size: 48 },
    { name: 'favicon.ico', size: 32 },
    { name: 'web-icon-192.png', size: 192 },
    { name: 'web-icon-512.png', size: 512 },
  ],
  expo: [
    { name: 'icon.png', size: 1024 },
    { name: 'splash-icon.png', size: 288 },
    { name: 'adaptive-icon.png', size: 1024 },
  ],
};

async function generateIcons(sourcePath) {
  if (!sourcePath) {
    // Try to find source icon
    const candidates = [
      'icon-source.png',
      'icon-1024.png',
      'assets/icon-source.png',
      'assets/icon.png',
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) {
        sourcePath = c;
        break;
      }
    }
  }

  if (!sourcePath || !fs.existsSync(sourcePath)) {
    console.error('Usage: node scripts/generate-icons.js <path-to-1024x1024-icon.png>');
    console.error('Or place a 1024x1024 icon at: icon-source.png or assets/icon-source.png');
    process.exit(1);
  }

  const metadata = await sharp(sourcePath).metadata();
  if (metadata.width < 1024 || metadata.height < 1024) {
    console.error(`Icon must be at least 1024x1024. Got: ${metadata.width}x${metadata.height}`);
    process.exit(1);
  }

  const outDir = path.join('assets', 'generated-icons');
  fs.mkdirSync(outDir, { recursive: true });

  let count = 0;

  // Expo assets (direct to assets/)
  for (const icon of SIZES.expo) {
    const outPath = path.join('assets', icon.name);
    await sharp(sourcePath).resize(icon.size, icon.size).png().toFile(outPath);
    count++;
  }

  // iOS
  const iosDir = path.join(outDir, 'ios');
  fs.mkdirSync(iosDir, { recursive: true });
  for (const icon of SIZES.ios) {
    const outPath = path.join(iosDir, icon.name);
    await sharp(sourcePath).resize(icon.size, icon.size).png().toFile(outPath);
    count++;
  }

  // Android
  const androidDir = path.join(outDir, 'android');
  for (const icon of SIZES.android) {
    const outPath = path.join(androidDir, icon.name);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });

    if (icon.name.includes('monochrome')) {
      await sharp(sourcePath).resize(icon.size, icon.size).grayscale().png().toFile(outPath);
    } else if (icon.name.includes('background')) {
      // Create solid white background for adaptive icon
      await sharp({
        create: {
          width: icon.size,
          height: icon.size,
          channels: 4,
          background: { r: 255, g: 255, b: 255, alpha: 1 },
        },
      })
        .png()
        .toFile(outPath);
    } else {
      await sharp(sourcePath).resize(icon.size, icon.size).png().toFile(outPath);
    }
    count++;
  }

  // Web
  const webDir = path.join(outDir, 'web');
  fs.mkdirSync(webDir, { recursive: true });
  for (const icon of SIZES.web) {
    const outPath = path.join(webDir, icon.name);
    await sharp(sourcePath).resize(icon.size, icon.size).png().toFile(outPath);
    count++;
  }

  console.log(`\x1b[32m✓\x1b[0m Generated ${count} icon variants from ${sourcePath}`);
  console.log(`  Expo assets: assets/icon.png, splash-icon.png, adaptive-icon.png`);
  console.log(`  iOS: ${iosDir}/`);
  console.log(`  Android: ${androidDir}/`);
  console.log(`  Web: ${webDir}/`);
}

generateIcons(process.argv[2]).catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
