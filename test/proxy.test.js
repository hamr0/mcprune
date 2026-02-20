import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { looksLikeSnapshot, extractContext, processSnapshot, detectMode } from '../src/proxy-utils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => readFileSync(resolve(__dirname, 'fixtures', name), 'utf8');

describe('looksLikeSnapshot', () => {
  it('returns true for snapshot starting with "- main"', () => {
    assert.ok(looksLikeSnapshot('- main [ref=e1]:\n  - button "Click"'));
  });

  it('returns true for snapshot starting with "- banner"', () => {
    assert.ok(looksLikeSnapshot('- banner:\n  - link "Home"'));
  });

  it('returns true for snapshot starting with "- button"', () => {
    assert.ok(looksLikeSnapshot('- button "Submit" [ref=e1]'));
  });

  it('returns true for snapshot starting with "- WebArea"', () => {
    assert.ok(looksLikeSnapshot('- WebArea "My Page":\n  - main'));
  });

  it('returns true for multi-line where role appears after initial text', () => {
    const text = 'Some preamble text\n- main [ref=e1]:\n  - button "Go"';
    assert.ok(looksLikeSnapshot(text));
  });

  it('returns false for plain text', () => {
    assert.ok(!looksLikeSnapshot('Hello world, this is plain text'));
  });

  it('returns false for empty string', () => {
    assert.ok(!looksLikeSnapshot(''));
  });

  it('returns false for null/undefined', () => {
    assert.ok(!looksLikeSnapshot(null));
    assert.ok(!looksLikeSnapshot(undefined));
  });

  it('returns false for YAML-like text without role prefix', () => {
    assert.ok(!looksLikeSnapshot('name: John\nage: 30\nitems:\n  - apple\n  - banana'));
  });

  it('returns true for snapshots starting with less common roles', () => {
    assert.ok(looksLikeSnapshot('- dialog "Confirm":\n  - button "OK"'));
    assert.ok(looksLikeSnapshot('- form:\n  - textbox "Email"'));
    assert.ok(looksLikeSnapshot('- table:\n  - row:\n    - cell: data'));
  });
});

describe('extractContext', () => {
  it('extracts text from browser_type tool calls', () => {
    const msg = {
      method: 'tools/call',
      params: { name: 'browser_type', arguments: { text: 'iPhone 15 Pro' } },
    };
    assert.equal(extractContext(msg), 'iPhone 15 Pro');
  });

  it('extracts q param from Amazon URL', () => {
    const msg = {
      method: 'tools/call',
      params: { name: 'browser_navigate', arguments: { url: 'https://www.amazon.com/s?q=laptop+stand' } },
    };
    assert.equal(extractContext(msg), 'laptop stand');
  });

  it('extracts q param from Google URL', () => {
    const msg = {
      method: 'tools/call',
      params: { name: 'browser_navigate', arguments: { url: 'https://www.google.com/search?q=best+headphones' } },
    };
    assert.equal(extractContext(msg), 'best headphones');
  });

  it('extracts k param from DuckDuckGo URL', () => {
    const msg = {
      method: 'tools/call',
      params: { name: 'browser_navigate', arguments: { url: 'https://duckduckgo.com/?k=rust+language' } },
    };
    assert.equal(extractContext(msg), 'rust language');
  });

  it('extracts query param', () => {
    const msg = {
      method: 'tools/call',
      params: { name: 'browser_navigate', arguments: { url: 'https://example.com/search?query=widgets' } },
    };
    assert.equal(extractContext(msg), 'widgets');
  });

  it('extracts search_query param', () => {
    const msg = {
      method: 'tools/call',
      params: { name: 'browser_navigate', arguments: { url: 'https://shop.com/find?search_query=shoes' } },
    };
    assert.equal(extractContext(msg), 'shoes');
  });

  it('returns null for non-tool-call messages', () => {
    assert.equal(extractContext({ method: 'initialize', params: {} }), null);
    assert.equal(extractContext({ method: 'tools/list' }), null);
  });

  it('returns null for browser_click', () => {
    const msg = {
      method: 'tools/call',
      params: { name: 'browser_click', arguments: { ref: 'e5' } },
    };
    assert.equal(extractContext(msg), null);
  });

  it('returns null for browser_navigate with no query params', () => {
    const msg = {
      method: 'tools/call',
      params: { name: 'browser_navigate', arguments: { url: 'https://example.com/about' } },
    };
    assert.equal(extractContext(msg), null);
  });

  it('handles malformed URLs gracefully', () => {
    const msg = {
      method: 'tools/call',
      params: { name: 'browser_navigate', arguments: { url: 'not a url at all %%' } },
    };
    // Should not throw, returns null
    assert.equal(extractContext(msg), null);
  });

  it('returns null for null/undefined input', () => {
    assert.equal(extractContext(null), null);
    assert.equal(extractContext(undefined), null);
  });
});

describe('detectMode', () => {
  // URL-based detection
  it('detects browse for MDN docs URL', () => {
    const r = detectMode('', 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Array');
    assert.equal(r.mode, 'browse');
    assert.equal(r.reason, 'url');
  });

  it('detects browse for Stack Overflow question', () => {
    const r = detectMode('', 'https://stackoverflow.com/questions/12345/how-to-merge-dicts');
    assert.equal(r.mode, 'browse');
    assert.equal(r.reason, 'url');
  });

  it('detects browse for GitHub issue', () => {
    const r = detectMode('', 'https://github.com/microsoft/playwright/issues/123');
    assert.equal(r.mode, 'browse');
    assert.equal(r.reason, 'url');
  });

  it('detects browse for GitHub PR', () => {
    const r = detectMode('', 'https://github.com/microsoft/playwright/pull/35498');
    assert.equal(r.mode, 'browse');
    assert.equal(r.reason, 'url');
  });

  it('detects browse for Python docs', () => {
    const r = detectMode('', 'https://docs.python.org/3/library/json.html');
    assert.equal(r.mode, 'browse');
    assert.equal(r.reason, 'url');
  });

  it('detects browse for npm package', () => {
    const r = detectMode('', 'https://www.npmjs.com/package/express');
    assert.equal(r.mode, 'browse');
    assert.equal(r.reason, 'url');
  });

  it('detects browse for Wikipedia', () => {
    const r = detectMode('', 'https://en.wikipedia.org/wiki/JavaScript');
    assert.equal(r.mode, 'browse');
    assert.equal(r.reason, 'url');
  });

  it('detects act for Amazon', () => {
    const r = detectMode('', 'https://www.amazon.nl/s?k=iphone+15');
    assert.equal(r.mode, 'act');
    assert.equal(r.reason, 'url');
  });

  it('detects act for eBay', () => {
    const r = detectMode('', 'https://www.ebay.com/sch/i.html?_nkw=laptop');
    assert.equal(r.mode, 'act');
    assert.equal(r.reason, 'url');
  });

  it('detects act for Booking.com', () => {
    const r = detectMode('', 'https://www.booking.com/searchresults.html');
    assert.equal(r.mode, 'act');
    assert.equal(r.reason, 'url');
  });

  // Content-based detection
  it('detects act when prices present and few paragraphs', () => {
    const snapshot = [
      '- main:',
      '  - heading "iPhone 15" [level=1]',
      '  - text: €609.00',
      '  - button "Add to Cart"',
      '  - link "Compare"',
      '  - link "Details"',
    ].join('\n');
    const r = detectMode(snapshot);
    assert.equal(r.mode, 'act');
    assert.equal(r.reason, 'prices');
  });

  it('detects browse when many paragraphs and code blocks', () => {
    const snapshot = [
      '- main:',
      '  - heading "Array.reduce()" [level=1]',
      '  - paragraph: The reduce method executes a reducer function.',
      '  - code: arr.reduce(callback, initialValue)',
      '  - paragraph: The callback takes four arguments.',
      '  - paragraph: The accumulator holds the return value.',
      '  - code: const sum = [1,2,3].reduce((a,b) => a+b, 0)',
      '  - paragraph: Returns the final accumulated value.',
      '  - paragraph: If no initial value, uses first element.',
      '  - link "See also"',
    ].join('\n');
    const r = detectMode(snapshot);
    assert.equal(r.mode, 'browse');
  });

  it('detects browse with high content-to-interactive ratio', () => {
    const snapshot = [
      '- main:',
      '  - paragraph: First paragraph of documentation.',
      '  - paragraph: Second paragraph with more detail.',
      '  - paragraph: Third paragraph explaining usage.',
      '  - code: example()',
      '  - code: another_example()',
      '  - link "Next page"',
    ].join('\n');
    const r = detectMode(snapshot);
    assert.equal(r.mode, 'browse');
  });

  it('defaults to act when no strong signals', () => {
    const snapshot = [
      '- main:',
      '  - heading "Welcome" [level=1]',
      '  - button "Sign in"',
      '  - link "Register"',
    ].join('\n');
    const r = detectMode(snapshot);
    assert.equal(r.mode, 'act');
    assert.equal(r.reason, 'default');
  });

  it('defaults to act with empty/null inputs', () => {
    assert.equal(detectMode('').mode, 'act');
    assert.equal(detectMode(null).mode, 'act');
    assert.equal(detectMode('', '').mode, 'act');
  });

  // URL takes priority over content
  it('URL overrides content signals', () => {
    // Docs URL but content looks like act (has prices)
    const snapshot = '- main:\n  - text: $99.99\n  - button "Buy"';
    const r = detectMode(snapshot, 'https://docs.python.org/3/tutorial/');
    assert.equal(r.mode, 'browse');
    assert.equal(r.reason, 'url');
  });
});

describe('detectMode with real fixtures', () => {

  it('detects browse for MDN fixture (content analysis)', () => {
    const r = detectMode(fixture('live-mdn-docs.yaml'));
    assert.equal(r.mode, 'browse');
  });

  it('detects browse for Python docs fixture (content analysis)', () => {
    const r = detectMode(fixture('live-python-docs.yaml'));
    assert.equal(r.mode, 'browse');
  });

  it('detects browse for Stack Overflow fixture (content analysis)', () => {
    const r = detectMode(fixture('live-stackoverflow.yaml'));
    assert.equal(r.mode, 'browse');
  });

  it('detects browse for Wikipedia fixture (needs URL — too many links for content-only)', () => {
    // Wikipedia has 646 links vs 73 paragraphs — content-only detection sees it as interactive.
    // In production, the URL triggers browse mode before content analysis runs.
    const contentOnly = detectMode(fixture('live-wikipedia.yaml'));
    assert.equal(contentOnly.mode, 'act'); // content heuristic alone → act (correct: too many links)

    const withUrl = detectMode(fixture('live-wikipedia.yaml'), 'https://en.wikipedia.org/wiki/JavaScript');
    assert.equal(withUrl.mode, 'browse'); // URL fixes it
  });

  it('detects act for Amazon product fixture (content analysis)', () => {
    const r = detectMode(fixture('amazon-product.yaml'));
    assert.equal(r.mode, 'act');
  });

  it('detects act for gov.uk form fixture (content analysis)', () => {
    const r = detectMode(fixture('live-gov-uk-form.yaml'));
    assert.equal(r.mode, 'act');
  });

  it('detects act for Hacker News fixture (default — no strong signals)', () => {
    const r = detectMode(fixture('live-hackernews.yaml'));
    assert.equal(r.mode, 'act');
  });
});

describe('processSnapshot', () => {
  it('returns header + pruned text in correct format', () => {
    const fakePrune = (text) => text.slice(0, 10); // keeps 10 chars
    const fakeSummarize = () => 'Test Page | 3 buttons';
    const input = 'a'.repeat(100);

    const result = processSnapshot(input, {
      prune: fakePrune,
      summarize: fakeSummarize,
      mode: 'act',
      context: '',
    });

    assert.ok(result.startsWith('[mcprune:'));
    assert.ok(result.includes('90.0% reduction'));
    assert.ok(result.includes('Test Page | 3 buttons'));
    assert.ok(result.includes('~25 →'));  // 100/4 = 25
    assert.ok(result.includes('~3 tokens'));  // 10/4 ≈ 3 (rounded)
    assert.ok(result.endsWith('aaaaaaaaaa'));
  });

  it('passes mode and context through to prune', () => {
    let receivedOpts;
    const capturePrune = (text, opts) => { receivedOpts = opts; return text; };
    const fakeSummarize = () => 'summary';

    processSnapshot('test', {
      prune: capturePrune,
      summarize: fakeSummarize,
      mode: 'browse',
      context: 'search terms',
    });

    assert.equal(receivedOpts.mode, 'browse');
    assert.equal(receivedOpts.context, 'search terms');
  });

  it('calculates correct token estimates (chars / 4)', () => {
    const input = 'x'.repeat(400);  // 400 chars = ~100 tokens
    const fakePrune = () => 'y'.repeat(100);  // 100 chars = ~25 tokens
    const fakeSummarize = () => 'page';

    const result = processSnapshot(input, {
      prune: fakePrune,
      summarize: fakeSummarize,
    });

    assert.ok(result.includes('~100 →'));
    assert.ok(result.includes('~25 tokens'));
    assert.ok(result.includes('75.0% reduction'));
  });

  it('includes mode label in header', () => {
    const fakePrune = (t) => t;
    const fakeSummarize = () => 'page';

    const result = processSnapshot('test', {
      prune: fakePrune,
      summarize: fakeSummarize,
      mode: 'act',
    });

    assert.ok(result.includes('mode=act'));
  });

  it('auto mode detects and labels correctly', () => {
    let receivedMode;
    const capturePrune = (text, opts) => { receivedMode = opts.mode; return text; };
    const fakeSummarize = () => 'docs';

    const docsSnapshot = [
      '- main:',
      '  - paragraph: Detailed documentation text here.',
      '  - paragraph: More documentation content follows.',
      '  - paragraph: Additional paragraph with examples.',
      '  - paragraph: Another section of documentation.',
      '  - paragraph: Final paragraph with summary.',
      '  - code: example()',
      '  - link "Next"',
    ].join('\n');

    const result = processSnapshot(docsSnapshot, {
      prune: capturePrune,
      summarize: fakeSummarize,
      mode: 'auto',
    });

    assert.equal(receivedMode, 'browse');
    assert.ok(result.includes('mode=browse (auto:'));
  });

  it('auto mode with URL passes detected mode to prune', () => {
    let receivedMode;
    const capturePrune = (text, opts) => { receivedMode = opts.mode; return text; };
    const fakeSummarize = () => 'page';

    processSnapshot('- main:\n  - button "Buy"', {
      prune: capturePrune,
      summarize: fakeSummarize,
      mode: 'auto',
      url: 'https://docs.python.org/3/tutorial/',
    });

    assert.equal(receivedMode, 'browse');
  });

  it('explicit mode overrides auto-detection', () => {
    let receivedMode;
    const capturePrune = (text, opts) => { receivedMode = opts.mode; return text; };
    const fakeSummarize = () => 'page';

    // Docs-like content but explicit act mode
    const docsSnapshot = '- main:\n  - paragraph: Long text.\n  - paragraph: More text.\n  - code: x()';
    processSnapshot(docsSnapshot, {
      prune: capturePrune,
      summarize: fakeSummarize,
      mode: 'act',
    });

    assert.equal(receivedMode, 'act');
  });
});
