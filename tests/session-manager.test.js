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
});
