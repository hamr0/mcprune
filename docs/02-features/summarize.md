# Page Summary Generation

`summarize(yaml)` in `src/prune.js` generates a one-line capability summary of a page.

## Format

```
{title} ({price}, {stock}) | {actions}
```

Examples:
```
Amazon.com: Apple iPhone 16 Pro Max ($1,099.00, In Stock) | pick color(4), pick size(3), set quantity, add to cart, buy now, add to list, 14 links
```

```
Accessibility | search, main menu, 42 languages, tools, hide, 15 links
```

## Title resolution

Priority cascade in `findPageTitle()`:

1. WebArea name (from `<title>` tag)
2. h1 inside main landmark
3. First heading inside main
4. h1 anywhere
5. Any heading anywhere
6. First named link
7. "Untitled"

## Data extraction

- **Price**: first text node matching `$N,NNN.NN`
- **Stock**: first text node matching "in stock" / "out of stock" / etc.
- Scoped to main landmark when available; falls back to full tree

## Action discovery

Scoped to main landmark, in order:

1. **Searchbox** -> "search"
2. **Radiogroups** -> `pick {name}({count})` for each
3. **Comboboxes** -> `set {name}` for each
4. **Buttons** (up to 6, skipping gallery/nav/generic) -> button label
5. **Links** (if >10) -> `{count} links`

## Edge cases

- No title -> "Untitled"
- No price/stock -> title + actions only
- No buttons -> just link count
- No interactive elements -> just title
- No main landmark -> uses full tree for scoping
