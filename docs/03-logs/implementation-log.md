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

## Browse mode hardening

- Made `pruneNode()` mode-aware: paragraphs, code blocks, term/definition pairs, strong/emphasis, inline links preserved in browse
- Made `keepTextNode()` accept mode parameter: browse keeps all text except decorators; act keeps only prices/stock/short labels
- Made `postClean()` skip orphaned heading removal in browse mode (headings structure articles)
- Added browse-specific rules: drop navigation inside main (Wikipedia chrome), convert figures to caption text, drop superscripts in both modes
- Wrapped steps 5-8 in mode check: skipped entirely in browse mode
- Added `scripts/capture-dev-sites.js` for developer site fixture capture
- Added 42 browse mode tests covering MDN, Python docs, Stack Overflow, GitHub issue, npm
- Total: 121 tests, all passing

## Fixtures captured

- `amazon-product.yaml` — e-commerce product page (4.9K)
- `live-hackernews.yaml` — no-landmark forum page (40K)
- `live-wikipedia.yaml` — reference article with deep nesting (121K)
- `live-gov-uk-form.yaml` — government form with radio buttons (4.6K)
- `live-mdn-docs.yaml` — MDN developer documentation (39K)
- `live-python-docs.yaml` — Python language documentation (89K)
- `live-stackoverflow.yaml` — Stack Overflow Q&A page (67K)
- `live-github-issue.yaml` — GitHub PR page (8.3K)
- `live-npm-package.yaml` — npm package page (20K)
