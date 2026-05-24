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
  // 1. URL-based detection (fast, high confidence). Match against the parsed
  //    hostname/pathname — never the raw URL string — so a domain can't be
  //    smuggled via scheme/query/fragment, and host patterns are anchored to a
  //    domain boundary to reject look-alikes like "wikipedia.org.attacker.net".
  const target = parseTarget(url);
  if (target) {
    if (isBrowseUrl(target)) return { mode: 'browse', reason: 'url' };
    if (isActUrl(target)) return { mode: 'act', reason: 'url' };
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

/**
 * Parse a URL into lowercased hostname + pathname, or null if unparseable.
 * @param {string} url
 * @returns {{ host: string, path: string }|null}
 */
function parseTarget(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    return { host: u.hostname.toLowerCase(), path: u.pathname.toLowerCase() };
  } catch {
    return null;
  }
}

/** Suffix match anchored to a domain boundary: `host` is `domain` or a sub-domain
 *  of it. Rejects look-alikes — "wikipedia.org.evil.net" does NOT match "wikipedia.org". */
function hostEndsWith(host, domain) {
  return host === domain || host.endsWith('.' + domain);
}

/** Label match: `label` appears as a whole dot-delimited label of `host`
 *  (e.g. "docs" in docs.python.org, "amazon" in www.amazon.nl). */
function hostHasLabel(host, label) {
  return host === label
    || host.startsWith(label + '.')
    || host.endsWith('.' + label)
    || host.includes('.' + label + '.');
}

/** Documentation / reference / article destinations → browse mode. */
function isBrowseUrl({ host, path }) {
  // Documentation / article hosts (suffix-anchored).
  for (const d of ['developer.mozilla.org', 'stackexchange.com', 'wikipedia.org',
    'medium.com', 'dev.to', 'ruby-doc.org', 'man7.org', 'linux.die.net',
    'learn.microsoft.com']) {
    if (hostEndsWith(host, d)) return true;
  }
  // Documentation sub-domains (docs.*, *.readthedocs.*, devdocs.*).
  if (hostHasLabel(host, 'docs') || hostHasLabel(host, 'readthedocs') || hostHasLabel(host, 'devdocs')) return true;
  // Host + path rules.
  if (hostEndsWith(host, 'stackoverflow.com') && path.startsWith('/questions')) return true;
  if (hostEndsWith(host, 'github.com') && /^\/[^/]+\/[^/]+\/(issues|pull|discussions|wiki)/.test(path)) return true;
  if (hostEndsWith(host, 'python.org') && /\/(docs|tutorial|library|reference)/.test(path)) return true;
  if (hostEndsWith(host, 'nodejs.org') && path.includes('/docs')) return true;
  if (hostEndsWith(host, 'npmjs.com') && path.startsWith('/package/')) return true;
  if (hostEndsWith(host, 'pypi.org') && path.startsWith('/project/')) return true;
  if (hostEndsWith(host, 'cloud.google.com') && path.includes('/docs')) return true;
  return false;
}

/** E-commerce / booking destinations → act mode. Intentionally permissive:
 *  a false match here only yields 'act', which is also the default. */
function isActUrl({ host }) {
  for (const d of ['booking.com', 'hotels.com', 'walmart.com', 'target.com',
    'bestbuy.com', 'etsy.com', 'aliexpress.com', 'bol.com']) {
    if (hostEndsWith(host, d)) return true;
  }
  for (const b of ['amazon', 'ebay', 'shopify', 'airbnb', 'zalando', 'coolblue']) {
    if (hostHasLabel(host, b)) return true;
  }
  if (host.endsWith('.shop')) return true;
  return false;
}

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

  // The summary is built from page-controlled text (titles, button labels). Strip
  // characters that would let a crafted page break out of the [mcprune: ...] frame
  // and masquerade as trusted middleware output to the LLM (prompt-injection laundering).
  const safeSummary = String(summary).replace(/[\[\]\r\n]+/g, ' ').trim();

  return `[mcprune: ${reduction}% reduction, ~${rawTokens} → ~${prunedTokens} tokens, ${modeLabel} | ${safeSummary}]\n\n${pruned}`;
}
