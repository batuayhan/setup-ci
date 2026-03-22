#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * Sets up RevenueCat entitlements, offerings, and packages via REST API.
 *
 * Usage:
 *   node scripts/setup-revenuecat.js
 *
 * Reads: revenuecat.config.json
 * Requires: REVENUECAT_API_KEY (secret/v1 key) and REVENUECAT_PROJECT_ID env vars
 *
 * Config example (revenuecat.config.json):
 * {
 *   "entitlements": [
 *     { "id": "pro", "name": "Pro Access" }
 *   ],
 *   "products": {
 *     "ios": [
 *       { "id": "pro_monthly", "storeId": "com.app.pro.monthly" },
 *       { "id": "pro_yearly", "storeId": "com.app.pro.yearly" }
 *     ],
 *     "android": [
 *       { "id": "pro_monthly", "storeId": "pro_monthly:monthly" },
 *       { "id": "pro_yearly", "storeId": "pro_yearly:yearly" }
 *     ]
 *   },
 *   "offerings": [
 *     {
 *       "id": "default",
 *       "name": "Default Offering",
 *       "packages": [
 *         { "id": "$rc_monthly", "productId": "pro_monthly" },
 *         { "id": "$rc_annual", "productId": "pro_yearly" }
 *       ]
 *     }
 *   ]
 * }
 */

const BASE_URL = 'https://api.revenuecat.com/v2/projects';

async function rcFetch(endpoint, method = 'GET', body = null) {
  const apiKey = process.env.REVENUECAT_API_KEY;
  const projectId = process.env.REVENUECAT_PROJECT_ID;

  if (!apiKey || !projectId) {
    console.error('Set REVENUECAT_API_KEY and REVENUECAT_PROJECT_ID environment variables');
    process.exit(1);
  }

  const url = `${BASE_URL}/${projectId}${endpoint}`;
  const options = {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  };

  if (body) options.body = JSON.stringify(body);

  const res = await fetch(url, options);
  const data = await res.json();

  if (!res.ok) {
    throw new Error(`RevenueCat API ${method} ${endpoint}: ${res.status} — ${JSON.stringify(data)}`);
  }

  return data;
}

async function setupRevenueCat() {
  const configPath = path.join(process.cwd(), 'revenuecat.config.json');

  if (!fs.existsSync(configPath)) {
    const template = {
      entitlements: [{ id: 'pro', name: 'Pro Access' }],
      products: {
        ios: [
          { id: 'pro_monthly', storeId: 'com.example.app.pro.monthly' },
          { id: 'pro_yearly', storeId: 'com.example.app.pro.yearly' },
        ],
        android: [
          { id: 'pro_monthly', storeId: 'pro_monthly:monthly' },
          { id: 'pro_yearly', storeId: 'pro_yearly:yearly' },
        ],
      },
      offerings: [
        {
          id: 'default',
          name: 'Default Offering',
          packages: [
            { id: '$rc_monthly', productId: 'pro_monthly' },
            { id: '$rc_annual', productId: 'pro_yearly' },
          ],
        },
      ],
    };
    fs.writeFileSync(configPath, JSON.stringify(template, null, 2) + '\n');
    console.log(`\x1b[33m!\x1b[0m Created template revenuecat.config.json — edit it, then run again.`);
    process.exit(0);
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

  // 1. Create entitlements
  console.log(`\x1b[36m>\x1b[0m Creating entitlements...`);
  for (const ent of config.entitlements) {
    try {
      await rcFetch('/entitlements', 'POST', {
        lookup_key: ent.id,
        display_name: ent.name,
      });
      console.log(`  \x1b[32m✓\x1b[0m ${ent.id}: ${ent.name}`);
    } catch (err) {
      if (err.message.includes('409') || err.message.includes('already exists')) {
        console.log(`  \x1b[33m~\x1b[0m ${ent.id}: already exists`);
      } else {
        console.error(`  \x1b[31m✗\x1b[0m ${ent.id}: ${err.message}`);
      }
    }
  }

  // 2. Create products
  console.log(`\x1b[36m>\x1b[0m Creating products...`);
  for (const [platform, products] of Object.entries(config.products)) {
    const appType = platform === 'ios' ? 'app_store' : 'play_store';
    for (const prod of products) {
      try {
        await rcFetch('/products', 'POST', {
          store_identifier: prod.storeId,
          app_id: appType,
          display_name: prod.id,
        });
        console.log(`  \x1b[32m✓\x1b[0m ${platform}/${prod.id}`);
      } catch (err) {
        if (err.message.includes('409') || err.message.includes('already exists')) {
          console.log(`  \x1b[33m~\x1b[0m ${platform}/${prod.id}: already exists`);
        } else {
          console.error(`  \x1b[31m✗\x1b[0m ${platform}/${prod.id}: ${err.message}`);
        }
      }
    }
  }

  // 3. Create offerings
  console.log(`\x1b[36m>\x1b[0m Creating offerings...`);
  for (const offering of config.offerings) {
    try {
      await rcFetch('/offerings', 'POST', {
        lookup_key: offering.id,
        display_name: offering.name,
      });
      console.log(`  \x1b[32m✓\x1b[0m ${offering.id}: ${offering.name}`);
    } catch (err) {
      if (err.message.includes('409') || err.message.includes('already exists')) {
        console.log(`  \x1b[33m~\x1b[0m ${offering.id}: already exists`);
      } else {
        console.error(`  \x1b[31m✗\x1b[0m ${offering.id}: ${err.message}`);
      }
    }
  }

  console.log(`\n\x1b[32m✓\x1b[0m RevenueCat setup complete`);
  console.log(`  Dashboard: https://app.revenuecat.com`);
}

setupRevenueCat().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
