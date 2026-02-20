/**
 * Capture a11y snapshots from developer/research sites.
 *
 * Usage: node scripts/capture-dev-sites.js
 *
 * Saves raw snapshots to test/fixtures/live-*.yaml
 * Prints pruning stats for each page in act + browse modes.
 */

import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { prune, summarize } from '../src/prune.js';

const PAGES = [
  { name: 'mdn-docs', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/map' },
  { name: 'stackoverflow', url: 'https://stackoverflow.com/questions/9549780/what-is-the-difference-between-css-variables-and-preprocessor-variables' },
  { name: 'github-issue', url: 'https://github.com/microsoft/playwright/issues/35498' },
  { name: 'python-docs', url: 'https://docs.python.org/3/library/asyncio-task.html' },
  { name: 'npm-package', url: 'https://www.npmjs.com/package/express' },
];

const FIXTURES_DIR = new URL('../test/fixtures/', import.meta.url);

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
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(3000);

      const snapshot = await page.locator('body').ariaSnapshot();

      const filename = `live-${name}.yaml`;
      writeFileSync(new URL(filename, FIXTURES_DIR), snapshot, 'utf8');

      const prunedAct = prune(snapshot, { mode: 'act' });
      const prunedBrowse = prune(snapshot, { mode: 'browse' });
      const sum = summarize(snapshot);

      const rawChars = snapshot.length;
      const actChars = prunedAct.length;
      const browseChars = prunedBrowse.length;
      const actReduction = ((1 - actChars / rawChars) * 100).toFixed(1);
      const browseReduction = ((1 - browseChars / rawChars) * 100).toFixed(1);

      console.log(`  Raw:     ${rawChars} chars (~${Math.round(rawChars / 4)} tokens)`);
      console.log(`  Act:     ${actChars} chars (~${Math.round(actChars / 4)} tokens) → ${actReduction}% reduction`);
      console.log(`  Browse:  ${browseChars} chars (~${Math.round(browseChars / 4)} tokens) → ${browseReduction}% reduction`);
      console.log(`  Summary: ${sum}`);

      results.push({ name, rawChars, actChars, browseChars, actReduction, browseReduction });
    } catch (err) {
      console.log(`  ERROR: ${err.message}`);
      results.push({ name, error: err.message });
    } finally {
      await page.close();
    }
  }

  await browser.close();

  console.log('\n\n=== SUMMARY ===\n');
  console.log('Page              | Raw chars | Act chars | Act %  | Browse chars | Browse %');
  console.log('------------------|-----------|-----------|--------|-------------|----------');
  for (const r of results) {
    if (r.error) {
      console.log(`${r.name.padEnd(18)}| ERROR: ${r.error}`);
    } else {
      console.log(
        `${r.name.padEnd(18)}| ${String(r.rawChars).padStart(9)} | ${String(r.actChars).padStart(9)} | ${r.actReduction.padStart(6)}% | ${String(r.browseChars).padStart(11)} | ${r.browseReduction}%`
      );
    }
  }
}

main().catch(console.error);
