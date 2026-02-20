# System State

## Project structure

```
mcprune/
  mcp-server.js           MCP proxy entry point — spawns Playwright MCP, intercepts responses
  src/
    prune.js              9-step pruning pipeline + summarize(), mode-aware filtering
    parse.js              Playwright ariaSnapshot YAML -> ANode tree
    serialize.js          ANode tree -> YAML, URL cleaning, tracking param stripping
    roles.js              ARIA role taxonomy (LANDMARKS, INTERACTIVE, GROUPS, STRUCTURAL)
    proxy-utils.js        Extracted proxy logic (looksLikeSnapshot, extractContext, processSnapshot)
  test/
    parse.test.js         8 parser tests
    prune.test.js         12 prune + summarize tests (Amazon product fixture)
    proxy.test.js         24 proxy utility tests
    edge-cases.test.js    77 edge case + browse mode + live fixture regression tests
    fixtures/             9 real-world page snapshots
  scripts/
    capture-live.js       Capture snapshots from 5 live sites
    capture-dev-sites.js  Capture developer/docs site snapshots
    capture-amazon-nl.js  Interactive Amazon NL capture
    capture-batch2.js     Batch capture from 8 diverse sites
    inspect.js            Quick inspect/debug a fixture
  blueprint.md            Detailed technical documentation
  docs/                   Structured project documentation
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

- **121 tests total**, all passing
- Parser: role parsing, states, nesting, inline text, full fixture
- Pruning: mode filtering, interactive preservation, noise removal, context filtering
- Proxy: snapshot detection, context extraction, stats formatting
- Edge cases: empty inputs, no-landmark pages, deep nesting, summarize edge cases
- Browse mode: content preservation for MDN, Python docs, Stack Overflow, GitHub issue, npm
- Regression: all 9 fixtures × 3 modes round-trip through parse(prune())

## Test fixtures (9)

| Fixture | Size | Type | Primary mode |
|---|---|---|---|
| `amazon-product.yaml` | 4.9K | E-commerce product page | act |
| `live-gov-uk-form.yaml` | 4.6K | Government form | act |
| `live-hackernews.yaml` | 40K | Forum/news (no landmarks) | act |
| `live-wikipedia.yaml` | 121K | Reference/wiki | browse |
| `live-mdn-docs.yaml` | 39K | Developer documentation | browse |
| `live-python-docs.yaml` | 89K | Language documentation | browse |
| `live-stackoverflow.yaml` | 67K | Q&A site | browse |
| `live-github-issue.yaml` | 8.3K | Code repository PR page | browse |
| `live-npm-package.yaml` | 20K | Package registry | browse |

## Performance benchmarks

| Page | Raw tokens | Pruned tokens | Reduction |
|---|---|---|---|
| Amazon NL search (30 products) | ~100K | ~14K | 85.8% |
| Amazon NL product page | ~28K | ~3.3K | 88.0% |
| Wikipedia article (browse) | ~54K | ~8.6K | 84.0% |
| Amazon product (fixture) | ~1.2K | ~289 | 76.5% |

## Dependencies

- `@playwright/mcp` — Playwright MCP server (subprocess)
- `@modelcontextprotocol/sdk` — MCP protocol types
- `playwright` (dev) — For capture scripts
