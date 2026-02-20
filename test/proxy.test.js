import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { looksLikeSnapshot, extractContext, processSnapshot } from '../src/proxy-utils.js';

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
});
