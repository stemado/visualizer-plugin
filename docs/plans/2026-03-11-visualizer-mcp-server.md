# Visualizer MCP Server — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an MCP server plugin for Claude Code that creates interactive HTML visualizations in a browser, combining the brainstorming Visual Companion's bidirectional browser communication with the Playground's rich template-driven visualization generation.

**Architecture:** A single Node.js process serves both stdio-based MCP (for Claude to call tools) and an HTTP+WebSocket server (for the browser). Claude calls MCP tools to push HTML screens and read user interactions — no filesystem intermediary needed. A skill layer teaches Claude how to generate high-quality visualizations using template patterns adapted from the Playground plugin.

**Tech Stack:** Node.js, `@modelcontextprotocol/sdk` (MCP stdio server), Express (HTTP), `ws` (WebSocket), no build step (plain JS with JSDoc types)

---

## File Structure

```
D:\Projects\visualizer\
├── .claude-plugin/
│   └── plugin.json              # Plugin metadata (name, version, author)
├── .mcp.json                    # MCP server config (stdio via node)
├── package.json                 # Dependencies and entry point
├── src/
│   ├── index.js                 # Entry point — wires MCP server + HTTP server
│   ├── mcp-server.js            # MCP tool definitions (start, push, read, stop)
│   ├── http-server.js           # Express + WebSocket server factory
│   ├── session-manager.js       # Session lifecycle (create, get, destroy, list)
│   ├── renderer.js              # HTML wrapping: fragment → full document
│   ├── helper.js                # Browser-side JS (WebSocket, click capture, API)
│   └── frame-template.html      # HTML/CSS frame with dark/light theming
├── skills/
│   └── visualizer/
│       ├── SKILL.md             # Teaches Claude to generate visualizations
│       └── templates/
│           ├── architecture.md  # System component diagrams (adapted from code-map)
│           ├── comparison.md    # Side-by-side comparisons (adapted from design-playground)
│           ├── concept-map.md   # Learning/relationship maps (adapted from concept-map)
│           ├── data-explorer.md # Data/query building (adapted from data-explorer)
│           ├── flowchart.md     # Process flows and state machines
│           └── dashboard.md     # Metric dashboards and KPI layouts
├── tests/
│   ├── renderer.test.js         # Fragment wrapping, full doc detection
│   ├── session-manager.test.js  # Session CRUD, event tracking
│   ├── http-server.test.js      # HTTP serving, WebSocket relay
│   ├── mcp-tools.test.js        # MCP tool integration tests
│   └── helper.test.js           # Browser-side JS API surface
└── docs/
    └── plans/
        └── 2026-03-11-visualizer-mcp-server.md  # This file
```

### File Responsibilities

| File | Responsibility | Depends On |
|------|---------------|------------|
| `index.js` | Entry point: creates MCP server, wires tools, starts stdio transport | `mcp-server.js` |
| `mcp-server.js` | Defines 5 MCP tools with schemas, delegates to session-manager and http-server | `session-manager.js`, `http-server.js` |
| `http-server.js` | Creates Express app + WebSocket server, serves HTML, relays events | `renderer.js`, `helper.js`, `frame-template.html` |
| `session-manager.js` | Manages session state: active sessions map, event buffers, screen history | (none) |
| `renderer.js` | Detects full docs vs fragments, wraps fragments in frame template | `frame-template.html` |
| `helper.js` | Browser-side: WebSocket connect/reconnect, click capture, `window.visualizer` API | (none — injected into served HTML) |
| `frame-template.html` | CSS theme variables, layout frame, indicator bar, CSS helper classes | (none — static asset) |

### MCP Tool Design

| Tool | Parameters | Returns | Purpose |
|------|-----------|---------|---------|
| `launch_session` | (none) | `{ session_id, url, port }` | Start HTTP+WS server, return browser URL |
| `push_screen` | `session_id: string, html: string` | `{ pushed: true, screen_index }` | Push HTML to browser, clear events |
| `get_events` | `session_id: string, since?: number, clear?: boolean` | `{ events: [...] }` | Read user interactions since last push/read |
| `list_sessions` | (none) | `{ sessions: [...] }` | List active sessions with URLs |
| `close_session` | `session_id: string` | `{ closed: true }` | Stop server, clean up |

---

## Chunk 1: Core Infrastructure

### Task 1: Project Scaffold and Dependencies

**Files:**
- Create: `package.json`
- Create: `.claude-plugin/plugin.json`
- Create: `.mcp.json`

- [ ] **Step 1: Initialize package.json**

```json
{
  "name": "visualizer",
  "version": "0.1.0",
  "description": "MCP server for interactive HTML visualizations in the browser",
  "main": "src/index.js",
  "scripts": {
    "start": "node src/index.js",
    "test": "node --test tests/*.test.js"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.12.1",
    "express": "^4.21.0",
    "ws": "^8.18.0",
    "zod": "^3.23.8"
  },
  "license": "MIT"
}
```

Write this to `D:\Projects\visualizer\package.json`.

- [ ] **Step 2: Create plugin manifest**

```json
{
  "name": "visualizer",
  "description": "Interactive HTML visualization companion — push diagrams, mockups, and explorers to a browser window",
  "version": "0.1.0",
  "author": { "name": "sdoherty" },
  "license": "MIT"
}
```

Write to `D:\Projects\visualizer\.claude-plugin\plugin.json`.

- [ ] **Step 3: Create MCP config**

```json
{
  "mcpServers": {
    "visualizer": {
      "command": "node",
      "args": ["${CLAUDE_PLUGIN_ROOT}/src/index.js"]
    }
  }
}
```

Write to `D:\Projects\visualizer\.mcp.json`.

- [ ] **Step 4: Install dependencies**

Run: `cd D:/Projects/visualizer && npm install`
Expected: `node_modules/` created, `package-lock.json` generated.

- [ ] **Step 5: Initialize git and commit**

```bash
cd D:/Projects/visualizer
git init
echo "node_modules/" > .gitignore
git add package.json package-lock.json .gitignore .claude-plugin/plugin.json .mcp.json
git commit -m "feat: project scaffold with MCP config and dependencies"
```

---

### Task 2: Renderer — Fragment Wrapping

The renderer detects whether HTML is a full document or a fragment, and wraps fragments in the frame template with helper.js injection.

**Files:**
- Create: `src/renderer.js`
- Create: `src/frame-template.html`
- Create: `src/helper.js`
- Create: `tests/renderer.test.js`

- [ ] **Step 1: Write the failing tests**

```javascript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd D:/Projects/visualizer && node --test tests/renderer.test.js`
Expected: FAIL — `Cannot find module '../src/renderer'`

- [ ] **Step 3: Create frame-template.html**

Adapt the brainstorming frame template. Key differences from the superpowers version:
- Title says "Visualizer" not "Superpowers Brainstorming"
- Same CSS variable theming (light/dark), same layout structure
- Same CSS helper classes (`.options`, `.option`, `.cards`, `.card`, `.mockup`, `.split`, `.pros-cons`, `.placeholder`, `.mock-*`)
- `<!-- CONTENT -->` placeholder in `#claude-content`

```html
<!DOCTYPE html>
<html>
<head>
  <title>Visualizer</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { height: 100%; overflow: hidden; }

    :root {
      --bg-primary: #f5f5f7;
      --bg-secondary: #ffffff;
      --bg-tertiary: #e5e5e7;
      --border: #d1d1d6;
      --text-primary: #1d1d1f;
      --text-secondary: #86868b;
      --text-tertiary: #aeaeb2;
      --accent: #0071e3;
      --accent-hover: #0077ed;
      --success: #34c759;
      --warning: #ff9f0a;
      --error: #ff3b30;
      --selected-bg: #e8f4fd;
      --selected-border: #0071e3;
    }

    @media (prefers-color-scheme: dark) {
      :root {
        --bg-primary: #1d1d1f;
        --bg-secondary: #2d2d2f;
        --bg-tertiary: #3d3d3f;
        --border: #424245;
        --text-primary: #f5f5f7;
        --text-secondary: #86868b;
        --text-tertiary: #636366;
        --accent: #0a84ff;
        --accent-hover: #409cff;
        --selected-bg: rgba(10, 132, 255, 0.15);
        --selected-border: #0a84ff;
      }
    }

    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      display: flex;
      flex-direction: column;
      line-height: 1.5;
    }

    .header {
      background: var(--bg-secondary);
      padding: 0.5rem 1.5rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid var(--border);
      flex-shrink: 0;
    }
    .header h1 { font-size: 0.85rem; font-weight: 500; color: var(--text-secondary); }
    .header .status { font-size: 0.7rem; color: var(--success); display: flex; align-items: center; gap: 0.4rem; }
    .header .status::before { content: ''; width: 6px; height: 6px; background: var(--success); border-radius: 50%; }

    .main { flex: 1; overflow-y: auto; }
    #claude-content { padding: 2rem; min-height: 100%; }

    .indicator-bar {
      background: var(--bg-secondary);
      border-top: 1px solid var(--border);
      padding: 0.5rem 1.5rem;
      flex-shrink: 0;
      text-align: center;
    }
    .indicator-bar span { font-size: 0.75rem; color: var(--text-secondary); }
    .indicator-bar .selected-text { color: var(--accent); font-weight: 500; }

    /* Typography */
    h2 { font-size: 1.5rem; font-weight: 600; margin-bottom: 0.5rem; }
    h3 { font-size: 1.1rem; font-weight: 600; margin-bottom: 0.25rem; }
    .subtitle { color: var(--text-secondary); margin-bottom: 1.5rem; }
    .section { margin-bottom: 2rem; }
    .label { font-size: 0.7rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem; }

    /* Options (A/B/C choices) */
    .options { display: flex; flex-direction: column; gap: 0.75rem; }
    .option {
      background: var(--bg-secondary);
      border: 2px solid var(--border);
      border-radius: 12px;
      padding: 1rem 1.25rem;
      cursor: pointer;
      transition: all 0.15s ease;
      display: flex;
      align-items: flex-start;
      gap: 1rem;
    }
    .option:hover { border-color: var(--accent); }
    .option.selected { background: var(--selected-bg); border-color: var(--selected-border); }
    .option .letter {
      background: var(--bg-tertiary);
      color: var(--text-secondary);
      width: 1.75rem; height: 1.75rem;
      border-radius: 6px;
      display: flex; align-items: center; justify-content: center;
      font-weight: 600; font-size: 0.85rem; flex-shrink: 0;
    }
    .option.selected .letter { background: var(--accent); color: white; }
    .option .content { flex: 1; }
    .option .content h3 { font-size: 0.95rem; margin-bottom: 0.15rem; }
    .option .content p { color: var(--text-secondary); font-size: 0.85rem; margin: 0; }

    /* Cards */
    .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem; }
    .card {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 12px;
      overflow: hidden;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .card:hover { border-color: var(--accent); transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
    .card.selected { border-color: var(--selected-border); border-width: 2px; }
    .card-image { background: var(--bg-tertiary); aspect-ratio: 16/10; display: flex; align-items: center; justify-content: center; }
    .card-body { padding: 1rem; }
    .card-body h3 { margin-bottom: 0.25rem; }
    .card-body p { color: var(--text-secondary); font-size: 0.85rem; }

    /* Mockup */
    .mockup {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 12px;
      overflow: hidden;
      margin-bottom: 1.5rem;
    }
    .mockup-header {
      background: var(--bg-tertiary);
      padding: 0.5rem 1rem;
      font-size: 0.75rem;
      color: var(--text-secondary);
      border-bottom: 1px solid var(--border);
    }
    .mockup-body { padding: 1.5rem; }

    /* Split view */
    .split { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; }
    @media (max-width: 700px) { .split { grid-template-columns: 1fr; } }

    /* Pros/Cons */
    .pros-cons { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin: 1rem 0; }
    .pros, .cons { background: var(--bg-secondary); border-radius: 8px; padding: 1rem; }
    .pros h4 { color: var(--success); font-size: 0.85rem; margin-bottom: 0.5rem; }
    .cons h4 { color: var(--error); font-size: 0.85rem; margin-bottom: 0.5rem; }
    .pros ul, .cons ul { margin-left: 1.25rem; font-size: 0.85rem; color: var(--text-secondary); }

    /* Mock elements */
    .placeholder {
      background: var(--bg-tertiary);
      border: 2px dashed var(--border);
      border-radius: 8px;
      padding: 2rem;
      text-align: center;
      color: var(--text-tertiary);
    }
    .mock-nav { background: var(--accent); color: white; padding: 0.75rem 1rem; display: flex; gap: 1.5rem; font-size: 0.9rem; }
    .mock-sidebar { background: var(--bg-tertiary); padding: 1rem; min-width: 180px; }
    .mock-content { padding: 1.5rem; flex: 1; }
    .mock-button { background: var(--accent); color: white; border: none; padding: 0.5rem 1rem; border-radius: 6px; font-size: 0.85rem; cursor: pointer; }
    .mock-input { background: var(--bg-primary); border: 1px solid var(--border); border-radius: 6px; padding: 0.5rem; width: 100%; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Visualizer</h1>
    <div class="status">Connected</div>
  </div>

  <div class="main">
    <div id="claude-content">
      <!-- CONTENT -->
    </div>
  </div>

  <div class="indicator-bar">
    <span id="indicator-text">Interact above, then return to the terminal</span>
  </div>
</body>
</html>
```

Write to `D:\Projects\visualizer\src\frame-template.html`.

- [ ] **Step 4: Create helper.js**

Adapted from brainstorming helper.js. Key differences:
- API exposed as `window.visualizer` instead of `window.brainstorm`
- Same WebSocket reconnect, click capture, toggleSelect logic

```javascript
(function() {
  const WS_URL = 'ws://' + window.location.host;
  let ws = null;
  let eventQueue = [];

  function connect() {
    ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      eventQueue.forEach(e => ws.send(JSON.stringify(e)));
      eventQueue = [];
      const status = document.querySelector('.header .status');
      if (status) status.textContent = 'Connected';
    };

    ws.onmessage = (msg) => {
      const data = JSON.parse(msg.data);
      if (data.type === 'reload') {
        window.location.reload();
      }
    };

    ws.onclose = () => {
      const status = document.querySelector('.header .status');
      if (status) {
        status.textContent = 'Reconnecting...';
        status.style.color = 'var(--warning)';
      }
      setTimeout(connect, 1000);
    };
  }

  function sendEvent(event) {
    event.timestamp = Date.now();
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(event));
    } else {
      eventQueue.push(event);
    }
  }

  // Capture clicks on choice elements
  document.addEventListener('click', (e) => {
    const target = e.target.closest('[data-choice]');
    if (!target) return;

    sendEvent({
      type: 'click',
      text: target.textContent.trim(),
      choice: target.dataset.choice,
      id: target.id || null
    });

    setTimeout(() => {
      const indicator = document.getElementById('indicator-text');
      if (!indicator) return;
      const container = target.closest('.options') || target.closest('.cards');
      const selected = container ? container.querySelectorAll('.selected') : [];
      if (selected.length === 0) {
        indicator.textContent = 'Interact above, then return to the terminal';
      } else if (selected.length === 1) {
        const label = selected[0].querySelector('h3')?.textContent?.trim() || selected[0].dataset.choice;
        indicator.innerHTML = '<span class="selected-text">' + label + ' selected</span> — return to terminal to continue';
      } else {
        indicator.innerHTML = '<span class="selected-text">' + selected.length + ' selected</span> — return to terminal to continue';
      }
    }, 0);
  });

  window.selectedChoice = null;

  window.toggleSelect = function(el) {
    // Look for standard frame containers first, then SVG parent
    const container = el.closest('.options') || el.closest('.cards') || el.closest('svg');
    const multi = container && container.dataset && container.dataset.multiselect !== undefined;
    if (container && !multi) {
      // Deselect siblings: .option/.card in HTML containers, or [data-choice] in SVG
      const selector = container.tagName === 'svg'
        ? '[data-choice]'
        : '.option, .card';
      container.querySelectorAll(selector).forEach(o => o.classList.remove('selected'));
    }
    if (multi) {
      el.classList.toggle('selected');
    } else {
      el.classList.add('selected');
    }
    window.selectedChoice = el.dataset.choice;
  };

  window.visualizer = {
    send: sendEvent,
    choice: (value, metadata = {}) => sendEvent({ type: 'choice', value, ...metadata })
  };

  connect();
})();
```

Write to `D:\Projects\visualizer\src\helper.js`.

- [ ] **Step 5: Implement renderer.js**

```javascript
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
```

Write to `D:\Projects\visualizer\src\renderer.js`.

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd D:/Projects/visualizer && node --test tests/renderer.test.js`
Expected: All 6 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/renderer.js src/frame-template.html src/helper.js tests/renderer.test.js
git commit -m "feat: renderer with fragment wrapping, helper.js injection, and frame template"
```

---

### Task 3: Session Manager

Manages in-memory session state. Each session tracks: id, port, screen history, event buffer, creation time.

**Files:**
- Create: `src/session-manager.js`
- Create: `tests/session-manager.test.js`

- [ ] **Step 1: Write the failing tests**

```javascript
// tests/session-manager.test.js
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');

describe('SessionManager', () => {
  let SessionManager, manager;

  beforeEach(() => {
    SessionManager = require('../src/session-manager');
    // Disable timeouts in tests to avoid flakiness
    manager = new SessionManager({ timeoutMs: 0 });
  });

  it('should create a session with a unique id', () => {
    const session = manager.create({ port: 50000, url: 'http://localhost:50000' });
    assert.ok(session.id);
    assert.strictEqual(session.port, 50000);
    assert.strictEqual(session.url, 'http://localhost:50000');
    assert.deepStrictEqual(session.events, []);
    assert.strictEqual(session.currentHtml, null);
    assert.strictEqual(session.screenIndex, 0);
    assert.ok(session.lastActivity);
  });

  it('should retrieve a session by id', () => {
    const created = manager.create({ port: 50000, url: 'http://localhost:50000' });
    const retrieved = manager.get(created.id);
    assert.strictEqual(retrieved.id, created.id);
  });

  it('should return null for unknown session id', () => {
    assert.strictEqual(manager.get('nonexistent'), null);
  });

  it('should list all sessions', () => {
    manager.create({ port: 50001, url: 'http://localhost:50001' });
    manager.create({ port: 50002, url: 'http://localhost:50002' });
    const sessions = manager.list();
    assert.strictEqual(sessions.length, 2);
  });

  it('should push a screen and increment index', () => {
    const session = manager.create({ port: 50000, url: 'http://localhost:50000' });
    manager.pushScreen(session.id, '<h2>Hello</h2>');
    const updated = manager.get(session.id);
    assert.strictEqual(updated.currentHtml, '<h2>Hello</h2>');
    assert.strictEqual(updated.screenIndex, 1);
  });

  it('should clear events when pushing a new screen', () => {
    const session = manager.create({ port: 50000, url: 'http://localhost:50000' });
    manager.addEvent(session.id, { type: 'click', choice: 'a' });
    assert.strictEqual(manager.get(session.id).events.length, 1);

    manager.pushScreen(session.id, '<h2>New</h2>');
    assert.strictEqual(manager.get(session.id).events.length, 0);
  });

  it('should add events to the session', () => {
    const session = manager.create({ port: 50000, url: 'http://localhost:50000' });
    manager.addEvent(session.id, { type: 'click', choice: 'a' });
    manager.addEvent(session.id, { type: 'click', choice: 'b' });
    assert.strictEqual(manager.get(session.id).events.length, 2);
  });

  it('should get events since a timestamp', () => {
    const session = manager.create({ port: 50000, url: 'http://localhost:50000' });
    const now = Date.now();
    manager.addEvent(session.id, { type: 'click', choice: 'a', timestamp: now - 1000 });
    manager.addEvent(session.id, { type: 'click', choice: 'b', timestamp: now + 1000 });
    const recent = manager.getEvents(session.id, now);
    assert.strictEqual(recent.length, 1);
    assert.strictEqual(recent[0].choice, 'b');
  });

  it('should clear events after read when clear flag is set', () => {
    const session = manager.create({ port: 50000, url: 'http://localhost:50000' });
    manager.addEvent(session.id, { type: 'click', choice: 'a' });
    manager.addEvent(session.id, { type: 'click', choice: 'b' });

    const events = manager.getEvents(session.id, undefined, true);
    assert.strictEqual(events.length, 2);

    const again = manager.getEvents(session.id);
    assert.strictEqual(again.length, 0, 'events should be cleared after read');
  });

  it('should update session fields via update()', () => {
    const session = manager.create({ port: 0, url: '' });
    manager.update(session.id, { port: 54321, url: 'http://localhost:54321' });
    const updated = manager.get(session.id);
    assert.strictEqual(updated.port, 54321);
    assert.strictEqual(updated.url, 'http://localhost:54321');
  });

  it('should enforce max concurrent sessions', () => {
    const m = new SessionManager({ timeoutMs: 0, maxSessions: 2 });
    m.create({ port: 1, url: '' });
    m.create({ port: 2, url: '' });
    assert.throws(() => m.create({ port: 3, url: '' }), /Maximum 2/);
  });

  it('should auto-destroy session after timeout', async () => {
    let timedOutId = null;
    const m = new SessionManager({
      timeoutMs: 50,
      onTimeout: (id) => { timedOutId = id; }
    });
    const session = m.create({ port: 50000, url: '' });

    await new Promise(resolve => setTimeout(resolve, 100));

    assert.strictEqual(m.get(session.id), null, 'session should be destroyed');
    assert.strictEqual(timedOutId, session.id, 'onTimeout callback should fire');
  });

  it('should destroy a session', () => {
    const session = manager.create({ port: 50000, url: 'http://localhost:50000' });
    manager.destroy(session.id);
    assert.strictEqual(manager.get(session.id), null);
    assert.strictEqual(manager.list().length, 0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd D:/Projects/visualizer && node --test tests/session-manager.test.js`
Expected: FAIL — `Cannot find module '../src/session-manager'`

- [ ] **Step 3: Implement session-manager.js**

```javascript
// src/session-manager.js
const crypto = require('crypto');

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const MAX_SESSIONS = 5;

class SessionManager {
  /**
   * @param {{ timeoutMs?: number, maxSessions?: number, onTimeout?: (id: string) => void }} [opts]
   */
  constructor(opts = {}) {
    /** @type {Map<string, Session>} */
    this.sessions = new Map();
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxSessions = opts.maxSessions ?? MAX_SESSIONS;
    this.onTimeout = opts.onTimeout || null;
    /** @type {Map<string, NodeJS.Timeout>} */
    this._timers = new Map();
  }

  /** Reset the inactivity timer for a session. */
  _touch(id) {
    const session = this.sessions.get(id);
    if (session) session.lastActivity = Date.now();

    // Clear existing timer
    const existing = this._timers.get(id);
    if (existing) clearTimeout(existing);

    // Set new timer
    if (this.timeoutMs > 0) {
      const timer = setTimeout(() => {
        if (this.onTimeout) this.onTimeout(id);
        this.destroy(id);
      }, this.timeoutMs);
      timer.unref(); // Don't block process exit
      this._timers.set(id, timer);
    }
  }

  /**
   * Create a new session.
   * @param {{ port: number, url: string }} opts
   * @returns {Session}
   */
  create({ port, url }) {
    if (this.sessions.size >= this.maxSessions) {
      throw new Error(`Maximum ${this.maxSessions} concurrent sessions. Close one first.`);
    }

    const id = crypto.randomBytes(8).toString('hex');
    const session = {
      id,
      port,
      url,
      events: [],
      currentHtml: null,
      screenIndex: 0,
      createdAt: Date.now(),
      lastActivity: Date.now(),
    };
    this.sessions.set(id, session);
    this._touch(id);
    return session;
  }

  /** @param {string} id */
  get(id) {
    return this.sessions.get(id) || null;
  }

  /**
   * Update session fields.
   * @param {string} id
   * @param {object} fields
   */
  update(id, fields) {
    const session = this.sessions.get(id);
    if (!session) throw new Error(`Session ${id} not found`);
    Object.assign(session, fields);
  }

  list() {
    return Array.from(this.sessions.values()).map(s => ({
      id: s.id,
      port: s.port,
      url: s.url,
      screenIndex: s.screenIndex,
      eventCount: s.events.length,
      createdAt: s.createdAt,
      lastActivity: s.lastActivity,
    }));
  }

  /**
   * Push a new screen to the session. Clears events.
   * @param {string} id
   * @param {string} html
   */
  pushScreen(id, html) {
    const session = this.sessions.get(id);
    if (!session) throw new Error(`Session ${id} not found`);
    session.currentHtml = html;
    session.screenIndex++;
    session.events = [];
    this._touch(id);
  }

  /**
   * Add a user interaction event.
   * @param {string} id
   * @param {object} event
   */
  addEvent(id, event) {
    const session = this.sessions.get(id);
    if (!session) return;
    session.events.push(event);
    this._touch(id);
  }

  /**
   * Get events, optionally filtered by timestamp.
   * @param {string} id
   * @param {number} [since]
   * @param {boolean} [clear=false] - Clear returned events after reading
   * @returns {object[]}
   */
  getEvents(id, since, clear = false) {
    const session = this.sessions.get(id);
    if (!session) return [];
    let events;
    if (since) {
      events = session.events.filter(e => e.timestamp > since);
      if (clear) {
        session.events = session.events.filter(e => e.timestamp <= since);
      }
    } else {
      events = [...session.events];
      if (clear) {
        session.events = [];
      }
    }
    return events;
  }

  /** @param {string} id */
  destroy(id) {
    const timer = this._timers.get(id);
    if (timer) {
      clearTimeout(timer);
      this._timers.delete(id);
    }
    this.sessions.delete(id);
  }
}

module.exports = SessionManager;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd D:/Projects/visualizer && node --test tests/session-manager.test.js`
Expected: All 13 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/session-manager.js tests/session-manager.test.js
git commit -m "feat: session manager with event tracking and screen history"
```

---

### Task 4: HTTP + WebSocket Server

Factory function that creates an Express app + WebSocket server for a session. Serves the current screen HTML, relays user events to the session manager.

**Files:**
- Create: `src/http-server.js`
- Create: `tests/http-server.test.js`

- [ ] **Step 1: Write the failing tests**

```javascript
// tests/http-server.test.js
const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const WebSocket = require('ws');

describe('HTTP Server', () => {
  let createHttpServer, SessionManager, manager, serverInfo;
  const servers = [];

  afterEach(() => {
    servers.forEach(s => { try { s.close(); } catch(e) {} });
    servers.length = 0;
  });

  function startServer(sessionId) {
    return new Promise((resolve) => {
      const { server } = createHttpServer(manager, sessionId);
      server.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        servers.push(server);
        resolve({ server, port });
      });
    });
  }

  function httpGet(port, path = '/') {
    return new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}${path}`, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      }).on('error', reject);
    });
  }

  it('should load modules', () => {
    createHttpServer = require('../src/http-server');
    SessionManager = require('../src/session-manager');
    manager = new SessionManager({ timeoutMs: 0 });
  });

  it('should serve waiting page when no screen pushed', async () => {
    createHttpServer = require('../src/http-server');
    SessionManager = require('../src/session-manager');
    manager = new SessionManager({ timeoutMs: 0 });
    const session = manager.create({ port: 0, url: '' });
    const { port } = await startServer(session.id);

    const { body } = await httpGet(port);
    assert.ok(body.includes('Waiting'), 'should show waiting message');
    assert.ok(body.includes('window.visualizer'), 'should inject helper.js');
  });

  it('should serve current screen after push', async () => {
    createHttpServer = require('../src/http-server');
    SessionManager = require('../src/session-manager');
    manager = new SessionManager({ timeoutMs: 0 });
    const session = manager.create({ port: 0, url: '' });
    manager.pushScreen(session.id, '<h2>My Visualization</h2>');
    const { port } = await startServer(session.id);

    const { body } = await httpGet(port);
    assert.ok(body.includes('<h2>My Visualization</h2>'));
    assert.ok(body.includes('window.visualizer'));
  });

  it('should relay WebSocket events to session manager', async () => {
    createHttpServer = require('../src/http-server');
    SessionManager = require('../src/session-manager');
    manager = new SessionManager({ timeoutMs: 0 });
    const session = manager.create({ port: 0, url: '' });
    const { port, server } = await startServer(session.id);

    await new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}`);
      ws.on('open', () => {
        ws.send(JSON.stringify({ type: 'click', choice: 'a', text: 'Option A' }));
        setTimeout(() => {
          ws.close();
          resolve();
        }, 100);
      });
      ws.on('error', reject);
    });

    const events = manager.getEvents(session.id);
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].choice, 'a');
  });

  it('should broadcast reload to connected clients', async () => {
    createHttpServer = require('../src/http-server');
    SessionManager = require('../src/session-manager');
    manager = new SessionManager({ timeoutMs: 0 });
    const session = manager.create({ port: 0, url: '' });
    const { port, server } = await startServer(session.id);
    const { broadcastReload } = createHttpServer._getServerState(server);

    const reloadReceived = new Promise((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}`);
      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'reload') {
          ws.close();
          resolve(true);
        }
      });
      ws.on('open', () => {
        // Trigger a reload after connection
        setTimeout(() => broadcastReload(), 50);
      });
    });

    const result = await reloadReceived;
    assert.strictEqual(result, true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd D:/Projects/visualizer && node --test tests/http-server.test.js`
Expected: FAIL — `Cannot find module '../src/http-server'`

- [ ] **Step 3: Implement http-server.js**

```javascript
// src/http-server.js
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { render } = require('./renderer');

// Fragment — goes through the frame template for proper light/dark theming
const WAITING_PAGE = `<div style="display:flex;align-items:center;justify-content:center;min-height:60vh">
  <p class="subtitle">Waiting for Claude to push a visualization...</p>
</div>`;

/** @type {WeakMap<http.Server, { wss: WebSocket.Server, broadcastReload: () => void }>} */
const serverStates = new WeakMap();

/**
 * Create an HTTP + WebSocket server for a session.
 * @param {import('./session-manager')} manager
 * @param {string} sessionId
 * @returns {{ server: http.Server, app: express.Application }}
 */
function createHttpServer(manager, sessionId) {
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocket.Server({ server });
  const clients = new Set();

  wss.on('connection', (ws) => {
    clients.add(ws);
    ws.on('close', () => clients.delete(ws));

    ws.on('message', (data) => {
      try {
        const event = JSON.parse(data.toString());
        manager.addEvent(sessionId, event);
      } catch (e) {
        // Ignore malformed messages
      }
    });
  });

  function broadcastReload() {
    const msg = JSON.stringify({ type: 'reload' });
    clients.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(msg);
      }
    });
  }

  serverStates.set(server, { wss, broadcastReload });

  app.get('/', (req, res) => {
    const session = manager.get(sessionId);
    const html = session && session.currentHtml
      ? render(session.currentHtml)
      : render(WAITING_PAGE);
    res.type('html').send(html);
  });

  return { server, app, broadcastReload };
}

// Expose for testing
createHttpServer._getServerState = (server) => serverStates.get(server);

module.exports = createHttpServer;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd D:/Projects/visualizer && node --test tests/http-server.test.js`
Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/http-server.js tests/http-server.test.js
git commit -m "feat: HTTP + WebSocket server with screen serving and event relay"
```

---

## Chunk 2: MCP Integration

### Task 5: MCP Server with Tool Definitions

The core MCP server that exposes 5 tools via stdio transport. This is the main entry point that Claude Code communicates with.

**Files:**
- Create: `src/mcp-server.js`
- Create: `src/index.js`
- Create: `tests/mcp-tools.test.js`

- [ ] **Step 1: Write the failing tests**

```javascript
// tests/mcp-tools.test.js
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const http = require('http');

describe('MCP Tools', () => {
  let createMcpTools, SessionManager, manager, tools;
  const serversToClose = [];

  beforeEach(() => {
    SessionManager = require('../src/session-manager');
    createMcpTools = require('../src/mcp-server');
    manager = new SessionManager({ timeoutMs: 0 });
    tools = createMcpTools(manager);
  });

  afterEach(async () => {
    // Close all sessions / servers
    for (const s of manager.list()) {
      try { await tools.close_session({ session_id: s.id }); } catch(e) {}
    }
    serversToClose.forEach(s => { try { s.close(); } catch(e) {} });
    serversToClose.length = 0;
  });

  it('should export tool handler functions', () => {
    assert.ok(tools.launch_session);
    assert.ok(tools.push_screen);
    assert.ok(tools.get_events);
    assert.ok(tools.list_sessions);
    assert.ok(tools.close_session);
  });

  it('launch_session should return session info with URL', async () => {
    const result = await tools.launch_session();
    assert.ok(result.session_id);
    assert.ok(result.url);
    assert.ok(result.port);
    assert.ok(result.url.startsWith('http://'));
  });

  it('push_screen should update the session and return screen index', async () => {
    const { session_id } = await tools.launch_session();
    const result = await tools.push_screen({
      session_id,
      html: '<h2>Test Viz</h2>'
    });
    assert.strictEqual(result.pushed, true);
    assert.strictEqual(result.screen_index, 1);

    const session = manager.get(session_id);
    assert.strictEqual(session.currentHtml, '<h2>Test Viz</h2>');
  });

  it('get_events should return empty array when no interactions', async () => {
    const { session_id } = await tools.launch_session();
    const result = await tools.get_events({ session_id });
    assert.deepStrictEqual(result.events, []);
  });

  it('list_sessions should return all active sessions', async () => {
    await tools.launch_session();
    await tools.launch_session();
    const result = await tools.list_sessions({});
    assert.strictEqual(result.sessions.length, 2);
  });

  it('close_session should remove the session', async () => {
    const { session_id } = await tools.launch_session();
    const result = await tools.close_session({ session_id });
    assert.strictEqual(result.closed, true);
    assert.strictEqual(manager.get(session_id), null);
  });

  it('get_events with clear should consume events', async () => {
    const { session_id } = await tools.launch_session();
    manager.addEvent(session_id, { type: 'click', choice: 'a', timestamp: Date.now() });

    const first = await tools.get_events({ session_id, clear: true });
    assert.strictEqual(first.events.length, 1);

    const second = await tools.get_events({ session_id });
    assert.strictEqual(second.events.length, 0, 'events should be consumed');
  });

  it('push_screen should error for invalid session', async () => {
    await assert.rejects(
      () => tools.push_screen({ session_id: 'bad', html: '<p>hi</p>' }),
      /not found/
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd D:/Projects/visualizer && node --test tests/mcp-tools.test.js`
Expected: FAIL — `Cannot find module '../src/mcp-server'`

- [ ] **Step 3: Implement mcp-server.js**

This module exports a factory function that creates tool handlers. The tool handlers are plain async functions that can be tested independently. The MCP SDK wiring happens in `index.js`.

```javascript
// src/mcp-server.js
const createHttpServer = require('./http-server');

/**
 * @param {import('./session-manager')} manager
 * @returns {Record<string, (args: any) => Promise<any>>}
 */
function createMcpTools(manager) {
  /** @type {Map<string, { server: import('http').Server, broadcastReload: () => void }>} */
  const httpServers = new Map();

  // Wire session timeout to close HTTP servers automatically
  manager.onTimeout = (id) => {
    const httpState = httpServers.get(id);
    if (httpState) {
      httpState.server.close();
      httpServers.delete(id);
    }
  };

  return {
    async launch_session() {
      const host = '127.0.0.1';

      // Create session with placeholder port (updated after bind)
      const session = manager.create({ port: 0, url: '' });
      const { server, broadcastReload } = createHttpServer(manager, session.id);

      try {
        const port = await new Promise((resolve, reject) => {
          server.listen(0, host, () => resolve(server.address().port));
          server.on('error', reject);
        });

        const url = `http://localhost:${port}`;
        manager.update(session.id, { port, url });

        httpServers.set(session.id, { server, broadcastReload });
        return { session_id: session.id, url, port };
      } catch (err) {
        manager.destroy(session.id);
        server.close();
        throw err;
      }
    },

    async push_screen({ session_id, html }) {
      const session = manager.get(session_id);
      if (!session) throw new Error(`Session ${session_id} not found`);

      manager.pushScreen(session_id, html);

      const httpState = httpServers.get(session_id);
      if (httpState) {
        httpState.broadcastReload();
      }

      return { pushed: true, screen_index: session.screenIndex };
    },

    async get_events({ session_id, since, clear }) {
      const session = manager.get(session_id);
      if (!session) throw new Error(`Session ${session_id} not found`);

      return { events: manager.getEvents(session_id, since, clear) };
    },

    async list_sessions() {
      return { sessions: manager.list() };
    },

    async close_session({ session_id }) {
      const httpState = httpServers.get(session_id);
      if (httpState) {
        await new Promise(resolve => httpState.server.close(resolve));
        httpServers.delete(session_id);
      }
      manager.destroy(session_id);
      return { closed: true };
    }
  };
}

module.exports = createMcpTools;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd D:/Projects/visualizer && node --test tests/mcp-tools.test.js`
Expected: All 8 tests PASS.

- [ ] **Step 5: Implement index.js — MCP stdio entry point**

This wires the tool handlers to the MCP SDK's `Server` class and starts the stdio transport.

```javascript
// src/index.js
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');
const SessionManager = require('./session-manager');
const createMcpTools = require('./mcp-server');

const manager = new SessionManager({
  timeoutMs: 30 * 60 * 1000, // 30 min inactivity timeout
  maxSessions: 5,
});
const tools = createMcpTools(manager);

const server = new McpServer({
  name: 'visualizer',
  version: '0.1.0',
});

server.tool(
  'launch_session',
  'Start a visualization session. Opens an HTTP server and returns a URL for the browser. Sessions are ephemeral — they live only as long as this MCP server process.',
  {},
  async () => ({
    content: [{ type: 'text', text: JSON.stringify(await tools.launch_session()) }]
  })
);

server.tool(
  'push_screen',
  'Push HTML content to the browser. Fragments are auto-wrapped in a themed frame. Full documents (starting with <!DOCTYPE or <html) are served as-is. Clears previous user events.',
  {
    session_id: z.string().describe('Session ID from launch_session'),
    html: z.string().describe('HTML content — fragment or full document')
  },
  async (args) => ({
    content: [{ type: 'text', text: JSON.stringify(await tools.push_screen(args)) }]
  })
);

server.tool(
  'get_events',
  'Read user interactions from the browser (clicks on [data-choice] elements). Returns events since last screen push, or since a given timestamp. Use clear=true to consume events so they are not returned again.',
  {
    session_id: z.string().describe('Session ID'),
    since: z.number().optional().describe('Only return events after this Unix timestamp (ms)'),
    clear: z.boolean().optional().describe('Clear returned events after reading (default: false)')
  },
  async (args) => ({
    content: [{ type: 'text', text: JSON.stringify(await tools.get_events(args)) }]
  })
);

server.tool(
  'list_sessions',
  'List all active visualization sessions with their URLs and status.',
  {},
  async () => ({
    content: [{ type: 'text', text: JSON.stringify(await tools.list_sessions()) }]
  })
);

server.tool(
  'close_session',
  'Stop a visualization session and clean up its HTTP server.',
  { session_id: z.string().describe('Session ID to close') },
  async (args) => ({
    content: [{ type: 'text', text: JSON.stringify(await tools.close_session(args)) }]
  })
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
```

- [ ] **Step 6: Verify CommonJS require of MCP SDK works**

Run: `cd D:/Projects/visualizer && node -e "require('@modelcontextprotocol/sdk/server/mcp.js'); require('@modelcontextprotocol/sdk/server/stdio.js'); console.log('CJS OK')"`
Expected: prints `CJS OK`.

If this fails with `ERR_REQUIRE_ESM`, the SDK doesn't ship CJS builds. In that case:
1. Add `"type": "module"` to `package.json`
2. Convert all `require()` to `import` and `module.exports` to `export`
3. Convert all test files from `require` to `import`
4. Re-run all tests

- [ ] **Step 7: Verify the MCP server starts without errors**

Run: `cd D:/Projects/visualizer && echo '{}' | timeout 3 node src/index.js 2>&1 || true`
Expected: No crash, process exits cleanly after timeout (it's waiting for stdio input).

- [ ] **Step 8: Commit**

```bash
git add src/mcp-server.js src/index.js tests/mcp-tools.test.js
git commit -m "feat: MCP server with 5 tools — launch, push, get_events, list, close"
```

---

### Task 6: End-to-End Integration Test

A test that spins up the full MCP server, launches a session, pushes content, simulates a browser connecting via WebSocket, makes a selection, and reads events back.

**Files:**
- Create: `tests/integration.test.js`

- [ ] **Step 1: Write the integration test**

```javascript
// tests/integration.test.js
const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const WebSocket = require('ws');

describe('End-to-end integration', () => {
  const SessionManager = require('../src/session-manager');
  const createMcpTools = require('../src/mcp-server');
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
});
```

- [ ] **Step 2: Run the integration test**

Run: `cd D:/Projects/visualizer && node --test tests/integration.test.js`
Expected: PASS.

- [ ] **Step 3: Run all tests together**

Run: `cd D:/Projects/visualizer && node --test tests/*.test.js`
Expected: All tests PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/integration.test.js
git commit -m "test: end-to-end integration test for full visualization workflow"
```

---

## Chunk 3: Skill Layer and Templates

### Task 7: Visualizer Skill

The skill document that teaches Claude how to generate good visualizations using the MCP tools. This is what transforms a generic LLM into a visualization-generating agent.

**Files:**
- Create: `skills/visualizer/SKILL.md`

- [ ] **Step 1: Write SKILL.md**

```markdown
---
name: visualizer
description: Create interactive HTML visualizations in a browser window — architecture diagrams, UI mockups, comparisons, concept maps, flowcharts, and dashboards. Use when the user asks to visualize, diagram, mock up, explore, or compare things visually.
---

# Visualizer

Push interactive HTML visualizations to a browser window. The user sees rich visual content — diagrams, mockups, comparisons — while continuing to work in the terminal.

## When to Use

When the user asks to **see** something, not just read about it:

- Architecture diagrams, system maps, data flows
- UI mockups, wireframes, component designs
- Side-by-side comparisons of options
- Concept maps, relationship graphs
- Process flowcharts, state machines
- Dashboards, metric displays

**Don't use** for pure text/tabular content — keep that in the terminal.

## Quick Start

1. Call `launch_session` to start the server
2. Tell the user to open the URL in their browser
3. Call `push_screen` with HTML content
4. Tell the user what's on screen, ask them to interact
5. On next turn, call `get_events` to read their clicks
6. Iterate until done
7. Call `close_session` when finished

## Writing HTML Content

**Write fragments by default.** The server auto-wraps them in a themed frame with dark/light mode, header, indicator bar, and all CSS classes.

Only write full `<!DOCTYPE html>` documents when you need complete page control (e.g., canvas-based diagrams, custom layouts).

### Minimal Example

```html
<h2>Which architecture fits?</h2>
<p class="subtitle">Consider scalability and team familiarity</p>

<div class="options">
  <div class="option" data-choice="monolith" onclick="toggleSelect(this)">
    <div class="letter">A</div>
    <div class="content">
      <h3>Monolith</h3>
      <p>Single deployable, shared database</p>
    </div>
  </div>
  <div class="option" data-choice="microservices" onclick="toggleSelect(this)">
    <div class="letter">B</div>
    <div class="content">
      <h3>Microservices</h3>
      <p>Independent services, event-driven</p>
    </div>
  </div>
</div>
```

### Available CSS Classes

**Options** (A/B/C choices): `.options` > `.option[data-choice]` with `.letter` + `.content`
**Cards** (visual grid): `.cards` > `.card[data-choice]` with `.card-image` + `.card-body`
**Mockup**: `.mockup` > `.mockup-header` + `.mockup-body`
**Split view**: `.split` (side-by-side grid, collapses on mobile)
**Pros/Cons**: `.pros-cons` > `.pros` + `.cons` with `<h4>` + `<ul>`
**Mock elements**: `.mock-nav`, `.mock-sidebar`, `.mock-content`, `.mock-button`, `.mock-input`, `.placeholder`
**Typography**: `h2` (title), `h3` (section), `.subtitle`, `.section`, `.label`

**Multi-select:** Add `data-multiselect` to the `.options` or `.cards` container.

### Interactivity

Add `data-choice="value"` and `onclick="toggleSelect(this)"` to any clickable element. User clicks are captured and returned by `get_events`.

For custom interactivity beyond click selection, use the `window.visualizer` API:
- `window.visualizer.send(event)` — send any event object to the server
- `window.visualizer.choice(value, metadata)` — send a choice event

### Full Documents

When writing full HTML documents (for canvas, SVG, or custom layouts), `helper.js` is still auto-injected. You get WebSocket auto-reload and the `window.visualizer` API without any setup.

## Reading User Events

Call `get_events` with `clear: true` after the user responds in the terminal. This returns events and removes them so they won't be re-read on subsequent calls.

```json
{"events": [
  {"type": "click", "choice": "microservices", "text": "Microservices...", "timestamp": 1706000101}
]}
```

Merge events with the user's terminal text. The terminal message is primary; events provide structured data.

**Important:** Without `clear: true`, the same events are returned on every call until a new screen is pushed. Use `clear: true` for normal operation. Omit it only if you need to peek at events without consuming them.

## Template Reference

Load a template from `templates/` to guide your HTML generation for specific visualization types:

| Template | Use For |
|----------|---------|
| `architecture.md` | System components, service diagrams, layer maps |
| `comparison.md` | Side-by-side design/approach comparisons |
| `concept-map.md` | Learning maps, knowledge graphs, scope mapping |
| `data-explorer.md` | Data queries, pipeline builders, schema explorers |
| `flowchart.md` | Process flows, state machines, decision trees |
| `dashboard.md` | Metric displays, KPI layouts, status boards |

## Session Lifecycle

- Sessions are **ephemeral** — they live only as long as the MCP server process. When the conversation ends, all sessions and their HTTP servers are destroyed.
- Sessions **auto-close after 30 minutes of inactivity** (no push_screen, get_events, or browser interaction). The browser will show "Reconnecting..." when this happens.
- Maximum **5 concurrent sessions**. Close unused sessions to free slots.
- Always call `close_session` when you're done to free the port immediately.
- If the user says "continue where we left off," you must start a fresh session — there is no persistence.

## Design Principles

- **Scale fidelity to the question** — wireframes for layout, polish for style questions
- **2-4 options max** per screen
- **Explain the question on each page** — "Which layout feels more professional?" not "Pick one"
- **Iterate before advancing** — if feedback changes current screen, push a new version
```

Write to `D:\Projects\visualizer\skills\visualizer\SKILL.md`.

- [ ] **Step 2: Commit**

```bash
git add skills/visualizer/SKILL.md
git commit -m "feat: visualizer skill with template reference and usage guide"
```

---

### Task 8: Visualization Templates

Adapt the 6 playground templates for the visualizer's MCP-based architecture. Key difference: instead of generating self-contained HTML files with inline state management, these templates guide Claude to generate HTML fragments that use the frame template's CSS classes and the `data-choice` interaction pattern.

**Files:**
- Create: `skills/visualizer/templates/architecture.md`
- Create: `skills/visualizer/templates/comparison.md`
- Create: `skills/visualizer/templates/concept-map.md`
- Create: `skills/visualizer/templates/data-explorer.md`
- Create: `skills/visualizer/templates/flowchart.md`
- Create: `skills/visualizer/templates/dashboard.md`

- [ ] **Step 1: Write architecture.md**

Adapted from playground's `code-map.md`. Focus on SVG-based system diagrams with clickable nodes.

```markdown
# Architecture Diagram Template

For system architecture, service maps, component relationships, and layer diagrams.

## Layout

Use SVG for the diagram area. Organize nodes in horizontal bands by layer:

```
┌─────────────────────────────────────────────┐
│  h2: Title                                  │
│  .subtitle: Description                     │
├─────────────────────────────────────────────┤
│                                             │
│  <svg> diagram area                         │
│    ┌─────┐     ┌─────┐     ┌─────┐         │
│    │ API │────→│Cache│────→│ DB  │         │
│    └─────┘     └─────┘     └─────┘         │
│                                             │
├─────────────────────────────────────────────┤
│  Comment/annotation area (optional)         │
└─────────────────────────────────────────────┘
```

## SVG Patterns

### Nodes (rounded rectangles)
```html
<rect x="50" y="30" width="120" height="50" rx="8"
      fill="#dbeafe" stroke="#3b82f6" stroke-width="1.5"
      data-choice="api-gateway" onclick="toggleSelect(this)"
      style="cursor: pointer;" />
<text x="110" y="60" text-anchor="middle" font-size="13"
      fill="#1e3a5f" font-family="system-ui">API Gateway</text>
```

### Connections (curved paths)
```html
<path d="M170,55 C200,55 210,55 240,55"
      fill="none" stroke="#94a3b8" stroke-width="1.5"
      marker-end="url(#arrow)" />
```

### Arrow marker definition
```html
<defs>
  <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5"
          markerWidth="6" markerHeight="6" orient="auto-start-reverse">
    <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
  </marker>
</defs>
```

### Layer color palette
| Layer | Fill | Stroke | Text |
|-------|------|--------|------|
| Client/UI | `#dbeafe` | `#3b82f6` | `#1e3a5f` |
| Server/API | `#fef3c7` | `#f59e0b` | `#78350f` |
| Data/Storage | `#dcfce7` | `#22c55e` | `#14532d` |
| External | `#fce7f3` | `#ec4899` | `#831843` |
| Infrastructure | `#f3e8ff` | `#a855f7` | `#581c87` |

### Connection types
| Type | Color | Style |
|------|-------|-------|
| Data flow | `#3b82f6` | Solid |
| API call | `#22c55e` | Solid |
| Event/async | `#f59e0b` | Dashed (`stroke-dasharray="5,5"`) |
| Dependency | `#94a3b8` | Dotted (`stroke-dasharray="2,4"`) |

## Interaction

Make nodes clickable with `data-choice` to let the user select components they want to discuss or modify. Use the selection to drive follow-up questions.

## Full Document Note

Architecture diagrams should be written as **full HTML documents** (starting with `<!DOCTYPE html>`) since they need precise SVG positioning. The helper.js is still auto-injected.
```

Write to `D:\Projects\visualizer\skills\visualizer\templates\architecture.md`.

- [ ] **Step 2: Write comparison.md**

```markdown
# Comparison Template

For side-by-side comparisons of designs, approaches, configurations, or options.

## Layout

```
┌──────────────────────────────────────────────┐
│  h2: "Which approach works better?"          │
│  .subtitle: Context for the decision         │
├──────────────────┬───────────────────────────┤
│  .split          │                           │
│  ┌────────────┐  │  ┌────────────┐           │
│  │ .mockup    │  │  │ .mockup    │           │
│  │ Option A   │  │  │ Option B   │           │
│  │            │  │  │            │           │
│  └────────────┘  │  └────────────┘           │
├──────────────────┴───────────────────────────┤
│  .pros-cons per option (optional)            │
├──────────────────────────────────────────────┤
│  .options for final selection                │
└──────────────────────────────────────────────┘
```

## Pattern

```html
<h2>Which layout structure works better?</h2>
<p class="subtitle">Consider content density and navigation clarity</p>

<div class="split">
  <div>
    <div class="mockup" data-choice="sidebar" onclick="toggleSelect(this)">
      <div class="mockup-header">Option A: Sidebar Navigation</div>
      <div class="mockup-body">
        <div style="display:flex; min-height:200px;">
          <div class="mock-sidebar">
            <div class="label">Navigation</div>
            <p style="font-size:0.8rem; color:var(--text-secondary)">Dashboard<br>Reports<br>Settings</p>
          </div>
          <div class="mock-content">
            <div class="placeholder">Main content area</div>
          </div>
        </div>
      </div>
    </div>
    <div class="pros-cons">
      <div class="pros"><h4>Pros</h4><ul><li>Always visible nav</li><li>Scales to many items</li></ul></div>
      <div class="cons"><h4>Cons</h4><ul><li>Takes horizontal space</li></ul></div>
    </div>
  </div>

  <div>
    <div class="mockup" data-choice="topnav" onclick="toggleSelect(this)">
      <div class="mockup-header">Option B: Top Navigation</div>
      <div class="mockup-body">
        <div class="mock-nav">Dashboard | Reports | Settings</div>
        <div class="mock-content" style="min-height:200px;">
          <div class="placeholder">Full-width content area</div>
        </div>
      </div>
    </div>
    <div class="pros-cons">
      <div class="pros"><h4>Pros</h4><ul><li>Full content width</li><li>Familiar pattern</li></ul></div>
      <div class="cons"><h4>Cons</h4><ul><li>Limited nav items</li></ul></div>
    </div>
  </div>
</div>
```

## Tips

- Show the SAME content in both options so the user compares structure, not content
- Include pros/cons only when the tradeoffs aren't visually obvious
- For more than 2 options, use `.cards` instead of `.split`
```

Write to `D:\Projects\visualizer\skills\visualizer\templates\comparison.md`.

- [ ] **Step 3: Write concept-map.md**

```markdown
# Concept Map Template

For knowledge graphs, learning maps, scope visualization, and relationship exploration.

## Approach

Use a **full HTML document** with `<canvas>` for the interactive concept map. Nodes are draggable, edges connect related concepts.

## Key Features

- Draggable nodes with labels
- Edges drawn as curved lines between nodes
- Click to select a node (fires `data-choice` event via `window.visualizer`)
- Force-directed auto-layout on initial render
- Color-coding by category or knowledge level

## Canvas Pattern

```javascript
const canvas = document.getElementById('map');
const ctx = canvas.getContext('2d');

const nodes = [
  { id: 'auth', label: 'Authentication', x: 200, y: 150, category: 'security' },
  { id: 'db', label: 'Database', x: 400, y: 200, category: 'data' },
  // ...
];

const edges = [
  { from: 'auth', to: 'db', label: 'queries' },
  // ...
];

// Category colors
const COLORS = {
  security: { fill: '#fef3c7', stroke: '#f59e0b', text: '#78350f' },
  data: { fill: '#dcfce7', stroke: '#22c55e', text: '#14532d' },
  ui: { fill: '#dbeafe', stroke: '#3b82f6', text: '#1e3a5f' },
  infra: { fill: '#f3e8ff', stroke: '#a855f7', text: '#581c87' },
};
```

## Interaction

Use `window.visualizer.choice(nodeId, { label })` when a node is clicked, so Claude can read which concept the user selected.

## Sidebar Controls

Add a sidebar with knowledge-level toggles:
- Know (green) / Fuzzy (amber) / Unknown (red) per concept
- This helps Claude understand what to explain vs. skip
```

Write to `D:\Projects\visualizer\skills\visualizer\templates\concept-map.md`.

- [ ] **Step 4: Write remaining templates (data-explorer.md, flowchart.md, dashboard.md)**

The implementing agent should generate these three templates using `architecture.md`, `comparison.md`, and `concept-map.md` as structural reference examples. Each template MUST follow the same format:

1. Title and purpose description
2. ASCII art layout diagram
3. Complete HTML/CSS code example using the frame template CSS classes
4. Interaction guidance (which elements get `data-choice`, how to use `window.visualizer`)
5. Tips specific to that visualization type

Additionally, reference the playground plugin's matching templates for domain-specific patterns:
- `data-explorer.md` — Reference `C:\Users\sdoherty\.claude\plugins\cache\claude-plugins-official\playground\b36fd4b75301\skills\playground\templates\data-explorer.md` for query builder patterns (clickable chips, filter rows, syntax-highlighted output)
- `flowchart.md` — New template. Use SVG with connected nodes, conditional diamond shapes, and dashed/solid connection lines. Nodes should be clickable with `data-choice`.
- `dashboard.md` — New template. Use `.cards` grid for metric tiles, inline SVG for sparklines, color-coded status indicators using theme variables.

Write each to `D:\Projects\visualizer\skills\visualizer\templates/`.

- [ ] **Step 5: Commit**

```bash
git add skills/visualizer/templates/
git commit -m "feat: 6 visualization templates — architecture, comparison, concept-map, data-explorer, flowchart, dashboard"
```

---

### Task 9: Helper.js Tests

Verify the browser-side JavaScript API surface and behavior.

**Files:**
- Create: `tests/helper.test.js`

- [ ] **Step 1: Write tests**

```javascript
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
    assert.ok(helperSource.includes('window.visualizer.send'), 'should expose send method');
    assert.ok(helperSource.includes('window.visualizer.choice'), 'should expose choice method');
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
```

- [ ] **Step 2: Run tests**

Run: `cd D:/Projects/visualizer && node --test tests/helper.test.js`
Expected: All 7 tests PASS.

- [ ] **Step 3: Run full test suite**

Run: `cd D:/Projects/visualizer && node --test tests/*.test.js`
Expected: All tests PASS across all test files.

- [ ] **Step 4: Commit**

```bash
git add tests/helper.test.js
git commit -m "test: helper.js API surface verification"
```

---

## Chunk 4: Polish and Distribution

### Task 10: Final Polish

**Files:**
- Modify: `package.json` (add `"type"` field if needed, verify scripts)
- Create: `.gitignore`

- [ ] **Step 1: Verify .gitignore is complete**

Ensure `.gitignore` contains:
```
node_modules/
.superpowers/
*.log
```

- [ ] **Step 2: Run full test suite one final time**

Run: `cd D:/Projects/visualizer && node --test tests/*.test.js`
Expected: All tests PASS.

- [ ] **Step 3: Test MCP server startup manually**

Run: `cd D:/Projects/visualizer && echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"capabilities":{},"clientInfo":{"name":"test","version":"1.0"},"protocolVersion":"2025-03-26"}}' | node src/index.js 2>/dev/null | head -1`
Expected: JSON response with server info (name: "visualizer", version: "0.1.0") and protocolVersion. Tools are listed via a separate `tools/list` request, not in the initialize response.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: final polish — gitignore, verify test suite"
```

---

### Task 11: Install as Claude Code Plugin

- [ ] **Step 1: Install the plugin**

Run: `claude plugin add D:/Projects/visualizer`

Or if installing from a local path isn't directly supported, add to `~/.claude/plugins/installed_plugins.json` with the path.

- [ ] **Step 2: Test in a new Claude Code session**

Start a new conversation and ask Claude to create a visualization. Verify:
- `launch_session` tool is available
- Server starts and returns a URL
- Browser shows the waiting page
- `push_screen` renders content
- Clicks in the browser appear in `get_events`
- `close_session` cleans up

---

## Summary

| Chunk | Tasks | Tests | What It Delivers |
|-------|-------|-------|-----------------|
| 1: Core Infrastructure | 1-4 | 24 tests | Renderer, session manager (w/ timeout + max sessions), HTTP+WS server |
| 2: MCP Integration | 5-6 | 9 tests + integration | MCP tools wired to stdio, event clearing, full workflow |
| 3: Skill Layer | 7-9 | 7 tests | Skill doc (w/ lifecycle docs), 6 templates, helper verification (w/ SVG) |
| 4: Polish | 10-11 | Verification | Final testing, CJS/ESM check, plugin installation |
