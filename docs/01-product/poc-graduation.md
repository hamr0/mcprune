# POC Graduation Criteria

## What "POC done" means

mcprune graduates from POC when we can say with evidence:

> **Pruned accessibility snapshots let LLM agents complete browsing tasks with fewer tokens and equal or better accuracy than raw snapshots.**

Not "the output looks correct." Not "121 tests pass." Not "85% reduction." The question is: **does an agent using mcprune actually finish its job?**

## Current state (what we've built)

| Component | Status | Confidence |
|---|---|---|
| Parse Playwright ariaSnapshot YAML | Done, 8 tests | High |
| 9-step pruning pipeline | Done, 12 tests | High for act, medium for browse |
| Act mode (e-commerce, forms) | Tuned against Amazon NL, gov.uk, Airbnb, Allbirds | Medium — no agent validation |
| Browse mode (docs, articles) | Tuned against MDN, Python docs, SO, GitHub, npm | Low — no agent validation |
| MCP proxy (transparent middleware) | Done, 24 tests | High |
| Edge cases + regression | 77 tests, 9 fixtures × 3 modes round-trip | High |
| Auto mode detection | Not started | — |
| Agent task validation | Not started | — |

**The gap**: Everything above validates the *output*. Nothing validates the *outcome*.

## POC graduation checklist

### Gate 1: Act mode works for agents (e-commerce tasks)

Run 5 real tasks through Claude Code + mcprune proxy in act mode. Each task must complete successfully — the agent reaches the goal state using only the pruned snapshot.

| # | Task | Site | Success = |
|---|---|---|---|
| A1 | Search for "iPhone 15" and find the cheapest option | Amazon | Agent identifies product with lowest price |
| A2 | Navigate to a product and read its specs (storage, color options) | Amazon | Agent correctly reports available options |
| A3 | Fill out "Where do you live?" form and submit | gov.uk | Agent selects correct radio button and clicks Continue |
| A4 | Search for accommodation in Amsterdam, read first result | Booking/Airbnb | Agent reports property name, price, key details |
| A5 | Find a product, select size/color, add to cart | Allbirds or similar | Agent reaches cart-added confirmation |

**Pass criteria**: 4/5 tasks complete. For each task, record:
- Token usage (mcprune vs baseline)
- Steps taken (click count)
- Any moment where pruning lost critical info (error log)

### Gate 2: Browse mode works for agents (research tasks)

Run 5 real tasks through Claude Code + mcprune proxy in browse mode.

| # | Task | Site | Success = |
|---|---|---|---|
| B1 | Find the signature of `Array.prototype.reduce()` | MDN | Agent returns correct parameters and return type |
| B2 | What does the `nonlocal` keyword do in Python? | Python docs | Agent explains correctly with example |
| B3 | Find the accepted answer to "How to merge two dicts in Python" | Stack Overflow | Agent returns the code from the accepted answer |
| B4 | Read a GitHub issue/PR and summarize what changed | GitHub | Agent correctly summarizes the PR purpose and status |
| B5 | Find the latest version and install command for `express` | npm | Agent returns correct version number and `npm install` command |

**Pass criteria**: 4/5 tasks complete. Same metrics.

### Gate 3: Token savings are real

Compare token usage for the 10 tasks above against a baseline (raw Playwright MCP, no pruning).

| Metric | Target |
|---|---|
| Average token reduction across 10 tasks | >60% |
| No task uses MORE tokens with mcprune than without | 0 regressions |
| No task FAILS with mcprune that succeeds without | 0 regressions |

If a task fails with mcprune but succeeds without, that's a pruning bug — the pipeline is dropping something the agent needs. Fix it before graduating.

### Gate 4: Auto mode detection (merge intent into pipeline)

The static `--mode act|browse` flag is a developer-facing workaround. For mcprune to be a real tool, mode selection must be automatic.

#### How it works

Per-snapshot detection in `processSnapshot()`. No global flag needed.

```
Snapshot arrives from Playwright
        │
        ▼
  ┌─────────────────────────────┐
  │  1. URL check               │
  │  Known docs domains?        │──── yes ──→ browse
  │  Known shopping domains?    │──── yes ──→ act
  └─────────┬───────────────────┘
            │ unknown domain
            ▼
  ┌─────────────────────────────┐
  │  2. Content scan            │
  │  Count in raw snapshot:     │
  │  - paragraphs (>50 chars)   │
  │  - code blocks              │
  │  - interactive elements     │
  │  - price patterns (€$£+dig) │
  └─────────┬───────────────────┘
            │
            ▼
  ┌─────────────────────────────┐
  │  3. Decide                  │
  │                             │
  │  prices found?      → act   │
  │  (para+code)/inter  │
  │     > 2.0?          → browse│
  │  else               → act   │
  └─────────────────────────────┘
```

#### URL patterns

```javascript
const BROWSE_DOMAINS = [
  /docs\./, /\.readthedocs\./, /developer\./, /devdocs\./,
  /stackoverflow\.com/, /stackexchange\.com/,
  /github\.com\/.*\/(issues|pull|discussions)/,
  /wiki/, /medium\.com/, /dev\.to/,
  /python\.org\/.*\/docs/, /nodejs\.org\/.*\/docs/,
  /mdn\./, /npmjs\.com\/package\//,
  /man7\.org/, /linux\.die\.net/
];

const ACT_DOMAINS = [
  /amazon\./, /ebay\./, /\.shop/, /shopify\./,
  /booking\.com/, /airbnb\./, /hotels\.com/,
  /walmart\./, /target\.com/, /bestbuy\.com/
];
```

#### Content heuristics

Quick regex scan on the raw snapshot (before parsing):
- `paragraphs`: count lines matching `- paragraph:` with text children >50 chars
- `code`: count lines matching `- code:`
- `interactive`: count lines matching `- (button|link|textbox|searchbox|checkbox|radio|combobox)`
- `prices`: check for `/[$€£¥]\s?\d/` or `/\d+[.,]\d{2}\s?(USD|EUR|GBP)/`

#### Safety

Misclassifying as **browse** when it should be **act**: extra text in output, no loss of interactive elements. Agent can still click everything. Cost: slightly more tokens.

Misclassifying as **act** when it should be **browse**: content paragraphs dropped. Agent can't read article text. Cost: task failure.

**Therefore default to browse when uncertain.** Browse mode is a superset — it keeps everything act keeps, plus content. The penalty is tokens, not correctness.

#### Stats header

Include detected mode so the agent and user can see what happened:

```
[mcprune: 85% reduction, mode=act (auto) | iPhone 15 - €609.00 | add to cart, buy now, 91 links]
[mcprune: 34% reduction, mode=browse (auto) | Array.prototype.reduce() - MDN | 12 headings, 8 code blocks, 45 links]
```

#### Pass criteria

- Auto-detection agrees with manual mode on 8/10 of the validation tasks
- No task that passed with manual mode fails with auto mode
- Default-browse safety net catches edge cases without breaking act tasks

## Phases after POC

### Phase 2: Integration

mcprune is proven. Now make it easy to use:

- npm package publication
- Zero-config setup (auto mode, no flags needed)
- Config file support (custom domain lists, noise patterns)
- CI/CD for test fixtures (capture fresh snapshots weekly, detect regressions)
- Site-agnostic noise patterns (replace Dutch-specific with generic)

### Phase 3: Advanced features

- Section-level extraction for large docs (heading-based windowing)
- Page state diffing ("dialog appeared with 2 buttons" instead of full re-snapshot)
- Multi-tab index via summarize() for agent routing
- Batch-aware pruning (skip intermediate snapshots for chained actions)
- Token budgets (hard cap on output size, progressive detail reduction)

### Phase 4: Standalone browsing MCP

If the proxy approach hits its limits:
- Fork Playwright MCP or build standalone
- Smart wait strategies (a11y tree readiness detection)
- Obstacle auto-handling (cookie banners, modals, age gates)
- Governance hooks for sensitive actions

## What we're NOT doing during POC

- npm publish (tool isn't proven yet)
- Forking Playwright MCP (proxy is sufficient)
- Building a standalone browsing MCP (premature)
- ML/embedding anything (contradicts core design)
- Multi-page flow tracking (agent handles this)
- Bot detection / stealth (orthogonal problem)

## Timeline

The POC is 4 gates. Gates 1-3 can run in parallel (validation tasks). Gate 4 (auto detection) can start after gates 1-2 confirm both modes work.

Estimated effort:
- Gates 1-3: 1-2 sessions of real agent testing + baseline comparison
- Gate 4: ~50 lines of code + tests for auto detection
- Total: 2-3 sessions to graduate POC
