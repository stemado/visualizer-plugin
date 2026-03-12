// src/renderer.js
const fs = require('fs');
const path = require('path');

const frameTemplate = fs.readFileSync(path.join(__dirname, 'frame-template.html'), 'utf-8');
const helperScript = fs.readFileSync(path.join(__dirname, 'helper.js'), 'utf-8');
const helperInjection = `<script>\n${helperScript}\n</script>`;
const sidebarScript = fs.readFileSync(path.join(__dirname, 'sidebar.js'), 'utf-8');
const sidebarInjection = `<script>\n${sidebarScript}\n</script>`;

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
function render(html, options = {}) {
  let output = isFullDocument(html) ? html : wrapInFrame(html);

  // Build injection string
  let injection = helperInjection + '\n' + sidebarInjection;
  if (typeof options.archiveIndex === 'number') {
    injection = `<script>window.__visualizerArchiveIndex = ${options.archiveIndex};</script>\n` + injection;
  }

  if (output.includes('</body>')) {
    output = output.replace('</body>', `${injection}\n</body>`);
  } else {
    output += injection;
  }

  return output;
}

module.exports = { render, isFullDocument, wrapInFrame };
