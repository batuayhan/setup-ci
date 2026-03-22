#!/usr/bin/env node

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Generates App Store screenshots using appshot (if configured).
 *
 * Usage:
 *   node scripts/generate-screenshots.js
 *
 * Prerequisites:
 *   - .appshot/config.json must exist (appshot configured)
 *   - Playwright MCP or appshot CLI must be available
 *   - Dev server must be running (for web-based capture)
 */

function run(cmd, args) {
  try {
    return execFileSync(cmd, args, { stdio: 'pipe' }).toString();
  } catch {
    return null;
  }
}

async function generateScreenshots() {
  const hasAppshot = fs.existsSync('.appshot/config.json');

  if (!hasAppshot) {
    console.log(`\x1b[33m!\x1b[0m No .appshot/config.json found.`);
    console.log(
      `  To set up screenshots, create .appshot/config.json with your screenshot configuration.`
    );
    console.log(`  See: https://github.com/batuayhan/appshot`);
    process.exit(0);
  }

  const config = JSON.parse(fs.readFileSync('.appshot/config.json', 'utf8'));
  console.log(`\x1b[36m>\x1b[0m Generating screenshots with appshot...`);

  // Check if appshot is available
  const hasAppshotCLI = run('which', ['appshot']);
  const hasNpxAppshot = run('npx', ['appshot', '--version']);

  if (hasAppshotCLI) {
    execFileSync('appshot', ['generate'], { stdio: 'inherit' });
  } else if (hasNpxAppshot) {
    execFileSync('npx', ['appshot', 'generate'], { stdio: 'inherit' });
  } else {
    console.error('appshot not found. Install it: npm install -g appshot');
    console.log('Or run screenshots manually with Claude Code: /appshot');
    process.exit(1);
  }

  console.log(`\x1b[32m✓\x1b[0m Screenshots generated`);
}

generateScreenshots().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
