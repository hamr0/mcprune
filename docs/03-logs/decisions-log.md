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
