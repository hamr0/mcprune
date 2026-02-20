/**
 * Proxy utility functions — extracted from mcp-server.js for testability.
 * Pure functions with no I/O or child process dependencies.
 */

/**
 * Check if a text block looks like a Playwright ariaSnapshot.
 * @param {string} text
 * @returns {boolean}
 */
export function looksLikeSnapshot(text) {
  if (!text) return false;
  return /^- (banner|main|navigation|contentinfo|complementary|region|generic|heading|WebArea|link|button|search|dialog|form|textbox|list|listitem|img|text|table|row|rowgroup|cell)/m.test(text);
}

/**
 * Extract search context from an MCP tool-call message.
 * Looks at browser_type text and browser_navigate URL query params.
 *
 * @param {object} msg - JSON-RPC message (request)
 * @returns {string|null} Extracted context string, or null if none found
 */
export function extractContext(msg) {
  if (!msg || msg.method !== 'tools/call') return null;

  const params = msg.params;
  if (!params) return null;

  // browser_type: use the typed text as context
  if (params.name === 'browser_type' && params.arguments?.text) {
    return params.arguments.text;
  }

  // browser_navigate: extract search query from URL params
  if (params.name === 'browser_navigate' && params.arguments?.url) {
    try {
      const u = new URL(params.arguments.url, 'https://placeholder.local');
      const q = u.searchParams.get('q')
        || u.searchParams.get('k')
        || u.searchParams.get('query')
        || u.searchParams.get('search_query')
        || '';
      return q || null;
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Process a snapshot text: prune + summarize + prepend stats header.
 *
 * @param {string} text - Raw snapshot text
 * @param {object} opts
 * @param {function} opts.prune - prune(yaml, options) function
 * @param {function} opts.summarize - summarize(yaml) function
 * @param {string} [opts.mode='act'] - Pruning mode
 * @param {string} [opts.context=''] - Search context
 * @returns {string} Header + pruned text
 */
export function processSnapshot(text, { prune, summarize, mode = 'act', context = '' }) {
  const pruned = prune(text, { mode, context });
  const summary = summarize(text);

  const rawTokens = Math.round(text.length / 4);
  const prunedTokens = Math.round(pruned.length / 4);
  const reduction = ((1 - pruned.length / text.length) * 100).toFixed(1);

  return `[mcprune: ${reduction}% reduction, ~${rawTokens} → ~${prunedTokens} tokens | ${summary}]\n\n${pruned}`;
}
