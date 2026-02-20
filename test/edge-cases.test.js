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
const mdnYaml = readFileSync(
  new URL('./fixtures/live-mdn-docs.yaml', import.meta.url), 'utf8'
);
const pythonYaml = readFileSync(
  new URL('./fixtures/live-python-docs.yaml', import.meta.url), 'utf8'
);
const soYaml = readFileSync(
  new URL('./fixtures/live-stackoverflow.yaml', import.meta.url), 'utf8'
);
const ghIssueYaml = readFileSync(
  new URL('./fixtures/live-github-issue.yaml', import.meta.url), 'utf8'
);
const npmYaml = readFileSync(
  new URL('./fixtures/live-npm-package.yaml', import.meta.url), 'utf8'
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

// --- Browse mode: developer/research sites ---

describe('browse mode: MDN docs', () => {
  it('keeps paragraphs with article text', () => {
    const result = prune(mdnYaml, { mode: 'browse' });
    assert.ok(result.includes('paragraph'), 'should keep paragraph nodes');
  });

  it('keeps code blocks', () => {
    const result = prune(mdnYaml, { mode: 'browse' });
    assert.ok(result.includes('code'), 'should keep code elements');
  });

  it('keeps section headings (Description, Syntax, etc.)', () => {
    const result = prune(mdnYaml, { mode: 'browse' });
    assert.ok(result.includes('heading'), 'should keep headings');
    // Description heading should survive in browse mode (dropped in act)
    const hasDescOrSyntax = result.includes('Syntax') || result.includes('Description')
      || result.includes('Parameters') || result.includes('Return value');
    assert.ok(hasDescOrSyntax, 'should keep doc section headings');
  });

  it('keeps inline links within paragraphs', () => {
    const result = prune(mdnYaml, { mode: 'browse' });
    // MDN has links like "Array" inside paragraph text
    assert.ok(result.includes('link "Array"') || result.includes('link "iterative method"'),
      'should keep inline reference links');
  });

  it('drops banner/nav chrome', () => {
    const result = prune(mdnYaml, { mode: 'browse' });
    assert.ok(!result.includes('button "HTML"'), 'should drop nav buttons');
    assert.ok(!result.includes('button "CSS"'), 'should drop nav buttons');
  });

  it('achieves meaningful reduction while preserving content', () => {
    const result = prune(mdnYaml, { mode: 'browse' });
    const reduction = 1 - result.length / mdnYaml.length;
    assert.ok(reduction > 0.5, `MDN browse should reduce >50%, got ${(reduction * 100).toFixed(1)}%`);
  });
});

describe('browse mode: Python docs', () => {
  it('keeps article paragraphs', () => {
    const result = prune(pythonYaml, { mode: 'browse' });
    assert.ok(result.includes('paragraph'), 'should keep paragraphs');
    assert.ok(result.includes('coroutine') || result.includes('asyncio'),
      'should keep Python docs content');
  });

  it('keeps code examples as text', () => {
    const result = prune(pythonYaml, { mode: 'browse' });
    // Python docs have code as text nodes: ">>> import asyncio"
    assert.ok(result.includes('import asyncio') || result.includes('async def'),
      'should keep code examples');
  });

  it('keeps term/definition pairs (API docs)', () => {
    const result = prune(pythonYaml, { mode: 'browse' });
    assert.ok(result.includes('term') || result.includes('definition'),
      'should keep term/definition pairs');
  });

  it('keeps all section headings', () => {
    const result = prune(pythonYaml, { mode: 'browse' });
    assert.ok(result.includes('heading "Coroutines and Tasks"'), 'should keep h1');
    assert.ok(result.includes('heading "Coroutines"') || result.includes('heading "Awaitables"'),
      'should keep h2 section headings');
  });

  it('drops navigation chrome outside main', () => {
    const result = prune(pythonYaml, { mode: 'browse' });
    // Python docs have a "Related" navigation with index/modules/next/previous links
    assert.ok(!result.includes('navigation "Related"'), 'should drop top nav');
  });
});

describe('browse mode: Stack Overflow', () => {
  it('keeps question and answer text', () => {
    const result = prune(soYaml, { mode: 'browse' });
    assert.ok(result.includes('paragraph'), 'should keep answer paragraphs');
  });

  it('keeps links within answers', () => {
    const result = prune(soYaml, { mode: 'browse' });
    assert.ok(result.includes('link'), 'should keep reference links');
  });

  it('achieves meaningful reduction', () => {
    const result = prune(soYaml, { mode: 'browse' });
    const reduction = 1 - result.length / soYaml.length;
    assert.ok(reduction > 0.5, `SO browse should reduce >50%, got ${(reduction * 100).toFixed(1)}%`);
  });
});

describe('browse mode: GitHub issue', () => {
  it('keeps issue/comment content', () => {
    const result = prune(ghIssueYaml, { mode: 'browse' });
    assert.ok(result.includes('paragraph') || result.includes('text'),
      'should keep issue body text');
  });

  it('achieves meaningful reduction', () => {
    const result = prune(ghIssueYaml, { mode: 'browse' });
    const reduction = 1 - result.length / ghIssueYaml.length;
    assert.ok(reduction > 0.5, `GitHub issue browse should reduce >50%, got ${(reduction * 100).toFixed(1)}%`);
  });
});

describe('browse mode: npm package', () => {
  it('keeps package description content', () => {
    const result = prune(npmYaml, { mode: 'browse' });
    assert.ok(result.includes('link') || result.includes('text'),
      'should keep package info');
  });

  it('achieves meaningful reduction', () => {
    const result = prune(npmYaml, { mode: 'browse' });
    const reduction = 1 - result.length / npmYaml.length;
    assert.ok(reduction > 0.4, `npm browse should reduce >40%, got ${(reduction * 100).toFixed(1)}%`);
  });
});

describe('browse mode: content preservation unit tests', () => {
  it('keeps paragraphs in browse, drops in act', () => {
    const yaml = '- main:\n  - paragraph:\n    - text: This is important documentation text.';
    const browse = prune(yaml, { mode: 'browse' });
    const act = prune(yaml, { mode: 'act' });
    assert.ok(browse.includes('important documentation'), 'browse should keep paragraph text');
    assert.ok(!act.includes('important documentation'), 'act should drop paragraph');
  });

  it('keeps long text nodes in browse, drops in act', () => {
    const yaml = '- main:\n  - text: This is a long description that explains how the algorithm works in detail and spans many words.';
    const browse = prune(yaml, { mode: 'browse' });
    const act = prune(yaml, { mode: 'act' });
    assert.ok(browse.includes('algorithm works'), 'browse should keep long text');
    assert.ok(!act.includes('algorithm works'), 'act should drop long text');
  });

  it('keeps text-only lists in browse, drops in act', () => {
    const yaml = [
      '- main:',
      '  - list:',
      '    - listitem:',
      '      - text: Step one: configure the server',
      '    - listitem:',
      '      - text: Step two: run the tests',
    ].join('\n');
    const browse = prune(yaml, { mode: 'browse' });
    const act = prune(yaml, { mode: 'act' });
    assert.ok(browse.includes('configure the server'), 'browse should keep text list items');
    assert.ok(!act.includes('configure the server'), 'act should drop text-only lists');
  });

  it('keeps all headings in browse, drops description headings in act', () => {
    const yaml = [
      '- main:',
      '  - heading "Title" [level=1]',
      '  - heading "Description" [level=2]',
      '  - heading "Specification" [level=2]',
      '  - button "Action" [ref=e1]',
    ].join('\n');
    const browse = prune(yaml, { mode: 'browse' });
    const act = prune(yaml, { mode: 'act' });
    assert.ok(browse.includes('Description'), 'browse should keep Description heading');
    assert.ok(browse.includes('Specification'), 'browse should keep Specification heading');
    assert.ok(!act.includes('heading "Description"'), 'act should drop Description heading');
  });

  it('drops navigation inside main in browse mode', () => {
    const yaml = [
      '- main:',
      '  - navigation "Page tools":',
      '    - button "Tools"',
      '  - heading "Article" [level=1]',
      '  - paragraph: The article content.',
    ].join('\n');
    const result = prune(yaml, { mode: 'browse' });
    assert.ok(!result.includes('Page tools'), 'browse should drop nav inside main');
    assert.ok(result.includes('Article'), 'browse should keep article heading');
    assert.ok(result.includes('article content'), 'browse should keep article text');
  });

  it('drops superscripts (footnotes) in browse mode', () => {
    const yaml = [
      '- main:',
      '  - paragraph:',
      '    - text: Some fact.',
      '    - superscript:',
      '      - link "[1]"',
    ].join('\n');
    const result = prune(yaml, { mode: 'browse' });
    assert.ok(!result.includes('superscript'), 'browse should drop footnote markers');
    assert.ok(result.includes('Some fact'), 'browse should keep the text');
  });

  it('keeps complementary (sidebar) in browse, drops in act', () => {
    const yaml = [
      '- main:',
      '  - heading "Array.map()" [level=1]',
      '  - complementary:',
      '    - heading "In this article" [level=2]',
      '    - link "Syntax"',
      '    - link "Examples"',
    ].join('\n');
    const browse = prune(yaml, { mode: 'browse' });
    const act = prune(yaml, { mode: 'act' });
    assert.ok(browse.includes('In this article'), 'browse should keep sidebar TOC');
    assert.ok(!act.includes('In this article'), 'act should drop complementary');
  });

  it('converts figures to caption text in browse mode', () => {
    const yaml = [
      '- main:',
      '  - figure "Elevator buttons with Braille":',
      '    - link "Photo of buttons":',
      '      - img "Photo of buttons"',
      '    - text: Elevator buttons with Braille',
    ].join('\n');
    const result = prune(yaml, { mode: 'browse' });
    assert.ok(result.includes('[Figure: Elevator buttons with Braille]'),
      'browse should convert figure to caption text');
    assert.ok(!result.includes('img'), 'browse should drop image inside figure');
  });

  it('skips steps 5-8 (dedup, noise, footer, filters) in browse mode', () => {
    const yaml = [
      '- main:',
      '  - link "Product" [ref=e1]',
      '  - link "Product" [ref=e2]',
      '  - button "back to top"',
      '  - link "After footer" [ref=e3]',
    ].join('\n');
    const browse = prune(yaml, { mode: 'browse' });
    const act = prune(yaml, { mode: 'act' });
    // Browse keeps duplicate links and content after "back to top"
    assert.ok(browse.includes('ref=e2'), 'browse should keep duplicate links');
    assert.ok(browse.includes('After footer'), 'browse should keep content after footer marker');
    // Act dedup and truncates
    assert.ok(!act.includes('ref=e2'), 'act should dedup links');
    assert.ok(!act.includes('After footer'), 'act should truncate after footer');
  });
});

// --- Round-trip: parse(prune(fixture)) should not throw ---

describe('round-trip parse safety', () => {
  const fixtures = [
    ['amazon-product', amazonYaml],
    ['live-hackernews', hnYaml],
    ['live-wikipedia', wikiYaml],
    ['live-gov-uk-form', govYaml],
    ['live-mdn-docs', mdnYaml],
    ['live-python-docs', pythonYaml],
    ['live-stackoverflow', soYaml],
    ['live-github-issue', ghIssueYaml],
    ['live-npm-package', npmYaml],
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
