# Vision

## What mcprune is

MCP middleware that prunes Playwright accessibility snapshots for LLM agents. Zero ML, 75-95% token reduction, all refs preserved.

## The problem

Playwright MCP gives LLM agents browser control via accessibility snapshots — YAML trees of every element on the page. Real pages produce 100K-400K+ tokens per snapshot. That's too large for any LLM context window.

## The solution

mcprune sits between the agent and Playwright MCP, intercepting every response and pruning snapshots to only what the agent needs: interactive elements, prices, headings, and refs to click.

```
Agent  <->  mcprune (proxy)  <->  Playwright MCP  <->  Browser
               |
         prune() + summarize()
         75-95% token reduction
```

## Core insight

Screen readers solved "what matters on a page" 25 years ago using ARIA landmarks, heading hierarchy, and role taxonomy. mcprune applies these same heuristics — landmark navigation, interactive element focus, structural collapsing — to compress accessibility trees for LLM agents.

## Boundaries

**mcprune IS:**
- A pruning library (`prune()`, `summarize()`) — string in, string out
- An MCP proxy server wrapping Playwright MCP
- Rule-based and deterministic — same input always produces same output
- Zero dependencies beyond Playwright MCP

**mcprune IS NOT:**
- A browser automation framework (that's Playwright MCP)
- An ML/embedding-based solution
- A bot detection bypass tool
- A per-site scraper

## Positioning

| Existing approach | Problem | mcprune's answer |
|---|---|---|
| Playwright MCP raw | 100K-400K tokens per page | 75-95% reduction |
| Vercel agent-browser `-i` | Flat interactive list, no context | Structured tree with prices, headings, groups |
| Vision/screenshot agents | Expensive, slow, coordinate-based | Text-based, fast, ref-based clicking |

## Success metric

An LLM agent can navigate, search, compare products, and complete purchases on e-commerce sites using pruned snapshots that fit within tool result token limits.
