#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * Generates store metadata (title, subtitle, description, keywords, release notes)
 * for App Store and Google Play in multiple languages.
 *
 * Usage:
 *   node scripts/generate-store-metadata.js
 *
 * Reads: store.config.json (project root)
 * Outputs: store-metadata/ directory with per-language JSON files
 *
 * Requires: ANTHROPIC_API_KEY environment variable
 */

const LANGUAGES = {
  en: 'English',
  tr: 'Turkish',
  de: 'German',
  fr: 'French',
  es: 'Spanish',
  ja: 'Japanese',
  ko: 'Korean',
  zh: 'Chinese (Simplified)',
  ar: 'Arabic',
  ru: 'Russian',
  pt: 'Portuguese (Brazil)',
};

async function callClaude(prompt) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('Set ANTHROPIC_API_KEY environment variable');
    process.exit(1);
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Claude API error: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  return data.content[0].text;
}

async function generateMetadata() {
  const configPath = path.join(process.cwd(), 'store.config.json');

  if (!fs.existsSync(configPath)) {
    // Generate a template store.config.json
    const template = {
      appName: 'My App',
      shortDescription: 'One-line description of your app',
      fullDescription:
        'Detailed description of what your app does, its key features, and why users should download it.',
      features: ['Feature 1', 'Feature 2', 'Feature 3'],
      category: 'Utilities',
      targetAudience: 'General',
      keywords: ['keyword1', 'keyword2', 'keyword3'],
      releaseNotes: 'Bug fixes and performance improvements.',
      languages: ['en', 'tr'],
    };
    fs.writeFileSync(configPath, JSON.stringify(template, null, 2) + '\n');
    console.log(
      `\x1b[33m!\x1b[0m Created template store.config.json — edit it with your app details, then run again.`
    );
    process.exit(0);
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const languages = config.languages || ['en'];
  const outDir = path.join(process.cwd(), 'store-metadata');
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`\x1b[36m>\x1b[0m Generating store metadata for ${languages.length} languages...`);

  const prompt = `You are an ASO (App Store Optimization) expert. Generate App Store and Google Play metadata for the following app.

App details:
- Name: ${config.appName}
- Short description: ${config.shortDescription}
- Full description: ${config.fullDescription}
- Features: ${config.features.join(', ')}
- Category: ${config.category}
- Target audience: ${config.targetAudience}
- Keywords hint: ${config.keywords.join(', ')}
- Release notes: ${config.releaseNotes}

Generate metadata for these languages: ${languages.map((l) => `${l} (${LANGUAGES[l] || l})`).join(', ')}

For EACH language, output a JSON object with these fields:
- title: App name (max 30 chars, localized if appropriate)
- subtitle: Catchy subtitle (max 30 chars, App Store)
- shortDescription: One-liner (max 80 chars, Google Play)
- fullDescription: Rich description (max 4000 chars, both stores) — include features, benefits, use bullet points
- keywords: Comma-separated ASO keywords (max 100 chars, App Store)
- releaseNotes: Localized release notes (max 500 chars)
- promoText: Promotional text (max 170 chars, App Store)

Respond with ONLY valid JSON — an object where keys are language codes and values are the metadata objects. No markdown, no explanation.`;

  const response = await callClaude(prompt);

  let metadata;
  try {
    metadata = JSON.parse(response);
  } catch {
    // Try extracting JSON from response
    const match = response.match(/\{[\s\S]*\}/);
    if (match) {
      metadata = JSON.parse(match[0]);
    } else {
      console.error('Failed to parse Claude response as JSON');
      fs.writeFileSync(path.join(outDir, 'raw-response.txt'), response);
      process.exit(1);
    }
  }

  for (const [lang, data] of Object.entries(metadata)) {
    const filePath = path.join(outDir, `${lang}.json`);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
  }

  // Also write a combined file
  fs.writeFileSync(
    path.join(outDir, 'all-languages.json'),
    JSON.stringify(metadata, null, 2) + '\n'
  );

  console.log(
    `\x1b[32m✓\x1b[0m Generated metadata for ${Object.keys(metadata).length} languages in store-metadata/`
  );
  Object.keys(metadata).forEach((lang) => {
    console.log(
      `  ${lang}: ${metadata[lang].title} — ${metadata[lang].subtitle || metadata[lang].shortDescription}`
    );
  });
}

generateMetadata().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
