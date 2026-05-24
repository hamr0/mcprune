# Changelog

All notable changes are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/); the project adheres to
[Semantic Versioning](https://semver.org/).

## [0.1.1] — 2026-05-24

Security and robustness hardening from a full audit of the proxy and pruning
pipeline. No public API changes.

### Security
- **Removed the unused `@modelcontextprotocol/sdk` dependency.** It was never
  imported but pulled in ~91 transitive packages carrying 20+ high-severity
  advisories (hono, express-rate-limit, fast-uri, ajv). `npm audit` is now
  clean. The proxy speaks JSON-RPC over stdio directly and only spawns
  `@playwright/mcp`.
- **Hardened auto mode detection against look-alike domains.** URL
  classification now matches the parsed hostname/path with domain-boundary
  anchoring instead of substring-matching the raw URL, so hosts like
  `wikipedia.org.attacker.net` or `evil.com/?ref=wikipedia.org` can no longer
  spoof browse mode. (`src/proxy-utils.js`)
- **Sanitized the stats header.** Page-derived summary text (titles, button
  labels) is stripped of `[`, `]`, and newlines so a crafted page cannot break
  out of the `[mcprune: …]` frame and masquerade as trusted middleware output
  to the LLM. (`src/proxy-utils.js`)

### Fixed
- **Proxy was non-functional for tool calls.** An undeclared `params` reference
  in the stdin handler threw `ReferenceError` on every `tools/call`, which the
  catch-all swallowed as "incomplete JSON" — the request was never forwarded to
  the child. (`mcp-server.js`)
- **Stack-overflow crash on deeply nested snapshots.** `prune()` recursed
  without bound and threw `RangeError` around ~2000 levels deep; a malicious or
  pathological page could crash the pipeline. Tree depth is now capped at 1000
  (real pages nest <15 levels), flattening deeper nodes onto the capped ancestor
  without dropping any `[ref=eN]` markers. (`src/parse.js`)
- **Fail-open error handling in the proxy.** Both stdio handlers now distinguish
  JSON parse failures from processing errors: a parse failure forwards the line
  verbatim, and a pruning error forwards the original unpruned response instead
  of dropping it and re-buffering into a wedge. (`mcp-server.js`)
- **Output forwarding can no longer be wedged by a chain rejection.** The async
  stdout drain is re-armed with `.catch`, so an unexpected failure (e.g. `EPIPE`)
  can't leave the promise chain rejected and silently halt all forwarding.
  (`mcp-server.js`)

### Changed
- Added a `files` whitelist to `package.json` so published tarballs ship only
  `src/`, `mcp-server.js`, and `README.md` (previously also shipped `scripts/`,
  `docs/`, and `blueprint.md`).
- Added `repository`, `homepage`, and `bugs` metadata to `package.json` —
  required for npm provenance (`--provenance`) to validate the source repo.

## [0.1.0]

- Initial release: rule-based ariaSnapshot pruning pipeline, MCP stdio proxy,
  context-aware relevance filtering, and auto mode detection.
