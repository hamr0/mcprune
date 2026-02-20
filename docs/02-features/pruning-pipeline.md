# Pruning Pipeline

The core of mcprune: a 9-step rule-based pipeline in `src/prune.js`.

## Pipeline flow

```
Raw YAML --> parse() --> [ANode tree]
                             |
                   1. extractRegions     <- keep landmarks matching mode
                   2. pruneNode          <- drop paragraphs, images; context-match cards
                   3. collapse           <- unwrap unnamed structural wrappers
                   4. postClean          <- trim comboboxes, drop orphaned headings
                   5. dedupLinks         <- first-occurrence dedup per product card
                   6. dropNoiseButtons   <- energy labels, sponsored, "view options"
                   7. truncateAfterFooter <- everything after "back to top"
                   8. dropFilterGroups   <- sidebar refinement panels
                   9. serialize          <- back to YAML, strip URLs
                             |
                   [pruned YAML string]
```

## Step details

### 1. extractRegions (`prune.js:170-209`)

Keeps only landmark subtrees matching the mode. Three fallback paths:

| Page structure | Behavior |
|---|---|
| Has landmarks + main with interactive content | Keep allowed landmarks only |
| Has landmarks but no useful main | Treat interactive non-landmark nodes as implicit main |
| No landmarks at all (HN-style) | Keep everything, rely on node-level pruning |

### 2. pruneNode (`prune.js:239-333`)

Per-node decisions:

- **Always keep**: interactive elements (INTERACTIVE set)
- **Always drop**: images, separators, complementary, superscripts
- **Mode-dependent**: paragraphs dropped in `act` mode, kept in `browse`
- **Context-aware**: listitems with zero keyword matches collapse to first link only
- **Headings**: h1 always kept; h2+ dropped if they're description headers
- **Text nodes**: kept if price, stock, shipping, or short label; dropped if long
- **Named groups**: preserved (radiogroup "Color", etc.)
- **Color swatches**: compressed to `kleuren(N): color1, color2, ...`

### 3. collapse (`prune.js:392-413`)

Unwraps unnamed structural wrappers:
- `generic > generic > button "Buy"` becomes `button "Buy"`
- Table layout roles (row, cell, rowgroup) always collapse, even when named
- Named groups are preserved
- Multi-child structural nodes become `_promote` (children emitted at parent depth)

### 4. postClean (`prune.js:420-461`)

- Combobox/listbox: keep just selected value, drop all options
- Orphaned headings: h2+ not followed by interactive content are dropped

### 5. dedupLinks (`prune.js:534-563`)

Within each listitem (product card), keep only first occurrence of each link text. Amazon cards have 3+ links to the same product (image, title, rating).

### 6. dropNoiseButtons (`prune.js:578-593`)

Pattern-matched removal of:
- Energy class labels, product info sheets
- Sponsored ad feedback buttons
- Generic "view options" / "see options" links
- Footer legal links (privacy, cookies, contact)

### 7. truncateAfterFooter (`prune.js:617-630`)

Recursive truncation at footer markers:
- "Back to top" buttons
- h6 headings
- "Related searches" / "Need help?" headings
- Works even when markers are nested inside wrapper nodes

### 8. dropFilterGroups (`prune.js:641-654`)

Removes sidebar filter panels detected by text patterns like "filter to narrow", "apply filter", "refine by".

### 9. serialize (`serialize.js`)

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
