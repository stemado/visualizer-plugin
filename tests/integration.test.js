// tests/integration.test.js
const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const WebSocket = require('ws');

describe('End-to-end integration', () => {
  const SessionManager = require('../src/session-manager');
  const createMcpTools = require('../src/mcp-server');
  const ArchiveManager = require('../src/archive-manager');
  const fs = require('fs');
  const path = require('path');
  const os = require('os');
  let manager, tools;

  afterEach(async () => {
    if (manager && tools) {
      for (const s of manager.list()) {
        try { await tools.close_session({ session_id: s.id }); } catch(e) {}
      }
    }
  });

  it('full workflow: launch → push → interact → read events → close', async () => {
    manager = new SessionManager({ timeoutMs: 0 });
    tools = createMcpTools(manager);

    // 1. Launch session
    const { session_id, url, port } = await tools.launch_session();
    assert.ok(session_id);
    assert.ok(url.includes(String(port)));

    // 2. Push a screen with options
    const pushResult = await tools.push_screen({
      session_id,
      html: `
        <h2>Pick a layout</h2>
        <div class="options">
          <div class="option" data-choice="grid" onclick="toggleSelect(this)">
            <div class="letter">A</div>
            <div class="content"><h3>Grid</h3><p>Card-based grid layout</p></div>
          </div>
          <div class="option" data-choice="list" onclick="toggleSelect(this)">
            <div class="letter">B</div>
            <div class="content"><h3>List</h3><p>Vertical list layout</p></div>
          </div>
        </div>
      `
    });
    assert.strictEqual(pushResult.pushed, true);
    assert.strictEqual(pushResult.screen_index, 1);

    // 3. Verify HTTP serves the content
    const html = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/`, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data));
      }).on('error', reject);
    });
    assert.ok(html.includes('Pick a layout'));
    assert.ok(html.includes('data-choice="grid"'));
    assert.ok(html.includes('window.visualizer'));

    // 4. Simulate browser interaction via WebSocket
    await new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}`);
      ws.on('open', () => {
        ws.send(JSON.stringify({
          type: 'click',
          choice: 'grid',
          text: 'Grid — Card-based grid layout',
          timestamp: Date.now()
        }));
        setTimeout(() => { ws.close(); resolve(); }, 100);
      });
      ws.on('error', reject);
    });

    // 5. Read events
    const { events } = await tools.get_events({ session_id });
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].choice, 'grid');
    assert.strictEqual(events[0].type, 'click');

    // 6. Push a new screen (should clear events)
    await tools.push_screen({
      session_id,
      html: '<h2>Next question</h2>'
    });
    const { events: clearedEvents } = await tools.get_events({ session_id });
    assert.strictEqual(clearedEvents.length, 0);

    // 7. Close session
    const closeResult = await tools.close_session({ session_id });
    assert.strictEqual(closeResult.closed, true);
    assert.strictEqual(manager.list().length, 0);
  });

  it('archive workflow: push screens → events archived → gallery generated on close', async () => {
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
});
