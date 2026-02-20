# MCP Proxy

The proxy server (`mcp-server.js`) wraps Playwright MCP as a subprocess and intercepts snapshot responses.

## Architecture

```
stdin (from LLM client)          stdout (to LLM client)
        |                                ^
        v                                |
   parentBuffer                    JSON.stringify(msg)
   processBuffer()                       ^
        |                                |
        v                         [prune if snapshot]
   extractContext()                       ^
   track pendingSnapshots                 |
        |                           childBuffer
        v                          processLines()
   child.stdin.write()                   ^
        |                                |
        v                                |
   Playwright MCP subprocess ----> child.stdout
```

## Key behaviors

### Interception strategy

The proxy intercepts **all** tool call responses, not just `browser_snapshot`. Playwright MCP embeds a fresh ariaSnapshot in every action tool response:

- `browser_navigate` -> full page snapshot
- `browser_click` -> snapshot after click
- `browser_type` -> snapshot after typing
- `browser_snapshot` -> explicit snapshot request

### Context tracking

Handled by `extractContext()` in `src/proxy-utils.js`:

| Tool call | Context extraction |
|---|---|
| `browser_type` | Uses `arguments.text` directly |
| `browser_navigate` | Extracts `q`, `k`, `query`, or `search_query` URL params |
| Other tools | No context extracted |

Context persists across calls — typing "iPhone 15" in a search box sets context for all subsequent snapshot pruning until new context arrives.

### Snapshot detection

`looksLikeSnapshot()` in `src/proxy-utils.js` checks if text starts with a Playwright ariaSnapshot role line:

```
/^- (banner|main|navigation|contentinfo|...|table|row|rowgroup|cell)/m
```

The `/m` flag handles text where the snapshot appears after non-snapshot preamble.

### Response format

`processSnapshot()` in `src/proxy-utils.js` produces:

```
[mcprune: 85.8% reduction, ~100713 -> ~14337 tokens | page summary]

- main [ref=e207]:
  - heading "Results" [ref=e204] [level=2]
  ...
```

### JSON-RPC framing

MCP uses newline-delimited JSON over stdio. The proxy maintains two buffers:
- `parentBuffer` — accumulates stdin chunks, processes complete lines
- `childBuffer` — accumulates child stdout chunks, processes with async support (pruning is async due to lazy module loading)

## CLI options

```
node mcp-server.js [--headless] [--mode act|browse|navigate|full]
```

- `--headless` — passed through to Playwright MCP
- `--mode` — sets pruning mode (default: `act`)

## MCP client config

```json
{
  "mcpServers": {
    "browser": {
      "command": "node",
      "args": ["/path/to/mcprune/mcp-server.js"]
    }
  }
}
```
