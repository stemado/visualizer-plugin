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
