// tests/renderer.test.js
const { describe, it } = require('node:test');
const assert = require('node:assert');

describe('renderer', () => {
  // Lazy-load to let us write the module first
  let renderer;

  it('should load the module', () => {
    renderer = require('../src/renderer');
    assert.ok(renderer.render);
    assert.ok(renderer.isFullDocument);
  });

  it('should detect full HTML documents', () => {
    renderer = require('../src/renderer');
    assert.strictEqual(renderer.isFullDocument('<!DOCTYPE html><html>...</html>'), true);
    assert.strictEqual(renderer.isFullDocument('<html><body>hi</body></html>'), true);
    assert.strictEqual(renderer.isFullDocument('  <!doctype HTML>'), true);
  });

  it('should detect fragments', () => {
    renderer = require('../src/renderer');
    assert.strictEqual(renderer.isFullDocument('<h2>Hello</h2>'), false);
    assert.strictEqual(renderer.isFullDocument('<div class="options">...</div>'), false);
  });

  it('should wrap fragments in frame template', () => {
    renderer = require('../src/renderer');
    const result = renderer.render('<h2>Test</h2>');
    assert.ok(result.includes('<h2>Test</h2>'), 'should contain the fragment content');
    assert.ok(result.includes('<!DOCTYPE html>'), 'should be wrapped in a full document');
    assert.ok(result.includes('visualizer'), 'should reference visualizer in the frame');
  });

  it('should preserve full document content without wrapping in frame', () => {
    renderer = require('../src/renderer');
    const fullDoc = '<!DOCTYPE html><html><body><h1>Custom</h1></body></html>';
    const result = renderer.render(fullDoc);
    assert.ok(result.includes('<h1>Custom</h1>'));
    assert.ok(!result.includes('Visualizer'), 'should not wrap in frame template');
  });

  it('should inject helper.js into all output', () => {
    renderer = require('../src/renderer');

    // Fragment
    const fragment = renderer.render('<h2>Test</h2>');
    assert.ok(fragment.includes('window.visualizer'), 'fragment output should include helper.js');

    // Full document
    const full = renderer.render('<!DOCTYPE html><html><body><p>Hi</p></body></html>');
    assert.ok(full.includes('window.visualizer'), 'full doc output should include helper.js');
  });
});
