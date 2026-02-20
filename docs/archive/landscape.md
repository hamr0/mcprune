# A11y-Based Agentic Browsing: Landscape & Market Analysis

## The Problem

LLM agents need to interact with websites. Current approaches:

- **Web scraping** — fragile, breaks on CSS/layout changes, adversarial
- **Browser automation (DOM/selectors)** — brittle CSS selectors, XPath, huge HTML payloads
- **Screenshot/vision** — expensive tokens, slow, coordinate-based clicking
- **Per-site MCP servers** — manually built (GitHub MCP, Slack MCP), doesn't scale

None use the interface layer that's already there: the **accessibility tree**.

## The Insight

Every browser computes an accessibility tree for every page — a parallel representation of the DOM stripped down to roles, names, and states. Built for screen readers (VoiceOver, NVDA, JAWS), standardized by W3C ARIA spec.

Key properties:
- **Always exists** — browser builds it automatically, no opt-in
- **CSS-resilient** — decoupled from visual presentation by definition
- **Human-readable labels** — "Add to Cart", not `.btn-primary-v3`
- **Standardized vocabulary** — `button`, `link`, `textbox`, `radiogroup` across all sites
- **Can't be blocked** — blocking it would break screen readers, violating accessibility law
- **Legally improving** — EU Accessibility Act (June 2025) forces WCAG 2.1 AA compliance on e-commerce, banking, telecom across 27 EU states. Fines up to 3M EUR / 4% revenue

An LLM is just another non-visual consumer. The a11y tree is the interface contract between the page and any non-visual actor.

## Who's Building What

### A11y-tree-first approaches

| Project | Type | A11y Tree Usage | Bot Evasion | Language | Stars |
|---|---|---|---|---|---|
| **Playwright MCP** (Microsoft) | MCP server | Primary — `ariaSnapshot()` to YAML with `[ref=eN]` IDs, all actions by ref | None | TypeScript | ~10k |
| **browser-use** | Agent library | Hybrid DOM+a11y — strips decorative DOM, resolves ARIA, semantic structure | Cloud only (Browserbase/Hyperbrowser) | Python | 50k+ |
| **Stagehand v3** (Browserbase) | SDK + CDP | Hybrid — raw CDP, a11y tree reduces tokens 80-90% vs DOM | Via Browserbase managed service | TypeScript | ~10k |
| **Vercel agent-browser** | CLI + MCP | Filtered refs — `-i` mode returns only interactive elements, 93% less context (claimed) | None | Rust/Node | 12k+ |

### Vision/screenshot-first approaches

| Project | Type | Approach | Bot Evasion |
|---|---|---|---|
| **Anthropic computer use** | Tool | Screenshot + coordinate clicking via Claude vision | None |
| **OpenAI CUA/Operator** | Agent | Screenshot + GPT-4o vision, coordinate-based | Managed |
| **Skyvern** | Agent + cloud | CV identifies elements from screenshots, LLM reasons | Managed |

### Bot detection / browser-as-a-service

| Project | Approach | Open Source |
|---|---|---|
| **Browserbase** | Custom Chrome build, CAPTCHA solving, residential proxies, fingerprinting | No (pairs with Stagehand) |
| **Steel** | Self-hostable headless browser API, sessions, stealth | Yes |
| **Hyperbrowser** | Hosted browser-use as API, CAPTCHA solving | No |
| **nodriver/zendriver** | CDP-avoiding drivers, bypass WebDriver artifacts | Yes |
| **rebrowser** | Drop-in Playwright/Puppeteer replacement, patches CDP side-channels | Yes |

### Bot detection reality

- Stealth patches (puppeteer-stealth, playwright-stealth) — increasingly fingerprinted, dying
- CDP-avoiding drivers (nodriver, zendriver) — work today, arms race continues
- Browser-as-a-service — where the money is, every serious player punts here
- **The a11y tree doesn't help with bot detection.** If Cloudflare blocks the page load, there's no tree

## What Playwright MCP Does (the incumbent)

- `browser_snapshot` — calls `page.accessibility.snapshot()`, serializes to YAML
- Every interactive element gets a `[ref=eN]` identifier
- 70+ tools: `browser_click(ref)`, `browser_type(ref, text)`, `browser_fill_form`, etc.
- Incremental snapshot mode — only sends changed subtrees between actions
- Vision mode as opt-in fallback for elements outside the a11y tree
- Already filters: skips invisible elements and `pointer-events: none`

### Playwright MCP weaknesses
- **Full tree dump** — real pages produce 8-20KB+ of YAML per snapshot
- **70 tools** — LLM tool selection itself becomes an error source (Speakeasy critique)
- **No stateful sessions** — auth flows, cookies, multi-page checkout unhandled
- **Shadow DOM/iframe gaps** — elements in shadow roots or cross-origin iframes can be missed
- **No governance** — zero guardrails on agent actions with real consequences

## What Vercel agent-browser Does (the "pruning" player)

- CLI with `snapshot`, `snapshot -i` (interactive only), depth limiting
- `-i` mode: regex line filter — hardcoded set of 17 interactive ARIA roles, everything else dropped
- Element refs as `@e1`, `@e2` — resolve to `getByRole(role, { name })` internally
- Claims 93% context reduction; Pulumi benchmark showed 82% (5.7x) more realistically

### Vercel agent-browser weaknesses
- **Binary: all or nothing.** Full mode = noise. `-i` mode = can't read the page at all (no prices, no headings, no stock status)
- **Flat list, no grouping.** Radios for "Color" and "Size" are just 7 disconnected radio buttons
- **Unnamed elements break.** `button [ref=e18]` matches all unnamed buttons — open bug
- **No task awareness.** Can't distinguish purchase controls from footer links
- **Algorithm is 15 lines of regex.** Not a deep solution

## Gaps Nobody Is Filling

### 1. Smart tree pruning (code-first, not LLM)
Screen readers solved "what matters" 25 years ago with landmark navigation, heading jumps, forms mode. Nobody's applied these heuristics to agent-facing tree compression. The middle ground between "dump everything" and "strip to flat interactive list" doesn't exist.

### 2. Governance layer for browser agents
Every tool lets the LLM click "Buy Now" with zero guardrails. No approval gates, spend limits, or human-in-the-loop checkpoints for browser actions that have real-world consequences.

### 3. Unnamed element disambiguation
Screen readers solve this with positional context: "button, 3 of 8, inside navigation." Nobody generates unique fallback selectors from parent context + child index when role+name isn't sufficient.

### 4. Page state diffing
Tree-level diff after each action: "dialog 'Added to Cart' appeared with 2 new buttons" vs raw before/after YAML comparison.

### 5. Multi-page flow mapping
Extracting "step 2 of 4: shipping" from sequential snapshots of checkout/booking/signup flows.

### 6. Page capability summary
One line per available action: `Page: Amazon iPhone ($1,099, In Stock) | Can: search, pick color(4), pick size(3), set qty, add to cart, buy now` — ~150 bytes, enough for multi-tab routing.

## Where We Choose to POC

**Smart a11y tree pruning as a standalone pure-function library.**

Why this and not a full MCP server:
- MCP browser space is crowded (Microsoft, Vercel, Browserbase, browser-use 50k stars)
- Pruning is the unsolved subproblem that all of them need
- It's composable — works with any tool that produces Playwright ariaSnapshot YAML
- It's code-first — deterministic heuristics borrowed from screen reader navigation
- It's testable — string in, string out, measure token reduction + task completion
- It aligns with bareagent philosophy: lightweight, zero deps, composable, no vendor lock-in

Secondary POC candidates (after pruning proves out):
- Page capability summary (feeds into agent routing / multi-tab orchestration)
- Governance layer wrapping any browser MCP (bareagent Checkpoint + StateMachine applied to browser actions)
