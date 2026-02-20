# Testing Guide

## Test structure

```
test/
  parse.test.js         Parser tests — YAML input -> ANode tree
  prune.test.js         Pruning + summarize tests — Amazon product fixture
  proxy.test.js         Proxy utility tests — snapshot detection, context, processing
  edge-cases.test.js    Edge cases + live fixture regressions
  fixtures/
    amazon-product.yaml     Small e-commerce product page
    live-hackernews.yaml    No-landmark forum page
    live-wikipedia.yaml     Deep article with many sections
    live-gov-uk-form.yaml   Government form with radios
```

## Writing tests

Use `node:test` + `node:assert/strict`:

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { prune, summarize, parse } from '../src/prune.js';

describe('feature', () => {
  it('does something specific', () => {
    const result = prune(someYaml, { mode: 'act' });
    assert.ok(result.includes('expected'));
  });
});
```

## Loading fixtures

```javascript
import { readFileSync } from 'node:fs';

const yaml = readFileSync(
  new URL('./fixtures/live-hackernews.yaml', import.meta.url), 'utf8'
);
```

## Test categories

### Unit tests (fast, isolated)

- **Parser tests**: specific YAML patterns -> expected tree structure
- **Proxy util tests**: pure function inputs -> expected outputs
- Can use inline YAML strings

### Integration tests (use fixtures)

- **Prune tests**: fixture YAML -> assert specific content kept/dropped
- **Summarize tests**: fixture YAML -> assert summary format
- **Round-trip tests**: `parse(prune(fixture))` does not throw

### Regression tests

When adding a new fixture or fixing a pruning bug:

1. Add the fixture to `test/fixtures/`
2. Add round-trip test in edge-cases.test.js
3. Add specific assertions for the expected pruning behavior

## Adding a new fixture

1. Capture with `scripts/capture-live.js` (add URL to PAGES array)
2. Save as `test/fixtures/live-{name}.yaml`
3. Add to the `fixtures` array in edge-cases.test.js round-trip tests
4. Add specific behavioral assertions as needed
