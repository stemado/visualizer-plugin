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
 * @returns {{ server: http.Server, app: express.Application, broadcastReload: () => void }}
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
