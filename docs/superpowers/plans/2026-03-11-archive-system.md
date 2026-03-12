# Archive System Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add screen archiving, in-session timeline sidebar, and post-session static gallery to the visualizer plugin.

**Architecture:** A new `archive-manager.js` module handles all disk persistence. `session-manager.js` delegates to it on every `push_screen` and `destroy`. `renderer.js` injects a `sidebar.js` client script. `http-server.js` adds routes to serve archived content. `index.js` is the composition root that wires everything together.

**Tech Stack:** Node.js built-ins (`fs`, `path`, `crypto`), Express routes, existing test harness (`node:test` + `node:assert`)

**Spec:** `docs/superpowers/specs/2026-03-11-archive-system-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/archive-manager.js` | Create | Disk persistence: save, getManifest, generateGallery, getArchivedScreen, closeSession, saveEvents |
| `src/sidebar.js` | Create | Client-side collapsible timeline sidebar |
| `src/gallery-template.html` | Create | Static gallery page template |
| `src/renderer.js` | Modify | Inject sidebar.js, export `wrapInFrame`, add `options.archiveIndex` to `render()` |
| `src/session-manager.js` | Modify | Accept `archive` in opts, call archive on push/destroy, reverse timer order |
| `src/http-server.js` | Modify | Accept `archive`, add `/archive/manifest` and `/archive/:index` routes |
| `src/mcp-server.js` | Modify | Accept `archive`, add `generate_gallery` handler, update `push_screen`/`close_session`/`onTimeout` |
| `src/index.js` | Modify | Create `ArchiveManager`, wire into SessionManager and createMcpTools, add `title` param + `generate_gallery` tool |
| `skills/visualizer/SKILL.md` | Modify | Document `title` param, `generate_gallery` tool, archive persistence |
| `tests/archive-manager.test.js` | Create | Tests for all archive-manager methods |
| `tests/session-manager.test.js` | Modify | Tests for archive integration, timer reorder |
| `tests/http-server.test.js` | Modify | Tests for archive routes |
| `tests/mcp-tools.test.js` | Modify | Tests for title param, generate_gallery tool |
| `tests/integration.test.js` | Modify | End-to-end archive + gallery test |

---

## Chunk 1: Archive Manager Core

### Task 1: Slugify utility + save()

**Files:**
- Create: `src/archive-manager.js`
- Create: `tests/archive-manager.test.js`

- [ ] **Step 1: Write failing tests for slugify and save**

```js
// tests/archive-manager.test.js
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

describe('ArchiveManager', () => {
  let ArchiveManager, archive, tmpDir;

  beforeEach(() => {
    ArchiveManager = require('../src/archive-manager');
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'viz-test-'));
    archive = new ArchiveManager(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('slugify', () => {
    it('should lowercase and hyphenate', () => {
      // slugify is internal, test via save filename
      archive.save('sess1', '<h2>Hello World</h2>', 'My Cool Title');
      const dir = archive.getArchiveDir('sess1');
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.html'));
      assert.strictEqual(files.length, 1);
      assert.ok(files[0].includes('my-cool-title'), `filename ${files[0]} should contain slug`);
    });

    it('should collapse consecutive hyphens', () => {
      archive.save('sess1', '<p>hi</p>', 'foo---bar   baz');
      const dir = archive.getArchiveDir('sess1');
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.html'));
      assert.ok(files[0].includes('foo-bar-baz'));
    });

    it('should truncate to 50 chars', () => {
      const longTitle = 'a'.repeat(80);
      archive.save('sess1', '<p>hi</p>', longTitle);
      const dir = archive.getArchiveDir('sess1');
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.html'));
      // NNN-timestamp- prefix + slug + .html
      const slug = files[0].split('-').slice(2).join('-').replace('.html', '');
      assert.ok(slug.length <= 50, `slug "${slug}" should be <= 50 chars`);
    });

    it('should fall back to untitled for empty title', () => {
      archive.save('sess1', '<p>hi</p>', '');
      const dir = archive.getArchiveDir('sess1');
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.html'));
      assert.ok(files[0].includes('untitled'));
    });

    it('should fall back to untitled when title omitted', () => {
      archive.save('sess1', '<p>hi</p>');
      const dir = archive.getArchiveDir('sess1');
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.html'));
      assert.ok(files[0].includes('untitled'));
    });
  });

  describe('save', () => {
    it('should create archive directory on first save', () => {
      const dir = archive.getArchiveDir('sess1');
      assert.ok(!fs.existsSync(dir), 'dir should not exist before save');
      archive.save('sess1', '<h2>Screen 1</h2>', 'first-screen');
      assert.ok(fs.existsSync(dir), 'dir should exist after save');
    });

    it('should write HTML file with correct content', () => {
      archive.save('sess1', '<h2>Hello</h2>', 'greeting');
      const dir = archive.getArchiveDir('sess1');
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.html'));
      const content = fs.readFileSync(path.join(dir, files[0]), 'utf-8');
      assert.strictEqual(content, '<h2>Hello</h2>');
    });

    it('should create manifest.json with screen entry', () => {
      archive.save('sess1', '<h2>First</h2>', 'first');
      const dir = archive.getArchiveDir('sess1');
      const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf-8'));
      assert.strictEqual(manifest.screens.length, 1);
      assert.strictEqual(manifest.screens[0].index, 1);
      assert.strictEqual(manifest.screens[0].title, 'first');
      assert.ok(manifest.screens[0].filename);
      assert.ok(manifest.screens[0].timestamp);
    });

    it('should increment screen index across multiple saves', () => {
      archive.save('sess1', '<p>1</p>', 'one');
      archive.save('sess1', '<p>2</p>', 'two');
      archive.save('sess1', '<p>3</p>', 'three');
      const dir = archive.getArchiveDir('sess1');
      const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf-8'));
      assert.strictEqual(manifest.screens.length, 3);
      assert.strictEqual(manifest.screens[0].index, 1);
      assert.strictEqual(manifest.screens[1].index, 2);
      assert.strictEqual(manifest.screens[2].index, 3);
    });

    it('should zero-pad sequence numbers to 3 digits', () => {
      archive.save('sess1', '<p>hi</p>', 'test');
      const dir = archive.getArchiveDir('sess1');
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.html'));
      assert.ok(files[0].startsWith('001-'), `filename ${files[0]} should start with 001-`);
    });

    it('should create session-meta.json on first save', () => {
      archive.save('sess1', '<p>hi</p>', 'test');
      const dir = archive.getArchiveDir('sess1');
      const meta = JSON.parse(fs.readFileSync(path.join(dir, 'session-meta.json'), 'utf-8'));
      assert.strictEqual(meta.sessionId, 'sess1');
      assert.ok(meta.created);
      assert.strictEqual(meta.projectDir, tmpDir);
      assert.strictEqual(meta.screenCount, undefined); // only set on close
    });

    it('should isolate sessions in separate directories', () => {
      archive.save('sess1', '<p>1</p>', 'one');
      archive.save('sess2', '<p>2</p>', 'two');
      assert.notStrictEqual(
        archive.getArchiveDir('sess1'),
        archive.getArchiveDir('sess2')
      );
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd D:/Projects/visualizer && node --test tests/archive-manager.test.js`
Expected: FAIL — `Cannot find module '../src/archive-manager'`

- [ ] **Step 3: Implement archive-manager.js with slugify, save, getArchiveDir**

```js
// src/archive-manager.js
const fs = require('fs');
const path = require('path');

/**
 * Slugify a title for use in filenames.
 * @param {string} title
 * @returns {string}
 */
function slugify(title) {
  if (!title) return 'untitled';
  let slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50)
    .replace(/-$/, ''); // strip trailing hyphen from truncation
  return slug || 'untitled';
}

/**
 * Escape HTML for use inside an iframe srcdoc attribute.
 * Must escape & before other entities.
 * @param {string} html
 * @returns {string}
 */
function escapeSrcdoc(html) {
  return html
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Escape a JSON string for safe embedding in a <script> block.
 * Prevents </script> from prematurely closing the script tag.
 * @param {string} json
 * @returns {string}
 */
function escapeScriptJson(json) {
  return json.replace(/<\/script>/gi, '<\\/script>');
}

/**
 * Write data to a file using temp-file-then-rename for crash safety.
 * Retries on Windows EPERM/EACCES up to 3 times.
 * @param {string} filePath
 * @param {string} data
 */
function safeWriteSync(filePath, data) {
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, data, 'utf-8');
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      fs.renameSync(tmp, filePath);
      return;
    } catch (err) {
      if ((err.code === 'EPERM' || err.code === 'EACCES') && attempt < 2) {
        // Windows: antivirus or indexer may hold a brief lock
        const start = Date.now();
        while (Date.now() - start < 50) { /* busy wait — sync context */ }
        continue;
      }
      throw err;
    }
  }
}

class ArchiveManager {
  /** @param {string} projectDir */
  constructor(projectDir) {
    this.projectDir = projectDir;
    /** @type {Map<string, number>} track screen count per session */
    this._counters = new Map();
  }

  /**
   * Get the archive directory for a session.
   * @param {string} sessionId
   * @returns {string}
   */
  getArchiveDir(sessionId) {
    return path.join(this.projectDir, '.visualizer', 'archive', sessionId);
  }

  /**
   * Ensure the archive directory exists and session-meta.json is created.
   * @param {string} sessionId
   */
  _ensureDir(sessionId) {
    const dir = this.getArchiveDir(sessionId);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      // Create session-meta.json on first access
      const meta = {
        sessionId,
        created: new Date().toISOString(),
        projectDir: this.projectDir,
      };
      safeWriteSync(path.join(dir, 'session-meta.json'), JSON.stringify(meta, null, 2));
    }
  }

  /**
   * Save a screen to the archive.
   * @param {string} sessionId
   * @param {string} html - Raw HTML content
   * @param {string} [title] - Screen title for labeling
   */
  save(sessionId, html, title) {
    try {
      this._ensureDir(sessionId);
      const dir = this.getArchiveDir(sessionId);
      const count = (this._counters.get(sessionId) || 0) + 1;
      this._counters.set(sessionId, count);

      const slug = slugify(title);
      const timestamp = Math.floor(Date.now() / 1000);
      const pad = String(count).padStart(3, '0');
      const filename = `${pad}-${timestamp}-${slug}.html`;

      // Write HTML file
      safeWriteSync(path.join(dir, filename), html);

      // Update manifest
      const manifestPath = path.join(dir, 'manifest.json');
      let manifest = { screens: [] };
      if (fs.existsSync(manifestPath)) {
        manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      }
      manifest.screens.push({
        index: count,
        title: slugify(title),
        filename,
        timestamp: new Date().toISOString(),
      });
      safeWriteSync(manifestPath, JSON.stringify(manifest, null, 2));
    } catch (err) {
      console.warn(`[archive] save failed for session ${sessionId}:`, err.message);
    }
  }
}

module.exports = ArchiveManager;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd D:/Projects/visualizer && node --test tests/archive-manager.test.js`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
cd D:/Projects/visualizer
git add src/archive-manager.js tests/archive-manager.test.js
git commit -m "feat: add archive-manager with save() and slugify"
```

---

### Task 2: getManifest, getArchivedScreen, closeSession, saveEvents

**Files:**
- Modify: `src/archive-manager.js`
- Modify: `tests/archive-manager.test.js`

- [ ] **Step 1: Write failing tests for remaining methods**

Add to `tests/archive-manager.test.js` inside the outer `describe`:

```js
  describe('getManifest', () => {
    it('should return empty screens for unknown session', () => {
      const manifest = archive.getManifest('nonexistent');
      assert.deepStrictEqual(manifest, { screens: [] });
    });

    it('should return saved screens in order', () => {
      archive.save('sess1', '<p>1</p>', 'first');
      archive.save('sess1', '<p>2</p>', 'second');
      const manifest = archive.getManifest('sess1');
      assert.strictEqual(manifest.screens.length, 2);
      assert.strictEqual(manifest.screens[0].title, 'first');
      assert.strictEqual(manifest.screens[1].title, 'second');
    });
  });

  describe('getArchivedScreen', () => {
    it('should return the HTML for a given screen index', () => {
      archive.save('sess1', '<h2>Screen One</h2>', 'one');
      archive.save('sess1', '<h2>Screen Two</h2>', 'two');
      const html = archive.getArchivedScreen('sess1', 2);
      assert.strictEqual(html, '<h2>Screen Two</h2>');
    });

    it('should return null for nonexistent index', () => {
      archive.save('sess1', '<p>hi</p>', 'test');
      const html = archive.getArchivedScreen('sess1', 99);
      assert.strictEqual(html, null);
    });

    it('should return null for nonexistent session', () => {
      const html = archive.getArchivedScreen('nonexistent', 1);
      assert.strictEqual(html, null);
    });
  });

  describe('closeSession', () => {
    it('should write closed timestamp and reason to session-meta.json', () => {
      archive.save('sess1', '<p>hi</p>', 'test');
      archive.closeSession('sess1', 'explicit', 1);
      const dir = archive.getArchiveDir('sess1');
      const meta = JSON.parse(fs.readFileSync(path.join(dir, 'session-meta.json'), 'utf-8'));
      assert.ok(meta.closed);
      assert.strictEqual(meta.closedReason, 'explicit');
      assert.strictEqual(meta.screenCount, 1);
    });

    it('should handle timeout reason', () => {
      archive.save('sess1', '<p>hi</p>', 'test');
      archive.closeSession('sess1', 'timeout', 3);
      const dir = archive.getArchiveDir('sess1');
      const meta = JSON.parse(fs.readFileSync(path.join(dir, 'session-meta.json'), 'utf-8'));
      assert.strictEqual(meta.closedReason, 'timeout');
      assert.strictEqual(meta.screenCount, 3);
    });

    it('should not throw for unknown session', () => {
      assert.doesNotThrow(() => archive.closeSession('nonexistent', 'explicit', 0));
    });
  });

  describe('saveEvents', () => {
    it('should add events to the manifest entry for a screen', () => {
      archive.save('sess1', '<p>1</p>', 'one');
      const events = [
        { type: 'click', choice: 'a', text: 'Option A', timestamp: 1000 }
      ];
      archive.saveEvents('sess1', 1, events);
      const manifest = archive.getManifest('sess1');
      assert.deepStrictEqual(manifest.screens[0].events, events);
    });

    it('should not write if events array is empty', () => {
      archive.save('sess1', '<p>1</p>', 'one');
      archive.saveEvents('sess1', 1, []);
      const manifest = archive.getManifest('sess1');
      assert.strictEqual(manifest.screens[0].events, undefined);
    });

    it('should not throw for unknown session or screen', () => {
      assert.doesNotThrow(() => archive.saveEvents('nonexistent', 1, [{ type: 'click' }]));
    });
  });
```

- [ ] **Step 2: Run tests to verify new tests fail**

Run: `cd D:/Projects/visualizer && node --test tests/archive-manager.test.js`
Expected: New tests FAIL — methods not defined

- [ ] **Step 3: Implement getManifest, getArchivedScreen, closeSession, saveEvents**

Add to the `ArchiveManager` class in `src/archive-manager.js`:

```js
  /**
   * Get the manifest for a session.
   * @param {string} sessionId
   * @returns {{ screens: Array<{ index: number, title: string, filename: string, timestamp: string, events?: object[] }> }}
   */
  getManifest(sessionId) {
    const manifestPath = path.join(this.getArchiveDir(sessionId), 'manifest.json');
    if (!fs.existsSync(manifestPath)) return { screens: [] };
    return JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  }

  /**
   * Get the raw HTML of an archived screen.
   * @param {string} sessionId
   * @param {number} index - 1-based screen index
   * @returns {string|null}
   */
  getArchivedScreen(sessionId, index) {
    const manifest = this.getManifest(sessionId);
    const entry = manifest.screens.find(s => s.index === index);
    if (!entry) return null;
    const filePath = path.join(this.getArchiveDir(sessionId), entry.filename);
    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath, 'utf-8');
  }

  /**
   * Write close metadata to session-meta.json.
   * @param {string} sessionId
   * @param {string} reason - 'explicit' | 'timeout'
   * @param {number} screenCount
   */
  closeSession(sessionId, reason, screenCount) {
    try {
      const metaPath = path.join(this.getArchiveDir(sessionId), 'session-meta.json');
      if (!fs.existsSync(metaPath)) return;
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      meta.closed = new Date().toISOString();
      meta.closedReason = reason;
      meta.screenCount = screenCount;
      safeWriteSync(metaPath, JSON.stringify(meta, null, 2));
    } catch (err) {
      console.warn(`[archive] closeSession failed for ${sessionId}:`, err.message);
    }
  }

  /**
   * Save events to a screen's manifest entry.
   * @param {string} sessionId
   * @param {number} screenIndex - 1-based
   * @param {object[]} events
   */
  saveEvents(sessionId, screenIndex, events) {
    if (!events || events.length === 0) return;
    try {
      const manifestPath = path.join(this.getArchiveDir(sessionId), 'manifest.json');
      if (!fs.existsSync(manifestPath)) return;
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      const entry = manifest.screens.find(s => s.index === screenIndex);
      if (!entry) return;
      entry.events = events;
      safeWriteSync(manifestPath, JSON.stringify(manifest, null, 2));
    } catch (err) {
      console.warn(`[archive] saveEvents failed for ${sessionId}:`, err.message);
    }
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd D:/Projects/visualizer && node --test tests/archive-manager.test.js`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
cd D:/Projects/visualizer
git add src/archive-manager.js tests/archive-manager.test.js
git commit -m "feat: add getManifest, getArchivedScreen, closeSession, saveEvents to archive-manager"
```

---

### Task 3: generateGallery

**Files:**
- Create: `src/gallery-template.html`
- Modify: `src/renderer.js` (export `wrapInFrame`)
- Modify: `src/archive-manager.js`
- Modify: `tests/archive-manager.test.js`

- [ ] **Step 1: Export wrapInFrame from renderer.js**

In `src/renderer.js`, change line 46:

```js
// OLD:
module.exports = { render, isFullDocument };
// NEW:
module.exports = { render, isFullDocument, wrapInFrame };
```

- [ ] **Step 2: Write the gallery template**

Create `src/gallery-template.html` — a self-contained HTML page. The `generateGallery` method reads this template and replaces `<!-- GALLERY_DATA -->` with a JSON blob of screens, and `<!-- GALLERY_SCREENS -->` with iframe srcdoc entries.

```html
<!DOCTYPE html>
<html>
<head>
<title>Visualizer Gallery — <!-- SESSION_ID --></title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: system-ui, -apple-system, sans-serif;
    background: #1d1d1f; color: #f5f5f7; line-height: 1.5;
  }
  .gallery-header {
    padding: 1.5rem 2rem; border-bottom: 1px solid #333;
    display: flex; justify-content: space-between; align-items: center;
  }
  .gallery-header h1 { font-size: 1.2rem; font-weight: 600; }
  .gallery-header .meta { font-size: 0.8rem; color: #888; }
  .view-toggle { display: flex; gap: 0.5rem; }
  .view-toggle button {
    padding: 0.4rem 1rem; border: 1px solid #444; border-radius: 6px;
    background: #2d2d2f; color: #ccc; cursor: pointer; font-size: 0.8rem;
  }
  .view-toggle button.active { background: #0a84ff; color: white; border-color: #0a84ff; }
  .timeline { padding: 2rem; padding-left: 3rem; position: relative; }
  .timeline::before {
    content: ''; position: absolute; left: 2.5rem; top: 0; bottom: 0;
    width: 2px; background: #333;
  }
  .timeline-entry { position: relative; margin-bottom: 2rem; }
  .timeline-dot {
    position: absolute; left: -1.5rem; top: 0.5rem;
    width: 12px; height: 12px; border-radius: 50%;
    background: #0a84ff; border: 2px solid #1d1d1f;
  }
  .timeline-entry.final .timeline-dot { background: #34c759; }
  .timeline-time { font-size: 0.75rem; color: #666; margin-bottom: 0.5rem; }
  .timeline-card {
    background: #2d2d2f; border: 1px solid #333; border-radius: 10px;
    overflow: hidden; cursor: pointer; transition: border-color 0.2s;
  }
  .timeline-card:hover { border-color: #0a84ff; }
  .timeline-entry.final .timeline-card { border-color: #34c759; }
  .timeline-card-body { padding: 1rem; display: flex; align-items: center; gap: 1rem; }
  .timeline-thumb {
    width: 160px; height: 96px; border-radius: 6px;
    overflow: hidden; flex-shrink: 0; position: relative; border: 1px solid #444;
  }
  .timeline-thumb iframe {
    width: 640px; height: 384px; border: none;
    transform: scale(0.25); transform-origin: top left;
    pointer-events: none;
  }
  .timeline-info h3 { font-size: 0.95rem; margin-bottom: 0.25rem; }
  .timeline-info .events-summary { font-size: 0.8rem; color: #0a84ff; margin-top: 0.25rem; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1rem; padding: 2rem; }
  .grid-card {
    background: #2d2d2f; border: 1px solid #333; border-radius: 10px;
    overflow: hidden; cursor: pointer; transition: border-color 0.2s;
  }
  .grid-card:hover { border-color: #0a84ff; }
  .grid-thumb { width: 100%; height: 180px; overflow: hidden; position: relative; }
  .grid-thumb iframe {
    width: 1200px; height: 720px; border: none;
    transform: scale(0.25); transform-origin: top left;
    pointer-events: none;
  }
  .grid-card-body { padding: 0.75rem 1rem; }
  .grid-card-body h3 { font-size: 0.85rem; margin-bottom: 0.2rem; }
  .grid-card-body .time { font-size: 0.75rem; color: #666; }
  .lightbox {
    display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.9);
    z-index: 1000; align-items: center; justify-content: center;
  }
  .lightbox.active { display: flex; }
  .lightbox iframe { width: 90vw; height: 90vh; border: none; border-radius: 8px; }
  .lightbox-close {
    position: absolute; top: 1rem; right: 1.5rem;
    color: white; font-size: 2rem; cursor: pointer; z-index: 1001;
  }
  .hidden { display: none; }
</style>
</head>
<body>
<div class="gallery-header">
  <div>
    <h1>Session <!-- SESSION_ID --></h1>
    <div class="meta"><!-- SESSION_META --></div>
  </div>
  <div class="view-toggle">
    <button class="active" onclick="showView('timeline')">Timeline</button>
    <button onclick="showView('grid')">Grid</button>
  </div>
</div>

<div id="timeline-view" class="timeline">
<!-- TIMELINE_ENTRIES -->
</div>

<div id="grid-view" class="grid hidden">
<!-- GRID_ENTRIES -->
</div>

<div class="lightbox" id="lightbox" onclick="closeLightbox()">
  <span class="lightbox-close">&times;</span>
  <iframe id="lightbox-frame"></iframe>
</div>

<script>
const SCREENS = <!-- GALLERY_DATA -->;
function showView(view) {
  document.getElementById('timeline-view').classList.toggle('hidden', view !== 'timeline');
  document.getElementById('grid-view').classList.toggle('hidden', view !== 'grid');
  document.querySelectorAll('.view-toggle button').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
}
function openLightbox(index) {
  const screen = SCREENS[index];
  if (!screen) return;
  const frame = document.getElementById('lightbox-frame');
  frame.srcdoc = screen.html;
  document.getElementById('lightbox').classList.add('active');
}
function closeLightbox() {
  document.getElementById('lightbox').classList.remove('active');
  document.getElementById('lightbox-frame').srcdoc = '';
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeLightbox(); });
</script>
</body>
</html>
```

- [ ] **Step 3: Write failing tests for generateGallery**

Add to `tests/archive-manager.test.js`:

```js
  describe('generateGallery', () => {
    it('should generate index.html in the archive directory', () => {
      archive.save('sess1', '<h2>Hello</h2>', 'greeting');
      archive.save('sess1', '<p>World</p>', 'world');
      archive.closeSession('sess1', 'explicit', 2);
      const galleryPath = archive.generateGallery('sess1');
      assert.ok(galleryPath);
      assert.ok(fs.existsSync(galleryPath));
      const content = fs.readFileSync(galleryPath, 'utf-8');
      assert.ok(content.includes('<!DOCTYPE html>'));
      assert.ok(content.includes('sess1'));
    });

    it('should embed screen content in GALLERY_DATA', () => {
      archive.save('sess1', '<h2>Test</h2>', 'test');
      archive.closeSession('sess1', 'explicit', 1);
      const galleryPath = archive.generateGallery('sess1');
      const content = fs.readFileSync(galleryPath, 'utf-8');
      // The gallery data should contain the screen HTML (possibly wrapped in frame)
      assert.ok(content.includes('Test'), 'gallery should contain screen content');
    });

    it('should wrap fragment screens in frame template', () => {
      archive.save('sess1', '<h2>Fragment</h2>', 'frag');
      archive.closeSession('sess1', 'explicit', 1);
      const galleryPath = archive.generateGallery('sess1');
      const content = fs.readFileSync(galleryPath, 'utf-8');
      // The embedded HTML should include frame template CSS (e.g., .options class)
      assert.ok(content.includes('.options'), 'fragments should be wrapped with frame CSS');
    });

    it('should not wrap full document screens', () => {
      archive.save('sess1', '<!DOCTYPE html><html><body><p>Full</p></body></html>', 'full');
      archive.closeSession('sess1', 'explicit', 1);
      const galleryPath = archive.generateGallery('sess1');
      const content = fs.readFileSync(galleryPath, 'utf-8');
      assert.ok(content.includes('<p>Full</p>'));
    });

    it('should return null for nonexistent session', () => {
      const result = archive.generateGallery('nonexistent');
      assert.strictEqual(result, null);
    });

    it('should include event summaries when events exist', () => {
      archive.save('sess1', '<p>1</p>', 'one');
      archive.saveEvents('sess1', 1, [{ type: 'click', choice: 'a', text: 'Option A' }]);
      archive.closeSession('sess1', 'explicit', 1);
      const galleryPath = archive.generateGallery('sess1');
      const content = fs.readFileSync(galleryPath, 'utf-8');
      assert.ok(content.includes('Option A'), 'should include event text');
    });
  });
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `cd D:/Projects/visualizer && node --test tests/archive-manager.test.js`
Expected: FAIL — `generateGallery` not defined

- [ ] **Step 5: Implement generateGallery**

Add to `ArchiveManager` class in `src/archive-manager.js`. Add `require('./renderer')` import at the top:

```js
const { isFullDocument, wrapInFrame } = require('./renderer');

// At top of file, after other requires:
const galleryTemplate = fs.readFileSync(path.join(__dirname, 'gallery-template.html'), 'utf-8');
```

Add the method:

```js
  /**
   * Generate a static gallery index.html for a session.
   * @param {string} sessionId
   * @returns {string|null} Path to generated index.html, or null if no screens
   */
  generateGallery(sessionId) {
    try {
      const manifest = this.getManifest(sessionId);
      if (manifest.screens.length === 0) return null;

      const dir = this.getArchiveDir(sessionId);
      const metaPath = path.join(dir, 'session-meta.json');
      const meta = fs.existsSync(metaPath)
        ? JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
        : {};

      // Build gallery data: each screen with rendered HTML
      const galleryScreens = manifest.screens.map(screen => {
        const rawHtml = fs.readFileSync(path.join(dir, screen.filename), 'utf-8');
        const html = isFullDocument(rawHtml) ? rawHtml : wrapInFrame(rawHtml);
        return {
          index: screen.index,
          title: screen.title,
          timestamp: screen.timestamp,
          events: screen.events || [],
          html,
        };
      });

      // Build timeline entries HTML
      const timelineEntries = galleryScreens.map((s, i) => {
        const isFinal = i === galleryScreens.length - 1;
        const escapedHtml = escapeSrcdoc(s.html);
        const eventsHtml = s.events.length > 0
          ? `<div class="events-summary">Selected: ${s.events.map(e => e.text || e.choice).join(', ')}</div>`
          : '';
        const time = new Date(s.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return `
      <div class="timeline-entry${isFinal ? ' final' : ''}" onclick="openLightbox(${i})">
        <div class="timeline-dot"></div>
        <div class="timeline-time">${time} — Screen ${s.index}${isFinal ? ' · Final' : ''}</div>
        <div class="timeline-card">
          <div class="timeline-card-body">
            <div class="timeline-thumb"><iframe srcdoc="${escapedHtml}"></iframe></div>
            <div class="timeline-info">
              <h3>${s.title}</h3>
              ${eventsHtml}
            </div>
          </div>
        </div>
      </div>`;
      }).join('\n');

      // Build grid entries HTML
      const gridEntries = galleryScreens.map((s, i) => {
        const escapedHtml = escapeSrcdoc(s.html);
        const time = new Date(s.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return `
      <div class="grid-card" onclick="openLightbox(${i})">
        <div class="grid-thumb"><iframe srcdoc="${escapedHtml}"></iframe></div>
        <div class="grid-card-body">
          <h3>${s.title}</h3>
          <div class="time">${time} — Screen ${s.index}</div>
        </div>
      </div>`;
      }).join('\n');

      // Gallery data for lightbox
      const galleryData = escapeScriptJson(JSON.stringify(galleryScreens.map(s => ({
        index: s.index,
        title: s.title,
        html: s.html,
      }))));

      // Session metadata
      const screenCount = manifest.screens.length;
      const sessionMeta = `${new Date(meta.created || Date.now()).toLocaleDateString()} · ${screenCount} screen${screenCount !== 1 ? 's' : ''}`;

      // Fill template
      let gallery = galleryTemplate
        .replace(/<!-- SESSION_ID -->/g, sessionId)
        .replace('<!-- SESSION_META -->', sessionMeta)
        .replace('<!-- TIMELINE_ENTRIES -->', timelineEntries)
        .replace('<!-- GRID_ENTRIES -->', gridEntries)
        .replace('<!-- GALLERY_DATA -->', galleryData);

      const outputPath = path.join(dir, 'index.html');
      safeWriteSync(outputPath, gallery);
      return outputPath;
    } catch (err) {
      console.warn(`[archive] generateGallery failed for ${sessionId}:`, err.message);
      return null;
    }
  }
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd D:/Projects/visualizer && node --test tests/archive-manager.test.js`
Expected: All PASS

- [ ] **Step 7: Commit**

```bash
cd D:/Projects/visualizer
git add src/archive-manager.js src/gallery-template.html src/renderer.js tests/archive-manager.test.js
git commit -m "feat: add generateGallery with static HTML output and frame-wrapping"
```

---

## Chunk 2: Session Manager + Renderer Integration

### Task 4: Wire archive into session-manager.js

**Files:**
- Modify: `src/session-manager.js`
- Modify: `tests/session-manager.test.js`

- [ ] **Step 1: Write failing tests for archive integration**

Add to `tests/session-manager.test.js`. These tests use a mock archive to verify delegation:

```js
  describe('archive integration', () => {
    it('should accept archive in constructor opts', () => {
      const mockArchive = { save() {}, saveEvents() {}, closeSession() {} };
      const m = new SessionManager({ timeoutMs: 0, archive: mockArchive });
      assert.ok(m.archive === mockArchive);
    });

    it('should call archive.save on pushScreen with title', () => {
      const saved = [];
      const mockArchive = {
        save(sid, html, title) { saved.push({ sid, html, title }); },
        saveEvents() {},
        closeSession() {},
      };
      const m = new SessionManager({ timeoutMs: 0, archive: mockArchive });
      const session = m.create({ port: 0, url: '' });
      m.pushScreen(session.id, '<h2>Hi</h2>', 'greeting');
      assert.strictEqual(saved.length, 1);
      assert.strictEqual(saved[0].html, '<h2>Hi</h2>');
      assert.strictEqual(saved[0].title, 'greeting');
    });

    it('should save previous screen events before clearing on pushScreen', () => {
      const savedEvents = [];
      const mockArchive = {
        save() {},
        saveEvents(sid, idx, events) { savedEvents.push({ sid, idx, events: [...events] }); },
        closeSession() {},
      };
      const m = new SessionManager({ timeoutMs: 0, archive: mockArchive });
      const session = m.create({ port: 0, url: '' });
      m.pushScreen(session.id, '<p>Screen 1</p>', 'one');
      m.addEvent(session.id, { type: 'click', choice: 'a' });
      m.addEvent(session.id, { type: 'click', choice: 'b' });

      // Push screen 2 — should archive events from screen 1
      m.pushScreen(session.id, '<p>Screen 2</p>', 'two');
      assert.strictEqual(savedEvents.length, 1);
      assert.strictEqual(savedEvents[0].idx, 1); // screen 1's index
      assert.strictEqual(savedEvents[0].events.length, 2);
    });

    it('should not save events if there are none', () => {
      const savedEvents = [];
      const mockArchive = {
        save() {},
        saveEvents(sid, idx, events) { savedEvents.push({ sid, idx, events }); },
        closeSession() {},
      };
      const m = new SessionManager({ timeoutMs: 0, archive: mockArchive });
      const session = m.create({ port: 0, url: '' });
      m.pushScreen(session.id, '<p>Screen 1</p>', 'one');
      m.pushScreen(session.id, '<p>Screen 2</p>', 'two'); // no events on screen 1
      assert.strictEqual(savedEvents.length, 0);
    });

    it('should call archive.closeSession on destroy with reason', () => {
      const closed = [];
      const mockArchive = {
        save() {},
        saveEvents() {},
        closeSession(sid, reason, count) { closed.push({ sid, reason, count }); },
      };
      const m = new SessionManager({ timeoutMs: 0, archive: mockArchive });
      const session = m.create({ port: 0, url: '' });
      m.pushScreen(session.id, '<p>hi</p>', 'test');
      m.destroy(session.id, 'explicit');
      assert.strictEqual(closed.length, 1);
      assert.strictEqual(closed[0].reason, 'explicit');
      assert.strictEqual(closed[0].count, 1);
    });

    it('should save remaining events on destroy', () => {
      const savedEvents = [];
      const mockArchive = {
        save() {},
        saveEvents(sid, idx, events) { savedEvents.push({ sid, idx, events: [...events] }); },
        closeSession() {},
      };
      const m = new SessionManager({ timeoutMs: 0, archive: mockArchive });
      const session = m.create({ port: 0, url: '' });
      m.pushScreen(session.id, '<p>hi</p>', 'test');
      m.addEvent(session.id, { type: 'click', choice: 'x' });
      m.destroy(session.id, 'explicit');
      assert.strictEqual(savedEvents.length, 1);
      assert.strictEqual(savedEvents[0].events.length, 1);
    });

    it('should reverse timer order: destroy before onTimeout', async () => {
      const callOrder = [];
      const mockArchive = {
        save() {},
        saveEvents() {},
        closeSession() { callOrder.push('closeSession'); },
      };
      const m = new SessionManager({
        timeoutMs: 50,
        archive: mockArchive,
        onTimeout: () => { callOrder.push('onTimeout'); },
      });
      const session = m.create({ port: 0, url: '' });

      await new Promise(resolve => setTimeout(resolve, 120));

      assert.strictEqual(m.get(session.id), null, 'session should be destroyed');
      assert.strictEqual(callOrder[0], 'closeSession', 'destroy (closeSession) should fire before onTimeout');
      assert.strictEqual(callOrder[1], 'onTimeout');
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd D:/Projects/visualizer && node --test tests/session-manager.test.js`
Expected: New tests FAIL

- [ ] **Step 3: Modify session-manager.js**

Changes to `src/session-manager.js`:

1. Constructor (line 11): add `this.archive = opts.archive || null;`
2. `_touch` (lines 32-34): reverse order to `destroy` then `onTimeout`
3. `pushScreen` (line 100-107): add `title` param, archive events + save
4. `destroy` (line 147-154): add `reason` param, archive events + closeSession

```js
// Line 11 — add archive:
constructor(opts = {}) {
    this.sessions = new Map();
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxSessions = opts.maxSessions ?? MAX_SESSIONS;
    this.onTimeout = opts.onTimeout || null;
    this.archive = opts.archive || null;
    this._timers = new Map();
}

// Lines 32-35 — reverse timer order:
const timer = setTimeout(() => {
    this.destroy(id, 'timeout');
    if (this.onTimeout) this.onTimeout(id);
}, this.timeoutMs);

// Lines 100-107 — add title, archive events and save:
pushScreen(id, html, title) {
    const session = this.sessions.get(id);
    if (!session) throw new Error(`Session ${id} not found`);
    // Archive events from previous screen before clearing
    if (this.archive && session.screenIndex > 0 && session.events.length > 0) {
      try { this.archive.saveEvents(id, session.screenIndex, session.events); }
      catch (e) { console.warn('[session] archive saveEvents failed:', e.message); }
    }
    session.currentHtml = html;
    session.screenIndex++;
    session.events = [];
    // Archive the new screen
    if (this.archive) {
      try { this.archive.save(id, html, title); }
      catch (e) { console.warn('[session] archive save failed:', e.message); }
    }
    this._touch(id);
}

// Lines 147-154 — add reason, archive close:
destroy(id, reason = 'explicit') {
    const session = this.sessions.get(id);
    if (session && this.archive) {
      // Save remaining events for last screen
      if (session.screenIndex > 0 && session.events.length > 0) {
        try { this.archive.saveEvents(id, session.screenIndex, session.events); }
        catch (e) { console.warn('[session] archive saveEvents failed:', e.message); }
      }
      try { this.archive.closeSession(id, reason, session.screenIndex); }
      catch (e) { console.warn('[session] archive closeSession failed:', e.message); }
    }
    const timer = this._timers.get(id);
    if (timer) {
      clearTimeout(timer);
      this._timers.delete(id);
    }
    this.sessions.delete(id);
}
```

- [ ] **Step 4: Run ALL tests to verify pass and no regressions**

Run: `cd D:/Projects/visualizer && node --test tests/session-manager.test.js`
Expected: All PASS (including existing tests — they use `timeoutMs: 0` so archive is null, no-op)

- [ ] **Step 5: Commit**

```bash
cd D:/Projects/visualizer
git add src/session-manager.js tests/session-manager.test.js
git commit -m "feat: wire archive into session-manager with event archiving and timer reorder"
```

---

### Task 5: Sidebar script + renderer injection

**Files:**
- Create: `src/sidebar.js`
- Modify: `src/renderer.js`

- [ ] **Step 1: Create the sidebar client-side script**

Create `src/sidebar.js`:

```js
(function() {
  const SIDEBAR_WIDTH = '220px';
  const COLLAPSED_KEY = 'visualizer-sidebar-collapsed';

  // Build sidebar DOM
  const sidebar = document.createElement('div');
  sidebar.id = 'viz-sidebar';
  sidebar.innerHTML = `
    <div class="viz-sidebar-header">
      <span class="viz-sidebar-title">History</span>
      <span class="viz-sidebar-toggle" title="Collapse">‹</span>
    </div>
    <div class="viz-sidebar-entries"></div>
    <div class="viz-sidebar-footer"></div>
  `;

  // Inject styles
  const style = document.createElement('style');
  style.textContent = `
    #viz-sidebar {
      position: fixed; left: 0; top: 0; bottom: 0; width: ${SIDEBAR_WIDTH};
      background: #111; border-right: 1px solid #2a2a2a; z-index: 9999;
      display: flex; flex-direction: column; font-family: system-ui, sans-serif;
      transition: transform 0.2s ease;
    }
    #viz-sidebar.collapsed { transform: translateX(-100%); }
    .viz-sidebar-header {
      padding: 12px 14px; border-bottom: 1px solid #2a2a2a;
      display: flex; justify-content: space-between; align-items: center;
    }
    .viz-sidebar-title { font-size: 11px; font-weight: 600; color: #888; letter-spacing: 1px; text-transform: uppercase; }
    .viz-sidebar-toggle { font-size: 16px; color: #555; cursor: pointer; user-select: none; }
    .viz-sidebar-entries { flex: 1; overflow-y: auto; padding: 8px; }
    .viz-sidebar-footer { padding: 10px 14px; border-top: 1px solid #2a2a2a; text-align: center; font-size: 10px; color: #555; }
    .viz-sidebar-entry {
      padding: 10px; margin-bottom: 6px; border-radius: 8px;
      background: #1a1a1a; border: 1px solid #2a2a2a; cursor: pointer;
    }
    .viz-sidebar-entry:hover { border-color: #444; }
    .viz-sidebar-entry.current { background: #1a2e1a; border-color: #4caf50; }
    .viz-sidebar-entry .entry-badge {
      font-size: 10px; font-weight: 700; background: #222; color: #888;
      padding: 2px 6px; border-radius: 4px; display: inline-block; margin-bottom: 4px;
    }
    .viz-sidebar-entry.current .entry-badge { background: #1a3a1a; color: #4caf50; }
    .viz-sidebar-entry .entry-current-tag { font-size: 10px; color: #4caf50; font-weight: 600; margin-left: 6px; }
    .viz-sidebar-entry .entry-title { font-size: 12px; color: #ccc; font-weight: 500; margin-bottom: 2px; }
    .viz-sidebar-entry.current .entry-title { color: #c8e6c9; }
    .viz-sidebar-entry .entry-time { font-size: 10px; color: #666; }
    #viz-sidebar-expand {
      position: fixed; left: 0; top: 50%; transform: translateY(-50%);
      width: 24px; height: 48px; background: #222; border: 1px solid #444;
      border-left: none; border-radius: 0 6px 6px 0;
      display: none; align-items: center; justify-content: center;
      cursor: pointer; z-index: 9998; color: #888; font-size: 14px;
    }
    #viz-sidebar-expand.visible { display: flex; }
    .viz-archive-banner {
      position: fixed; top: 0; left: ${SIDEBAR_WIDTH}; right: 0;
      background: #2d1a1a; color: #ffcc80; padding: 6px 16px;
      font-size: 12px; z-index: 9998; display: none; text-align: center;
    }
    .viz-archive-banner a { color: #4caf50; cursor: pointer; text-decoration: underline; }
    .viz-archive-banner.visible { display: block; }
    body { margin-left: ${SIDEBAR_WIDTH}; transition: margin-left 0.2s ease; }
    body.viz-sidebar-collapsed { margin-left: 0; }
    @media (max-width: 900px) {
      #viz-sidebar { transform: translateX(-100%); }
      #viz-sidebar-expand { display: flex; }
      body { margin-left: 0; }
    }
  `;

  document.head.appendChild(style);
  document.body.appendChild(sidebar);

  // Expand tab
  const expandBtn = document.createElement('div');
  expandBtn.id = 'viz-sidebar-expand';
  expandBtn.textContent = '›';
  document.body.appendChild(expandBtn);

  // Archive banner
  const banner = document.createElement('div');
  banner.className = 'viz-archive-banner';
  banner.innerHTML = 'Viewing archived screen — <a onclick="window.location.href=\'/\'">return to live</a>';
  document.body.appendChild(banner);

  // State
  const isArchiveView = typeof window.__visualizerArchiveIndex === 'number';
  let collapsed = localStorage.getItem(COLLAPSED_KEY) === 'true';

  function updateCollapsed() {
    sidebar.classList.toggle('collapsed', collapsed);
    expandBtn.classList.toggle('visible', collapsed);
    document.body.classList.toggle('viz-sidebar-collapsed', collapsed);
    localStorage.setItem(COLLAPSED_KEY, collapsed);
  }

  sidebar.querySelector('.viz-sidebar-toggle').addEventListener('click', () => {
    collapsed = true;
    updateCollapsed();
  });
  expandBtn.addEventListener('click', () => {
    collapsed = false;
    updateCollapsed();
  });
  updateCollapsed();

  // Show archive banner if viewing archived screen
  if (isArchiveView) {
    banner.classList.add('visible');
  }

  // Fetch and render manifest
  async function loadManifest() {
    try {
      const res = await fetch('/archive/manifest');
      if (!res.ok) return;
      const manifest = await res.json();
      renderEntries(manifest.screens);
    } catch (e) {
      // Sidebar is non-critical — fail silently
    }
  }

  function renderEntries(screens) {
    const container = sidebar.querySelector('.viz-sidebar-entries');
    const footer = sidebar.querySelector('.viz-sidebar-footer');

    if (screens.length === 0) {
      container.innerHTML = '<div style="padding:1rem;text-align:center;color:#555;font-size:11px;">No screens yet</div>';
      footer.textContent = '0 screens';
      return;
    }

    // Reverse: newest first
    const reversed = [...screens].reverse();
    const latestIndex = reversed[0].index;

    container.innerHTML = reversed.map(s => {
      const isCurrent = !isArchiveView && s.index === latestIndex;
      const isViewing = isArchiveView && s.index === window.__visualizerArchiveIndex;
      const time = new Date(s.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const cls = isCurrent || isViewing ? 'current' : '';
      const href = isCurrent ? '/' : `/archive/${s.index}`;
      return `
        <div class="viz-sidebar-entry ${cls}" onclick="window.location.href='${href}'">
          <span class="entry-badge">${s.index}</span>
          ${isCurrent ? '<span class="entry-current-tag">CURRENT</span>' : ''}
          ${isViewing ? '<span class="entry-current-tag">VIEWING</span>' : ''}
          <div class="entry-title">${s.title}</div>
          <div class="entry-time">${time}</div>
        </div>`;
    }).join('');

    footer.textContent = `${screens.length} screen${screens.length !== 1 ? 's' : ''}`;
  }

  // If viewing archive and a reload comes in (new screen pushed), go to live view
  // instead of reloading the archive URL. We set a global flag that causes the
  // page to navigate to '/' on visibility change after reload. This is simpler
  // and more robust than trying to intercept window.location.reload.
  if (isArchiveView) {
    // When helper.js triggers reload(), the page reloads the archive URL.
    // Instead, we use a beforeunload-time redirect: hook into the ws message
    // handler by adding our own listener on the same WebSocket port.
    // Since helper.js does window.location.reload() synchronously in its
    // onmessage handler, we listen on a SECOND WebSocket connection that
    // races the reload. If our handler fires first, we navigate to '/'.
    // If helper.js fires first, the page reloads — but the reloaded page
    // will also be the archive view with the same redirect logic, so on
    // the NEXT reload message it will navigate to '/'.
    // This is acceptable for v1: worst case is one extra reload cycle.
    const archiveWs = new WebSocket('ws://' + window.location.host);
    archiveWs.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data);
        if (data.type === 'reload') {
          window.location.href = '/';
        }
      } catch (e) {}
    };
  }

  loadManifest();
})();
```

- [ ] **Step 2: Modify renderer.js to inject sidebar**

Update `src/renderer.js`:

```js
// After line 6 (helperScript):
const sidebarScript = fs.readFileSync(path.join(__dirname, 'sidebar.js'), 'utf-8');
const sidebarInjection = `<script>\n${sidebarScript}\n</script>`;

// Update render function to accept options:
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
```

- [ ] **Step 3: Add renderer tests for sidebar injection**

Add to `tests/renderer.test.js`:

```js
  it('should inject sidebar.js into output', () => {
    renderer = require('../src/renderer');
    const result = renderer.render('<h2>Test</h2>');
    assert.ok(result.includes('viz-sidebar'), 'should include sidebar script');
  });

  it('should inject archiveIndex when provided', () => {
    renderer = require('../src/renderer');
    const result = renderer.render('<h2>Test</h2>', { archiveIndex: 3 });
    assert.ok(result.includes('window.__visualizerArchiveIndex = 3'));
  });

  it('should export wrapInFrame', () => {
    renderer = require('../src/renderer');
    assert.ok(typeof renderer.wrapInFrame === 'function');
    const wrapped = renderer.wrapInFrame('<h2>Test</h2>');
    assert.ok(wrapped.includes('<h2>Test</h2>'));
    assert.ok(wrapped.includes('<!DOCTYPE html>'));
  });
```

- [ ] **Step 4: Run tests**

Run: `cd D:/Projects/visualizer && node --test tests/renderer.test.js`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
cd D:/Projects/visualizer
git add src/sidebar.js src/renderer.js tests/renderer.test.js
git commit -m "feat: add timeline sidebar with renderer injection"
```

---

## Chunk 3: HTTP Server Routes + MCP Tools + Wiring

### Task 6: HTTP server archive routes

**Files:**
- Modify: `src/http-server.js`
- Modify: `tests/http-server.test.js`

- [ ] **Step 1: Write failing tests for archive routes**

Add to `tests/http-server.test.js`. These need a real ArchiveManager since they serve from disk:

```js
  it('should serve archive manifest as JSON', async () => {
    createHttpServer = require('../src/http-server');
    SessionManager = require('../src/session-manager');
    const ArchiveManager = require('../src/archive-manager');
    const os = require('os');
    const fs = require('fs');
    const path = require('path');

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'viz-http-'));
    const archive = new ArchiveManager(tmpDir);
    manager = new SessionManager({ timeoutMs: 0, archive });
    const session = manager.create({ port: 0, url: '' });
    manager.pushScreen(session.id, '<h2>Test</h2>', 'test-screen');

    const { server } = createHttpServer(manager, session.id, archive);
    server.listen(0, '127.0.0.1', async () => {
      const port = server.address().port;
      servers.push(server);
      const { body } = await httpGet(port, '/archive/manifest');
      const manifest = JSON.parse(body);
      assert.strictEqual(manifest.screens.length, 1);
      assert.strictEqual(manifest.screens[0].title, 'test-screen');
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });
    // Wait for callback
    await new Promise(resolve => setTimeout(resolve, 200));
  });

  it('should serve archived screen through render()', async () => {
    createHttpServer = require('../src/http-server');
    SessionManager = require('../src/session-manager');
    const ArchiveManager = require('../src/archive-manager');
    const os = require('os');
    const fs = require('fs');
    const path = require('path');

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'viz-http-'));
    const archive = new ArchiveManager(tmpDir);
    manager = new SessionManager({ timeoutMs: 0, archive });
    const session = manager.create({ port: 0, url: '' });
    manager.pushScreen(session.id, '<h2>Archived</h2>', 'test');

    const { server } = createHttpServer(manager, session.id, archive);
    server.listen(0, '127.0.0.1', async () => {
      const port = server.address().port;
      servers.push(server);
      const { body } = await httpGet(port, '/archive/1');
      assert.ok(body.includes('<h2>Archived</h2>'), 'should contain archived content');
      assert.ok(body.includes('window.__visualizerArchiveIndex = 1'), 'should inject archive index');
      assert.ok(body.includes('viz-sidebar'), 'should inject sidebar');
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });
    await new Promise(resolve => setTimeout(resolve, 200));
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd D:/Projects/visualizer && node --test tests/http-server.test.js`
Expected: FAIL — `createHttpServer` doesn't accept 3rd arg / routes don't exist

- [ ] **Step 3: Modify http-server.js**

Update `src/http-server.js`:

```js
// Line 21 — add archive parameter:
function createHttpServer(manager, sessionId, archive) {
  // ... existing code unchanged until after app.get('/') ...

  // Add archive routes after the existing app.get('/'):
  app.get('/archive/manifest', (req, res) => {
    if (!archive) return res.json({ screens: [] });
    res.json(archive.getManifest(sessionId));
  });

  app.get('/archive/:index', (req, res) => {
    if (!archive) return res.status(404).send('Archive not available');
    const index = parseInt(req.params.index, 10);
    const html = archive.getArchivedScreen(sessionId, index);
    if (!html) return res.status(404).send('Screen not found');
    res.type('html').send(render(html, { archiveIndex: index }));
  });

  return { server, app, broadcastReload };
}
```

- [ ] **Step 4: Run tests**

Run: `cd D:/Projects/visualizer && node --test tests/http-server.test.js`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
cd D:/Projects/visualizer
git add src/http-server.js tests/http-server.test.js
git commit -m "feat: add archive manifest and screen routes to HTTP server"
```

---

### Task 7: MCP tools + index.js wiring

**Files:**
- Modify: `src/mcp-server.js`
- Modify: `src/index.js`
- Modify: `tests/mcp-tools.test.js`

- [ ] **Step 1: Write failing tests for updated MCP tools**

Add to `tests/mcp-tools.test.js`:

```js
  it('should accept title parameter in push_screen', async () => {
    const os = require('os');
    const fs = require('fs');
    const path = require('path');
    const ArchiveManager = require('../src/archive-manager');

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'viz-mcp-'));
    const archive = new ArchiveManager(tmpDir);
    manager = new SessionManager({ timeoutMs: 0, archive });
    tools = createMcpTools(manager, archive);

    const { session_id } = await tools.launch_session();
    await tools.push_screen({ session_id, html: '<h2>Hi</h2>', title: 'greeting' });

    const manifest = archive.getManifest(session_id);
    assert.strictEqual(manifest.screens.length, 1);
    assert.strictEqual(manifest.screens[0].title, 'greeting');
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should generate gallery on close_session', async () => {
    const os = require('os');
    const fs = require('fs');
    const path = require('path');
    const ArchiveManager = require('../src/archive-manager');

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'viz-mcp-'));
    const archive = new ArchiveManager(tmpDir);
    manager = new SessionManager({ timeoutMs: 0, archive });
    tools = createMcpTools(manager, archive);

    const { session_id } = await tools.launch_session();
    await tools.push_screen({ session_id, html: '<h2>Test</h2>', title: 'test' });
    await tools.close_session({ session_id });

    const galleryPath = path.join(archive.getArchiveDir(session_id), 'index.html');
    assert.ok(fs.existsSync(galleryPath), 'gallery should be generated on close');
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should expose generate_gallery tool', async () => {
    const os = require('os');
    const fs = require('fs');
    const path = require('path');
    const ArchiveManager = require('../src/archive-manager');

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'viz-mcp-'));
    const archive = new ArchiveManager(tmpDir);
    manager = new SessionManager({ timeoutMs: 0, archive });
    tools = createMcpTools(manager, archive);

    const { session_id } = await tools.launch_session();
    await tools.push_screen({ session_id, html: '<h2>Test</h2>', title: 'test' });
    const result = await tools.generate_gallery({ session_id });
    assert.ok(result.path);
    assert.ok(fs.existsSync(result.path));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd D:/Projects/visualizer && node --test tests/mcp-tools.test.js`
Expected: FAIL — `createMcpTools` doesn't accept 2nd arg

- [ ] **Step 3: Modify mcp-server.js**

Update `src/mcp-server.js`:

```js
function createMcpTools(manager, archive) {
  const httpServers = new Map();

  // Wire session timeout
  manager.onTimeout = (id) => {
    const httpState = httpServers.get(id);
    if (httpState) {
      httpState.server.close();
      httpServers.delete(id);
    }
    // Generate gallery — destroy already called by timer before onTimeout
    if (archive) {
      try { archive.generateGallery(id); }
      catch (e) { console.warn('[mcp] gallery generation on timeout failed:', e.message); }
    }
  };

  return {
    async launch_session() {
      const host = '127.0.0.1';
      const session = manager.create({ port: 0, url: '' });
      const { server, broadcastReload } = createHttpServer(manager, session.id, archive);
      // ... rest unchanged
    },

    async push_screen({ session_id, html, title }) {
      const session = manager.get(session_id);
      if (!session) throw new Error(`Session ${session_id} not found`);
      manager.pushScreen(session_id, html, title);
      const httpState = httpServers.get(session_id);
      if (httpState) httpState.broadcastReload();
      return { pushed: true, screen_index: session.screenIndex };
    },

    // get_events + list_sessions unchanged...

    async close_session({ session_id }) {
      const httpState = httpServers.get(session_id);
      if (httpState) {
        await new Promise(resolve => httpState.server.close(resolve));
        httpServers.delete(session_id);
      }
      manager.destroy(session_id, 'explicit');
      // Generate gallery after destroy (session-meta already written)
      if (archive) {
        try { archive.generateGallery(session_id); }
        catch (e) { console.warn('[mcp] gallery generation on close failed:', e.message); }
      }
      return { closed: true };
    },

    async generate_gallery({ session_id }) {
      if (!archive) throw new Error('Archive not available');
      const galleryPath = archive.generateGallery(session_id);
      if (!galleryPath) throw new Error(`No screens to generate gallery for session ${session_id}`);
      return { path: galleryPath };
    },
  };
}
```

- [ ] **Step 4: Modify index.js**

Update `src/index.js`:

```js
const ArchiveManager = require('./archive-manager');

const projectDir = process.cwd();
const archive = new ArchiveManager(projectDir);
const manager = new SessionManager({
  timeoutMs: 30 * 60 * 1000,
  maxSessions: 5,
  archive,
});
const tools = createMcpTools(manager, archive);
```

Add `title` to push_screen schema (line 33):

```js
  {
    session_id: z.string().describe('Session ID from launch_session'),
    html: z.string().describe('HTML content — fragment or full document'),
    title: z.string().optional().describe('Screen title for archive labeling'),
  },
```

Register `generate_gallery` tool after the existing tools:

```js
server.tool(
  'generate_gallery',
  'Generate a static HTML gallery page for an archived session. Called automatically on close, but can be used for mid-session snapshots.',
  { session_id: z.string().describe('Session ID to generate gallery for') },
  async (args) => ({
    content: [{ type: 'text', text: JSON.stringify(await tools.generate_gallery(args)) }]
  })
);
```

- [ ] **Step 5: Run ALL tests**

Run: `cd D:/Projects/visualizer && node --test`
Expected: All PASS across all test files

- [ ] **Step 6: Commit**

```bash
cd D:/Projects/visualizer
git add src/mcp-server.js src/index.js tests/mcp-tools.test.js
git commit -m "feat: wire archive into MCP tools with generate_gallery and title param"
```

---

### Task 8: Integration test + SKILL.md update

**Files:**
- Modify: `tests/integration.test.js`
- Modify: `skills/visualizer/SKILL.md`

- [ ] **Step 1: Add integration test for archive workflow**

Add to `tests/integration.test.js`:

```js
  it('archive workflow: push screens → events archived → gallery generated on close', async () => {
    const os = require('os');
    const fs = require('fs');
    const path = require('path');
    const ArchiveManager = require('../src/archive-manager');

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'viz-integ-'));
    const archive = new ArchiveManager(tmpDir);
    manager = new SessionManager({ timeoutMs: 0, archive });
    tools = createMcpTools(manager, archive);

    // 1. Launch + push screens with titles
    const { session_id, port } = await tools.launch_session();
    await tools.push_screen({ session_id, html: '<h2>Layout Options</h2>', title: 'layout' });

    // 2. Simulate user interaction
    manager.addEvent(session_id, { type: 'click', choice: 'grid', text: 'Grid Layout', timestamp: Date.now() });

    // 3. Push second screen — should archive events from first
    await tools.push_screen({ session_id, html: '<h2>Color Palette</h2>', title: 'colors' });

    // 4. Verify manifest has events on first screen
    const manifest = archive.getManifest(session_id);
    assert.strictEqual(manifest.screens.length, 2);
    assert.strictEqual(manifest.screens[0].title, 'layout');
    assert.ok(manifest.screens[0].events, 'first screen should have archived events');
    assert.strictEqual(manifest.screens[0].events[0].choice, 'grid');

    // 5. Verify archived screen content
    const archivedHtml = archive.getArchivedScreen(session_id, 1);
    assert.ok(archivedHtml.includes('Layout Options'));

    // 6. Verify HTTP archive routes
    const manifestRes = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/archive/manifest`, res => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(JSON.parse(data)));
      }).on('error', reject);
    });
    assert.strictEqual(manifestRes.screens.length, 2);

    // 7. Close — should generate gallery
    await tools.close_session({ session_id });
    const galleryPath = path.join(archive.getArchiveDir(session_id), 'index.html');
    assert.ok(fs.existsSync(galleryPath), 'gallery should exist after close');

    // 8. Verify gallery content
    const gallery = fs.readFileSync(galleryPath, 'utf-8');
    assert.ok(gallery.includes('Layout Options'));
    assert.ok(gallery.includes('Color Palette'));
    assert.ok(gallery.includes('Grid Layout'), 'gallery should show event selections');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
```

- [ ] **Step 2: Run integration tests**

Run: `cd D:/Projects/visualizer && node --test tests/integration.test.js`
Expected: All PASS

- [ ] **Step 3: Update SKILL.md**

Add to `skills/visualizer/SKILL.md` after the Quick Start section, update step 3 to mention title:

```markdown
3. Call `push_screen` with HTML content and an optional `title` (e.g., "layout-options", "color-palette")
```

Add after the tools reference section:

```markdown
## Screen Archiving

Every screen you push is automatically archived to `.visualizer/archive/` in the project directory. This provides:

- **In-session navigation**: A sidebar in the browser lets the user flip back to earlier screens
- **Post-session gallery**: When you close the session, a static `index.html` gallery is generated that works without the server

### Title Parameter

When calling `push_screen`, include a descriptive `title` to label the screen in the archive:

```json
{ "session_id": "abc123", "html": "<h2>Layout</h2>...", "title": "homepage-layout" }
```

Titles appear in the sidebar and gallery. They're optional but recommended.

### Gallery Generation

The `generate_gallery` tool creates a static HTML gallery at any time:

```json
{ "session_id": "abc123" }
```

Returns `{ "path": ".visualizer/archive/abc123/index.html" }`. This is called automatically on `close_session`, but you can call it mid-session for a snapshot.
```

- [ ] **Step 4: Run ALL tests**

Run: `cd D:/Projects/visualizer && node --test`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
cd D:/Projects/visualizer
git add tests/integration.test.js skills/visualizer/SKILL.md
git commit -m "feat: add archive integration test and update SKILL.md docs"
```

---

### Task 9: Add .visualizer/ to .gitignore

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Add .visualizer/ to .gitignore**

Append to `.gitignore`:

```
# Archive data
.visualizer/
```

- [ ] **Step 2: Commit**

```bash
cd D:/Projects/visualizer
git add .gitignore
git commit -m "chore: add .visualizer/ to .gitignore"
```

---

## Post-Implementation Checklist

- [ ] Run full test suite: `cd D:/Projects/visualizer && node --test`
- [ ] Manually test: launch session, push 3 screens with titles, interact, close, open gallery
- [ ] Verify sidebar collapses/expands correctly
- [ ] Verify gallery works when opened directly (no server)
- [ ] Verify archived screen navigation works via sidebar clicks
- [ ] Note: `closedReason: "crash"` is deferred — only `"explicit"` and `"timeout"` are implemented in v1
