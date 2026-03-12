// tests/helper.test.js
const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

describe('helper.js', () => {
  const helperSource = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'helper.js'), 'utf-8'
  );

  it('should expose window.visualizer API', () => {
    assert.ok(helperSource.includes('window.visualizer'), 'should define window.visualizer');
    assert.ok(helperSource.includes('send: sendEvent'), 'should expose send method');
    assert.ok(helperSource.includes("type: 'choice'"), 'should expose choice method');
  });

  it('should expose window.toggleSelect', () => {
    assert.ok(helperSource.includes('window.toggleSelect'), 'should define toggleSelect');
  });

  it('should handle data-choice click events', () => {
    assert.ok(helperSource.includes('[data-choice]'), 'should listen for data-choice clicks');
  });

  it('should support multi-select via data-multiselect', () => {
    assert.ok(helperSource.includes('multiselect'), 'should check for data-multiselect');
  });

  it('should support SVG containers in toggleSelect', () => {
    assert.ok(helperSource.includes("container.tagName === 'svg'"), 'should detect SVG containers');
    assert.ok(helperSource.includes("el.closest('svg')"), 'should look for SVG parent');
  });

  it('should auto-reconnect WebSocket', () => {
    assert.ok(helperSource.includes('setTimeout(connect'), 'should reconnect on close');
  });

  it('should queue events while disconnected', () => {
    assert.ok(helperSource.includes('eventQueue'), 'should maintain event queue');
  });
});
