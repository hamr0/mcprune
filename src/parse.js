/**
 * Parse Playwright ariaSnapshot YAML into a tree structure.
 *
 * Playwright format:
 *   - role "name" [state1] [state2=value] [ref=eN]:
 *     - childrole "childname"
 *     - text: content here
 *     - /prop: value
 *
 * @param {string} yaml - Playwright ariaSnapshot YAML string
 * @returns {Array<ANode>} Root-level nodes
 *
 * @typedef {object} ANode
 * @property {string} role
 * @property {string} [name]
 * @property {string} [ref]
 * @property {Record<string, string|boolean>} states - e.g. { checked: true, level: '1' }
 * @property {Record<string, string>} props - e.g. { url: '/cart', placeholder: 'Search' }
 * @property {string} [text] - inline text content (for "- text: foo" or "- role: foo")
 * @property {Array<ANode>} children
 */

// Match: "- role "name" [state1] [ref=e2] [level=1]:"
//   or:  "- role "name" [checked]"
//   or:  "- role:"
//   or:  "- role "name":"
//   or:  "- text: some content"
//   or:  "- /url: about:blank"
const LINE_RE = /^(\s*)-\s+(.+)$/;
const ROLE_RE = /^(\w+)(?:\s+"((?:[^"\\]|\\.)*)")?(.*)$/;
const STATE_RE = /\[(\w+)(?:=([^\]]+))?\]/g;
const PROP_RE = /^\/(\w+):\s*(.*)$/;
const TEXT_RE = /^text:\s*(.*)$/;

/**
 * @param {string} yaml
 * @returns {Array<ANode>}
 */
export function parse(yaml) {
  const lines = yaml.split('\n');
  /** @type {Array<{node: ANode, indent: number}>} */
  const stack = [];
  /** @type {Array<ANode>} */
  const roots = [];

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (raw.trim() === '') continue;

    const lineMatch = raw.match(LINE_RE);
    if (!lineMatch) continue;

    const indent = lineMatch[1].length;
    const content = lineMatch[2];

    // Property line: "- /url: about:blank"
    const propMatch = content.match(PROP_RE);
    if (propMatch) {
      const parent = findParent(stack, indent);
      if (parent) {
        parent.props[propMatch[1]] = propMatch[2];
      }
      continue;
    }

    // Text line: "- text: some content"
    const textMatch = content.match(TEXT_RE);
    if (textMatch) {
      const node = makeNode('text');
      node.text = textMatch[1];
      attachNode(node, indent, stack, roots);
      continue;
    }

    // Role line: "- button "Add to Cart" [ref=e36]:"
    // Strip trailing colon (indicates children follow)
    let body = content;
    const hasChildren = body.endsWith(':');
    if (hasChildren) body = body.slice(0, -1);

    const roleMatch = body.match(ROLE_RE);
    if (!roleMatch) continue;

    const role = roleMatch[1];
    const name = roleMatch[2] ? roleMatch[2].replace(/\\"/g, '"') : undefined;
    const tail = roleMatch[3] || '';

    const node = makeNode(role, name);

    // Parse [state] and [state=value] from tail
    let stateMatch;
    while ((stateMatch = STATE_RE.exec(tail)) !== null) {
      const key = stateMatch[1];
      const val = stateMatch[2];
      if (key === 'ref') {
        node.ref = val;
      } else {
        node.states[key] = val ?? true;
      }
    }

    // Inline text content: "- listitem: one" or "- textbox: hello world"
    // This is content after all [] brackets, if the line had a trailing colon
    // but actually Playwright uses "- role: text" for inline text on leaf nodes
    // Check if content after role+name+states has ": text"
    const inlineColonIdx = body.indexOf(': ');
    if (!hasChildren && inlineColonIdx > -1 && !name) {
      // "- role: inline text"
      // Re-parse: role might be "listitem" and inline text is "one"
      const colonContent = body.slice(body.indexOf(': ') + 2);
      if (colonContent && !colonContent.startsWith('[')) {
        node.text = colonContent;
      }
    } else if (hasChildren) {
      // "- role "name" [states]:" — check for inline text after the colon
      // In Playwright format: "- listitem: one" means text child
      const afterRole = content.slice(0, -1); // without trailing colon
      const inlineIdx = afterRole.indexOf(': ');
      if (inlineIdx > -1 && !name) {
        const inlineText = afterRole.slice(inlineIdx + 2).replace(/\s*\[.*$/, '');
        if (inlineText) {
          node.text = inlineText;
        }
      }
    }

    attachNode(node, indent, stack, roots);
  }

  return roots;
}

/**
 * @param {string} role
 * @param {string} [name]
 * @returns {ANode}
 */
function makeNode(role, name) {
  return { role, name, ref: undefined, states: {}, props: {}, text: undefined, children: [] };
}

/**
 * @param {ANode} node
 * @param {number} indent
 * @param {Array<{node: ANode, indent: number}>} stack
 * @param {Array<ANode>} roots
 */
function attachNode(node, indent, stack, roots) {
  // Pop stack to find parent at lower indent
  while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
    stack.pop();
  }

  if (stack.length === 0) {
    roots.push(node);
  } else {
    stack[stack.length - 1].node.children.push(node);
  }

  stack.push({ node, indent });
}

/**
 * @param {Array<{node: ANode, indent: number}>} stack
 * @param {number} indent
 * @returns {ANode|null}
 */
function findParent(stack, indent) {
  for (let i = stack.length - 1; i >= 0; i--) {
    if (stack[i].indent < indent) return stack[i].node;
  }
  return null;
}
