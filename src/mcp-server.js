// src/mcp-server.js
const createHttpServer = require('./http-server');

/**
 * @param {import('./session-manager')} manager
 * @param {import('./archive-manager')} [archive]
 * @returns {Record<string, (args: any) => Promise<any>>}
 */
function createMcpTools(manager, archive) {
  /** @type {Map<string, { server: import('http').Server, broadcastReload: () => void }>} */
  const httpServers = new Map();

  // Wire session timeout to close HTTP servers automatically
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

      // Create session with placeholder port (updated after bind)
      const session = manager.create({ port: 0, url: '' });
      const { server, broadcastReload } = createHttpServer(manager, session.id, archive);

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

    async push_screen({ session_id, html, title }) {
      const session = manager.get(session_id);
      if (!session) throw new Error(`Session ${session_id} not found`);

      manager.pushScreen(session_id, html, title);

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

module.exports = createMcpTools;
