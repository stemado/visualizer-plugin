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
