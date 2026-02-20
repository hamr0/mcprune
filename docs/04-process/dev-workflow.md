# Development Workflow

## Setup

```bash
git clone https://github.com/hamr0/mcprune.git
cd mcprune
npm install
npx playwright install chromium
```

## Running tests

```bash
npm test                           # All 79 tests (~1.4s)
node --test test/proxy.test.js     # Proxy utils only
node --test test/edge-cases.test.js # Edge cases only
node --test test/parse.test.js     # Parser only
node --test test/prune.test.js     # Prune + summarize only
```

Test framework: `node:test` + `node:assert/strict` (no external test runner).

## Inspecting pruning output

```bash
node scripts/inspect.js    # Prune amazon-product fixture, print result + stats
```

## Capturing live snapshots

```bash
node scripts/capture-live.js       # 5 sites: HN, Wikipedia, GitHub, Google, GOV.UK
node scripts/capture-amazon-nl.js  # Interactive Amazon NL session
node scripts/capture-batch2.js     # 8 diverse sites
```

Captures save to `test/fixtures/live-*.yaml`.

## Running as MCP proxy

```bash
node mcp-server.js                      # Default: act mode, visible browser
node mcp-server.js --headless           # Headless browser
node mcp-server.js --mode navigate      # Keep banner + nav
```

## Project conventions

- **ESM only** — `"type": "module"` in package.json
- **No build step** — run source directly with Node.js
- **Fixtures loaded via** `readFileSync(new URL('./fixtures/...', import.meta.url), 'utf8')`
- **Pure functions preferred** — proxy-utils has no I/O, prune.js has no I/O
- **No external test framework** — `node:test` built-in
