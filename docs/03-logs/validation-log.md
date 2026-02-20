# Validation Log

## Test suite: 121/121 passing

| Suite | File | Tests | What's covered |
|---|---|---|---|
| parse | `test/parse.test.js` | 8 | Button with ref, states, text nodes, properties, nesting, inline text, landmarks, full Amazon fixture |
| prune | `test/prune.test.js` | 12 | Act mode drops (banner, footer, nav, images, descriptions, complementary, reviews, gallery), act mode keeps (interactive, radiogroups, prices), navigate mode, token reduction |
| proxy | `test/proxy.test.js` | 24 | Snapshot detection (true/false cases), context extraction (type, navigate, params, edge cases), processSnapshot formatting and passthrough |
| edge-cases | `test/edge-cases.test.js` | 77 | Empty/minimal inputs, no-landmark pages (HN, Wikipedia), structural collapse, context-aware pruning, summarize edge cases, browse mode content preservation (MDN, Python docs, SO, GitHub issue, npm), round-trip parse safety (9 fixtures × 3 modes) |

## Token reduction benchmarks

### Fixture (unit test)

```
Amazon product: 4,930 chars -> 1,157 chars (76.5% reduction)
```

### Live (via MCP proxy)

| Page | Raw | Pruned | Reduction |
|---|---|---|---|
| Amazon NL search (30 products) | ~100K tokens | ~14K tokens | 85.8% |
| Amazon NL product page | ~28K tokens | ~3.3K tokens | 88.0% |
| Wikipedia article (browse) | ~54K tokens | ~8.6K tokens | 84.0% |
| Amazon NL homepage | ~30K chars | ~8K chars | 75.5% |

## Browse mode coverage

Browse mode tested against 5 developer/docs fixtures:

| Fixture | Verified content preservation |
|---|---|
| MDN docs | Paragraphs, code blocks, inline links, headings, sidebar TOC |
| Python docs | Article text, code examples, term/definition pairs |
| Stack Overflow | Question text, code blocks, answer content |
| GitHub issue | PR description, comment text, code references |
| npm package | Package description, README content |

## Round-trip safety

All 9 fixtures pass `parse(prune(fixture))` without throwing, in all 3 modes (act, browse, navigate). This confirms pruned output is valid parseable YAML.
