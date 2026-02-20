import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { prune, summarize } from '../src/prune.js';

const amazonYaml = readFileSync(
  new URL('./fixtures/amazon-product.yaml', import.meta.url), 'utf8'
);

describe('prune', () => {
  it('act mode: drops banner, footer, nav', () => {
    const result = prune(amazonYaml, { mode: 'act' });
    assert.ok(!result.includes('banner'), 'should not contain banner');
    assert.ok(!result.includes('contentinfo'), 'should not contain contentinfo');
    assert.ok(!result.includes('Breadcrumb'), 'should not contain breadcrumb nav');
    assert.ok(!result.includes('Footer'), 'should not contain footer nav');
    assert.ok(!result.includes('Conditions of Use'), 'should not contain footer links');
    assert.ok(!result.includes('Back to top'), 'should not contain back to top');
  });

  it('act mode: keeps interactive elements in main', () => {
    const result = prune(amazonYaml, { mode: 'act' });
    assert.ok(result.includes('Add to Cart'), 'should keep Add to Cart');
    assert.ok(result.includes('Buy Now'), 'should keep Buy Now');
    assert.ok(result.includes('ref=e36'), 'should keep Add to Cart ref');
    assert.ok(result.includes('ref=e37'), 'should keep Buy Now ref');
  });

  it('act mode: keeps radiogroups with names and options', () => {
    const result = prune(amazonYaml, { mode: 'act' });
    assert.ok(result.includes('radiogroup "Color"'), 'should keep Color radiogroup');
    assert.ok(result.includes('radiogroup "Size"'), 'should keep Size radiogroup');
    assert.ok(result.includes('Black Titanium'), 'should keep color options');
    assert.ok(result.includes('512GB'), 'should keep size options');
    assert.ok(result.includes('[checked]'), 'should keep checked state');
  });

  it('act mode: keeps price, stock, headings', () => {
    const result = prune(amazonYaml, { mode: 'act' });
    assert.ok(result.includes('$1,099.00'), 'should keep price');
    assert.ok(result.includes('In Stock'), 'should keep stock status');
    assert.ok(result.includes('heading'), 'should keep h1 heading');
  });

  it('act mode: drops images', () => {
    const result = prune(amazonYaml, { mode: 'act' });
    assert.ok(!result.includes('img'), 'should not contain img nodes');
  });

  it('act mode: drops product description bullets', () => {
    const result = prune(amazonYaml, { mode: 'act' });
    assert.ok(!result.includes('STUNNING TITANIUM'), 'should drop description');
    assert.ok(!result.includes('A18 PRO CHIP'), 'should drop description');
    assert.ok(!result.includes('CAMERA CONTROL'), 'should drop description');
  });

  it('act mode: drops complementary (customers also viewed)', () => {
    const result = prune(amazonYaml, { mode: 'act' });
    assert.ok(!result.includes('Customers also viewed'), 'should drop complementary');
    assert.ok(!result.includes('Samsung Galaxy'), 'should drop recommended products');
  });

  it('act mode: drops customer reviews section', () => {
    const result = prune(amazonYaml, { mode: 'act' });
    assert.ok(!result.includes('Customer reviews'), 'should drop reviews heading');
    assert.ok(!result.includes('5 star 68%'), 'should drop review links');
  });

  it('act mode: drops image gallery buttons', () => {
    const result = prune(amazonYaml, { mode: 'act' });
    assert.ok(!result.includes('Show image 1 of 7'), 'should drop image buttons');
    assert.ok(!result.includes('Product images'), 'should drop image region');
  });

  it('navigate mode: keeps banner nav', () => {
    const result = prune(amazonYaml, { mode: 'navigate' });
    assert.ok(result.includes('Search Amazon'), 'should keep search');
    assert.ok(result.includes('Cart 3 items'), 'should keep cart link');
  });

  it('significant token reduction vs input', () => {
    const result = prune(amazonYaml, { mode: 'act' });
    const inputTokens = amazonYaml.length;
    const outputTokens = result.length;
    const reduction = 1 - (outputTokens / inputTokens);

    console.log(`  Input:  ${inputTokens} chars`);
    console.log(`  Output: ${outputTokens} chars`);
    console.log(`  Reduction: ${(reduction * 100).toFixed(1)}%`);

    assert.ok(reduction > 0.7, `should reduce by >70%, got ${(reduction * 100).toFixed(1)}%`);
  });
});

describe('summarize', () => {
  it('produces a one-line summary', () => {
    const result = summarize(amazonYaml);
    console.log(`  Summary: ${result}`);

    assert.ok(result.includes('iPhone'), 'should include product name');
    assert.ok(result.includes('$'), 'should include price');
    assert.ok(result.includes('color'), 'should include color action');
    assert.ok(result.includes('size'), 'should include size action');
    assert.ok(result.includes('add to cart'), 'should include add to cart');
  });
});
