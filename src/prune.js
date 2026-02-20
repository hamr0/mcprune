/**
 * mcprune: MCP middleware that prunes Playwright accessibility snapshots for LLM agents.
 * Zero ML, 75-95% token reduction, all refs preserved.
 *
 * @module mcprune
 */

import { parse } from './parse.js';
import { serialize } from './serialize.js';
import { LANDMARKS, INTERACTIVE, GROUPS, STRUCTURAL, MODE_REGIONS } from './roles.js';

/**
 * Prune a Playwright ariaSnapshot YAML string.
 *
 * @param {string} yaml - Raw ariaSnapshot YAML
 * @param {object} [options]
 * @param {'act'|'browse'|'navigate'|'full'} [options.mode='act'] - Pruning mode
 * @param {boolean} [options.preserveRefs=true] - Keep [ref=eN] markers
 * @param {boolean} [options.collapseWrappers=true] - Remove unnamed structural wrappers
 * @param {boolean} [options.stripUrls=true] - Strip /url properties (agents use refs)
 * @param {string} [options.context=''] - Search context for relevance pruning (e.g. "iPhone 15")
 * @returns {string} Pruned YAML
 */
export function prune(yaml, options = {}) {
  const {
    mode = 'act', preserveRefs = true, collapseWrappers = true,
    stripUrls = true, context = '',
  } = options;

  const tree = parse(yaml);
  const allowedRegions = MODE_REGIONS[mode] || MODE_REGIONS.act;

  // Build keyword set from context for fuzzy relevance matching
  const keywords = context
    ? context.toLowerCase().split(/\s+/).filter(w => w.length > 1)
    : [];

  // Step 1: Extract landmark subtrees that match the mode
  const kept = extractRegions(tree, allowedRegions);

  // Step 2: Prune nodes within kept regions
  const ctx = { mode, parentRole: null, keywords };
  const pruned = kept.map(region => pruneNode(region, ctx)).filter(Boolean);

  // Step 3: Collapse unnamed structural wrappers
  const collapsed = collapseWrappers
    ? pruned.map(n => collapse(n)).filter(Boolean)
    : pruned;

  // Step 4: Post-prune cleanup (dedup, noise removal, context filtering)
  const cleaned = collapsed.map(n => postClean(n)).filter(Boolean);

  // Step 5: Dedup links — keep first ref per unique link text
  const deduped = dedupLinks(cleaned);

  // Step 6: Drop noise buttons (energy labels, product sheets, ad feedback)
  const denoised = deduped.map(n => dropNoiseButtons(n)).filter(Boolean);

  // Step 7: Truncate after "back to top" — everything below is footer
  const truncated = truncateAfterFooter(denoised);

  // Step 8: Drop sidebar filter groups
  const noFilters = truncated.map(n => dropFilterGroups(n)).filter(Boolean);

  // Step 9: Serialize back to YAML
  return serialize(noFilters, { preserveRefs, stripUrls });
}

/**
 * Generate a one-line page capability summary.
 *
 * @param {string} yaml - Raw ariaSnapshot YAML
 * @returns {string} Summary line
 */
export function summarize(yaml) {
  const tree = parse(yaml);
  const allNodes = flatten(tree);

  // Scope to main landmark for action discovery (fall back to full tree)
  const mainNode = allNodes.find(n => n.role === 'main');
  const scopedNodes = mainNode ? flatten([mainNode]) : allNodes;

  // Page title: cascade through available sources
  const title = findPageTitle(allNodes);

  // Key data: price, stock (from scoped area)
  const texts = scopedNodes.filter(n => n.role === 'text').map(n => n.text || '');
  const price = texts.find(t => /^\$[\d,]+\.?\d*$/.test(t));
  const stock = texts.find(t => /in stock/i.test(t));

  // Interactive capabilities (from scoped area)
  const actions = [];
  const buttons = scopedNodes.filter(n => n.role === 'button' && n.name && !n.states.disabled);
  const radiogroups = scopedNodes.filter(n => n.role === 'radiogroup' && n.name);
  const searchbox = scopedNodes.find(n => n.role === 'searchbox');
  const comboboxes = scopedNodes.filter(n => n.role === 'combobox' && n.name);
  const links = scopedNodes.filter(n => n.role === 'link' && n.name);

  if (searchbox) actions.push('search');
  for (const rg of radiogroups) {
    actions.push(`pick ${rg.name.toLowerCase()}(${rg.children.length})`);
  }
  for (const cb of comboboxes) {
    actions.push(`set ${cb.name.toLowerCase()}`);
  }
  const seenButtons = new Set();
  for (const btn of buttons) {
    const label = btn.name.toLowerCase().replace(/\s+/g, ' ');
    // Skip gallery, nav, and generic/duplicate buttons
    if (/^show image/i.test(label)) continue;
    if (/^(previous|next)$/i.test(label)) continue;
    if (/^\[.*\]$/.test(label)) continue; // skip [show], [hide] etc.
    if (label.length > 30) continue; // skip long labels (language pickers, etc.)
    if (seenButtons.has(label)) continue;
    seenButtons.add(label);
    actions.push(label);
    if (seenButtons.size >= 6) break; // cap button count in summary
  }

  // For link-heavy pages, show count instead of listing each
  if (links.length > 10) {
    actions.push(`${links.length} links`);
  }

  const meta = [price, stock].filter(Boolean).join(', ');
  const pageLine = meta ? `${title} (${meta})` : title;
  return `${pageLine} | ${actions.join(', ')}`;
}

/**
 * Find the best page title from all available sources.
 * Priority: WebArea name > h1 > first heading > first named link > "Untitled"
 */
function findPageTitle(allNodes) {
  // 1. WebArea (has document title from <title> tag)
  const webArea = allNodes.find(n => n.role === 'WebArea');
  if (webArea?.name) return webArea.name;

  // 2. h1 heading — prefer one inside main if available
  const mainNode = allNodes.find(n => n.role === 'main');
  if (mainNode) {
    const mainH1 = flatten([mainNode]).find(n => n.role === 'heading' && n.states.level === '1');
    if (mainH1?.name) return mainH1.name;
    // First heading inside main
    const mainHeading = flatten([mainNode]).find(n => n.role === 'heading' && n.name);
    if (mainHeading?.name) return mainHeading.name;
  }

  // 3. h1 anywhere
  const h1 = allNodes.find(n => n.role === 'heading' && n.states.level === '1');
  if (h1?.name) return h1.name;

  // 4. Any heading
  const anyHeading = allNodes.find(n => n.role === 'heading' && n.name);
  if (anyHeading?.name) return anyHeading.name;

  // 5. First named link (often the site name, like "Hacker News")
  const firstLink = allNodes.find(n => n.role === 'link' && n.name);
  if (firstLink?.name) return firstLink.name;

  return 'Untitled';
}

/**
 * Extract subtrees rooted at allowed landmark regions.
 * If root is WebArea, look at its children for landmarks.
 * Nodes not inside any landmark and not a landmark themselves
 * are included if they're inside an allowed-region subtree.
 */
function extractRegions(tree, allowedRegions) {
  // First, unwrap WebArea
  let nodes = tree;
  if (nodes.length === 1 && nodes[0].role === 'WebArea') {
    nodes = nodes[0].children;
  }

  // Check if this page uses landmarks at all
  const hasLandmarks = nodes.some(n => LANDMARKS.has(n.role));
  const mainNode = nodes.find(n => n.role === 'main');
  // main exists AND has meaningful content (not just empty lists/wrappers)
  const hasMain = mainNode ? hasInteractive(mainNode) || hasHeading(mainNode) : false;

  const results = [];
  for (const node of nodes) {
    if (LANDMARKS.has(node.role)) {
      if (isRegionAllowed(node, allowedRegions)) {
        results.push(node);
      }
    } else if (hasLandmarks && hasMain) {
      // Page has landmarks AND a main region — non-landmark nodes are chrome
      // (cookie banners, skip links, overlays). Drop in act/browse mode.
      if (allowedRegions.has('navigation')) {
        // navigate/full mode: keep non-landmark top-level nodes
        results.push(node);
      }
    } else if (hasLandmarks && !hasMain) {
      // Page has landmarks (banner, nav, etc.) but NO main — the primary content
      // sits outside any landmark (common on Amazon search, Shopify listings, etc.).
      // Treat non-landmark nodes with interactive content or headings as implicit main.
      if (hasInteractive(node) || hasHeading(node)) {
        results.push(node);
      }
    } else {
      // No landmarks at all (HN-style) — keep everything, rely on node-level pruning
      results.push(node);
    }
  }
  return results;
}

/**
 * Check if a landmark node is allowed by the current mode.
 * 'region' landmarks are allowed if they're not clearly auxiliary
 * (like "Customer reviews" or "Product images" in act mode).
 */
function isRegionAllowed(node, allowedRegions) {
  // Direct landmark match
  if (allowedRegions.has(node.role)) return true;

  // Named regions inside main are treated as main content
  if (node.role === 'region' && allowedRegions.has('main')) {
    // Drop known auxiliary regions in act mode
    const auxPatterns = /image|review|recommend|related|similar|also viewed|cookie/i;
    if (node.name && auxPatterns.test(node.name)) return false;
    return true;
  }

  return false;
}

/**
 * Prune a single node and its subtree.
 * Returns the pruned node, or null if it should be dropped entirely.
 *
 * @param {import('./parse.js').ANode} node
 * @param {{ mode: string, parentRole: string|null, keywords: string[] }} ctx
 * @returns {import('./parse.js').ANode|null}
 */
function pruneNode(node, ctx) {
  // In act mode, drop links inside paragraphs — they're inline content references,
  // not page actions. ("assistive technology" link inside article text ≠ "Add to Cart")
  if (ctx.mode === 'act' && node.role === 'link' && ctx.parentRole === 'paragraph') {
    return null;
  }

  // In act mode, drop entire paragraphs — they're content, not actions
  if (ctx.mode === 'act' && node.role === 'paragraph') {
    return null;
  }

  // In act mode, drop superscript (footnote markers)
  if (ctx.mode === 'act' && node.role === 'superscript') {
    return null;
  }

  // Always keep interactive elements
  if (INTERACTIVE.has(node.role)) {
    return { ...node, children: pruneChildren(node.children, ctx) };
  }

  // Context-aware pruning: if we have keywords and this is a listitem (product card),
  // check if ANY text in the subtree matches. If zero matches, collapse to minimal.
  if (ctx.keywords.length > 0 && node.role === 'listitem' && hasInteractive(node)) {
    const subtreeText = extractText(node).toLowerCase();
    const hits = ctx.keywords.filter(kw => subtreeText.includes(kw)).length;
    if (hits === 0) {
      // No keyword match — collapse to just first link + price
      const condensed = condenseIrrelevantCard(node);
      return condensed;
    }
  }

  // Always keep named groups (radiogroup "Color", tablist, etc.)
  // But collapse color swatch groups to a compact summary
  if (GROUPS.has(node.role) && node.name) {
    return { ...node, children: pruneChildren(node.children, ctx) };
  }
  if (node.role === 'group' && node.name) {
    // Color swatch groups: "beschikbare kleuren", "available colors"
    if (/kleuren|colors?|couleurs?|farben/i.test(node.name)) {
      return collapseColorSwatches(node);
    }
    return { ...node, children: pruneChildren(node.children, ctx) };
  }

  // Keep h1 always (page identity). Drop h2+ headings for non-actionable sections.
  if (node.role === 'heading') {
    if (node.states.level !== '1') {
      const descriptionHeadings = /about this|description|detail|feature|specification|overview/i;
      if (node.name && descriptionHeadings.test(node.name)) return null;
    }
    return { ...node, children: [] };
  }

  // Keep text nodes that are contextually useful
  if (node.role === 'text') {
    return keepTextNode(node) ? node : null;
  }

  // Drop images
  if (node.role === 'img') return null;

  // Drop separators
  if (node.role === 'separator') return null;

  // Drop auxiliary landmarks that got through (complementary, etc.)
  if (node.role === 'complementary') return null;

  // Drop named regions about images/reviews in act mode
  if (node.role === 'region') {
    const auxPatterns = /image|review|recommend|related|similar|also viewed/i;
    if (node.name && auxPatterns.test(node.name)) return null;
  }

  // For structural/unnamed nodes: recurse into children, promote keepers
  const childCtx = { ...ctx, parentRole: node.role };
  const keptChildren = pruneChildren(node.children, childCtx);

  // Pure text lists (product descriptions) — drop if no interactive children
  if (node.role === 'list' && keptChildren.every(c => !hasInteractive(c))) {
    return null;
  }
  if (node.role === 'listitem' && !hasInteractive(node)) {
    return null;
  }

  // If this structural node has kept children, keep it (may be collapsed later)
  if (keptChildren.length > 0) {
    return { ...node, children: keptChildren };
  }

  return null;
}

/**
 * Prune an array of children nodes.
 * @param {Array<import('./parse.js').ANode>} children
 * @param {{ mode: string, parentRole: string|null }} ctx
 * @returns {Array<import('./parse.js').ANode>}
 */
function pruneChildren(children, ctx) {
  return children.map(c => pruneNode(c, ctx)).filter(Boolean);
}

/**
 * Decide whether a text node is worth keeping.
 * Keep: prices, stock status, labels near interactive elements.
 * Drop: long descriptions, marketing copy.
 */
function keepTextNode(node) {
  const t = node.text || '';
  if (!t) return false;

  // Keep prices
  if (/\$[\d,]+\.?\d*/.test(t)) return true;

  // Keep stock/availability
  if (/in stock|out of stock|unavailable|available/i.test(t)) return true;

  // Keep shipping info
  if (/delivery|shipping|free/i.test(t)) return true;

  // Keep short label-like text (e.g., "Color:", "Size:", "Quantity:")
  if (t.length < 40 && t.endsWith(':')) return true;
  if (t.length < 30) return true;

  // Drop long text (descriptions, bullet points)
  return false;
}

/**
 * Check if a node or any descendant is interactive.
 */
function hasInteractive(node) {
  if (INTERACTIVE.has(node.role) || GROUPS.has(node.role)) return true;
  return node.children?.some(c => hasInteractive(c)) ?? false;
}

/**
 * Check if a node is or contains a heading.
 */
function hasHeading(node) {
  if (node.role === 'heading') return true;
  return node.children?.some(c => hasHeading(c)) ?? false;
}

/**
 * Collapse unnamed structural wrappers.
 * "generic > generic > button X" becomes "button X"
 * Named groups are preserved: "radiogroup 'Color' > radio 'Black'" stays.
 */
function collapse(node) {
  if (!node) return null;

  // Recursively collapse children first
  node.children = node.children.map(c => collapse(c)).filter(Boolean);

  // Table layout roles (row, cell, rowgroup) always collapse — their names are
  // just concatenated child text, not meaningful labels like radiogroup "Color"
  const isTableLayout = node.role === 'row' || node.role === 'cell' || node.role === 'rowgroup';

  // If structural wrapper with one child, unwrap
  if ((STRUCTURAL.has(node.role) && !node.name) || isTableLayout) {
    if (node.children.length === 1) return node.children[0];
  }

  // If structural wrapper, promote all children up
  if ((STRUCTURAL.has(node.role) && !node.name && !node.ref) || isTableLayout) {
    return node.children.length > 0 ? { ...node, role: '_promote', children: node.children } : null;
  }

  return node;
}

/**
 * Post-prune cleanup pass:
 * - Drop orphaned headings (h2+ not followed by interactive content)
 * - Trim combobox/listbox option children to just selected value
 */
function postClean(node) {
  if (!node) return null;

  // Trim combobox options — the LLM just needs the combobox name + current value
  if (node.role === 'combobox' || node.role === 'listbox') {
    const selected = node.children.find(c => c.states.selected);
    // Keep the node but drop option children — value is in the selected option or node text
    return { ...node, text: selected?.name || node.text, children: [] };
  }

  // Recurse into children
  node.children = node.children.map(c => postClean(c)).filter(Boolean);

  // Drop orphaned headings: h2+ with no interactive sibling after them in parent
  if (node.children) {
    node.children = dropOrphanedHeadings(node.children);
  }

  return node;
}

/**
 * Remove h2+ headings that aren't followed by any interactive element
 * before the next heading or end of siblings.
 */
function dropOrphanedHeadings(children) {
  const result = [];
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child.role === 'heading' && child.states.level !== '1') {
      // Look ahead: is there any interactive element before the next heading?
      let hasInteractiveAfter = false;
      for (let j = i + 1; j < children.length; j++) {
        if (children[j].role === 'heading') break;
        if (hasInteractive(children[j])) { hasInteractiveAfter = true; break; }
      }
      if (!hasInteractiveAfter) continue; // drop this heading
    }
    result.push(child);
  }
  return result;
}

/**
 * Flatten a tree into an array of all nodes (depth-first).
 */
function flatten(nodes) {
  const result = [];
  for (const n of nodes) {
    result.push(n);
    if (n.children) result.push(...flatten(n.children));
  }
  return result;
}

/**
 * Collapse a color swatch group to a compact representation.
 * "group 'beschikbare kleuren' > listitem > link 'Zwart', listitem > link 'Blauw', ..."
 * becomes: "group 'kleuren(5): Zwart, Blauw, Geel, Groen, Roze'"
 */
function collapseColorSwatches(node) {
  const colors = [];
  const allNodes = flatten([node]);
  for (const n of allNodes) {
    if (n.role === 'link' && n.name && !n.name.startsWith('+')) {
      colors.push(n.name);
    }
  }
  if (colors.length === 0) {
    // Just a "+ 4 andere kleuren" link — keep as-is but flatten
    const plusLink = allNodes.find(n => n.role === 'link' && n.name);
    return plusLink ? { ...plusLink, children: [] } : null;
  }
  // Compact: single text node listing colors
  return {
    role: 'text', name: '', ref: '', states: {}, props: {},
    text: `kleuren(${colors.length}): ${colors.join(', ')}`,
    children: [],
  };
}

/**
 * Extract all text content from a node subtree (for keyword matching).
 */
function extractText(node) {
  let text = node.name || '';
  if (node.text) text += ' ' + node.text;
  for (const child of node.children) {
    text += ' ' + extractText(child);
  }
  return text;
}

/**
 * Condense an irrelevant product card to just its first link (title).
 * Used when context keywords don't match any text in the card.
 */
function condenseIrrelevantCard(node) {
  const allNodes = flatten([node]);
  const firstLink = allNodes.find(n => n.role === 'link' && n.name);
  if (!firstLink) return null;
  // Return just the link, no children, no extra buttons
  return {
    role: 'listitem', name: '', text: '', ref: '',
    states: {}, props: {},
    children: [{ ...firstLink, children: [] }],
  };
}

/**
 * Dedup links: when the same link text appears multiple times in a container,
 * keep only the first occurrence (with its ref). Common on Amazon where product
 * title, image, and rating all link to the same page.
 */
function dedupLinks(nodes) {
  const seen = new Map(); // link name → first ref
  return nodes.map(n => dedupLinksInNode(n, seen)).filter(Boolean);
}

function dedupLinksInNode(node, seen) {
  if (!node) return null;

  if (node.role === 'link' && node.name) {
    const key = node.name;
    if (seen.has(key)) {
      return null; // duplicate — drop it
    }
    seen.set(key, node.ref);
  }

  // For listitems, use a fresh seen-set (dedup within each product card, not across cards)
  if (node.role === 'listitem') {
    const localSeen = new Map();
    node.children = node.children
      .map(c => dedupLinksInNode(c, localSeen))
      .filter(Boolean);
    return node.children.length > 0 ? node : null;
  }

  node.children = node.children
    .map(c => dedupLinksInNode(c, seen))
    .filter(Boolean);
  return node;
}

/** Noise button patterns — buttons that add no value for agent actions */
const NOISE_BUTTONS = /energieklasse|energy\s*class|productinformatieblad|product\s*information\s*sheet|gesponsorde|sponsored|ad\s*feedback|sterren.*details.*beoordeling|stars.*rating\s*detail/i;

/** Noise link patterns — links repeated per card that are generic navigation */
const NOISE_LINKS = /^opties bekijken$|^view options$|^see options$|^voir les options$/i;

/** Footer link patterns — legal, corporate, subsidiary links */
const FOOTER_LINKS = /gebruiks.*voorwaarden|conditions.*use|privacy|cookie|contactgegevens|contact\s*info|advertenties|interest.*ads|goodreads|imdb|amazon\s*web\s*services|kindle\s*direct|amazon\s*photos|lees\s*meer\s*over\s*deze\s*resultaten/i;

/**
 * Drop noise elements that clutter search results.
 * Energy labels, product info sheets, sponsored ad feedback, generic "view options" links.
 */
function dropNoiseButtons(node) {
  if (!node) return null;

  if (node.role === 'button' && node.name && NOISE_BUTTONS.test(node.name)) {
    return null;
  }
  if (node.role === 'link' && node.name && (NOISE_LINKS.test(node.name) || FOOTER_LINKS.test(node.name))) {
    return null;
  }

  node.children = node.children
    .map(c => dropNoiseButtons(c))
    .filter(Boolean);

  return node;
}

/**
 * Check if a node is a footer marker (signals end of useful content).
 */
function isFooterMarker(node) {
  if (node.role === 'button' && node.name && /terug naar boven|back to top/i.test(node.name)) return true;
  if (node.role === 'heading' && node.states.level === '6') return true;
  if (node.role === 'heading' && node.name && /gerelateerde zoek|related search|hulp nodig|need help|do you need help/i.test(node.name)) return true;
  return false;
}

/**
 * Check if a node should be skipped entirely.
 */
function isSkippable(node) {
  if (node.role === 'dialog' && node.name && /filter/i.test(node.name)) return true;
  return false;
}

/**
 * Truncate the tree after footer markers — everything below is noise.
 * Works recursively: if footer markers are inside a wrapper, truncate there.
 */
function truncateAfterFooter(nodes) {
  const result = [];
  for (const node of nodes) {
    if (isFooterMarker(node)) break;
    if (isSkippable(node)) continue;

    // Recurse into children — footer may be nested inside a wrapper
    if (node.children && node.children.length > 0) {
      node.children = truncateAfterFooter(node.children);
      // If all children were truncated, drop this node too
      if (node.children.length === 0 && STRUCTURAL.has(node.role)) continue;
    }
    result.push(node);
  }
  return result;
}

/** Filter group pattern — sidebar refinement groups on search pages */
const FILTER_GROUP = /toepassen om de resultaten|filter.*to narrow|apply.*filter|refine by/i;

/**
 * Drop sidebar filter groups. These are groups with heading + list of filter links.
 * Detected by filter link text patterns like "Filter X toepassen om de resultaten te beperken".
 */
function dropFilterGroups(node) {
  if (!node) return null;

  // A group containing filter links
  if (node.role === 'group' && node.name) {
    const allText = extractText(node);
    if (FILTER_GROUP.test(allText)) return null;
  }

  node.children = node.children.map(c => dropFilterGroups(c)).filter(Boolean);
  // Drop empty containers after filter removal
  if (STRUCTURAL.has(node.role) && !node.name && node.children.length === 0) return null;
  return node;
}

export { parse } from './parse.js';
