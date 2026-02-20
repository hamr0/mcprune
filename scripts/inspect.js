import { readFileSync } from 'node:fs';
import { prune, summarize } from '../src/prune.js';

const yaml = readFileSync(
  new URL('./fixtures/amazon-product.yaml', import.meta.url), 'utf8'
);

console.log('=== ACT MODE ===\n');
console.log(prune(yaml, { mode: 'act' }));
console.log('\n=== SUMMARY ===\n');
console.log(summarize(yaml));
console.log('\n=== STATS ===');
console.log(`Input:  ${yaml.length} chars (~${Math.round(yaml.length / 4)} tokens)`);
const pruned = prune(yaml, { mode: 'act' });
console.log(`Output: ${pruned.length} chars (~${Math.round(pruned.length / 4)} tokens)`);
console.log(`Reduction: ${((1 - pruned.length / yaml.length) * 100).toFixed(1)}%`);
