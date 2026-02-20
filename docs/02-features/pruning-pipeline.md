# Pruning Pipeline

The core of mcprune: a 9-step rule-based pipeline in `src/prune.js`. The mode (`act` or `browse`) controls which steps run and how nodes are filtered.

## Pipeline flow

```
Raw YAML --> parse() --> [ANode tree]
                             |
                   1. extractRegions     <- keep landmarks matching mode
                   2. pruneNode          <- mode-aware: act drops content; browse keeps it
                   3. collapse           <- unwrap unnamed structural wrappers
                   4. postClean          <- trim comboboxes; act drops orphaned headings
                 ┌─── if act/navigate/full: ───┐
                 │ 5. dedupLinks               │ <- e-commerce noise removal
                 │ 6. dropNoiseButtons          │   (skipped in browse mode —
                 │ 7. truncateAfterFooter       │    docs/articles don't have
                 │ 8. dropFilterGroups          │    product card noise)
                 └─────────────────────────────┘
                   9. serialize          <- back to YAML, strip URLs
                             |
                   [pruned YAML string]
```

## Step details

### 1. extractRegions

Keeps only landmark subtrees matching the mode. Three fallback paths:

| Page structure | Behavior |
|---|---|
| Has landmarks + main with interactive content | Keep allowed landmarks only |
| Has landmarks but no useful main | Treat interactive non-landmark nodes as implicit main |
| No landmarks at all (HN-style) | Keep everything, rely on node-level pruning |

### 2. pruneNode — mode-aware

Per-node decisions differ between act and browse modes:

| Content | Act mode | Browse mode |
|---|---|---|
| Interactive elements (INTERACTIVE set) | **Keep** | **Keep** |
| Paragraphs | **Drop** | **Keep** (with children pruned) |
| Code blocks | **Keep** | **Keep** |
| Term/definition pairs | **Drop** | **Keep** |
| Strong/emphasis | **Drop** | **Keep** |
| Inline links (inside paragraphs) | **Drop** | **Keep** |
| Images, separators | **Drop** | **Drop** |
| Superscripts (footnotes) | **Drop** | **Drop** |
| Navigation inside main | **Keep** | **Drop** (Wikipedia chrome) |
| Complementary (sidebar TOC) | **Drop** | **Keep** |
| Figures | **Drop** | **Caption only** (`[Figure: desc]`) |
| Headings (h1) | **Keep** | **Keep** |
| Headings (h2+, description-type) | **Drop** | **Keep** |
| Text nodes | Prices, stock, short labels only | All text except decorators (`|`, `»`, `·`) |
| Named groups | **Keep** (radiogroup "Color", etc.) | **Keep** |
| Color swatches | Compressed to `kleuren(N): ...` | Compressed |
| Product cards (context mismatch) | Condensed to first link | **Keep** full |

### 3. collapse

Unwraps unnamed structural wrappers:
- `generic > generic > button "Buy"` becomes `button "Buy"`
- Table layout roles (row, cell, rowgroup) always collapse, even when named
- Named groups are preserved
- Multi-child structural nodes become `_promote` (children emitted at parent depth)

### 4. postClean

| Action | Act mode | Browse mode |
|---|---|---|
| Trim combobox/listbox to selected value | Yes | Yes |
| Drop orphaned headings (h2+ without interactive content after) | Yes | **No** (headings structure articles) |

### 5-8. E-commerce noise removal (act/navigate/full only)

These steps are **skipped entirely in browse mode** — documentation and articles don't have product card noise.

**5. dedupLinks** — Within each listitem (product card), keep only first occurrence of each link text.

**6. dropNoiseButtons** — Pattern-matched removal of energy labels, sponsored feedback, "view options" links, footer legal links.

**7. truncateAfterFooter** — Recursive truncation at "back to top" buttons, h6 headings, "related searches" markers.

**8. dropFilterGroups** — Removes sidebar filter panels detected by text patterns.

### 9. serialize

- Converts ANode tree back to Playwright YAML format
- `_promote` nodes emit children at parent depth (flat output)
- Strips `/url` properties by default (agents click by ref)
- Cleans tracking params from remaining URLs
- Truncates long URLs to 150 chars

## ARIA role taxonomy (`roles.js`)

| Category | Count | Examples | Treatment |
|---|---|---|---|
| LANDMARKS | 8 | banner, main, contentinfo, navigation | Region extraction |
| INTERACTIVE | 17 | button, link, textbox, checkbox, radio | Always preserved |
| GROUPS | 9 | radiogroup, tablist, menu, toolbar | Preserved when named |
| STRUCTURAL | 12 | generic, group, list, table, row, cell | Collapsed/removed |
