/**
 * Capture real a11y snapshots from live pages and test pruning.
 *
 * Usage: node test/capture-live.js
 *
 * Saves raw snapshots to test/fixtures/live-*.yaml
 * Prints pruning stats for each page.
 */

import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { prune, summarize } from '../src/prune.js';

const PAGES = [
  { name: 'hackernews', url: 'https://news.ycombinator.com/' },
  { name: 'wikipedia', url: 'https://en.wikipedia.org/wiki/Accessibility' },
  { name: 'github-repo', url: 'https://github.com/anthropics/claude-code' },
  { name: 'google-search', url: 'https://www.google.com/search?q=playwright+accessibility+tree' },
  { name: 'gov-uk', url: 'https://www.gov.uk/browse/benefits' },
];

const FIXTURES_DIR = new URL('./fixtures/', import.meta.url);

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  });

  const results = [];

  for (const { name, url } of PAGES) {
    process.stdout.write(`\n${name}: ${url}\n`);
    const page = await context.newPage();

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      // Wait a bit for JS to settle
      await page.waitForTimeout(2000);

      // Capture aria snapshot
      const snapshot = await page.locator('body').ariaSnapshot();

      // Save raw snapshot
      const filename = `live-${name}.yaml`;
      writeFileSync(new URL(filename, FIXTURES_DIR), snapshot, 'utf8');

      // Run pruner
      const prunedAct = prune(snapshot, { mode: 'act' });
      const prunedNav = prune(snapshot, { mode: 'navigate' });
      const sum = summarize(snapshot);

      const rawChars = snapshot.length;
      const actChars = prunedAct.length;
      const navChars = prunedNav.length;
      const actReduction = ((1 - actChars / rawChars) * 100).toFixed(1);
      const navReduction = ((1 - navChars / rawChars) * 100).toFixed(1);

      const rawLines = snapshot.split('\n').length;
      const actLines = prunedAct.split('\n').length;

      console.log(`  Raw:      ${rawChars} chars, ${rawLines} lines (~${Math.round(rawChars / 4)} tokens)`);
      console.log(`  Act mode: ${actChars} chars, ${actLines} lines (~${Math.round(actChars / 4)} tokens) → ${actReduction}% reduction`);
      console.log(`  Nav mode: ${navChars} chars (~${Math.round(navChars / 4)} tokens) → ${navReduction}% reduction`);
      console.log(`  Summary:  ${sum}`);

      results.push({ name, rawChars, actChars, navChars, actReduction, rawLines, actLines });
    } catch (err) {
      console.log(`  ERROR: ${err.message}`);
      results.push({ name, error: err.message });
    } finally {
      await page.close();
    }
  }

  await browser.close();

  // Summary table
  console.log('\n\n=== SUMMARY ===\n');
  console.log('Page            | Raw chars | Raw lines | Act chars | Act lines | Reduction');
  console.log('----------------|-----------|-----------|-----------|-----------|----------');
  for (const r of results) {
    if (r.error) {
      console.log(`${r.name.padEnd(16)}| ERROR: ${r.error}`);
    } else {
      console.log(
        `${r.name.padEnd(16)}| ${String(r.rawChars).padStart(9)} | ${String(r.rawLines).padStart(9)} | ${String(r.actChars).padStart(9)} | ${String(r.actLines).padStart(9)} | ${r.actReduction}%`
      );
    }
  }
}

main().catch(console.error);
