# System State

## Project structure

```
mcprune/
  mcp-server.js           MCP proxy entry point — spawns Playwright MCP, intercepts responses
  src/
    prune.js              9-step pruning pipeline + summarize()
    parse.js              Playwright ariaSnapshot YAML -> ANode tree
    serialize.js          ANode tree -> YAML, URL cleaning, tracking param stripping
    roles.js              ARIA role taxonomy (LANDMARKS, INTERACTIVE, GROUPS, STRUCTURAL)
    proxy-utils.js        Extracted proxy logic (looksLikeSnapshot, extractContext, processSnapshot)
  test/
    parse.test.js         8 parser tests
    prune.test.js         12 prune + summarize tests (Amazon product fixture)
    proxy.test.js         24 proxy utility tests
    edge-cases.test.js    35 edge case + live fixture regression tests
    fixtures/             4 real-world page snapshots (amazon, HN, wikipedia, gov.uk)
  scripts/
    capture-live.js       Capture snapshots from 5 live sites
    capture-amazon-nl.js  Interactive Amazon NL capture
    capture-batch2.js     Batch capture from 8 diverse sites
    inspect.js            Quick inspect/debug a fixture
  blueprint.md            Detailed technical documentation
```

## Module dependency graph

```
mcp-server.js
  -> src/proxy-utils.js (looksLikeSnapshot, extractContext, processSnapshot)
  -> src/prune.js (lazy-loaded: prune, summarize)

src/prune.js
  -> src/parse.js (parse)
  -> src/serialize.js (serialize)
  -> src/roles.js (LANDMARKS, INTERACTIVE, GROUPS, STRUCTURAL, MODE_REGIONS)

src/proxy-utils.js
  (pure functions, no imports)
```

## Key data types

**ANode** (from `parse.js`):
```javascript
{
  role: string,         // ARIA role: 'button', 'main', 'link', etc.
  name: string,         // Accessible name: "Add to Cart"
  ref: string,          // Playwright ref: "e36"
  states: {},           // checked, disabled, level, selected, etc.
  props: {},            // url, placeholder, etc.
  text: string,         // Inline text content
  children: ANode[],    // Child nodes
}
```

## Test coverage

- **79 tests total**, all passing
- Parser: role parsing, states, nesting, inline text, full fixture
- Pruning: mode filtering, interactive preservation, noise removal, context filtering
- Proxy: snapshot detection, context extraction, stats formatting
- Edge cases: empty inputs, no-landmark pages, deep nesting, summarize edge cases
- Regression: all 4 fixtures x 3 modes round-trip through parse(prune())

## Performance benchmarks

| Page | Raw tokens | Pruned tokens | Reduction |
|---|---|---|---|
| Amazon NL search (30 products) | ~100K | ~14K | 85.8% |
| Amazon NL product page | ~28K | ~3.3K | 88.0% |
| Wikipedia article | ~54K | ~8.6K | 84.0% |
| Amazon product (fixture) | ~1.2K | ~289 | 76.5% |

## Dependencies

- `@playwright/mcp` — Playwright MCP server (subprocess)
- `@modelcontextprotocol/sdk` — MCP protocol types
- `playwright` (dev) — For capture scripts
