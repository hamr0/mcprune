# mcprune

MCP middleware that prunes Playwright accessibility snapshots for LLM agents.
Zero ML, 75-95% token reduction, all refs preserved.

## The problem

Playwright MCP gives LLM agents browser control via accessibility snapshots — YAML trees of every element on the page. But real pages produce **100K-400K+ tokens** per snapshot. That's too large for any LLM context window to handle effectively.

mcprune sits between the agent and Playwright MCP, intercepting every response and pruning snapshots down to only what the agent needs: interactive elements, prices, headings, and refs to click.

```
Agent  ←→  mcprune (proxy)  ←→  Playwright MCP  ←→  Browser
              ↓
         prune() + summarize()
         75-95% token reduction
```

## Before / After

**Amazon search page — raw Playwright snapshot:**
~100,000 tokens. Includes every pixel-level wrapper, tracking URL, sidebar filter, energy label, legal footer, and duplicated link.

**After mcprune:**
~14,000 tokens. Product titles, prices, ratings, color options, "Add to basket" buttons, and clickable refs. Everything an agent needs to shop.

**Amazon product page:**
~28,000 tokens → **~3,300 tokens** (88% reduction). Full buy flow preserved.

## Quick start

### As an MCP server (recommended)

Add to your Claude Code, Cursor, or any MCP client config:

```json
{
  "mcpServers": {
    "browser": {
      "command": "node",
      "args": ["/path/to/mcprune/mcp-server.js"]
    }
  }
}
```

That's it. The agent gets all Playwright browser tools (`browser_navigate`, `browser_click`, `browser_type`, `browser_snapshot`, etc.) with automatic pruning on every response.

Options:
- `--headless` — run browser without visible window
- `--mode act|browse|navigate|full` — pruning mode (default: `act`)

### As a library

```javascript
import { prune, summarize } from 'mcprune';

const snapshot = await page.locator('body').ariaSnapshot();

const pruned = prune(snapshot, {
  mode: 'act',
  context: 'iPhone 15 price'  // optional: keywords for relevance filtering
});

const summary = summarize(snapshot);
// → "Apple iPhone 15 (128GB) - Black | pick color(5), set quantity, add to basket, buy now, 91 links"
```

## How it works

A 9-step rule-based pipeline. No ML, no embeddings, no API calls.

| Step | What | Why |
|------|------|-----|
| 1. **Extract regions** | Keep landmarks matching the mode (`act` → `main` only) | Drop banner, footer, sidebar in action mode |
| 2. **Prune nodes** | Drop paragraphs, images, descriptions. Keep interactive elements, prices, short labels | Core reduction — 50-60% happens here |
| 3. **Collapse wrappers** | `generic > generic > button "Buy"` → `button "Buy"` | Playwright trees are deeply nested |
| 4. **Clean up** | Trim combobox options, drop orphaned headings | A 50-option dropdown → just the combobox name |
| 5. **Dedup links** | One link per unique text per product card | Amazon cards have 3+ links to the same product |
| 6. **Drop noise** | Energy labels, product sheets, ad feedback, "view options" | These repeat 10-30x per search page |
| 7. **Truncate footer** | Everything after "back to top" is noise | Corporate links, legal text, subsidiaries |
| 8. **Drop filters** | Sidebar refinement panels | 20+ collapsible filter groups on Amazon |
| 9. **Serialize** | Back to YAML, strip URLs, clean tracking params | URLs were 62% of output — agents click by ref |

### Context-aware pruning

When the agent types a search query, mcprune captures it as context. Product cards that don't match any keywords are collapsed to just their title, while matching products keep full details.

```
Agent types "iPhone 15" in search box
  → mcprune captures context: ["iphone", "15"]
  → Matching cards: full price, rating, colors, buttons
  → Non-matching cards: title only
```

## Pruning modes

The mode controls **only how mcprune prunes** the snapshot. Playwright MCP executes all browser actions identically regardless of mode.

| Mode | Regions kept | Pipeline | Use case |
|------|-------------|----------|----------|
| `act` | `main` only | All 9 steps | Shopping, forms, taking actions |
| `browse` | `main` only | Steps 1-4 + 9 (skip e-commerce noise removal) | Docs, articles, reading content |
| `navigate` | `main` + `banner` + `nav` + `search` | All 9 steps | Site exploration |
| `full` | All landmarks | All 9 steps | Debugging, full page view |

**Browse mode** preserves paragraphs, code blocks, term/definition pairs, inline links, all headings, and figure captions — content that `act` mode drops because agents taking actions don't need article text.

## Performance

Tested live via MCP proxy:

| Page | Raw | Pruned | Reduction |
|------|-----|--------|-----------|
| Amazon NL search (30 products) | ~100K tokens | ~14K tokens | 85.8% |
| Amazon NL product page | ~28K tokens | ~3.3K tokens | 88.0% |
| Wikipedia article (browse) | ~54K tokens | ~8.6K tokens | 84.0% |
| MDN docs (browse) | ~10K tokens | ~5.5K tokens | ~43% |
| Python docs (browse) | ~22K tokens | ~17K tokens | ~23% |
| Amazon product (fixture) | ~1.2K tokens | ~289 tokens | 76.5% |

All refs (`[ref=eN]`) are preserved. The agent can click, type, and interact with every element in the pruned output.

## Install

```bash
git clone https://github.com/hamr0/mcprune.git
cd mcprune
npm install
npx playwright install chromium
```

## Test

```bash
npm test  # 121 tests
```

## Project structure

```
mcprune/
  mcp-server.js       MCP proxy — entry point, spawns Playwright MCP
  src/
    prune.js           9-step pruning pipeline + summarize(), mode-aware filtering
    parse.js           Playwright ariaSnapshot YAML → tree
    serialize.js       Tree → YAML, URL cleaning
    roles.js           ARIA role taxonomy (LANDMARKS, INTERACTIVE, STRUCTURAL, ...)
    proxy-utils.js     Extracted proxy logic (snapshot detection, context, stats)
  test/
    parse.test.js      8 parser tests
    prune.test.js      12 prune + summarize tests
    proxy.test.js      24 proxy utility tests
    edge-cases.test.js 77 edge case + browse mode + regression tests
    fixtures/          9 real-world page snapshots (e-commerce, docs, forums, gov)
  scripts/             Dev tools for capturing live snapshots
  blueprint.md         Detailed technical documentation
  docs/                Structured project documentation
```

## How the MCP proxy works

1. Spawns `@playwright/mcp` as a child process over stdio
2. Forwards all JSON-RPC messages bidirectionally
3. Tracks context from `browser_type` text and `browser_navigate` URL params
4. Intercepts **all** tool responses (not just `browser_snapshot` — Playwright embeds snapshots in `browser_click`, `browser_type`, etc.)
5. Detects snapshots via regex, runs `prune()` + `summarize()`
6. Prepends a stats header: `[mcprune: 85.8% reduction, ~100K → ~14K tokens | page summary]`

## License

MIT
