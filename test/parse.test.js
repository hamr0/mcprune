import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from '../src/parse.js';

describe('parse', () => {
  it('parses a simple button with ref', () => {
    const tree = parse('- button "Submit" [ref=e1]');
    assert.equal(tree.length, 1);
    assert.equal(tree[0].role, 'button');
    assert.equal(tree[0].name, 'Submit');
    assert.equal(tree[0].ref, 'e1');
  });

  it('parses states: checked, disabled, level', () => {
    const tree = parse('- radio "Option A" [ref=e1] [checked]');
    assert.equal(tree[0].states.checked, true);

    const tree2 = parse('- heading "Title" [level=1]');
    assert.equal(tree2[0].states.level, '1');

    const tree3 = parse('- button "Prev" [ref=e2] [disabled]');
    assert.equal(tree3[0].states.disabled, true);
  });

  it('parses text nodes', () => {
    const tree = parse('- text: $1,099.00');
    assert.equal(tree[0].role, 'text');
    assert.equal(tree[0].text, '$1,099.00');
  });

  it('parses property lines (/url, /placeholder)', () => {
    const yaml = `- link "Home" [ref=e1]:
  - /url: /home`;
    const tree = parse(yaml);
    assert.equal(tree[0].props.url, '/home');
  });

  it('parses nested children by indentation', () => {
    const yaml = `- radiogroup "Color" [ref=e1]:
  - radio "Black" [ref=e2]
  - radio "White" [ref=e3] [checked]`;
    const tree = parse(yaml);
    assert.equal(tree[0].role, 'radiogroup');
    assert.equal(tree[0].children.length, 2);
    assert.equal(tree[0].children[0].name, 'Black');
    assert.equal(tree[0].children[1].states.checked, true);
  });

  it('parses inline text content', () => {
    const yaml = `- listitem: one`;
    const tree = parse(yaml);
    assert.equal(tree[0].role, 'listitem');
    assert.equal(tree[0].text, 'one');
  });

  it('parses landmark roles', () => {
    const yaml = `- banner [ref=e1]:
  - navigation [ref=e2]:
    - link "Home" [ref=e3]
- main [ref=e4]:
  - button "Click" [ref=e5]
- contentinfo [ref=e6]:
  - link "Privacy" [ref=e7]`;
    const tree = parse(yaml);
    assert.equal(tree.length, 3);
    assert.equal(tree[0].role, 'banner');
    assert.equal(tree[1].role, 'main');
    assert.equal(tree[2].role, 'contentinfo');
    assert.equal(tree[1].children[0].role, 'button');
  });

  it('parses the full amazon fixture', () => {
    const yaml = readFileSync(
      new URL('./fixtures/amazon-product.yaml', import.meta.url), 'utf8'
    );
    const tree = parse(yaml);
    assert.ok(tree.length > 0, 'should parse root nodes');

    // Root should be WebArea
    const root = tree[0];
    assert.equal(root.role, 'WebArea');
    assert.equal(root.name, 'Amazon.com: Apple iPhone 16 Pro Max');

    // Should have banner, breadcrumb nav, main, contentinfo
    const topRoles = root.children.map(c => c.role);
    assert.ok(topRoles.includes('banner'), 'should have banner');
    assert.ok(topRoles.includes('main'), 'should have main');
    assert.ok(topRoles.includes('contentinfo'), 'should have contentinfo');

    // Main should contain the Add to Cart button
    const main = root.children.find(c => c.role === 'main');
    const allNodes = flattenTree(main);
    const addToCart = allNodes.find(n => n.name === 'Add to Cart');
    assert.ok(addToCart, 'should find Add to Cart button');
    assert.equal(addToCart.ref, 'e36');

    // Should find radiogroup Color with 4 options
    const colorGroup = allNodes.find(n => n.role === 'radiogroup' && n.name === 'Color');
    assert.ok(colorGroup, 'should find Color radiogroup');
    assert.equal(colorGroup.children.length, 4);

    // Should find checked radio
    const checkedRadio = colorGroup.children.find(c => c.states.checked);
    assert.equal(checkedRadio.name, 'Desert Titanium');
  });
});

/** Flatten tree into array of all nodes */
function flattenTree(node) {
  const result = [node];
  for (const child of node.children || []) {
    result.push(...flattenTree(child));
  }
  return result;
}
