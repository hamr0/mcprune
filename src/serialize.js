/**
 * Serialize a pruned node tree back to Playwright ariaSnapshot YAML format.
 *
 * @param {Array<import('./parse.js').ANode>} nodes
 * @param {object} [options]
 * @param {boolean} [options.preserveRefs=true]
 * @returns {string}
 */
export function serialize(nodes, options = {}) {
  const { preserveRefs = true, truncateUrls = true, maxUrlLength = 150, stripUrls = false } = options;
  const lines = [];

  for (const node of nodes) {
    serializeNode(node, 0, lines, preserveRefs, truncateUrls, maxUrlLength, stripUrls);
  }

  return lines.join('\n');
}

/**
 * @param {import('./parse.js').ANode} node
 * @param {number} depth
 * @param {string[]} lines
 * @param {boolean} preserveRefs
 */
function serializeNode(node, depth, lines, preserveRefs, truncateUrls, maxUrlLength, stripUrls) {
  // _promote nodes: emit children at current depth, skip the wrapper
  if (node.role === '_promote') {
    for (const child of node.children) {
      serializeNode(child, depth, lines, preserveRefs, truncateUrls, maxUrlLength, stripUrls);
    }
    return;
  }

  const indent = '  '.repeat(depth);

  // Text nodes
  if (node.role === 'text') {
    lines.push(`${indent}- text: ${node.text || ''}`);
    return;
  }

  // Build the role line
  let line = `${indent}- ${node.role}`;

  // Add name
  if (node.name) {
    line += ` "${node.name}"`;
  }

  // Add inline text for leaf nodes with text but no name
  // e.g., "- listitem: one"
  if (!node.name && node.text && node.children.length === 0) {
    line += `: ${node.text}`;
    // Add states/ref inline
    line += formatStates(node, preserveRefs);
    lines.push(line);
    return;
  }

  // Add states
  line += formatStates(node, preserveRefs);

  // Children or properties?
  const hasContent = node.children.length > 0 || Object.keys(node.props).length > 0;
  if (hasContent) {
    line += ':';
  }

  lines.push(line);

  // Properties
  for (const [key, val] of Object.entries(node.props)) {
    if (key === 'url' && stripUrls) continue; // agents click by ref, URLs are noise
    const emitted = (key === 'url' && truncateUrls) ? cleanUrl(val, maxUrlLength) : val;
    lines.push(`${indent}  - /${key}: ${emitted}`);
  }

  // Children
  for (const child of node.children) {
    serializeNode(child, depth + 1, lines, preserveRefs, truncateUrls, maxUrlLength, stripUrls);
  }
}

/**
 * Format state attributes and ref as bracket annotations.
 * @param {import('./parse.js').ANode} node
 * @param {boolean} preserveRefs
 * @returns {string}
 */
/**
 * Clean and truncate a URL for LLM consumption.
 * Strips tracking params, ad redirects, and caps length.
 */
function cleanUrl(url, maxLen) {
  // Amazon ad redirect URLs: extract the actual destination URL at the end
  // Pattern: https://aax-eu.amazon.nl/x/c/.../https://www.amazon.nl/actual/path
  const adRedirect = url.match(/\/https?:\/\/(www\.amazon\.[^/]+\/(?:dp|gp|s|stores)\/.+)$/);
  if (adRedirect) {
    url = 'https://' + adRedirect[1];
  }

  // Strip known tracking query params
  try {
    // Handle relative URLs
    const isRelative = url.startsWith('/');
    const parsed = new URL(url, 'https://placeholder.local');

    const trackingParams = new Set([
      // Amazon
      'ref', 'ref_', 'pf_rd_p', 'pf_rd_r', 'pf_rd_s', 'pf_rd_t', 'pf_rd_i', 'pf_rd_m',
      'pd_rd_w', 'pd_rd_r', 'pd_rd_wg', 'pd_rd_plhdr',
      'content-id', 'aaxitk', 'hsa_cr_id', 'lp_asins', 'lp_query', 'lp_slot',
      'aref', 'sp_csd', 'sp_cr', 'spc', 'store_ref', 'ingress', 'visitId',
      // Google / universal
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
      'fbclid', 'gclid', 'dclid', 'msclkid',
      '_encoding', 'ie',
    ]);

    const cleaned = new URLSearchParams();
    for (const [k, v] of parsed.searchParams) {
      if (!trackingParams.has(k)) {
        cleaned.set(k, v);
      }
    }

    const qs = cleaned.toString();
    const base = parsed.pathname + (qs ? '?' + qs : '') + (parsed.hash || '');
    url = isRelative ? base : parsed.origin + base;
  } catch {
    // Not a parseable URL, just truncate
  }

  if (url.length > maxLen) {
    return url.slice(0, maxLen) + '…';
  }
  return url;
}

function formatStates(node, preserveRefs) {
  let s = '';
  if (preserveRefs && node.ref) {
    s += ` [ref=${node.ref}]`;
  }
  for (const [key, val] of Object.entries(node.states)) {
    if (val === true) {
      s += ` [${key}]`;
    } else {
      s += ` [${key}=${val}]`;
    }
  }
  return s;
}
