// tests/archive-manager.test.js
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

describe('ArchiveManager', () => {
  let ArchiveManager, archive, tmpDir;

  beforeEach(() => {
    ArchiveManager = require('../src/archive-manager');
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'viz-test-'));
    archive = new ArchiveManager(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('slugify', () => {
    it('should lowercase and hyphenate', () => {
      // slugify is internal, test via save filename
      archive.save('sess1', '<h2>Hello World</h2>', 'My Cool Title');
      const dir = archive.getArchiveDir('sess1');
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.html'));
      assert.strictEqual(files.length, 1);
      assert.ok(files[0].includes('my-cool-title'), `filename ${files[0]} should contain slug`);
    });

    it('should collapse consecutive hyphens', () => {
      archive.save('sess1', '<p>hi</p>', 'foo---bar   baz');
      const dir = archive.getArchiveDir('sess1');
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.html'));
      assert.ok(files[0].includes('foo-bar-baz'));
    });

    it('should truncate to 50 chars', () => {
      const longTitle = 'a'.repeat(80);
      archive.save('sess1', '<p>hi</p>', longTitle);
      const dir = archive.getArchiveDir('sess1');
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.html'));
      // NNN-timestamp- prefix + slug + .html
      const slug = files[0].split('-').slice(2).join('-').replace('.html', '');
      assert.ok(slug.length <= 50, `slug "${slug}" should be <= 50 chars`);
    });

    it('should fall back to untitled for empty title', () => {
      archive.save('sess1', '<p>hi</p>', '');
      const dir = archive.getArchiveDir('sess1');
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.html'));
      assert.ok(files[0].includes('untitled'));
    });

    it('should fall back to untitled when title omitted', () => {
      archive.save('sess1', '<p>hi</p>');
      const dir = archive.getArchiveDir('sess1');
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.html'));
      assert.ok(files[0].includes('untitled'));
    });
  });

  describe('save', () => {
    it('should create archive directory on first save', () => {
      const dir = archive.getArchiveDir('sess1');
      assert.ok(!fs.existsSync(dir), 'dir should not exist before save');
      archive.save('sess1', '<h2>Screen 1</h2>', 'first-screen');
      assert.ok(fs.existsSync(dir), 'dir should exist after save');
    });

    it('should write HTML file with correct content', () => {
      archive.save('sess1', '<h2>Hello</h2>', 'greeting');
      const dir = archive.getArchiveDir('sess1');
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.html'));
      const content = fs.readFileSync(path.join(dir, files[0]), 'utf-8');
      assert.strictEqual(content, '<h2>Hello</h2>');
    });

    it('should create manifest.json with screen entry', () => {
      archive.save('sess1', '<h2>First</h2>', 'first');
      const dir = archive.getArchiveDir('sess1');
      const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf-8'));
      assert.strictEqual(manifest.screens.length, 1);
      assert.strictEqual(manifest.screens[0].index, 1);
      assert.strictEqual(manifest.screens[0].title, 'first');
      assert.ok(manifest.screens[0].filename);
      assert.ok(manifest.screens[0].timestamp);
    });

    it('should increment screen index across multiple saves', () => {
      archive.save('sess1', '<p>1</p>', 'one');
      archive.save('sess1', '<p>2</p>', 'two');
      archive.save('sess1', '<p>3</p>', 'three');
      const dir = archive.getArchiveDir('sess1');
      const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf-8'));
      assert.strictEqual(manifest.screens.length, 3);
      assert.strictEqual(manifest.screens[0].index, 1);
      assert.strictEqual(manifest.screens[1].index, 2);
      assert.strictEqual(manifest.screens[2].index, 3);
    });

    it('should zero-pad sequence numbers to 3 digits', () => {
      archive.save('sess1', '<p>hi</p>', 'test');
      const dir = archive.getArchiveDir('sess1');
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.html'));
      assert.ok(files[0].startsWith('001-'), `filename ${files[0]} should start with 001-`);
    });

    it('should create session-meta.json on first save', () => {
      archive.save('sess1', '<p>hi</p>', 'test');
      const dir = archive.getArchiveDir('sess1');
      const meta = JSON.parse(fs.readFileSync(path.join(dir, 'session-meta.json'), 'utf-8'));
      assert.strictEqual(meta.sessionId, 'sess1');
      assert.ok(meta.created);
      assert.strictEqual(meta.projectDir, tmpDir);
      assert.strictEqual(meta.screenCount, undefined); // only set on close
    });

    it('should isolate sessions in separate directories', () => {
      archive.save('sess1', '<p>1</p>', 'one');
      archive.save('sess2', '<p>2</p>', 'two');
      assert.notStrictEqual(
        archive.getArchiveDir('sess1'),
        archive.getArchiveDir('sess2')
      );
    });
  });

  describe('getManifest', () => {
    it('should return empty screens for unknown session', () => {
      const manifest = archive.getManifest('nonexistent');
      assert.deepStrictEqual(manifest, { screens: [] });
    });

    it('should return saved screens in order', () => {
      archive.save('sess1', '<p>1</p>', 'first');
      archive.save('sess1', '<p>2</p>', 'second');
      const manifest = archive.getManifest('sess1');
      assert.strictEqual(manifest.screens.length, 2);
      assert.strictEqual(manifest.screens[0].title, 'first');
      assert.strictEqual(manifest.screens[1].title, 'second');
    });
  });

  describe('getArchivedScreen', () => {
    it('should return the HTML for a given screen index', () => {
      archive.save('sess1', '<h2>Screen One</h2>', 'one');
      archive.save('sess1', '<h2>Screen Two</h2>', 'two');
      const html = archive.getArchivedScreen('sess1', 2);
      assert.strictEqual(html, '<h2>Screen Two</h2>');
    });

    it('should return null for nonexistent index', () => {
      archive.save('sess1', '<p>hi</p>', 'test');
      const html = archive.getArchivedScreen('sess1', 99);
      assert.strictEqual(html, null);
    });

    it('should return null for nonexistent session', () => {
      const html = archive.getArchivedScreen('nonexistent', 1);
      assert.strictEqual(html, null);
    });
  });

  describe('closeSession', () => {
    it('should write closed timestamp and reason to session-meta.json', () => {
      archive.save('sess1', '<p>hi</p>', 'test');
      archive.closeSession('sess1', 'explicit', 1);
      const dir = archive.getArchiveDir('sess1');
      const meta = JSON.parse(fs.readFileSync(path.join(dir, 'session-meta.json'), 'utf-8'));
      assert.ok(meta.closed);
      assert.strictEqual(meta.closedReason, 'explicit');
      assert.strictEqual(meta.screenCount, 1);
    });

    it('should handle timeout reason', () => {
      archive.save('sess1', '<p>hi</p>', 'test');
      archive.closeSession('sess1', 'timeout', 3);
      const dir = archive.getArchiveDir('sess1');
      const meta = JSON.parse(fs.readFileSync(path.join(dir, 'session-meta.json'), 'utf-8'));
      assert.strictEqual(meta.closedReason, 'timeout');
      assert.strictEqual(meta.screenCount, 3);
    });

    it('should not throw for unknown session', () => {
      assert.doesNotThrow(() => archive.closeSession('nonexistent', 'explicit', 0));
    });
  });

  describe('saveEvents', () => {
    it('should add events to the manifest entry for a screen', () => {
      archive.save('sess1', '<p>1</p>', 'one');
      const events = [
        { type: 'click', choice: 'a', text: 'Option A', timestamp: 1000 }
      ];
      archive.saveEvents('sess1', 1, events);
      const manifest = archive.getManifest('sess1');
      assert.deepStrictEqual(manifest.screens[0].events, events);
    });

    it('should not write if events array is empty', () => {
      archive.save('sess1', '<p>1</p>', 'one');
      archive.saveEvents('sess1', 1, []);
      const manifest = archive.getManifest('sess1');
      assert.strictEqual(manifest.screens[0].events, undefined);
    });

    it('should not throw for unknown session or screen', () => {
      assert.doesNotThrow(() => archive.saveEvents('nonexistent', 1, [{ type: 'click' }]));
    });
  });

  describe('generateGallery', () => {
    it('should generate index.html in the archive directory', () => {
      archive.save('sess1', '<h2>Hello</h2>', 'greeting');
      archive.save('sess1', '<p>World</p>', 'world');
      archive.closeSession('sess1', 'explicit', 2);
      const galleryPath = archive.generateGallery('sess1');
      assert.ok(galleryPath);
      assert.ok(fs.existsSync(galleryPath));
      const content = fs.readFileSync(galleryPath, 'utf-8');
      assert.ok(content.includes('<!DOCTYPE html>'));
      assert.ok(content.includes('sess1'));
    });

    it('should embed screen content in GALLERY_DATA', () => {
      archive.save('sess1', '<h2>Test</h2>', 'test');
      archive.closeSession('sess1', 'explicit', 1);
      const galleryPath = archive.generateGallery('sess1');
      const content = fs.readFileSync(galleryPath, 'utf-8');
      // The gallery data should contain the screen HTML (possibly wrapped in frame)
      assert.ok(content.includes('Test'), 'gallery should contain screen content');
    });

    it('should wrap fragment screens in frame template', () => {
      archive.save('sess1', '<h2>Fragment</h2>', 'frag');
      archive.closeSession('sess1', 'explicit', 1);
      const galleryPath = archive.generateGallery('sess1');
      const content = fs.readFileSync(galleryPath, 'utf-8');
      // The embedded HTML should include frame template CSS (e.g., .options class)
      assert.ok(content.includes('.options'), 'fragments should be wrapped with frame CSS');
    });

    it('should not wrap full document screens', () => {
      archive.save('sess1', '<!DOCTYPE html><html><body><p>Full</p></body></html>', 'full');
      archive.closeSession('sess1', 'explicit', 1);
      const galleryPath = archive.generateGallery('sess1');
      const content = fs.readFileSync(galleryPath, 'utf-8');
      assert.ok(content.includes('<p>Full</p>'));
    });

    it('should return null for nonexistent session', () => {
      const result = archive.generateGallery('nonexistent');
      assert.strictEqual(result, null);
    });

    it('should include event summaries when events exist', () => {
      archive.save('sess1', '<p>1</p>', 'one');
      archive.saveEvents('sess1', 1, [{ type: 'click', choice: 'a', text: 'Option A' }]);
      archive.closeSession('sess1', 'explicit', 1);
      const galleryPath = archive.generateGallery('sess1');
      const content = fs.readFileSync(galleryPath, 'utf-8');
      assert.ok(content.includes('Option A'), 'should include event text');
    });
  });
});
