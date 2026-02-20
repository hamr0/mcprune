# Insights

## URLs are the biggest bloat source

On Amazon NL search results, URLs accounted for 62% of the pruned output before stripping. Tracking parameters, ad redirect chains, and encoded session data dominate. Stripping URLs is the single highest-impact optimization.

## Playwright embeds snapshots everywhere

Not just `browser_snapshot` — every tool that triggers a page change (`browser_click`, `browser_type`, `browser_navigate`) embeds a full ariaSnapshot in its response. The proxy must intercept all tool responses.

## Pages without landmarks need special handling

Hacker News has zero ARIA landmarks — no `main`, no `banner`, nothing. The pruner must detect this and keep everything, relying on node-level pruning (drop images, separators, long text) rather than region extraction.

## Named table roles are misleading

`row "Hacker Newsnew | past | comments..."` — the name is just concatenated child text, not a semantic label. Table layout roles should always collapse, unlike `radiogroup "Color"` which carries real meaning.

## Context-aware filtering transforms search pages

Without context, a 30-product search page outputs all products equally. With context keywords from the agent's search query, irrelevant products collapse to title-only. This is the difference between "everything" and "what you searched for + browsable titles."

## Footer content is deeply nested

"Back to top" buttons and footer markers aren't always top-level nodes. They're often nested 2-3 levels deep inside `generic` wrappers. Footer truncation must be recursive.

## Single-char keyword filtering matters

Without it, searching for "a" would match virtually everything and trigger card condensing everywhere, producing the opposite of the intended effect.
