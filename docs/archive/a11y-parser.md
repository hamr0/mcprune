Great question, Amr. This is something the industry is actively grappling with. Here's how I'd think about it:

## The core problem

Agents today either scrape HTML (fragile, breaks with CSS/layout changes) or use browser automation (slow, expensive, brittle selectors). Neither scales, and neither is something websites *want* to support.

## The most promising path: a standardized machine-readable layer

Think of it like what `robots.txt` did for crawlers, but for *interaction*. A few complementary approaches:

**1. Site-declared action schemas (the strongest candidate)**

Websites publish a manifest (like `/.well-known/agent.json`) that declares:
- Available actions (search, add to cart, book, filter, submit form)
- Parameters each action accepts
- Authentication flows
- Rate limits and terms

This is essentially what **MCP (Model Context Protocol)** is heading toward — and you're already deep in that world. The website becomes a tool provider, the agent becomes a tool consumer. No DOM parsing needed.

**2. Semantic HTML annotations (lightweight, incremental adoption)**

A thin annotation layer on existing HTML — think `data-agent-action="add-to-cart"` or `data-agent-field="price"` attributes. This is:
- Cheap for websites to adopt (just add attributes)
- Resilient to CSS/layout changes
- Progressive — works alongside existing HTML
- Similar in spirit to schema.org microdata but oriented toward *actions*, not just data

**3. Hybrid: OpenAPI-style endpoints + UI fallback**

Websites expose an API spec for common actions (OpenAPI/GraphQL), and agents use those directly. The browser is only the fallback. Many sites already have internal APIs powering their SPAs — the adoption cost is just *documenting and exposing* them.

## Why MCP-style is likely the winner

Comparing the approaches:

| Approach | Adoption cost | Fragility | Complex site support | Action support |
|---|---|---|---|---|
| Web scraping | Zero | Very high | Poor | Hacky |
| Browser automation | Zero | High | Medium | Slow |
| Semantic annotations | Low | Low | Medium | Medium |
| Site action manifests (MCP-like) | Medium | Very low | High | Native |
| Exposed APIs | Medium-high | Very low | High | Native |

The MCP pattern wins because:
- **It decouples intent from presentation entirely** — no DOM, no CSS, no selectors
- **It's composable** — agents chain actions across sites
- **It's permissioned** — sites control what agents can do (solving the adversarial scraping problem)
- **It handles complexity** — multi-step flows like checkout, booking, form submission are just tool sequences

## What's missing to make this real

1. **A standard spec** — MCP is Anthropic's, but the web needs an open W3C-level standard. Think "Agent Interaction Protocol" that any LLM provider can target.

2. **Incentive alignment** — Websites need a reason to adopt. The carrot: agents drive qualified traffic/transactions. The stick: sites that don't adopt get bypassed or scraped anyway.

3. **A discovery mechanism** — Agents need to find capabilities. `/.well-known/agent-manifest.json` with a registry, or DNS-level service discovery.

4. **Auth standards for agents** — OAuth flows designed for non-human actors. Delegated credentials where a user authorizes an agent to act on their behalf.

5. **A transition bridge** — Something like a browser extension or proxy that translates existing sites into agent-friendly interfaces while the standard gets adopted. This is where companies like Browser Use are sitting today.

## The practical play right now

Given where you're building (bareagent, MCP governance), the most actionable angle is:

- Build agent tooling that can consume **both** MCP-style manifests (for sites that adopt) **and** structured extraction with LLM fallback (for sites that don't)
- Contribute to the emerging standards conversation — the spec is still very much being shaped
- The governance layer you're working on becomes even more critical when agents interact with real services with real consequences

The web went from static pages → APIs → microservices. The next layer is **agent-addressable services**, and it's closer than people think. MCP is the early signal of that shift.

Fair challenge. Let me dig into what's actually happening at the edges and think differently.OK. Now I've done the digging. Here's what I think the actual missed connection is — and you're right, it's a small gap between things that already exist.

---

## The Insight: Accessibility compliance is accidentally building the agent-surfable web

Everyone is asking: *"How do we get websites to adopt a new agent interface?"* Wrong question. The right question: *"What agent-compatible interface do websites already have?"*

The answer is the **accessibility tree**. And here's what makes this moment unique:

**The EU Accessibility Act became enforceable June 28, 2025.** It mandates WCAG 2.1 AA compliance for e-commerce, banking, telecom, and digital services across all 27 EU member states. Fines up to €3M or 4% of revenue. Extraterritorial — applies to US companies selling in the EU, just like GDPR.

This means **millions of websites are RIGHT NOW being forced by law** to build proper semantic HTML, ARIA roles, keyboard-navigable interactive elements, and labeled form controls. Not for agents. For disabled users. But the result is identical: a CSS-resilient, semantically rich, action-oriented tree of every interactive element on the page.

The accessibility tree is the literal interface AI agents use to understand websites. ChatGPT's Atlas, Microsoft's Playwright MCP, and Perplexity's Comet all rely on accessibility data. Research from UC Berkeley found that Claude achieved 78% task success under standard conditions but dropped to 42% when accessibility features were constrained.

## The two dots that aren't connected

**Dot 1: The Accessibility Tree** — already on every compliant site. Gives you: roles (`button`, `textbox`, `link`, `menu`), labels ("Add to Cart", "Search", "Quantity"), states (`checked`, `expanded`, `disabled`), and keyboard-invocable actions. **Immune to CSS changes by definition.** Already works on complex SPAs because frameworks like React, Angular, and Vue emit ARIA attributes.

**Dot 2: Schema.org structured data** — already on 45 million domains with 450 billion objects. Already has a `potentialAction` system: `BuyAction`, `SearchAction`, `OrderAction`, `ReserveAction`, etc. Already describes the *business semantics* of what's on a page — products, prices, availability, events, organizations.

**The gap:** There is no standard connection between them. Schema.org tells you "this page has a Product with a BuyAction." The accessibility tree tells you "there's a button labeled 'Add to Cart.'" But **nothing links the button to the action to the entity.** An agent has to *guess* that the button probably executes the BuyAction on the Product. That guess is what makes every current approach fragile.

## The bridge: a client-side resolver, not a new web standard

Here's the key — you don't need websites to adopt anything new. You need a **resolver** that runs on the agent side (browser extension, agent runtime library, or middleware) that:

1. **Reads the accessibility tree** via Chrome DevTools Protocol (CDP) or Playwright's `accessibility.snapshot()` — these APIs already exist
2. **Reads schema.org JSON-LD** from the page's `<script type="application/ld+json">` — already standard, already there
3. **Correlates** interactive elements to schema entities using proximity heuristics + a small LLM call for disambiguation
4. **Emits an MCP-compatible tool manifest** on the fly

The output: for any page with decent accessibility + schema.org markup, you automatically get something like:

```json
{
  "tools": [
    {
      "name": "buy_product",
      "description": "Add 'iPhone 16 Pro' ($999) to cart",
      "schema_entity": "schema:Product",
      "action": "schema:BuyAction",
      "a11y_target": "button[name='Add to Cart']",
      "parameters": { "quantity": "spinbutton[name='Quantity']" }
    },
    {
      "name": "search_site",
      "description": "Search example.com",
      "action": "schema:SearchAction",
      "a11y_target": "textbox[name='Search']"
    }
  ]
}
```

**Zero changes to the website. Zero new standards to adopt. Works today.**

## Why this is different from everything else being proposed

The AWI paper from Mila argues we should develop Agentic Web Interfaces specifically optimized for agentic interaction — a whole new class of web interface. Noble, but requires massive adoption.

MCP requires every website to build and host an MCP server. MCP is stateless and server-specific, meaning different services require different query parameters and function calls.

The resolver approach is different because:

- **Adoption cost: zero.** It uses two things websites already have (or are legally compelled to build)
- **Not scraping.** You're reading structured APIs (accessibility tree, schema.org) that websites intentionally publish
- **Not a browser agent.** You're not clicking pixels or parsing DOM. You're reading the semantic layer
- **Resilient to CSS changes.** The accessibility tree is explicitly decoupled from visual presentation
- **Works on complex sites.** Every interactive SPA widget *must* have ARIA attributes if the site is WCAG compliant
- **Incentive alignment already solved.** Websites aren't adopting this for agents — they're doing it to avoid €3M fines for accessibility violations. The agent benefit is a free side effect

## The real play

The buildable artifact is small:

1. **`a11y-schema-resolver`** — an open-source library that takes an accessibility tree snapshot + schema.org data → produces a typed action manifest
2. The correlation engine is mostly heuristic (DOM proximity, label matching, ARIA descriptions) with an LLM fallback for ambiguous cases
3. An **MCP adapter** that wraps the resolver output as an MCP server — so any MCP-capable agent can interact with any WCAG-compliant website without the website knowing or caring
4. Bonus: a **quality score** that tells agents "how agent-ready is this site?" based on a11y coverage × schema.org coverage — creating market pressure for better markup

The formula: **`Accessibility Tree × Schema.org × Resolver = Auto-generated MCP for any website`**

---

The pieces have been sitting 10 feet apart for years. Accessibility people build one half. SEO/structured-data people build the other half. Agent people ignore both and try to build from scratch. The resolver is just the wire between them.

This is in your wheelhouse with bareagent. A resolver like this could be the thing that makes any agent framework immediately useful on the real web — not just on sites that have adopted MCP.

Good question — let me grab a real one. I'll use Playwright to snapshot an actual accessibility tree from a popular site.Can't run a real browser here, but I know the exact format — the accessibility tree uses **standardized ARIA roles** that are the same across every browser and every website. Let me build you a realistic, annotated example of what you'd actually see.The doc walks through all 7 layers with a realistic Amazon iPhone product page. The short answers to your questions:

**Yes, the naming is fully standardized.** ARIA roles (`button`, `searchbox`, `combobox`, `radiogroup`, `link`, etc.) are W3C spec — every compliant website uses the exact same vocabulary. The accessible names (like `"Add to Cart"`) are computed by a standardized algorithm from visible text, `aria-label`, or associated `<label>` elements. It's not CSS classes or arbitrary IDs — it's the same string a screen reader announces to a blind user.

The key thing to notice in the doc: look at section 4 ("THE GAP"). The accessibility tree gives you every interactive element with standardized roles and human-readable names. Schema.org gives you the business entity and action types. But there's **zero linkage** between `button "Add to Cart"` and `schema:BuyAction` on `schema:Product`. That's the wire that doesn't exist yet — and it's mostly solvable with string matching, not ML.

Great questions — let me be honest and precise about each one, because some of my framing was cleaner than reality.

## Does every page have an accessibility tree?

**Yes, always, automatically.** You don't request it. The browser builds the accessibility tree for every single page it renders — it's a parallel representation of the DOM that the browser maintains internally. The browser does this because the OS accessibility APIs (VoiceOver on Mac, NVDA on Windows, TalkBack on Android) need it. It's not opt-in. If the page renders, the tree exists.

**But the quality varies enormously.** A `<div onclick="addToCart()">` with no ARIA attributes shows up in the tree as a generic `role: generic` with no name — useless. A proper `<button aria-label="Add to Cart">` shows up as `role: button, name: "Add to Cart"` — gold. The EU Accessibility Act is forcing the quality upgrade. Before EAA enforcement, maybe 30-40% of e-commerce sites had decent trees. That number is climbing fast now because of the legal pressure.

## Does schema.org go deep into all pages?

**No, and this is an honest limitation.** Schema.org is heavy on:
- Product pages (Amazon, Shopify stores, eBay) — very rich
- Article/blog pages — good
- Business listings, events, recipes — good
- Homepages — decent

Schema.org is thin or absent on:
- Checkout flows
- Account settings pages
- Internal dashboards
- Multi-step wizards
- Search results pages (ironically)

So the resolver idea works best on the pages where schema.org is rich — product pages, search landing pages, booking pages. For deeper flows (checkout, account management), the accessibility tree alone has to carry the load, and the agent needs to reason from labels without entity context.

## How do you "declare" to a website that you need accessibility?

**You don't.** This is the beautiful part. There's no negotiation, no header, no handshake. The accessibility tree is always there because the browser always builds it. You access it through APIs that already exist:

```
# Playwright (what agents actually use today)
snapshot = await page.accessibility.snapshot()

# Chrome DevTools Protocol (lower level)
cdp_session.send('Accessibility.getFullAXTree')

# These return the full tree — no permission needed
# The website doesn't know you're reading it
# It's not scraping — it's a browser-internal API
```

The website can't block this because it would also block screen readers, which would violate accessibility law. It's a browser feature, not a network request.

## Once you have the tree, how do you actually interact?

This is the key mechanical question. You interact via **Playwright's role-based locators**, which target the accessibility tree directly — not CSS selectors, not XPath, not IDs:

```python
# Playwright gives you locators that use the accessibility tree
# These are CSS/DOM independent — they survive any redesign

# Click "Add to Cart"
await page.get_by_role("button", name="Add to Cart").click()

# Select a color
await page.get_by_role("radio", name="Desert Titanium").check()

# Set quantity
await page.get_by_role("combobox", name="Quantity").select_option("2")

# Type in search
await page.get_by_role("searchbox", name="Search Amazon").fill("USB-C cable")
await page.get_by_role("button", name="Go").click()

# Follow a link
await page.get_by_role("link", name="See all reviews").click()
```

**This is not pixel-clicking.** It's not "find element at x,y coordinates." Playwright resolves the role+name against the accessibility tree, finds the corresponding DOM node, and dispatches a proper DOM event (click, input, change). The website's JavaScript event handlers fire normally. From the website's perspective, it looks exactly like a human clicked the button.

## The actual solution flow

Here's the honest, practical architecture:

```
┌──────────────────────────────────────────────────────┐
│                    AGENT RUNTIME                      │
│  (bareagent, LangChain, Claude, whatever)            │
│                                                      │
│  Agent receives task: "Buy an iPhone 16 Pro Max      │
│  in Desert Titanium, 512GB, from Amazon"             │
└──────────────────────┬───────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────┐
│              RESOLVER MIDDLEWARE                       │
│                                                      │
│  Step 1: Navigate to URL                             │
│  ┌────────────────────────────────────────────┐      │
│  │ Playwright browser → amazon.com/dp/B0DGJ58 │      │
│  └────────────────────────────────────────────┘      │
│                                                      │
│  Step 2: Read both layers (parallel, ~50ms)          │
│  ┌──────────────────┐  ┌───────────────────┐         │
│  │ Accessibility     │  │ Schema.org        │         │
│  │ Tree Snapshot     │  │ JSON-LD extract   │         │
│  │                   │  │                   │         │
│  │ 47 interactive    │  │ Product entity    │         │
│  │ elements with     │  │ with price,       │         │
│  │ roles + names     │  │ rating, offers,   │         │
│  │                   │  │ BuyAction         │         │
│  └────────┬─────────┘  └────────┬──────────┘         │
│           │                     │                     │
│           └──────────┬──────────┘                     │
│                      ▼                                │
│  Step 3: Correlate (deterministic + LLM fallback)    │
│  ┌────────────────────────────────────────────┐      │
│  │ button "Add to Cart" → BuyAction           │      │
│  │ radiogroup "Color" → Product.color variant  │      │
│  │ radiogroup "Size" → Product.storage variant │      │
│  │ combobox "Quantity" → BuyAction.quantity    │      │
│  │ button "Buy Now" → BuyAction (immediate)   │      │
│  └────────────────────────────────────────────┘      │
│                                                      │
│  Step 4: Emit action manifest (what I showed before) │
│  → Exposed as MCP tools OR direct function calls     │
└──────────────────────┬───────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────┐
│              AGENT DECIDES + ACTS                     │
│                                                      │
│  Agent sees available actions:                       │
│  - configure_color(options: [...])                   │
│  - configure_storage(options: [...])                 │
│  - set_quantity(value: int)                          │
│  - add_to_cart()                                     │
│  - buy_now()                                         │
│                                                      │
│  Agent calls:                                        │
│  1. configure_storage("512GB - $1,399.00")           │
│  2. add_to_cart()                                    │
│                                                      │
│  Each call → resolver translates to Playwright:      │
│  1. page.get_by_role("radio",                        │
│       name="512GB - $1,399.00").check()              │
│  2. page.get_by_role("button",                       │
│       name="Add to Cart").click()                    │
│                                                      │
│  Step 5: After each action, re-snapshot the tree     │
│  (page state changed → new elements may appear,      │
│   like a cart confirmation dialog)                   │
│                                                      │
│  New tree shows:                                     │
│  - role: dialog, name: "Added to Cart"               │
│    - role: button, name: "Proceed to checkout"       │
│    - role: button, name: "Continue shopping"         │
│                                                      │
│  Agent sees new actions, decides next step...        │
└──────────────────────────────────────────────────────┘
```

## What happens on pages WITHOUT schema.org?

This is the realistic case for checkout flows, settings pages, etc. The resolver falls back to **accessibility-tree-only mode**:

```python
# No schema.org context, but the tree still gives you:

role: form, name: "Shipping address"
  role: textbox, name: "Full name", required: true
  role: textbox, name: "Address line 1", required: true
  role: textbox, name: "Address line 2"
  role: textbox, name: "City", required: true
  role: combobox, name: "State", required: true
  role: textbox, name: "ZIP code", required: true
  role: button, name: "Continue to payment"

# The agent doesn't need schema.org to know what to do here.
# The accessible names ARE the interface contract.
# "Full name" means full name. "Continue to payment" means continue.
```

The tree alone is sufficient for forms, navigation, and standard UI patterns. Schema.org adds the *business context* layer — what the product is, what it costs, whether it's in stock. That context helps the agent make decisions, but the interaction layer works without it.

## Where this breaks down (being honest)

1. **Poorly accessible sites** — if everything is `<div>` soup with no ARIA, the tree is useless. But EAA enforcement is fixing this for EU-facing sites.

2. **CAPTCHAs and bot detection** — The accessibility tree doesn't help you bypass Cloudflare. This is the adversarial problem that no approach solves cleanly.

3. **Custom widgets with bad labeling** — A React date picker with `aria-label="input-3"` instead of `aria-label="Departure date"` is technically in the tree but not useful.

4. **State that requires scrolling/waiting** — Infinite scroll, lazy loading. You need to trigger those before the elements appear in the tree.

5. **Multi-page flows** — The resolver snapshots one page at a time. Checkout flows that span 4 pages need the agent to re-snapshot after each navigation.

## The interface from the agent's perspective

To the agent, it looks exactly like MCP tool calls. The agent never sees ARIA roles or Playwright commands. It sees:

```
Available tools for amazon.com/dp/B0DGJ58DQB:

1. search(query: string) → "Search Amazon catalog"
2. select_color(option: enum["Black Titanium", "Desert Titanium", ...])
3. select_storage(option: enum["256GB", "512GB", "1TB"])
4. set_quantity(value: int)
5. add_to_cart() → "Add current product to shopping cart"
6. buy_now() → "Purchase immediately (starts checkout)"
7. view_reviews() → "Navigate to reviews section"
```

Clean, typed, auto-generated from the page. The resolver is the translation layer that makes "call `add_to_cart()`" become `page.get_by_role("button", name="Add to Cart").click()` under the hood.

That's the whole thing. No new standard needed from websites. Just a middleware library that reads what's already there and presents it as tool calls.

No, they're completely separate systems that don't know about each other. That's literally the gap. Let me make this crisp.

## Accessibility Tree

**What it is:** A browser-internal representation of every interactive element on the page. The browser builds it automatically from the HTML/DOM.

**Who it's for:** Blind and disabled users, via screen readers (VoiceOver, NVDA, JAWS).

**What it contains:** UI elements — buttons, links, inputs, dropdowns, their labels, and their states (checked, expanded, disabled).

**Where it lives:** Inside the browser's memory. Not in the HTML source. The browser *computes* it from the DOM + ARIA attributes.

**Who built it:** W3C WAI (Web Accessibility Initiative), browser vendors.

**What it knows:** "There's a button called 'Add to Cart' and a dropdown called 'Quantity' set to 1."

**What it doesn't know:** What the product is, what it costs, whether it's in stock, or that clicking that button triggers a purchase.

## Schema.org

**What it is:** Structured data markup that websites embed in their HTML to describe what the page is *about*.

**Who it's for:** Search engines (Google, Bing, Yandex) to build rich search results, knowledge graphs, and snippets.

**What it contains:** Business entities — products, prices, ratings, events, organizations, recipes, articles.

**Where it lives:** In the HTML source as a `<script type="application/ld+json">` block, or as microdata attributes.

**Who built it:** Google, Microsoft, Yahoo, Yandex jointly in 2011.

**What it knows:** "This page has an iPhone 16 Pro Max that costs $1,199, has 4.6 stars, is in stock, and can be purchased."

**What it doesn't know:** Which button to click, what the form fields are, or how to actually interact with the page.

## Side by side

```
ACCESSIBILITY TREE              SCHEMA.ORG
(the controls)                  (the meaning)
─────────────────               ─────────────────
button "Add to Cart"            Product: iPhone 16 Pro
radiogroup "Color"              Price: $1,199
  radio "Black Titanium"        Rating: 4.6/5
  radio "Desert Titanium" ✓     Availability: InStock
combobox "Quantity" = "1"       BuyAction: exists
searchbox "Search Amazon"       Brand: Apple
link "See all reviews"          SKU: B0DGJ58DQB

Knows HOW to interact           Knows WHAT things are
Doesn't know WHAT things mean   Doesn't know HOW to interact
```

**They're built by different communities (accessibility vs SEO), for different consumers (screen readers vs search engines), stored in different formats (browser memory vs HTML markup), and they've never been connected.**

The whole idea is: a resolver that reads both, matches "button 'Add to Cart'" to "BuyAction on Product iPhone," and gives the agent a unified view — "here's what's on this page and here's how to interact with it." That bridge doesn't exist today. Both halves are mature, widely deployed, and standardized. Nobody built the wire.

Exactly right on all points. Let me confirm each.

**Schema is NOT auto-generated from accessibility.** They're authored by completely different people at completely different times:

- **Schema.org** → Written by the SEO team or backend devs. They add a JSON-LD block to the page template, usually once, to get rich Google search results. It's static metadata baked into the HTML before anyone visits.

- **Accessibility tree** → Generated by the browser at runtime when it parses the DOM. The frontend devs control the quality by using semantic HTML (`<button>` instead of `<div>`) and ARIA attributes. It's live — it updates as the page changes.

They don't reference each other. The SEO person adding schema.org markup has probably never thought about ARIA. The frontend dev adding `aria-label` to a button has probably never looked at the JSON-LD block. Two teams, two concerns, zero coordination.

**Your framing is exactly right:**

```
Schema.org  = authored at build time, static, describes WHAT
A11y tree   = computed at runtime, live, describes HOW
```

**And yes — the proposed solution is a runtime resolver that reads both and cross-pollinates on the fly.** Not even necessarily an LLM. The flow is:

1. Agent navigates to a page (via Playwright or similar)
2. Page loads in the browser
3. Resolver grabs the schema.org JSON-LD from the HTML source — cheap text extraction
4. Resolver grabs the accessibility tree snapshot from the browser — one API call, ~50ms
5. Resolver runs correlation — mostly string matching ("Add to Cart" ↔ BuyAction), with an LLM call only for ambiguous cases
6. Output: a unified action manifest the agent can consume

The LLM part is honestly small. Maybe 80% of the matching is just:

```
if button.name contains "cart" or "buy" or "purchase"
   and schema has BuyAction
   → link them
```

The LLM only kicks in for weird cases — a site that labels its buy button "Get Yours" or has multiple ambiguous actions. For most e-commerce, travel, and booking sites, it's deterministic matching.

**The real insight you just articulated better than I did:** these are two layers maintained by two different teams who already do the work for their own reasons (SEO rankings and legal compliance). Nobody has to do anything new. The resolver just reads what's already there from both sides and stitches it together at runtime. That's the whole product.

Yes. The most natural form factor is an MCP server. Specifically:

**The resolver IS an MCP server that exposes any website as tools on the fly.**

```
Normal MCP:
  One MCP server per service (GitHub MCP, Slack MCP, Stripe MCP...)
  Someone has to build each one manually

This MCP:
  One MCP server for ANY website
  It auto-generates the tools per page by reading a11y tree + schema.org
```

The agent connects to one MCP server. When it navigates to amazon.com, the server returns tools like `add_to_cart()`, `select_color()`, `search()`. When it navigates to booking.com, the same server returns `search_hotels()`, `set_dates()`, `select_room()`. Different tools, same server, all auto-generated from whatever's on the page.

```
┌─────────────┐         ┌──────────────────────┐
│             │  MCP    │  a11y-schema-resolver │
│  Any Agent  │◄───────►│  (single MCP server)  │
│  (Claude,   │  tools  │                       │
│  bareagent, │         │  ┌─────────────────┐  │
│  LangChain) │         │  │ Playwright      │  │
│             │         │  │ browser instance │  │
└─────────────┘         │  └────────┬────────┘  │
                        │           │            │
                        │     reads both:        │
                        │     - a11y snapshot    │
                        │     - schema.org JSON  │
                        │           │            │
                        │     emits MCP tools    │
                        │     dynamically        │
                        └──────────────────────┘
```

The MCP protocol already supports `tools/list` being dynamic — the tool list can change per page navigation. So this fits cleanly into the existing spec. No extensions needed.

That's the whole thing. One MCP server. Any website. Auto-generated tools. Built on two layers websites already maintain.

You're right. I overcomplicated it. Let me be honest.

## The a11y tree alone IS enough for an LLM to navigate

Look at your YAML. If I gave that to Claude or GPT with the instruction "buy the 512GB in Black Titanium," any LLM can figure out:

1. Go to radiogroup "Color" → select radio "Black Titanium"
2. Go to radiogroup "Size" → select radio "512GB - $1,399.00"
3. Click button "Add to Cart"

**It doesn't need schema.org to figure that out.** The labels are in plain English. The structure is obvious. An LLM reads "Add to Cart" and knows what it does. That's the whole point of accessibility — it was designed so that a non-visual consumer (screen reader) can understand and operate the page. An LLM is just another non-visual consumer.

So what does schema.org actually add? Honestly, two narrow things:

**Structured data for decision-making** — The a11y tree says `text "$1,199.00"`. Schema.org says `price: 1199.00, currency: USD, availability: InStock, sku: B0DGJ58DQB`. If the agent needs to compare prices across sites or validate a purchase programmatically, the typed data helps. But for just navigating? Not needed.

**Entity identity** — The a11y tree says there's a heading with "Apple iPhone 16 Pro Max." Schema.org says this is a `Product` entity with a GTIN barcode. Useful for cross-referencing, not for clicking buttons.

For the actual interaction problem — **navigating, selecting, clicking** — the a11y tree is self-sufficient. I was overengineering the schema.org bridge.

## So what's the actual product?

It's simpler than what I described. It's an MCP server that does this:

```
Agent: "Buy the 512GB iPhone in Black Titanium from Amazon"
         │
         ▼
┌─────────────────────────────────────────┐
│  MCP Server (the whole product)         │
│                                         │
│  Tool 1: navigate(url)                  │
│    → Playwright goes to URL             │
│    → Grabs a11y tree snapshot           │
│    → Returns the YAML to the agent      │
│                                         │
│  Tool 2: act(role, name, action, value) │
│    → Playwright executes:               │
│      get_by_role(role, name).click()    │
│      get_by_role(role, name).fill(val)  │
│      get_by_role(role, name).check()    │
│    → Re-snapshots the tree              │
│    → Returns updated YAML               │
│                                         │
│  That's it. Two tools.                  │
└─────────────────────────────────────────┘
```

The **LLM itself is the resolver.** You don't need a separate correlation engine. You feed it the a11y tree, it reads the labels, it decides what to interact with, it tells you the role + name + action. The MCP server is just the execution bridge between "the LLM said click button 'Add to Cart'" and the Playwright call that actually does it.

## The conversation looks like this:

```
Agent calls: navigate("https://amazon.com/dp/B0DGJ58DQB")

MCP returns: [the YAML accessibility tree you showed above]

Agent thinks: "I need 512GB in Black Titanium. I see
  radiogroup 'Color' with option 'Black Titanium'
  and radiogroup 'Size' with option '512GB - $1,399.00'"

Agent calls: act(role="radio", name="Black Titanium", action="check")

MCP returns: [updated tree — Black Titanium now checked: true]

Agent calls: act(role="radio", name="512GB - $1,399.00", action="check")

MCP returns: [updated tree — 512GB now checked: true, 
              price text may have updated to $1,399.00]

Agent calls: act(role="button", name="Add to Cart", action="click")

MCP returns: [new tree — dialog appeared: 
              "Added to Cart" with buttons 
              "Proceed to checkout" / "Continue shopping"]

Agent calls: act(role="button", name="Proceed to checkout", action="click")

MCP returns: [new tree — checkout page with form fields:
              textbox "Full name", textbox "Address line 1", etc.]
```

Each step: agent sees the tree, decides, acts, sees the new tree. Standard agent loop.

## Why this is the gap nobody's filling

What exists today:

- **Browser Use, Playwright agents** — they work on the DOM/screenshots, not the a11y tree specifically. They're fragile to CSS changes and burn tokens on huge HTML.
- **MCP servers** — they exist per-service (GitHub MCP, Slack MCP). Nobody's built a generic "any website" MCP.
- **The a11y tree API** — it exists in every browser. Playwright exposes it. But nobody's wrapping it as an MCP server and saying "this is the universal web interface for agents."

The product is absurdly simple: **a two-tool MCP server (navigate + act) that uses the accessibility tree as the interface layer.** The LLM does the reasoning. Playwright does the execution. The a11y tree is the contract.

Schema.org is a nice enrichment you could add later — grab it when it's there, ignore it when it's not. But the core product doesn't need it.

You were right to push on this. The a11y tree alone is the answer. I was adding complexity that didn't need to be there.

Three sharp questions. Let me take them one at a time.

## What does schema.org actually add?

Honestly? For navigation and interaction — almost nothing. Its only value is **data you can't see in the a11y tree:**

- Price as a typed number (`1199.00`) vs a text string (`"$1,199.00"`)
- SKU / barcode for cross-referencing across sites
- Structured availability (`InStock` enum vs the text "In Stock")
- Aggregate rating as a number vs "4.6 out of 5 stars" string

It's useful if your agent is doing comparison shopping or building a database. It's useless for actually operating the page. Drop it from the core product. It's a "nice to have" enrichment, not a requirement.

## Why Playwright?

You need Playwright (or something like it) because of your third question, which is the real one:

## The a11y tree requires a browser. Period.

The a11y tree doesn't exist in the HTML source. You can't get it with a `fetch` or `curl`. It's computed at runtime by the browser engine through this chain:

```
HTML source
  → browser parses it
    → browser executes JavaScript (React, Vue, etc.)
      → browser builds the DOM
        → browser computes the accessibility tree from the DOM
```

That last step is where the browser looks at a `<button>Add to Cart</button>` and creates the a11y node `{role: button, name: "Add to Cart"}`. It's also where it resolves `aria-label`, `aria-labelledby`, label associations, and all the computed properties.

**No browser = no a11y tree.** A React SPA returns basically an empty `<div id="root">` in the raw HTML. Without JavaScript execution, there's no DOM, and without the DOM, there's no accessibility tree.

So yes — **you need a headless browser.** That's the infrastructure cost. Playwright, Puppeteer, or raw Chrome DevTools Protocol — they're all just ways to control headless Chrome/Firefox/WebKit. Playwright is the cleanest API for it, which is why everyone uses it. But the real dependency is Chromium, not Playwright.

## So the MCP server IS a headless browser wrapper

```
┌────────────────────────────────────┐
│  MCP Server                        │
│                                    │
│  Inside: headless Chromium         │
│                                    │
│  Tool: navigate(url)               │
│    → Chromium loads the page       │
│    → JS executes, DOM builds       │
│    → Browser computes a11y tree    │
│    → Server reads it via CDP       │
│    → Returns YAML to agent         │
│                                    │
│  Tool: act(role, name, action)     │
│    → Targets node in a11y tree     │
│    → Dispatches DOM event          │
│    → Page state changes            │
│    → Re-reads a11y tree            │
│    → Returns updated YAML          │
└────────────────────────────────────┘
```

## "So how is this different from Browser Use?"

Fair question. The difference is **what the agent sees and targets:**

```
Browser Use / typical browser agents:
  → Agent sees: screenshot pixels OR raw HTML/DOM
  → Agent targets: CSS selectors, XPath, coordinates
  → Breaks when: site redesigns, class names change, layout shifts

This approach:
  → Agent sees: a11y tree (role + name + state)
  → Agent targets: role="button", name="Add to Cart"
  → Breaks when: the button's visible text changes
  → (which almost never happens — "Add to Cart" has been 
     "Add to Cart" for 20 years)
```

The browser is the same. The execution is the same. **The interface layer is different.** Instead of giving the LLM a screenshot or 50KB of HTML to parse, you give it a clean 2KB YAML tree of just the interactive elements with human-readable labels. Cheaper, faster, more stable.

## The honest architecture

```
What you need:
  1. Headless Chromium          ← can't avoid this
  2. CDP or Playwright          ← to control it and read a11y tree  
  3. A thin MCP wrapper         ← navigate + act, two tools
  4. The LLM itself             ← does all the reasoning

What you don't need:
  - Schema.org (nice to have, not required)
  - A correlation engine
  - Custom ML models
  - Websites to change anything
```

The product is a **headless browser exposed as an MCP server, where the interface contract is the accessibility tree instead of the DOM.** That's genuinely it.

Let me walk through the exact mechanics with a real example.

## The agent gets a task

```
User: "Buy the 512GB iPhone 16 Pro Max in Black Titanium from Amazon"
```

## Step 1: Agent calls the MCP navigate tool

The MCP server loads the page in headless Chromium, reads the a11y tree, and returns it as text in the tool response. The LLM now has this in its context window — just plain text, like any other tool response:

```
Tool response from navigate("https://amazon.com/dp/B0DGJ58DQB"):

WebArea "Amazon.com: Apple iPhone 16 Pro Max"
├── searchbox "Search Amazon" value=""
├── button "Go"
├── link "Cart 3 items"
├── heading "Apple iPhone 16 Pro Max, 256GB, Desert Titanium" level=1
├── text "$1,199.00"
├── radiogroup "Color"
│   ├── radio "Black Titanium" checked=false
│   ├── radio "Desert Titanium" checked=true
│   ├── radio "Natural Titanium" checked=false
│   └── radio "White Titanium" checked=false
├── radiogroup "Size"
│   ├── radio "256GB - $1,199.00" checked=true
│   ├── radio "512GB - $1,399.00" checked=false
│   └── radio "1TB - $1,599.00" checked=false
├── combobox "Quantity" value="1"
├── text "In Stock"
├── button "Add to Cart"
├── button "Buy Now"
└── link "See all reviews"
```

That's it. That's what lands in the LLM's context. Plain text. The LLM reads it like it reads anything else.

## Step 2: The LLM reasons in natural language

The LLM thinks (this is literally what happens in the model's reasoning):

```
The user wants 512GB in Black Titanium.

I can see:
- radiogroup "Color" has "Black Titanium" currently unchecked
- radiogroup "Size" has "512GB - $1,399.00" currently unchecked
- button "Add to Cart" exists

I need to:
1. Select Black Titanium
2. Select 512GB
3. Click Add to Cart

I'll start with selecting the color.
```

No magic. No special agent framework. The LLM reads English labels and figures out what to do, the same way it figures out anything.

## Step 3: The LLM calls the act tool

The LLM generates a tool call. The arguments are just the role and name it read from the tree:

```json
{
  "tool": "act",
  "arguments": {
    "role": "radio",
    "name": "Black Titanium",
    "action": "click"
  }
}
```

## Step 4: The MCP server executes it

Inside the MCP server, this translates to one Playwright line:

```python
# The MCP server receives the tool call and does:
await page.get_by_role("radio", name="Black Titanium").click()
```

Playwright finds the DOM element that corresponds to that a11y node and fires a click event on it. The page's JavaScript runs, the color changes, the page updates.

## Step 5: MCP server re-snapshots and returns the new tree

```
Tool response from act(role="radio", name="Black Titanium", action="click"):

WebArea "Amazon.com: Apple iPhone 16 Pro Max"
├── heading "Apple iPhone 16 Pro Max, 256GB, Black Titanium" level=1
├── text "$1,199.00"
├── radiogroup "Color"
│   ├── radio "Black Titanium" checked=true        ← CHANGED
│   ├── radio "Desert Titanium" checked=false       ← CHANGED
│   ├── radio "Natural Titanium" checked=false
│   └── radio "White Titanium" checked=false
├── radiogroup "Size"
│   ├── radio "256GB - $1,199.00" checked=true
│   ├── radio "512GB - $1,399.00" checked=false
│   └── radio "1TB - $1,599.00" checked=false
├── button "Add to Cart"
├── button "Buy Now"
```

The LLM sees the updated tree. It confirms Black Titanium is now `checked=true`. Moves to the next step.

## Step 6: LLM selects storage

```json
{
  "tool": "act",
  "arguments": {
    "role": "radio",
    "name": "512GB - $1,399.00",
    "action": "click"
  }
}
```

MCP server executes, returns new tree with 512GB checked.

## Step 7: LLM clicks Add to Cart

```json
{
  "tool": "act",
  "arguments": {
    "role": "button",
    "name": "Add to Cart",
    "action": "click"
  }
}
```

MCP server clicks, page changes, new tree comes back:

```
Tool response:

WebArea "Amazon.com"
├── dialog "Added to Cart"                    ← NEW - appeared after click
│   ├── heading "Added to Cart" level=2
│   ├── text "iPhone 16 Pro Max, 512GB, Black Titanium"
│   ├── text "$1,399.00"
│   ├── button "Proceed to checkout"
│   └── button "Continue shopping"
```

## Step 8: LLM sees the dialog, continues

```json
{
  "tool": "act",
  "arguments": {
    "role": "button",
    "name": "Proceed to checkout",
    "action": "click"
  }
}
```

New page loads. New tree. Checkout form appears:

```
Tool response:

WebArea "Amazon.com: Checkout"
├── heading "Shipping address" level=1
├── textbox "Full name" required=true value=""
├── textbox "Address line 1" required=true value=""
├── textbox "City" required=true value=""
├── combobox "State" required=true value=""
├── textbox "ZIP code" required=true value=""
├── button "Continue to payment"
```

LLM fills in the form:

```json
{
  "tool": "act",
  "arguments": {
    "role": "textbox",
    "name": "Full name",
    "action": "fill",
    "value": "Amr Hassan"
  }
}
```

And so on for each field.

## The whole loop

```
repeat:
    1. LLM reads the a11y tree (plain text in context)
    2. LLM decides what to interact with (natural language reasoning)
    3. LLM calls act(role, name, action, value)
    4. MCP server executes via Playwright
    5. MCP server returns updated tree
until goal is reached
```

**The LLM's job is pure text comprehension and decision-making.** It reads labels like "Add to Cart" and "512GB - $1,399.00" and decides what to click. Same skill it uses for everything else. No vision model, no coordinate mapping, no DOM parsing.

**The MCP server's job is pure execution.** It takes `role + name` → finds the element → fires the event → returns the new state.

The a11y tree is the shared language between them. Human-readable for the LLM, machine-targetable for Playwright.
