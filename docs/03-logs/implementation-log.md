# Implementation Log

## Initial build

- Built parser (`parse.js`) for Playwright ariaSnapshot YAML format
- Built 9-step pruning pipeline (`prune.js`) with mode-based landmark extraction
- Built serializer (`serialize.js`) with URL cleaning and tracking param stripping
- Defined ARIA role taxonomy (`roles.js`) — 4 categories, ~46 roles
- Built MCP proxy (`mcp-server.js`) — spawns Playwright MCP, intercepts all responses
- Added `summarize()` for one-line page capability summaries

## Test expansion

- Extracted proxy logic into `src/proxy-utils.js` (looksLikeSnapshot, extractContext, processSnapshot)
- Updated `mcp-server.js` to import from proxy-utils
- Added `test/proxy.test.js` — 24 tests for proxy utility functions
- Added `test/edge-cases.test.js` — 35 tests covering empty inputs, no-landmark pages, structural edge cases, context-aware pruning, summarize edge cases, live fixture regressions, and round-trip parse safety
- Total: 79 tests, all passing

## Fixtures captured

- `amazon-product.yaml` — e-commerce product page (4.9K)
- `live-hackernews.yaml` — no-landmark forum page (40K)
- `live-wikipedia.yaml` — reference article with deep nesting (121K)
- `live-gov-uk-form.yaml` — government form with radio buttons (4.6K)
