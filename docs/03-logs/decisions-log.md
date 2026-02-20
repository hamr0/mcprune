# Decisions Log

## Rule-based, not ML

**Decision**: Pure rule-based pruning using ARIA role taxonomy.

**Rationale**:
1. Deterministic — same input always produces same output
2. Fast — no model loading, <1ms per snapshot
3. Transparent — every decision traces to a specific rule
4. No dependencies — no onnxruntime, no embeddings, no API calls
5. Correct by construction — ARIA roles are finite and well-specified

## Strip URLs by default

**Decision**: Remove `/url` properties from serialized output.

**Rationale**: Agents interact via `[ref=eN]` markers, not URLs. On Amazon NL search results, URLs were 62% of pruned output before stripping. They're full of tracking params, ad redirects, and session data.

## Intercept ALL tool responses

**Decision**: Proxy intercepts every `tools/call` response, not just `browser_snapshot`.

**Rationale**: Playwright MCP embeds a fresh ariaSnapshot in every action tool response (`browser_click`, `browser_type`, `browser_navigate`). Only intercepting `browser_snapshot` would miss 80%+ of snapshots.

## Recursive footer truncation

**Decision**: Footer markers checked recursively through nested wrappers.

**Rationale**: On live pages, "Back to top" buttons are often nested inside `generic [ref=eN]` wrappers. Non-recursive check misses them entirely.

## Context-aware card filtering

**Decision**: Capture search context from agent actions, collapse non-matching product cards.

**Rationale**: When searching for "iPhone 15", full details for every unrelated product card waste tokens. Condensing to title-only preserves browsability while focusing on what the agent searched for.

## Extract proxy-utils for testability

**Decision**: Move `looksLikeSnapshot`, `extractContext`, `processSnapshot` to `src/proxy-utils.js`.

**Rationale**: The MCP proxy (`mcp-server.js`) spawns child processes and manages stdio — hard to unit test. Extracting pure functions allows testing proxy logic without spawning Playwright.

## Table layout roles always collapse

**Decision**: `row`, `cell`, `rowgroup` collapse even when named.

**Rationale**: Their names are just concatenated child text (e.g., `row "Hacker Newsnew | past | comments..."`), not meaningful labels like `radiogroup "Color"`.

## Browse mode: skip steps 5-8

**Decision**: In browse mode, skip dedupLinks, dropNoiseButtons, truncateAfterFooter, and dropFilterGroups entirely.

**Rationale**: These steps target e-commerce noise (duplicate product links, energy labels, sidebar filters, corporate footers). Documentation and article pages don't have this noise. Running them would risk removing legitimate content (e.g., a "Back to top" link in docs that happens to match the footer pattern).

## Browse mode: preserve paragraphs and article content

**Decision**: In browse mode, keep paragraphs, code blocks, term/definition pairs, strong/emphasis, inline links, complementary sidebars, figure captions, and all headings.

**Rationale**: ~70% of agentic browsing is research/reading (docs, articles, Q&A). Act mode was optimized for e-commerce where paragraphs are noise (product descriptions, SEO text). For developer sites (MDN, Python docs, Stack Overflow), paragraph content IS what the agent needs.

## Mode is a static flag, not auto-detected

**Decision**: Mode is set at proxy startup via `--mode act|browse`. No auto-detection from page content.

**Rationale**: Auto-detection would need heuristics (paragraph density? presence of code blocks?) that could misclassify pages. A static flag is predictable and debuggable. Users know whether they're shopping or reading docs.
