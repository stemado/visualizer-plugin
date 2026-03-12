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

      const { isFullDocument, wrapInFrame } = require('./renderer');

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
      const galleryTemplate = fs.readFileSync(path.join(__dirname, 'gallery-template.html'), 'utf-8');
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
}

module.exports = ArchiveManager;
