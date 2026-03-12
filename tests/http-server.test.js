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
