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
