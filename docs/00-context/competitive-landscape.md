# Competitive Landscape & Strategic Position

## The goal

Make accessibility-tree-based browsing so reliable that agents don't need screenshots, pixel coordinates, or WebMCP-style DOM interaction. Agents should be fully autonomous with just pruned aria snapshots — reading docs, shopping, filling forms, researching — all from structured text with refs to click.

## How others approach the problem

### Playwright MCP (Microsoft) — does nothing

The official Playwright MCP dumps the raw accessibility tree. No pruning, no filtering, no token awareness. 100K-400K tokens per page. This is the gap.

### fast-playwright-mcp (tontoko) — forked Playwright MCP

Forked the entire Playwright MCP codebase and added:
- `includeSnapshot: false` — skip snapshots entirely (70-80% savings)
- `browser_batch_execute` — batch multiple actions, skip intermediate snapshots (90% savings)
- `snapshotOptions.selector` — CSS selector to capture only a page section
- `diffOptions` — track only what changed since last snapshot
- Image compression (JPEG quality settings)

**Strengths**: Deep integration. Can modify tool parameters, add new tools, control what Playwright captures before it captures it. Batch execution is genuinely clever — 5 clicks = 1 round-trip instead of 5.

**Weaknesses**: Maintenance burden — every Playwright MCP update needs a merge. The agent must know which CSS selector to use (defeats autonomous browsing). `includeSnapshot: false` means the agent is flying blind. Diff detection assumes sequential browsing.

### Better Playwright (Skywork) — DOM compression

Claims 91% DOM reduction using SimHash pattern detection, text truncation, list folding. Works on the DOM, not the accessibility tree.

**Strengths**: High reduction rates.

**Weaknesses**: DOM is fragile (class names change, structure varies). Accessibility tree is semantic and stable.

### Playwright CLI approach — save to disk

Instead of streaming snapshots into context, save them to files. Agent reads what it needs. ~4x fewer tokens than MCP.

**Strengths**: Agent chooses what to load.

**Weaknesses**: Extra round-trips. Agent must decide what to read without seeing anything first.

### Vision/screenshot agents — pixel-based

Send screenshots to multimodal LLMs. Click by coordinates.

**Strengths**: Works on any page regardless of a11y quality.

**Weaknesses**: Expensive (image tokens), slow, coordinate-based clicking is fragile, can't "read" text efficiently.

## mcprune's position

The only approach that:
1. Works on the **accessibility tree** (semantic, stable across site redesigns)
2. Is **transparent** — agent doesn't know it's pruned, same tools, same refs
3. Is **rule-based** — deterministic, no ML overhead, <1ms per snapshot
4. Preserves **all refs** — every interactive element stays clickable
5. Is **zero-config for the agent** — no selector knowledge, no batch planning needed

## Fork vs proxy — why proxy is right (for now)

### Why tontoko forked

To add capabilities the proxy can't:
- New tool parameters (`includeSnapshot`, `snapshotOptions.selector`)
- New tools (`browser_batch_execute`)
- Request-side modifications (the proxy only touches responses)

### Why we didn't fork

1. **Maintenance burden**: Playwright MCP is actively developed by Microsoft. A fork means tracking upstream changes, resolving merge conflicts, staying compatible with breaking changes. For a POC, this is a distraction.

2. **Scope alignment**: mcprune's job is pruning the response, not controlling the request. The proxy does exactly this — intercept, prune, forward. Clean separation of concerns.

3. **Compatibility**: The proxy works with any Playwright MCP version. Swap in a newer version and it still works. A fork pins you to a specific version.

4. **Agent transparency**: The agent talks to what it thinks is Playwright MCP. It doesn't need to learn new tools or parameters. This matters for adoption — any MCP client works unchanged.

### When a fork would make sense

If mcprune graduates beyond POC and needs:
- **Request-side filtering** — tell Playwright to only capture a section of the page
- **Batch execution** — combine multiple actions into one round-trip
- **Selective snapshot** — skip snapshots for known-safe actions (typing a character doesn't need a full snapshot)
- **Token budgets** — tell Playwright "give me at most N nodes"

These require modifying what Playwright does, not just what we do with its output. That's fork territory. But we're not there yet.

## Auto mode detection — how to decide act vs browse

### The problem

Mode is a static flag (`--mode act|browse`). If an agent is shopping AND reading reviews, it's stuck. Auto-detection would make mcprune invisible.

### Signals available to the proxy

The proxy sees every JSON-RPC message. It can detect:

| Signal | Source | Indicator |
|---|---|---|
| **URL patterns** | `browser_navigate` URL | `docs.*`, `*.readthedocs.io`, `stackoverflow.com`, `github.com/*/issues` → browse; `amazon.*`, `ebay.*`, `*.shop` → act |
| **Content analysis** | Snapshot response (pre-prune) | Paragraph-to-interactive ratio. High paragraphs + code blocks = browse. High links + buttons + prices = act |
| **Page structure** | Snapshot response | Presence of `<article>`, `<code>`, term/definition pairs → browse. Presence of price patterns, add-to-cart buttons → act |
| **Agent behavior** | Tool call patterns | Lots of `browser_click` = act. `browser_snapshot` after navigate = browse/reading |

### Proposed approach: per-snapshot detection

Don't set mode globally. Detect per response:

```
1. Receive raw snapshot from Playwright
2. Quick scan (before full prune):
   - Count paragraphs with >50 chars
   - Count code blocks
   - Count interactive elements
   - Check for price patterns (€, $, £ followed by digits)
   - Check URL against known patterns
3. If (paragraphs + code) / interactive > 2.0 → browse
   If price patterns found → act
   If URL matches known docs domain → browse
   Default → act
4. Prune with detected mode
5. Include detected mode in stats header: [mcprune: 85% reduction, mode=browse | ...]
```

### Risks

- Misclassification: a product page with long reviews might flip to browse, losing the buy buttons. Mitigation: act mode already keeps interactive elements, so misclassifying as browse only adds extra text — it doesn't lose anything actionable.
- Performance: the pre-scan adds ~1ms. Negligible.
- Predictability: harder to debug when mode changes per page. Mitigation: log detected mode in stats header.

### Alternative: agent-directed mode

Let the agent set mode per request via a tool parameter. The proxy could expose a `browser_set_mode` tool or read a special header. This gives the agent control but requires agent awareness of mcprune.

## Intent detection — what the agent is trying to do

### Beyond act/browse

The real question isn't "act or browse" — it's "what does the agent need from this page?"

| Intent | What to keep | How to detect |
|---|---|---|
| **Buy something** | Prices, options, add-to-cart, quantities | Price patterns + cart buttons in snapshot |
| **Research/read** | Paragraphs, code, headings, definitions | High text density, code blocks, docs URL |
| **Navigate/explore** | Nav links, search, site structure | Agent just navigated to new domain, or homepage URL |
| **Fill a form** | Form fields, labels, submit buttons | Form landmark present, textboxes + radio/checkbox |
| **Compare** | Multiple product cards, specs tables | Search results page pattern, multiple similar listitems |
| **Monitor** | Specific data points (price, stock, status) | Repeated visits to same page |

The proxy can't see the agent's system prompt or conversation — it only sees tool calls and responses. But tool calls + URL + snapshot content give enough signal for the common cases.

## What's next — honest priority assessment

### Current state

mcprune is a working POC. The pruning pipeline handles act (e-commerce) well and browse (docs) adequately. 121 tests pass. But it hasn't been validated with a real agent completing real tasks.

### Priority 1: Validate with real agent tasks

Before building more features, prove the core works:

- **Act mode validation**: Give Claude Code + mcprune 5 e-commerce tasks (search product, compare prices, add to cart, fill shipping form, find specific spec). Measure: task completion rate, token usage, errors where pruning lost critical info.
- **Browse mode validation**: Give Claude Code + mcprune 5 research tasks (find API usage in docs, answer SO question, read GitHub issue, find npm package version, follow tutorial steps). Measure: same metrics.
- **Baseline comparison**: Run same tasks with raw Playwright MCP (no pruning). Compare token usage and completion rate.

This is the only way to know if mcprune actually helps or if it's pruning things agents need.

### Priority 2: Auto mode detection

After validation confirms both modes work, implement per-snapshot mode detection so users don't need the `--mode` flag. This is the difference between "dev tool" and "drop-in replacement."

### Priority 3: Section-level extraction for browse

Large docs pages (89K Python docs) still produce too many tokens even after pruning. Need a way to extract the relevant section, not the whole page. Could use heading hierarchy — agent asks for a topic, mcprune finds the matching heading and returns that section + N levels deep.

### Priority 4: Site-agnostic noise patterns

Replace Dutch/Amazon-specific patterns with generic ones. "Sponsored" is universal. "Energielabel" is not. Make noise patterns configurable or detected from page language.

### What we're NOT doing next

- **Forking Playwright MCP** — maintenance overhead, POC not proven yet
- **Batch execution** — valuable but changes the agent interface, breaks transparency
- **ML-based pruning** — contradicts the core design principle
- **Multi-page flow tracking** — scope creep, the agent handles this
