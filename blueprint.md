# mcprune: Blueprint

> Screen-reader-inspired accessibility tree pruning for LLM agents

## What is this?

**mcprune** is a middleware layer that sits between an LLM agent and the Playwright browser automation toolkit. It intercepts the raw accessibility snapshots that Playwright captures from web pages and prunes them down to only what an agent needs to understand and act on the page.

The core insight: Playwright's `ariaSnapshot` format is a YAML-like accessibility tree — the same data structure screen readers use. But raw snapshots are massive (100K-400K+ tokens for a typical e-commerce page). LLMs choke on this. mcprune applies the same filtering logic that screen readers use (landmark navigation, interactive element focus, structural collapsing) to reduce these trees by 75-95%, while preserving every actionable element, price, and ref the agent needs.

**Zero ML. Pure rule-based. ~230ms for 20 tests.**

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
| `src/prune.js` | Core pruning engine — 9-step pipeline, context-aware filtering |
| `src/parse.js` | YAML parser — Playwright ariaSnapshot format → JavaScript tree |
| `src/serialize.js` | YAML serializer — pruned tree → Playwright-compatible YAML with URL cleaning |
| `src/roles.js` | ARIA role taxonomy — LANDMARKS, INTERACTIVE, GROUPS, STRUCTURAL sets |

### How it works end-to-end

1. **Agent sends tool call** (e.g., `browser_navigate`, `browser_click`, `browser_snapshot`)
2. **Proxy forwards** the call to Playwright MCP subprocess
3. **Playwright executes** the browser action and returns the result (which embeds an ariaSnapshot)
4. **Proxy intercepts** the response, detects embedded snapshots via `looksLikeSnapshot()`
5. **Proxy runs** `prune(snapshot, { mode, context })` and `summarize(snapshot)`
6. **Proxy replaces** the raw snapshot with pruned version + stats header
7. **Agent receives** a compact, actionable page representation with all refs intact

### Context tracking

The proxy monitors agent actions to build search context:

- `browser_type` text → captured as keywords (e.g., typing "iPhone 15" in a search box)
- `browser_navigate` URL → query params extracted (`?q=`, `?k=`, `?query=`, `?search_query=`)
- Keywords are passed to `prune()` for relevance-based card filtering

## The 9-Step Pruning Pipeline

```
Raw YAML ──► parse() ──► [ANode tree]
                              │
                    1. extractRegions     ← keep landmarks matching mode (act=main only)
                    2. pruneNode          ← drop paragraphs, images, desc headings; context-match cards
                    3. collapse           ← unwrap unnamed structural wrappers (generic > generic > button → button)
                    4. postClean          ← trim combobox options, drop orphaned headings
                    5. dedupLinks         ← first-occurrence dedup per product card
                    6. dropNoiseButtons   ← energy labels, product sheets, sponsored, "view options"
                    7. truncateAfterFooter ← recursive: everything after "back to top" is noise
                    8. dropFilterGroups   ← sidebar refinement panels
                    9. serialize          ← back to YAML, strip URLs, clean tracking params
                              │
                    [pruned YAML string]
```

### Step details

| Step | What it does | Why |
|------|-------------|-----|
| **1. extractRegions** | Keeps only landmarks matching the mode (act → `main` only; navigate → `main` + `banner` + `nav` + `search`). If no `main` exists, falls back to interactive content outside landmarks. | Pages without landmarks (HN) get everything; pages with landmarks get surgical extraction |
| **2. pruneNode** | Drops paragraphs, images, separators, superscripts, description headings. Keeps all interactive elements, prices, stock text, short labels. Context-aware: product cards with zero keyword matches collapse to title-only. Color swatch groups compress to `kleuren(5): Black, Blue, ...` | This is the core value — 50-60% reduction happens here |
| **3. collapse** | Unwraps unnamed structural wrappers. `generic > generic > button "Buy"` becomes `button "Buy"`. Table layout roles (row, cell) always collapse. | Playwright's tree is deeply nested — agents don't need wrapper hierarchy |
| **4. postClean** | Trims combobox/listbox children to just selected value. Drops headings not followed by interactive content. | A combobox with 50 options → just the combobox name + current value |
| **5. dedupLinks** | Within each product card (listitem), keeps only first occurrence of each link text. | Amazon product cards have 3+ links to the same product (image, title, rating) |
| **6. dropNoiseButtons** | Removes energy class labels, product information sheets, sponsored ad feedback, "view options" links, footer legal links. | These appear 10-30x per search page and add zero agent value |
| **7. truncateAfterFooter** | Recursively truncates at "back to top" buttons, h6 headings, "related searches" headings. Works even when footer is nested inside wrapper nodes. | Everything after the footer is corporate links, legal text, subsidiaries |
| **8. dropFilterGroups** | Removes sidebar filter panels detected by text patterns. | Filter groups on Amazon NL are 20+ collapsible sections — massive bloat |
| **9. serialize** | Converts tree back to Playwright YAML. Strips `/url` properties (agents click by ref). Cleans tracking params from any remaining URLs. Truncates long URLs. | URLs were 62% of pre-strip output. Tracking params add nothing. |

## Pruning Modes

| Mode | Regions kept | Use case |
|------|-------------|----------|
| `act` | `main` only | E-commerce, forms — agent needs to take actions |
| `browse` | `main` only | Reading content — same regions, less aggressive text dropping |
| `navigate` | `main`, `banner`, `navigation`, `search` | Site exploration — agent needs nav links and search |
| `full` | All landmarks | Debugging, full page understanding |

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

### Unit tests: 20/20 passing

| Suite | Tests | Coverage |
|-------|-------|----------|
| **parse** | 8 | Button with ref, states, text nodes, properties, nesting, inline text, landmarks, full Amazon fixture |
| **prune** | 11 | Act mode drops (banner, footer, nav, images, descriptions, complementary, reviews, gallery buttons), act mode keeps (interactive, radiogroups, prices), navigate mode, token reduction assertion |
| **summarize** | 1 | One-line summary format validation |

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

The pruned snapshot preserves:
- All `[ref=eN]` markers for clicking/typing
- All interactive elements (buttons, links, textboxes, comboboxes)
- Product titles, prices, ratings, stock status
- Page structure (headings, lists of results)
- Form state (selected options, checked boxes)

The agent can: navigate, search, click products, add to cart, fill forms, compare products — all from the pruned snapshot.

## Test Fixtures (15 sites)

| Fixture | Size | Type |
|---------|------|------|
| `amazon-product.yaml` | 4.9K | E-commerce product page |
| `live-amazon-nl-search.yaml` | 422K | E-commerce search results |
| `live-amazon-nl-product.yaml` | 65K | E-commerce product page (NL) |
| `live-airbnb.yaml` | 21K | Travel/SPA |
| `live-allbirds.yaml` | 27K | Shopify e-commerce |
| `live-bbc-news.yaml` | 38K | News site |
| `live-booking-search.yaml` | 2.9K | Travel booking |
| `live-craigslist.yaml` | 1.4K | Classifieds |
| `live-github-repo.yaml` | 23K | Code repository |
| `live-google-search.yaml` | 437B | Search engine |
| `live-gov-uk-form.yaml` | 4.6K | Government form |
| `live-gov-uk.yaml` | 7.9K | Government info |
| `live-hackernews.yaml` | 40K | Forum/news |
| `live-todomvc.yaml` | 2.0K | SPA |
| `live-wikipedia.yaml` | 121K | Reference/wiki |

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
npm test                          # 20 unit tests
node test/capture-live.js         # capture snapshots from 5 live sites
node test/capture-amazon-nl.js    # interactive Amazon NL test
node test/capture-batch2.js       # batch capture from 8 diverse sites
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
