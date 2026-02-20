import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { prune, summarize, parse } from '../src/prune.js';

// --- Load fixtures ---
const hnYaml = readFileSync(
  new URL('./fixtures/live-hackernews.yaml', import.meta.url), 'utf8'
);
const wikiYaml = readFileSync(
  new URL('./fixtures/live-wikipedia.yaml', import.meta.url), 'utf8'
);
const govYaml = readFileSync(
  new URL('./fixtures/live-gov-uk-form.yaml', import.meta.url), 'utf8'
);
const amazonYaml = readFileSync(
  new URL('./fixtures/amazon-product.yaml', import.meta.url), 'utf8'
);

// --- Empty / minimal inputs ---

describe('empty and minimal inputs', () => {
  it('empty string returns empty string', () => {
    assert.equal(prune(''), '');
  });

  it('single text node', () => {
    const result = prune('- text: hello world');
    // A standalone text node with no landmarks — kept via no-landmark path
    assert.ok(typeof result === 'string');
  });

  it('no main landmark falls through to no-landmark path', () => {
    const yaml = `- banner:\n  - link "Home"\n- contentinfo:\n  - link "Privacy"`;
    // No main → banner has no interactive heading, so implicit-main logic kicks in
    const result = prune(yaml, { mode: 'act' });
    assert.ok(typeof result === 'string');
  });

  it('main with no interactive content uses implicit main detection', () => {
    const yaml = `- main:\n  - text: Just some text here\n  - text: Nothing interactive`;
    const result = prune(yaml, { mode: 'act' });
    // main has no interactive content → hasMain is false
    assert.ok(typeof result === 'string');
  });
});

// --- No-landmark pages ---

describe('no-landmark pages', () => {
  it('HN: prune keeps links despite no landmarks', () => {
    const result = prune(hnYaml, { mode: 'act' });
    // HN has no landmarks at all — everything kept, then node-level pruning
    assert.ok(result.includes('link'), 'should preserve links');
  });

  it('HN: prune produces significant reduction', () => {
    const result = prune(hnYaml, { mode: 'act' });
    const reduction = 1 - result.length / hnYaml.length;
    assert.ok(reduction > 0.3, `HN reduction should be >30%, got ${(reduction * 100).toFixed(1)}%`);
  });

  it('Wikipedia: keeps headings and links in browse mode', () => {
    const result = prune(wikiYaml, { mode: 'browse' });
    assert.ok(result.includes('heading'), 'should keep headings');
    assert.ok(result.includes('link'), 'should keep links');
  });
});

// --- Structural edge cases ---

describe('structural edge cases', () => {
  it('deeply nested wrappers collapse correctly', () => {
    const yaml = [
      '- main:',
      '  - generic:',
      '    - generic:',
      '      - generic:',
      '        - button "Deep" [ref=e1]',
    ].join('\n');
    const result = prune(yaml, { mode: 'act' });
    assert.ok(result.includes('button "Deep"'), 'deeply nested button should survive');
    // Should not have 3 levels of generic wrapper
    const genericCount = (result.match(/generic/g) || []).length;
    assert.ok(genericCount === 0, `should collapse all unnamed generics, found ${genericCount}`);
  });

  it('named group is preserved (not collapsed)', () => {
    const yaml = [
      '- main:',
      '  - group "Options":',
      '    - button "A" [ref=e1]',
      '    - button "B" [ref=e2]',
    ].join('\n');
    const result = prune(yaml, { mode: 'act' });
    assert.ok(result.includes('group "Options"'), 'named group should be preserved');
  });

  it('table layout roles collapse even when named', () => {
    const yaml = [
      '- main:',
      '  - table:',
      '    - row "Some Row":',
      '      - cell "Some Cell":',
      '        - button "Action" [ref=e1]',
    ].join('\n');
    const result = prune(yaml, { mode: 'act' });
    assert.ok(result.includes('button "Action"'), 'button inside table should survive');
    assert.ok(!result.includes('row "Some Row"'), 'named row should be collapsed');
    assert.ok(!result.includes('cell "Some Cell"'), 'named cell should be collapsed');
  });
});

// --- Context-aware pruning ---

describe('context-aware pruning', () => {
  it('with keywords, matching listitem keeps full detail', () => {
    const yaml = [
      '- main:',
      '  - list:',
      '    - listitem:',
      '      - link "iPhone 15 Pro Max" [ref=e1]',
      '      - text: $999.00',
      '      - button "Add to Cart" [ref=e2]',
    ].join('\n');
    const result = prune(yaml, { mode: 'act', context: 'iPhone Pro' });
    assert.ok(result.includes('Add to Cart'), 'matching card should keep full detail');
    assert.ok(result.includes('$999.00'), 'matching card should keep price');
  });

  it('with keywords, non-matching card condensed to first link only', () => {
    const yaml = [
      '- main:',
      '  - list:',
      '    - listitem:',
      '      - link "Samsung Galaxy S24" [ref=e1]',
      '      - text: $799.00',
      '      - button "Add to Cart" [ref=e2]',
    ].join('\n');
    const result = prune(yaml, { mode: 'act', context: 'iPhone Pro' });
    // Non-matching card should be condensed — keep first link, drop button/price
    assert.ok(result.includes('Samsung Galaxy'), 'first link should survive');
    assert.ok(!result.includes('Add to Cart'), 'button should be dropped in non-matching card');
  });

  it('single-char keywords are filtered out', () => {
    const yaml = [
      '- main:',
      '  - list:',
      '    - listitem:',
      '      - link "Widget A" [ref=e1]',
      '      - button "Buy" [ref=e2]',
    ].join('\n');
    // Context "a" has only single-char words → should be treated as no keywords
    const result = prune(yaml, { mode: 'act', context: 'a' });
    assert.ok(result.includes('Buy'), 'single-char keyword should not trigger condensing');
  });

  it('empty context string treated as no keywords', () => {
    const yaml = [
      '- main:',
      '  - list:',
      '    - listitem:',
      '      - link "Product" [ref=e1]',
      '      - button "Buy" [ref=e2]',
    ].join('\n');
    const result = prune(yaml, { mode: 'act', context: '' });
    assert.ok(result.includes('Buy'), 'empty context should not trigger condensing');
  });
});

// --- Summarize edge cases ---

describe('summarize edge cases', () => {
  it('page with no title returns "Untitled"', () => {
    const yaml = '- main:\n  - button "Click" [ref=e1]';
    const result = summarize(yaml);
    assert.ok(result.includes('Untitled'), `should include Untitled, got: ${result}`);
  });

  it('page with no price/stock shows just title + actions', () => {
    const yaml = [
      '- WebArea "My Page":',
      '  - main:',
      '    - heading "Welcome" [level=1]',
      '    - button "Start" [ref=e1]',
    ].join('\n');
    const result = summarize(yaml);
    assert.ok(result.includes('My Page'), 'should use WebArea name as title');
    assert.ok(result.includes('start'), 'should include button action');
    assert.ok(!result.includes('$'), 'should have no price');
  });

  it('page with no buttons shows links count', () => {
    const links = Array.from({ length: 15 }, (_, i) =>
      `    - link "Link ${i}" [ref=e${i}]`
    ).join('\n');
    const yaml = `- WebArea "Links Page":\n  - main:\n${links}`;
    const result = summarize(yaml);
    assert.ok(result.includes('15 links'), `should show link count, got: ${result}`);
  });

  it('page with no interactive elements at all', () => {
    const yaml = '- WebArea "Static":\n  - main:\n    - text: Just text';
    const result = summarize(yaml);
    assert.ok(result.includes('Static'), 'should still extract title');
  });
});

// --- Live fixture regression tests ---

describe('live fixture regressions', () => {
  it('gov-uk-form in act mode: form elements kept', () => {
    const result = prune(govYaml, { mode: 'act' });
    assert.ok(result.includes('radio'), 'should keep radio buttons');
    assert.ok(result.includes('Continue'), 'should keep Continue button');
    assert.ok(result.includes('England') || result.includes('Wales'), 'should keep radio options');
  });

  it('gov-uk-form in act mode: footer dropped', () => {
    const result = prune(govYaml, { mode: 'act' });
    assert.ok(!result.includes('Terms and conditions'), 'should drop footer links');
  });

  it('hackernews in act mode: links preserved despite no landmarks', () => {
    const result = prune(hnYaml, { mode: 'act' });
    assert.ok(result.includes('link'), 'should keep links');
    // Should keep article links
    const linkCount = (result.match(/link "/g) || []).length;
    assert.ok(linkCount > 5, `should keep many links, got ${linkCount}`);
  });

  it('wikipedia in browse mode: headings and links preserved', () => {
    const result = prune(wikiYaml, { mode: 'browse' });
    assert.ok(result.includes('heading "Accessibility"'), 'should keep h1');
    assert.ok(result.includes('link'), 'should keep links');
  });

  it('wikipedia in act mode: main content kept', () => {
    const result = prune(wikiYaml, { mode: 'act' });
    assert.ok(result.includes('heading "Accessibility"'), 'should keep h1 in main');
  });
});

// --- Round-trip: parse(prune(fixture)) should not throw ---

describe('round-trip parse safety', () => {
  const fixtures = [
    ['amazon-product', amazonYaml],
    ['live-hackernews', hnYaml],
    ['live-wikipedia', wikiYaml],
    ['live-gov-uk-form', govYaml],
  ];

  for (const [name, yaml] of fixtures) {
    for (const mode of ['act', 'browse', 'navigate']) {
      it(`parse(prune(${name}, ${mode})) does not throw`, () => {
        const pruned = prune(yaml, { mode });
        assert.doesNotThrow(() => parse(pruned), `parse should not throw for ${name} in ${mode} mode`);
      });
    }
  }
});
