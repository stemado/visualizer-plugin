// src/renderer.js
const fs = require('fs');
const path = require('path');

const frameTemplate = fs.readFileSync(path.join(__dirname, 'frame-template.html'), 'utf-8');
const helperScript = fs.readFileSync(path.join(__dirname, 'helper.js'), 'utf-8');
const helperInjection = `<script>\n${helperScript}\n</script>`;

/**
 * Detect whether HTML content is a full document or a bare fragment.
 * @param {string} html
 * @returns {boolean}
 */
function isFullDocument(html) {
  const trimmed = html.trimStart().toLowerCase();
  return trimmed.startsWith('<!doctype') || trimmed.startsWith('<html');
}

/**
 * Wrap a content fragment in the frame template.
 * @param {string} content
 * @returns {string}
 */
function wrapInFrame(content) {
  return frameTemplate.replace('<!-- CONTENT -->', content);
}

/**
 * Render HTML content for serving. Wraps fragments in the frame,
 * injects helper.js into all output.
 * @param {string} html - Raw HTML content (fragment or full document)
 * @returns {string} - Ready-to-serve HTML
 */
function render(html) {
  let output = isFullDocument(html) ? html : wrapInFrame(html);

  if (output.includes('</body>')) {
    output = output.replace('</body>', `${helperInjection}\n</body>`);
  } else {
    output += helperInjection;
  }

  return output;
}

module.exports = { render, isFullDocument };
