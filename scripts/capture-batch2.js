/**
 * Batch 2: Test a11y-prune against more site types.
 * Covers: SPA, e-commerce (Shopify), forms, booking, classifieds, news.
 *
 * Usage: node test/capture-batch2.js
 */

import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { prune, summarize } from '../src/prune.js';

const PAGES = [
  // SPA - React app
  { name: 'react-hn', url: 'https://react-hn.kristoferbaxter.com/' },
  // Classifieds / simple listings
  { name: 'craigslist', url: 'https://amsterdam.craigslist.org/search/apa' },
  // Booking / travel
  { name: 'booking-search', url: 'https://www.booking.com/searchresults.html?ss=Amsterdam&checkin=2026-03-15&checkout=2026-03-17&group_adults=2' },
  // News - modern site
  { name: 'bbc-news', url: 'https://www.bbc.com/news' },
  // E-commerce - Shopify store
  { name: 'allbirds', url: 'https://www.allbirds.com/products/mens-tree-runners' },
  // Multi-step form
  { name: 'gov-uk-form', url: 'https://www.gov.uk/check-benefits-financial-support/start' },
  // Map-heavy / complex SPA
  { name: 'airbnb', url: 'https://www.airbnb.com/s/Amsterdam/homes' },
  // Simple SPA - TodoMVC
  { name: 'todomvc', url: 'https://todomvc.com/examples/react/dist/' },
];

const FIXTURES_DIR = new URL('./fixtures/', import.meta.url);

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    locale: 'en-US',
  });

  const results = [];

  for (const { name, url } of PAGES) {
    process.stdout.write(`\n${name}: ${url}\n`);
    const page = await context.newPage();

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(3000);

      // Try dismissing cookie banners
      try {
        for (const sel of [
          'button:has-text("Accept")', 'button:has-text("accept")',
          'button:has-text("Agree")', 'button:has-text("OK")',
          'button:has-text("Akkoord")', 'button:has-text("Accepteren")',
          '#onetrust-accept-btn-handler', '#sp-cc-accept',
          '[data-testid="accept-btn"]',
        ]) {
          const btn = page.locator(sel).first();
          if (await btn.isVisible({ timeout: 500 }).catch(() => false)) {
            await btn.click();
            await page.waitForTimeout(500);
            break;
          }
        }
      } catch { /* no banner */ }

      const snapshot = await page.locator('body').ariaSnapshot();
      writeFileSync(new URL(`live-${name}.yaml`, FIXTURES_DIR), snapshot, 'utf8');

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

      results.push({ name, rawChars, actChars, reduction, rawLines, actLines });
    } catch (err) {
      console.log(`  ERROR: ${err.message.slice(0, 200)}`);
      results.push({ name, error: err.message.slice(0, 200) });
    } finally {
      await page.close();
    }
  }

  await browser.close();

  console.log('\n\n=== BATCH 2 SUMMARY ===\n');
  console.log('Page             | Raw chars | Raw lines | Act chars | Act lines | Reduction');
  console.log('-----------------|-----------|-----------|-----------|-----------|----------');
  for (const r of results) {
    if (r.error) {
      console.log(`${r.name.padEnd(17)}| ERROR: ${r.error.slice(0, 60)}`);
    } else {
      console.log(
        `${r.name.padEnd(17)}| ${String(r.rawChars).padStart(9)} | ${String(r.rawLines).padStart(9)} | ${String(r.actChars).padStart(9)} | ${String(r.actLines).padStart(9)} | ${r.reduction}%`
      );
    }
  }
}

main().catch(console.error);
