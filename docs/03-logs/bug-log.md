# Bug Log

Add entries as bugs are discovered:

```
## [date] Short description

**Symptom**: What was observed
**Root cause**: Why it happened
**Fix**: What was changed
**Files**: Which files were modified
```

## 2026-05-24 Proxy threw ReferenceError on every tool call

**Symptom**: No `tools/call` was ever forwarded to the Playwright MCP child; the proxy was effectively non-functional.
**Root cause**: The stdin handler referenced an undeclared `params` variable. In strict-mode ESM this throws `ReferenceError` for every `tools/call`; the surrounding catch-all swallowed it as "incomplete JSON" and re-buffered the line instead of forwarding it.
**Fix**: Declared `const params = msg.params || {}`; split JSON-parse failures from processing errors so the message is always forwarded (verbatim on parse failure, original on logic error).
**Files**: `mcp-server.js`

## 2026-05-24 Stack overflow on deeply nested snapshots

**Symptom**: `prune()` threw `RangeError: Maximum call stack size exceeded` on snapshots nested ~2000+ levels deep (reproducible; a crafted/malicious page could trigger it).
**Root cause**: Every pruning pass (`extractText`, `collapse`, `flatten`, `serializeNode`, …) recurses on tree depth, with no bound on input nesting.
**Fix**: Capped tree depth at 1000 in `parse()` (`MAX_DEPTH`); nodes beyond the cap flatten onto the capped ancestor so no `[ref=eN]` markers are lost. Real pages nest <15 levels.
**Files**: `src/parse.js`

## 2026-05-24 Proxy wedged on pruning/parse errors

**Symptom**: A snapshot that made `prune()` throw caused the response to be dropped and re-buffered, wedging the proxy.
**Root cause**: The stdout handler's catch-all treated any exception (parse or processing) identically and re-buffered the line.
**Fix**: Fail-open handling — parse failures pass through verbatim; pruning errors forward the original unpruned response. Also serialized async pruning through a promise chain to preserve message order.
**Files**: `mcp-server.js`
