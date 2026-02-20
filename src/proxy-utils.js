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
 * Detect pruning mode from URL and snapshot content.
 * Returns 'act' or 'browse'.
 *
 * @param {string} text - Raw snapshot text
 * @param {string} [url=''] - Current page URL (from browser_navigate)
 * @returns {{ mode: string, reason: string }}
 */
export function detectMode(text, url = '') {
  // 1. URL-based detection (fast, high confidence)
  if (url) {
    const lc = url.toLowerCase();
    if (BROWSE_URL_PATTERNS.some(p => p.test(lc))) {
      return { mode: 'browse', reason: 'url' };
    }
    if (ACT_URL_PATTERNS.some(p => p.test(lc))) {
      return { mode: 'act', reason: 'url' };
    }
  }

  // 2. Content-based detection (scan raw snapshot)
  if (text) {
    const lines = text.split('\n');
    let paragraphs = 0;
    let codeBlocks = 0;
    let interactive = 0;
    let hasPrices = false;

    for (const line of lines) {
      const trimmed = line.trimStart();
      if (trimmed.startsWith('- paragraph')) paragraphs++;
      else if (trimmed.startsWith('- code')) codeBlocks++;
      else if (/^- (button|link|textbox|searchbox|checkbox|radio|combobox|listbox|menuitem|option|slider|spinbutton|switch|tab) /.test(trimmed)) interactive++;
      if (!hasPrices && /[$€£¥]\s?\d|USD|EUR|GBP/.test(trimmed)) hasPrices = true;
    }

    // Price patterns strongly suggest e-commerce
    if (hasPrices && paragraphs < 5) {
      return { mode: 'act', reason: 'prices' };
    }

    // High content-to-interactive ratio suggests documentation/article
    const contentSignals = paragraphs + codeBlocks * 2; // code blocks are strong browse signal
    if (interactive > 0 && contentSignals / interactive > 1.5) {
      return { mode: 'browse', reason: 'content-ratio' };
    }

    // Many paragraphs even without much interactive = article
    if (paragraphs >= 5 && codeBlocks >= 1) {
      return { mode: 'browse', reason: 'docs-pattern' };
    }
  }

  // 3. Default to act (the original behavior)
  return { mode: 'act', reason: 'default' };
}

const BROWSE_URL_PATTERNS = [
  /docs\./, /\.readthedocs\./, /developer\.mozilla/, /devdocs\./,
  /stackoverflow\.com\/questions/, /stackexchange\.com/,
  /github\.com\/[^/]+\/[^/]+\/(issues|pull|discussions|wiki)/,
  /wikipedia\.org/, /medium\.com\//, /dev\.to\//,
  /python\.org\/.*\/(docs|tutorial|library|reference)/,
  /nodejs\.org\/.*\/docs/, /ruby-doc\.org/,
  /npmjs\.com\/package\//, /pypi\.org\/project\//,
  /man7\.org/, /linux\.die\.net/,
  /learn\.microsoft\.com/, /cloud\.google\.com\/.*\/docs/,
];

const ACT_URL_PATTERNS = [
  /amazon\./, /ebay\./, /\.shop\//, /shopify\./,
  /booking\.com/, /airbnb\./, /hotels\.com/,
  /walmart\.com/, /target\.com/, /bestbuy\.com/,
  /etsy\.com/, /aliexpress\.com/, /zalando\./,
  /bol\.com/, /coolblue\./,
];

/**
 * Process a snapshot text: prune + summarize + prepend stats header.
 *
 * @param {string} text - Raw snapshot text
 * @param {object} opts
 * @param {function} opts.prune - prune(yaml, options) function
 * @param {function} opts.summarize - summarize(yaml) function
 * @param {string} [opts.mode='act'] - Pruning mode ('auto' for auto-detection)
 * @param {string} [opts.context=''] - Search context
 * @param {string} [opts.url=''] - Current page URL (for auto-detection)
 * @returns {string} Header + pruned text
 */
export function processSnapshot(text, { prune, summarize, mode = 'act', context = '', url = '' }) {
  let effectiveMode = mode;
  let autoReason = '';

  if (mode === 'auto') {
    const detection = detectMode(text, url);
    effectiveMode = detection.mode;
    autoReason = detection.reason;
  }

  const pruned = prune(text, { mode: effectiveMode, context });
  const summary = summarize(text);

  const rawTokens = Math.round(text.length / 4);
  const prunedTokens = Math.round(pruned.length / 4);
  const reduction = ((1 - pruned.length / text.length) * 100).toFixed(1);

  const modeLabel = mode === 'auto'
    ? `mode=${effectiveMode} (auto:${autoReason})`
    : `mode=${effectiveMode}`;

  return `[mcprune: ${reduction}% reduction, ~${rawTokens} → ~${prunedTokens} tokens, ${modeLabel} | ${summary}]\n\n${pruned}`;
}
