# mcprune: Blueprint

> Screen-reader-inspired accessibility tree pruning for LLM agents

## What is this?

**mcprune** is a middleware layer that sits between an LLM agent and the Playwright browser automation toolkit. It intercepts the raw accessibility snapshots that Playwright captures from web pages and prunes them down to only what an agent needs to understand and act on the page.

The core insight: Playwright's `ariaSnapshot` format is a YAML-like accessibility tree — the same data structure screen readers use. But raw snapshots are massive (100K-400K+ tokens for a typical e-commerce page). LLMs choke on this. mcprune applies the same filtering logic that screen readers use (landmark navigation, interactive element focus, structural collapsing) to reduce these trees by 75-95%, while preserving every actionable element, price, and ref the agent needs.

**Zero ML. Pure rule-based. 121 tests, ~630ms.**

## Architecture

```
┌──────────────┐     JSON-RPC      ┌──────────────────┐     JSON-RPC      ┌─────────────────┐
│              │  ──────────────►   │                  │  ──────────────►   │                 │
│  LLM Agent   │                   │  mcprune MCP  │                   │  Playwright MCP │
│ (Claude Code)│  ◄──────────────  │  (mcp-server.js) │  ◄──────────────  │  (subprocess)   │
│              │   pruned snapshot  │                  │   raw snapshot    │                 │
└──────────────┘                   └──────────────────┘                   └─────────────────┘
                                          │
                                    ┌─────┴─────┐
                                    │  prune()  │
                                    │ summarize()│
                                    └───────────┘
```

### Components

| File | Role |
|------|------|
| `mcp-server.js` | MCP proxy — spawns Playwright MCP, intercepts all tool responses, applies pruning |
| `src/proxy-utils.js` | Extracted proxy logic — snapshot detection, context extraction, stats formatting |
| `src/prune.js` | Core pruning engine — 9-step pipeline, mode-aware filtering |
| `src/parse.js` | YAML parser — Playwright ariaSnapshot format → JavaScript tree |
| `src/serialize.js` | YAML serializer — pruned tree → Playwright-compatible YAML with URL cleaning |
| `src/roles.js` | ARIA role taxonomy — LANDMARKS, INTERACTIVE, GROUPS, STRUCTURAL sets |

### How it works end-to-end

The mode (`act` or `browse`) controls only how mcprune prunes the snapshot response. Playwright MCP executes the actual browser action regardless of mode. The proxy is transparent — it forwards all tool calls unchanged and only modifies the response.

```
1. Agent sends tool call         →  mcprune proxy  →  Playwright MCP
   (browser_click, browser_type,     (forwards         (executes action,
    browser_navigate, etc.)           unchanged)         returns snapshot)

2. Playwright returns response   →  mcprune proxy  →  Agent receives
   with embedded ariaSnapshot        prune(snapshot,    pruned snapshot
                                     { mode, context }) + stats header
```

Detailed steps:
1. **Agent sends tool call** (e.g., `browser_navigate`, `browser_click`, `browser_snapshot`)
2. **Proxy forwards** the call unchanged to Playwright MCP subprocess
3. **Playwright executes** the browser action and returns the result (which embeds an ariaSnapshot)
4. **Proxy intercepts** the response, detects embedded snapshots via `looksLikeSnapshot()`
5. **Proxy runs** `prune(snapshot, { mode, context })` and `summarize(snapshot)`
6. **Proxy replaces** the raw snapshot with pruned version + stats header
7. **Agent receives** a compact representation with all `[ref=eN]` markers intact — it can click, type, and interact exactly as before

### Context tracking

The proxy monitors agent actions to build search context:

- `browser_type` text → captured as keywords (e.g., typing "iPhone 15" in a search box)
- `browser_navigate` URL → query params extracted (`?q=`, `?k=`, `?query=`, `?search_query=`)
- Keywords are passed to `prune()` for relevance-based card filtering

## The Pruning Pipeline

```
Raw YAML ──► parse() ──► [ANode tree]
                              │
                    1. extractRegions     ← keep landmarks matching mode (act=main only)
                    2. pruneNode          ← mode-aware: act drops paragraphs; browse keeps them
                    3. collapse           ← unwrap unnamed structural wrappers
                    4. postClean          ← trim comboboxes; act drops orphaned headings
                  ┌─── if act/navigate/full: ───┐
                  │ 5. dedupLinks               │ ← e-commerce noise removal
                  │ 6. dropNoiseButtons          │   (skipped in browse mode —
                  │ 7. truncateAfterFooter       │    docs/articles don't have
                  │ 8. dropFilterGroups          │    product card noise)
                  └─────────────────────────────┘
                    9. serialize          ← back to YAML, strip URLs
                              │
                    [pruned YAML string]
```

### Step details

| Step | Act mode | Browse mode |
|------|----------|-------------|
| **1. extractRegions** | Keep `main` only (navigate adds banner/nav/search) | Keep `main` only |
| **2. pruneNode** | Drop paragraphs, images, separators, superscripts, description headings. Keep interactive elements, prices, short labels. Context-match product cards. | Keep paragraphs, code blocks, term/definition pairs, inline links, strong/emphasis. Keep all headings. Drop superscripts, navigation inside main. Convert figures to `[Figure: caption]`. |
| **3. collapse** | Unwrap unnamed structural wrappers, collapse table layout roles | Same |
| **4. postClean** | Trim comboboxes. Drop orphaned headings (h2+ not followed by interactive content). | Trim comboboxes. Keep all headings (they structure the article). |
| **5. dedupLinks** | First-occurrence dedup per product card | **Skipped** |
| **6. dropNoiseButtons** | Remove energy labels, product sheets, sponsored, "view options" | **Skipped** |
| **7. truncateAfterFooter** | Recursive truncation at "back to top" | **Skipped** |
| **8. dropFilterGroups** | Remove sidebar filter panels | **Skipped** |
| **9. serialize** | Back to YAML, strip URLs, clean tracking params | Same |

### What browse mode preserves that act mode drops

| Content type | Act mode | Browse mode | Why |
|---|---|---|---|
| Paragraphs | Dropped | **Kept** | Article text IS the content |
| Inline links (inside paragraphs) | Dropped | **Kept** | Reference links in docs |
| Long text (>30 chars) | Dropped | **Kept** | Documentation, code examples |
| Text-only lists | Dropped | **Kept** | Instructions, bullet points |
| Description/Specification headings | Dropped | **Kept** | Section structure |
| Orphaned headings (no interactive after) | Dropped | **Kept** | Headings structure articles |
| Code blocks | Kept | **Kept** | — |
| Term/definition pairs | Dropped | **Kept** | API docs, parameter tables |
| Complementary (sidebar TOC) | Dropped | **Kept** | "In this article" navigation |
| Figures | Dropped | **Caption only** | `[Figure: description]` |
| Superscripts (footnotes) | Dropped | **Dropped** | Citation noise `[1]` `[2]` |
| Navigation inside main | Kept | **Dropped** | Wikipedia "Namespaces", "Views" chrome |

## Pruning Modes

| Mode | Regions kept | Pipeline steps | Use case |
|------|-------------|----------------|----------|
| `act` | `main` only | All 9 steps | E-commerce, forms — agent takes actions |
| `browse` | `main` only | Steps 1-4 + 9 (skip 5-8) | Docs, articles — agent reads content |
| `navigate` | `main` + `banner` + `nav` + `search` | All 9 steps | Site exploration — agent needs nav links |
| `full` | All landmarks | All 9 steps | Debugging, full page view |

The mode is set at proxy startup (`--mode act|browse`) and controls only how mcprune prunes. Playwright MCP executes all browser actions identically regardless of mode.

## ARIA Role Taxonomy

The pruning engine classifies every node by its ARIA role into four categories:

| Category | Roles | Treatment |
|----------|-------|-----------|
| **LANDMARKS** (8) | banner, main, contentinfo, navigation, complementary, search, form, region | Region extraction — mode determines which survive |
| **INTERACTIVE** (17) | button, link, textbox, searchbox, checkbox, radio, combobox, listbox, menuitem, option, slider, spinbutton, switch, tab, treeitem, ... | Always preserved — these are what agents click/type/select |
| **GROUPS** (9) | radiogroup, tablist, menu, menubar, toolbar, listbox, tree, treegrid, grid | Preserved when named — give meaning to interactive children |
| **STRUCTURAL** (12) | generic, group, list, table, row, cell, directory, document, presentation, none, separator, ... | Collapsed or removed — no semantic value for agents |

## MCP Proxy Design

### Interception strategy

The proxy intercepts **all** tool call responses, not just `browser_snapshot`. This is critical because Playwright MCP embeds a fresh ariaSnapshot in the response of every tool that triggers a page change:

- `browser_navigate` → full page snapshot
- `browser_click` → snapshot after click
- `browser_type` → snapshot after typing
- `browser_snapshot` → explicit snapshot request

### Snapshot detection

```javascript
function looksLikeSnapshot(text) {
  return /^- (banner|main|navigation|contentinfo|complementary|region|generic|heading|WebArea|link|button|search|dialog|form|textbox|list|listitem|img|text)/m.test(text);
}
```

### Response format

The proxy prepends a stats header to every pruned snapshot:

```
[mcprune: 85.8% reduction, ~100713 → ~14337 tokens | page summary here]

- main [ref=e207]:
  - heading "Results" [ref=e204] [level=2]
  ...
```

The summary line (generated by `summarize()`) gives the agent a quick overview: page title, key data (price, stock), and available actions (buttons, forms, link count).

## Test Results

### Unit tests: 121/121 passing

| Suite | File | Tests | Coverage |
|-------|------|-------|----------|
| **parse** | `test/parse.test.js` | 8 | Button with ref, states, text nodes, properties, nesting, inline text, landmarks, full Amazon fixture |
| **prune** | `test/prune.test.js` | 12 | Act mode drops (banner, footer, nav, images, descriptions, complementary, reviews, gallery), act mode keeps (interactive, radiogroups, prices), navigate mode, token reduction |
| **proxy** | `test/proxy.test.js` | 24 | Snapshot detection (true/false cases), context extraction (type, navigate, URL params, edge cases), processSnapshot formatting and passthrough |
| **edge-cases** | `test/edge-cases.test.js` | 77 | Empty/minimal inputs, no-landmark pages (HN, Wikipedia), structural collapse, context-aware pruning, summarize edge cases, browse mode content preservation (MDN, Python docs, Stack Overflow, GitHub issue, npm), round-trip parse safety (9 fixtures × 3 modes) |

### Token reduction benchmark (Amazon product fixture)

```
Input:  4,930 chars (~1,232 tokens)
Output: 1,157 chars (~289 tokens)
Reduction: 76.5%
```

### Live performance (Amazon NL, via MCP proxy)

| Page | Raw chars | Pruned chars | Reduction | Fits in Claude Code? |
|------|-----------|-------------|-----------|---------------------|
| Amazon NL homepage | ~30K | ~8K | 75.5% | Yes |
| Amazon NL search "iPhone 15" | ~400K | ~57K | 85.8% | Yes (warning at ~14K tokens) |
| Amazon NL product page | ~111K | ~13K | 88.0% | Yes (~3.3K tokens) |

### What the agent can do with pruned output

**Act mode** — the pruned snapshot preserves:
- All `[ref=eN]` markers for clicking/typing
- All interactive elements (buttons, links, textboxes, comboboxes)
- Product titles, prices, ratings, stock status
- Page structure (headings, lists of results)
- Form state (selected options, checked boxes)

The agent can: navigate, search, click products, add to cart, fill forms, compare products.

**Browse mode** — additionally preserves:
- Paragraphs, article text, documentation content
- Code blocks, term/definition pairs
- Inline links within paragraphs (reference links in docs)
- All headings (structure articles and docs)
- Complementary sidebars (table of contents)
- Figure captions

The agent can: read documentation, follow reference links, understand API parameters.

## Test Fixtures (9 in repo)

| Fixture | Size | Type | Primary mode |
|---------|------|------|-------------|
| `amazon-product.yaml` | 4.9K | E-commerce product page | act |
| `live-gov-uk-form.yaml` | 4.6K | Government form | act |
| `live-hackernews.yaml` | 40K | Forum/news (no landmarks) | act |
| `live-wikipedia.yaml` | 121K | Reference/wiki | browse |
| `live-mdn-docs.yaml` | 39K | Developer documentation | browse |
| `live-python-docs.yaml` | 89K | Language documentation | browse |
| `live-stackoverflow.yaml` | 67K | Q&A site | browse |
| `live-github-issue.yaml` | 8.3K | Code repository PR page | browse |
| `live-npm-package.yaml` | 20K | Package registry | browse |

## Usage

### As a library

```javascript
import { prune, summarize } from 'mcprune';

const snapshot = await page.locator('body').ariaSnapshot();

// Prune for action-taking agent
const pruned = prune(snapshot, { mode: 'act', context: 'iPhone 15 price' });

// Get one-line summary
const summary = summarize(snapshot);
// → "Apple iPhone 15 (128GB) - Black (€609.00) | pick color(5), pick size(2), set quantity, add to basket, buy now, 91 links"
```

### As an MCP server (middleware)

```json
{
  "mcpServers": {
    "a11y-browser": {
      "command": "node",
      "args": ["/path/to/a11y-parser/mcp-server.js", "--mode", "act"],
      "type": "stdio"
    }
  }
}
```

The MCP server exposes the same tools as Playwright MCP (`browser_navigate`, `browser_click`, `browser_snapshot`, etc.) but every response with a snapshot is automatically pruned.

Options:
- `--headless` — run browser without visible window
- `--mode act|browse|navigate|full` — pruning mode (default: `act`)

### Running tests

```bash
npm test                          # 121 unit tests
node scripts/capture-live.js      # capture snapshots from 5 live sites
node scripts/capture-dev-sites.js # capture developer/docs site snapshots
node scripts/capture-amazon-nl.js # interactive Amazon NL test
node scripts/capture-batch2.js    # batch capture from 8 diverse sites
```

## Design Decisions

### Why rule-based, not ML?

1. **Deterministic** — same input always produces same output
2. **Fast** — no model loading, no inference latency, runs in <1ms per snapshot
3. **Transparent** — every pruning decision traces to a specific rule
4. **No dependencies** — no onnxruntime, no embeddings, no API calls
5. **Correct by construction** — ARIA roles are a finite, well-specified taxonomy

### Why strip URLs?

Agents interact with pages via `[ref=eN]` markers, not URLs. On Amazon NL search results, URLs accounted for **62% of the pruned output** before stripping. They're full of tracking parameters, ad redirect chains, and encoded session data. Stripping them is the single highest-impact optimization.

### Why intercept all tool responses?

Playwright MCP embeds a fresh ariaSnapshot in the response of every action tool (`browser_click`, `browser_type`, `browser_navigate`), not just `browser_snapshot`. If the proxy only intercepted `browser_snapshot`, the agent would still receive raw 100K+ snapshots every time it clicked a button.

### Why recursive footer truncation?

On live pages, footer markers ("Back to top" buttons) are often nested inside wrapper nodes (`generic [ref=eN]`), not at the top level. A non-recursive check misses them entirely, leaving corporate links, subsidiary listings, and legal text in the output.

### Why context-aware pruning?

When an agent searches for "iPhone 15", it doesn't need full details for every iPhone 11, iPhone 12, and Redmi Note card on the page. Context keywords enable collapsing irrelevant cards to just their title, while preserving full details for matching products. This transforms search pages from "everything" to "what you searched for + browsable titles for the rest."

## What it achieves

| Metric | Before | After | Impact |
|--------|--------|-------|--------|
| Amazon search page tokens | ~100K | ~14K | Fits in Claude Code tool result limits |
| Amazon product page tokens | ~28K | ~3.3K | No token warning, fast agent response |
| Agent can click by ref? | Yes | Yes | Refs preserved through pruning |
| Agent understands prices? | Buried in noise | Prominent | Short text kept, descriptions dropped |
| Agent can navigate? | Overwhelmed | Clear structure | Landmarks + headings + interactive elements |
| Footer/legal noise? | 20-30% of page | 0% | Recursively truncated |
| Tracking URLs? | 62% of output | 0% | Stripped (agents use refs) |
| Duplicate links? | 3x per product card | 1x | First-occurrence dedup |
| Sidebar filters? | 20+ groups | 0 | Pattern-matched and dropped |
