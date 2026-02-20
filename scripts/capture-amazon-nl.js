/**
 * Capture a11y snapshot from Amazon NL searching for iPhone 15 price.
 *
 * Usage: node test/capture-amazon-nl.js
 */

import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { prune, summarize } from '../src/prune.js';

const FIXTURES_DIR = new URL('./fixtures/', import.meta.url);

async function main() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    locale: 'nl-NL',
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  });

  const page = await context.newPage();

  // Go to Amazon NL
  console.log('Navigating to amazon.nl...');
  await page.goto('https://www.amazon.nl', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(3000);

  // Handle cookie consent if present
  try {
    const acceptBtn = page.locator('#sp-cc-accept');
    if (await acceptBtn.isVisible({ timeout: 3000 })) {
      console.log('Accepting cookies...');
      await acceptBtn.click();
      await page.waitForTimeout(1000);
    }
  } catch { /* no cookie banner */ }

  // Search for iPhone 15
  console.log('Searching for "iphone 15"...');
  const searchBox = page.locator('#twotabsearchtextbox');
  await searchBox.fill('iphone 15');
  await searchBox.press('Enter');
  await page.waitForTimeout(4000);

  // Capture search results page
  console.log('\n=== SEARCH RESULTS PAGE ===');
  const searchSnapshot = await page.locator('body').ariaSnapshot();
  writeFileSync(new URL('live-amazon-nl-search.yaml', FIXTURES_DIR), searchSnapshot, 'utf8');
  printStats('amazon-nl-search', searchSnapshot);

  // Click the first product result
  console.log('\nClicking first product...');
  try {
    // Amazon search results typically have product links
    const firstProduct = page.locator('[data-component-type="s-search-result"] h2 a').first();
    if (await firstProduct.isVisible({ timeout: 5000 })) {
      await firstProduct.click();
      await page.waitForTimeout(4000);
    } else {
      // Fallback: try any product-looking link
      const anyProduct = page.locator('a').filter({ hasText: /iphone 15/i }).first();
      await anyProduct.click();
      await page.waitForTimeout(4000);
    }

    // Capture product page
    console.log('\n=== PRODUCT PAGE ===');
    const productSnapshot = await page.locator('body').ariaSnapshot();
    writeFileSync(new URL('live-amazon-nl-product.yaml', FIXTURES_DIR), productSnapshot, 'utf8');
    printStats('amazon-nl-product', productSnapshot);
  } catch (err) {
    console.log(`Could not navigate to product: ${err.message}`);
  }

  await browser.close();
}

function printStats(name, snapshot) {
  const prunedAct = prune(snapshot, { mode: 'act' });
  const sum = summarize(snapshot);

  const rawChars = snapshot.length;
  const actChars = prunedAct.length;
  const reduction = ((1 - actChars / rawChars) * 100).toFixed(1);
  const rawLines = snapshot.split('\n').length;
  const actLines = prunedAct.split('\n').length;

  console.log(`  Raw:      ${rawChars} chars, ${rawLines} lines (~${Math.round(rawChars / 4)} tokens)`);
  console.log(`  Act mode: ${actChars} chars, ${actLines} lines (~${Math.round(actChars / 4)} tokens) → ${reduction}% reduction`);
  console.log(`  Summary:  ${sum}`);
  console.log(`\n  --- Pruned output (first 80 lines) ---`);
  console.log(prunedAct.split('\n').slice(0, 80).join('\n'));
  console.log('  --- end ---');
}

main().catch(console.error);
