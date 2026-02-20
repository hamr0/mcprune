# Assumptions, Constraints & Risks

## Assumptions

1. **Pages use ARIA landmarks** — Most well-structured sites have `main`, `banner`, `contentinfo`. Pages without landmarks (like HN) get fallback handling that keeps everything.

2. **Agents interact by ref** — Playwright MCP assigns `[ref=eN]` to interactive elements. Agents click/type via these refs, not URLs. This makes URL stripping safe.

3. **Interactive elements are what matter** — For action-taking agents, buttons, links, textboxes, radiogroups, and comboboxes are the primary content. Paragraphs, images, and descriptions are noise.

4. **Context improves relevance** — When an agent searches for "iPhone 15", non-matching product cards can safely be condensed to title-only.

5. **Token estimation via chars/4** — Rough but sufficient for stats headers. Not used for pruning decisions.

## Constraints

- **No ML dependencies** — Must remain pure rule-based for determinism and speed
- **Must preserve all refs** — Dropping a ref breaks the agent's ability to interact
- **Must handle pages without landmarks** — HN, legacy sites, poorly structured pages
- **Must work as both library and MCP proxy** — Two consumption modes from day one
- **Node.js ESM only** — Package uses `"type": "module"`

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Playwright changes ariaSnapshot format | Low | Parser is format-specific but simple to update |
| Sites with non-standard ARIA roles | Medium | Fallback paths handle unknown roles as structural |
| Over-pruning drops something important | Medium | Conservative defaults, mode system, context-aware filtering |
| MCP protocol changes | Low | Proxy is thin JSON-RPC passthrough, minimal coupling |

## Unknowns

- How well does pruning generalize to non-e-commerce sites? (Tested: Wikipedia, HN, GOV.UK — works well)
- What's the right default mode? (`act` works for most agent tasks)
- Should summarize() be more structured (JSON) or stay as one-line text?
