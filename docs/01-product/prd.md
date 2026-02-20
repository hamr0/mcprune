# Product Requirements

## Problem statement

LLM agents using Playwright MCP receive raw accessibility snapshots of 100K-400K+ tokens per page. This exceeds context windows and degrades agent performance. Agents need a compact, actionable representation that preserves interactive elements and refs.

## Users

1. **LLM agent developers** using Playwright MCP who need smaller snapshots
2. **MCP client users** (Claude Code, Cursor) who want drop-in browser automation that fits in context

## Requirements

### Core pruning (P0)

| Requirement | Status |
|---|---|
| Parse Playwright ariaSnapshot YAML format | Done |
| Prune by ARIA landmark regions (mode-dependent) | Done |
| Preserve all interactive elements (buttons, links, textboxes, etc.) | Done |
| Preserve all `[ref=eN]` markers | Done |
| Collapse unnamed structural wrappers | Done |
| Strip URLs (agents use refs) | Done |
| Achieve 75-95% token reduction on real pages | Done |
| Serialize back to valid ariaSnapshot YAML | Done |

### Context-aware filtering (P0)

| Requirement | Status |
|---|---|
| Capture search context from browser_type text | Done |
| Extract query params from browser_navigate URLs | Done |
| Collapse non-matching product cards to title-only | Done |
| Filter single-char keywords | Done |

### MCP proxy (P0)

| Requirement | Status |
|---|---|
| Spawn Playwright MCP as subprocess | Done |
| Forward all JSON-RPC messages bidirectionally | Done |
| Intercept ALL tool responses (not just browser_snapshot) | Done |
| Detect embedded snapshots via regex | Done |
| Apply prune() + summarize() to detected snapshots | Done |
| Prepend stats header with reduction % and summary | Done |

### Pruning modes (P1)

| Mode | Regions | Status |
|---|---|---|
| `act` | main only | Done |
| `browse` | main only | Done |
| `navigate` | main + banner + nav + search | Done |
| `full` | all landmarks | Done |

### Library API (P1)

| Requirement | Status |
|---|---|
| `prune(yaml, options)` — returns pruned YAML string | Done |
| `summarize(yaml)` — returns one-line page capability summary | Done |
| `parse(yaml)` — re-exported for advanced use | Done |
| ESM exports via package.json | Done |

### Noise removal (P1)

| Requirement | Status |
|---|---|
| Dedup links within product cards | Done |
| Drop energy labels, product info sheets, ad feedback | Done |
| Truncate after footer markers ("back to top") | Done |
| Drop sidebar filter groups | Done |
| Drop orphaned headings (not followed by interactive content) | Done |
| Trim combobox/listbox to selected value only | Done |

### Auto mode detection (P2 — next)

| Requirement | Status |
|---|---|
| Per-snapshot content analysis (paragraph/interactive ratio) | Not started |
| URL pattern matching for known site types | Not started |
| Price pattern detection for act mode | Not started |
| Include detected mode in stats header | Not started |
| Fallback to act mode when uncertain | Not started |

### Agent validation (P2 — next)

| Requirement | Status |
|---|---|
| 5 e-commerce task completions with act mode (Claude Code) | Not started |
| 5 research task completions with browse mode (Claude Code) | Not started |
| Baseline comparison with raw Playwright MCP | Not started |
| Token usage measurement per task | Not started |
| Error log when pruning loses critical info | Not started |

### Section-level extraction (P3)

| Requirement | Status |
|---|---|
| Heading-based section extraction for large docs | Not started |
| Agent can request specific section by topic/heading | Not started |

### Site-agnostic noise patterns (P3)

| Requirement | Status |
|---|---|
| Replace Dutch-specific patterns with generic | Not started |
| Configurable noise pattern lists | Not started |

## Non-requirements

- Bot detection bypass (out of scope)
- Per-site custom rules (rules are generic ARIA-based)
- ML/embedding-based pruning
- Multi-page flow tracking
- Auth/session management
- Forking Playwright MCP (proxy approach preferred for now)
