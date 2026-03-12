# Visualizer Archive System — Design Spec

**Date:** 2026-03-11
**Status:** Draft
**Author:** sdoherty + Claude

## Problem

The visualizer plugin is entirely ephemeral. Each `push_screen` overwrites the previous screen in memory, and all content is destroyed when the session ends. Users cannot:

1. Navigate back to earlier screens during a session
2. Review the visual decision trail after a session ends
3. Share the progression of design decisions with stakeholders

## Solution

Add an archive layer that persists every screen to disk as it's pushed, provides in-session navigation via a timeline sidebar, and generates a self-contained static gallery for post-session review.

## Architecture: Approach B — Separate Archive Module

A new `archive-manager.js` module handles all persistence concerns. The existing `session-manager.js` delegates to it but retains its current in-memory behavior for live screen serving.

### New Module: `archive-manager.js`

Constructed with a `projectDir` parameter: `new ArchiveManager(projectDir)`. The `projectDir` is determined by `process.cwd()` at MCP server startup (in `index.js`) and passed through to the archive manager. This is reliable because the MCP server is launched by Claude Code with the working directory set to the project root.

Seven responsibilities:

1. **`save(sessionId, html, title)`** — Called by session-manager on every `push_screen`. Writes the **raw** HTML to disk as `NNN-timestamp-title.html` and appends an entry to `manifest.json`. Raw HTML is stored (not rendered) because the live sidebar route (`GET /archive/:index`) passes it through `render()` which handles fragment wrapping and script injection. All disk I/O in `save()` uses **synchronous** `fs.writeFileSync` / `fs.renameSync` — this prevents read-modify-write race conditions on `manifest.json` since Node.js is single-threaded and sync calls cannot interleave. Writes use temp-file-then-rename for crash safety. On Windows, retries on `EPERM`/`EACCES` (up to 3 attempts with 50ms delay) since antivirus or indexing services may briefly lock files.

2. **`getManifest(sessionId)`** — Returns the ordered list of archived screens with metadata (index, title, timestamp, filename). Used by the sidebar and gallery.

3. **`generateGallery(sessionId)`** — Builds a self-contained `index.html` from the manifest and archived HTML files. For each archived screen: reads the raw HTML file, detects if it's a fragment via `isFullDocument()` (imported from `renderer.js`), and if so wraps it with the frame template via `wrapInFrame()` (also from `renderer.js`) before embedding in `<iframe srcdoc>`. This ensures gallery thumbnails and lightbox views have proper CSS styling (`.options`, `.cards`, `.mockup` classes, etc.). `helper.js` is NOT injected since there's no WebSocket server for static files. This is a static page that works without any server. Failures are non-fatal — logged as warnings, never thrown. Can always be retried via the `generate_gallery` MCP tool.

4. **`getArchiveDir(sessionId)`** — Resolves the archive path: `<projectDir>/.visualizer/archive/<session-id>/`.

5. **`getArchivedScreen(sessionId, index)`** — Reads and returns the HTML content of an archived screen by its sequence index. Used by `http-server.js` for the `/archive/:index` route.

6. **`closeSession(sessionId, reason, screenCount)`** — Writes `closed` timestamp, `closedReason`, and final `screenCount` to `session-meta.json`. Called by `session-manager.js` `destroy()` before the session is removed from the map. The `screenCount` value is passed in from `session.screenIndex` (the existing counter on the session object).

7. **`saveEvents(sessionId, screenIndex, events)`** — Saves the user interaction events for a given screen by updating that screen's entry in `manifest.json` with an `events` array. Called by `session-manager.js` at two points: (a) in `pushScreen()`, before clearing events — saves the interactions from the **previous** screen (the one the user was just looking at), and (b) in `destroy()` — saves any remaining events for the final screen. Uses synchronous I/O (same as `save()`). If `events` is empty, no update is written.

### Slugification Algorithm

Title slugification: replace non-alphanumeric characters with hyphens, collapse consecutive hyphens, strip leading/trailing hyphens, truncate to 50 characters, lowercase. If the result is empty, use `untitled`.

### Filesystem Layout

```
.visualizer/
└── archive/
    └── <session-id>/
        ├── session-meta.json
        ├── manifest.json
        ├── 001-1741700000-homepage-layout.html
        ├── 002-1741700135-color-palette.html
        ├── 003-1741700280-nav-comparison.html
        ├── 004-1741700410-final-layout.html
        └── index.html                    # gallery (generated on close)
```

**File naming convention:** `{NNN}-{unix-seconds}-{slugified-title}.html`
- NNN: zero-padded 3-digit sequence (supports up to 999 screens per session; pads to 4+ digits automatically beyond that)
- Timestamp: Unix seconds (compact, sortable)
- Title: slugified per the algorithm above. Falls back to `untitled` if omitted.

**`session-meta.json`:**

Created on the first `push_screen` call for a session (alongside the archive directory). Updated with `closed`, final `screenCount`, and `closedReason` on session close.

```json
{
  "sessionId": "a3f8c1e2b4d6",
  "created": "2026-03-11T14:30:00Z",
  "closed": "2026-03-11T15:45:00Z",
  "closedReason": "explicit",
  "projectDir": "D:/Projects/my-app",
  "screenCount": 4
}
```

`closedReason` values: `"explicit"` (normal `close_session`), `"timeout"` (30-minute inactivity), `"crash"` (process exit without close).

**`manifest.json`:**

Timestamps in ISO 8601 format (human-readable). Filename timestamps use Unix seconds (compact, sortable).

```json
{
  "screens": [
    {
      "index": 1,
      "title": "homepage-layout",
      "filename": "001-1741700000-homepage-layout.html",
      "timestamp": "2026-03-11T14:33:20Z",
      "events": [
        { "type": "click", "choice": "b", "text": "Two Column Layout", "timestamp": 1741700080000 }
      ]
    }
  ]
}
```

The `events` array is populated retroactively: when screen N+1 is pushed, the events accumulated during screen N are saved to screen N's manifest entry via `saveEvents()`. Events for the final screen are saved on session close. If no interactions occurred, `events` is omitted (not an empty array).

### Archive Location

Project-relative: `.visualizer/archive/<session-id>/` in the project directory. The project directory is `process.cwd()` at MCP server startup.

### Persistence Strategy

Hybrid incremental + on-close:
- Each `push_screen` immediately writes the HTML file and updates the manifest (incremental — protects against crashes/timeouts)
- The gallery `index.html` is generated on `close_session` or on demand via `generate_gallery` tool
- If a session crashes, all HTML files are on disk. The gallery can be regenerated from the manifest.

## In-Session Navigation: Timeline Sidebar

A collapsible panel injected by `renderer.js` on the left edge of the browser window.

### Behavior

- **Newest screen at top**, highlighted green with a "CURRENT" badge
- **Older screens below** in reverse chronological order
- Each entry shows: sequence number, title, timestamp
- **Click to view**: navigates to `GET /archive/:idx`, loads the archived screen with the sidebar still visible
- **Back to live**: clicking "CURRENT" or browser back returns to the live screen (`GET /`)
- **New screen always takes focus**: when Claude pushes a new screen, it becomes the main view and the previous slides into sidebar history
- **Collapsible**: toggle with ‹/› tab. Collapsed by default on viewports under 900px. State persisted in localStorage.

### Implementation

`sidebar.js` is a **client-side script** (like `helper.js`). It is read from disk and inlined by `renderer.js` into every rendered page, injected before `</body>`.

- On page load, `sidebar.js` fetches `GET /archive/manifest` and builds the sidebar DOM
- It listens for a `visualizer:reload` custom DOM event (dispatched by `helper.js` when a WebSocket `reload` message arrives) to refetch the manifest and update the sidebar without a separate WebSocket connection
- `helper.js` change: after calling `window.location.reload()`, no additional change needed — the full page reload causes `sidebar.js` to re-initialize with fresh manifest data. The `visualizer:reload` event is a future optimization hook but is not required for v1. **No changes to `helper.js` in v1.**

When viewing an archived screen (`GET /archive/:index`), the page includes an injected `window.__visualizerArchiveIndex = N` variable so the sidebar can highlight the correct entry and show a "Viewing archived screen — click to return to live" banner. On WebSocket `reload` (new screen pushed), an archived view navigates to `GET /` (live screen) instead of reloading the archive URL.

## Post-Session Gallery: Static `index.html`

A self-contained HTML page generated on session close.

### Characteristics

- **Fully static**: pure HTML/CSS/JS, no server required. Open directly in a browser.
- **Iframe-based previews**: each screen is rendered in a `<iframe srcdoc="...">` with CSS `transform: scale(0.25)` for thumbnail cards. Clicking expands to a full-size lightbox iframe. This avoids nesting `<!DOCTYPE>`/`<html>` tags and handles both fragment and full-document screens correctly.
- **Two view modes**: Timeline (for decision-trail storytelling) and Grid (for quick visual scanning).
- **Click to expand**: clicking a card opens the full screen in a lightbox `<iframe srcdoc>` overlay within the same page.
- **Regenerable**: can always be rebuilt from manifest + HTML files via `generate_gallery` MCP tool.

### Timeline View

Vertical timeline with dot connectors. Each screen shown as a card with:
- CSS-scaled iframe thumbnail preview (fragments wrapped in frame template for proper styling; `helper.js` omitted)
- Title
- Timestamp
- User selections (if events exist for that screen — e.g., "Selected: Two Column Layout")
- Final screen highlighted in green

### Grid View

Card grid for quick visual scanning. Same information, denser layout.

## Changes to Existing Files

### `index.js` — Composition Root

`index.js` is where all top-level objects are constructed. The archive manager is created here and wired into both SessionManager and `createMcpTools`:

```js
const projectDir = process.cwd();
const archive = new ArchiveManager(projectDir);
const manager = new SessionManager({
  timeoutMs: 30 * 60 * 1000,
  maxSessions: 5,
  archive,     // ← new: passed to SessionManager
});
const tools = createMcpTools(manager, archive);  // ← new: archive passed directly
```

Additional changes:
1. Add `title: z.string().optional().describe('Screen title for archive labeling')` to the `push_screen` tool schema
2. Register new `generate_gallery` tool with schema: `{ session_id: z.string().describe('Session to generate gallery for') }`, description: `"Generate a static HTML gallery page for an archived session"`, returns `{ path: string }`

### `mcp-server.js`

Note: The existing exported function is `createMcpTools(manager)`, not `createMcpServer`.

1. `createMcpTools(manager)` → `createMcpTools(manager, archive)`. Receives the archive instance (constructed in `index.js`). Passes it to every `createHttpServer(manager, sessionId, archive)` call.
2. `push_screen` handler: destructure `title` from args, pass to `manager.pushScreen(sessionId, html, title)`
3. New `generate_gallery` handler: calls `archive.generateGallery(session_id)`, returns `{ path }`
4. `close_session` handler: call `manager.destroy(session_id, 'explicit')` which internally writes `session-meta.json` first, then call `archive.generateGallery(session_id)` after destroy (session-meta is already written, manifest is on disk — gallery has everything it needs). Gallery generation failure is logged but does not prevent session cleanup.
5. `onTimeout` handler: **does NOT call `manager.destroy()`**. The timer in `_touch()` calls `this.destroy(id, 'timeout')` BEFORE `onTimeout` (see `session-manager.js` change #4 below). The `onTimeout` handler only: (a) closes the HTTP server (existing behavior), and (b) calls `archive.generateGallery(id)`. All data is on disk by the time `onTimeout` fires because `destroy()` has already written events and session-meta.

### `session-manager.js`

1. Constructor: extend existing `opts` parameter to include `archive`: `new SessionManager({ timeoutMs, maxSessions, onTimeout, archive })`. Stores as `this.archive`. The archive is constructed in `index.js` and passed in — SessionManager does not create it.
2. `pushScreen(sessionId, html)` → `pushScreen(sessionId, html, title)`. First, archives the events from the **previous** screen by calling `this.archive.saveEvents(sessionId, session.screenIndex, session.events)` (if `session.screenIndex > 0` and events exist). Then sets `currentHtml` in memory (unchanged behavior), increments `screenIndex`, clears events, and calls `this.archive.save(sessionId, html, title)`. Archive failures are logged but do not throw.
3. `destroy(id)` — add `closedReason` parameter: `destroy(id, reason = 'explicit')`. Before deleting from the map: (a) saves any remaining events for the last screen via `this.archive.saveEvents(id, session.screenIndex, session.events)`, then (b) calls `this.archive.closeSession(id, reason, session.screenIndex)` to write `closed` timestamp, `closedReason`, and final `screenCount` to `session-meta.json`. The `screenCount` value comes from `session.screenIndex` (the existing counter that increments on each push). Then deletes the session from the map and clears the timer.
4. `_touch(id)` — **reverse the order** of the timer callback. Currently: `onTimeout(id)` then `destroy(id)`. Change to: `destroy(id, 'timeout')` then `onTimeout(id)`. This ensures `destroy()` writes session-meta.json to disk before `onTimeout` generates the gallery. The `onTimeout` handler in `mcp-server.js` does NOT call `destroy()` — it's already been called.

```js
// Updated timer callback in _touch():
const timer = setTimeout(() => {
    this.destroy(id, 'timeout');                // writes events + session-meta first
    if (this.onTimeout) this.onTimeout(id);     // HTTP cleanup + gallery generation
}, this.timeoutMs);
```

**Important ordering note:** In both `close_session` and timeout paths, the sequence is: `destroy()` (writes metadata to disk, removes from map) → gallery generation. Gallery reads from disk (manifest + HTML files + session-meta.json), not from the in-memory session, so this is safe.

### `http-server.js`

1. `createHttpServer(manager, sessionId)` → `createHttpServer(manager, sessionId, archive)`. Stores archive reference.
2. `GET /archive/manifest` — calls `archive.getManifest(sessionId)`, returns JSON response
3. `GET /archive/:index` — calls `archive.getArchivedScreen(sessionId, index)`, passes result through `render()` with an additional `archiveIndex` option that injects `window.__visualizerArchiveIndex = N`. Serves the rendered HTML with sidebar.

### `renderer.js`

1. Read `sidebar.js` from disk at module load (same pattern as `helper.js` — line 8-9 of current code)
2. `render(html, options)` — accepts optional `options.archiveIndex`. Injects sidebar script before `</body>` (after `helper.js` injection). If `archiveIndex` is set, also injects `<script>window.__visualizerArchiveIndex = ${options.archiveIndex}</script>`.
3. Update exports: `module.exports = { render, isFullDocument, wrapInFrame }`. The `wrapInFrame` function (currently private) is now exported so that `archive-manager.js` can use it in `generateGallery()` to wrap fragments in the frame template before embedding in gallery iframes.

### `helper.js`

**No changes in v1.** The full page reload on WebSocket `reload` message naturally causes `sidebar.js` to re-initialize with fresh data.

### `SKILL.md`

Add to the push_screen documentation:
- `title` (optional string): Short descriptive title for the screen (e.g., "homepage-layout", "color-palette-options"). Used for archive labeling and sidebar display. Recommended but not required — defaults to "untitled".

Add new tool documentation:
- `generate_gallery`: Takes `session_id`. Generates a static HTML gallery page at `.visualizer/archive/<session-id>/index.html`. Called automatically on `close_session`, but can be called manually for mid-session gallery snapshots.

Add archive section:
- Archives persist at `.visualizer/archive/` in the project directory
- Each session gets its own subdirectory with all screens preserved
- The gallery `index.html` can be opened directly in a browser without the MCP server

### Unchanged Files

- `frame-template.html` — no changes (content template)
- `ensure-deps.sh` — no changes (dependency hook)
- `package.json` — no new dependencies (all Node built-ins for fs operations)

## New Files

| File | Purpose |
|---|---|
| `src/archive-manager.js` | Archive persistence, manifest management, gallery generation |
| `src/gallery-template.html` | Static gallery page template (with timeline + grid views, lightbox) |
| `src/sidebar.js` | Client-side script for collapsible timeline sidebar (read and inlined by renderer.js) |

## Edge Cases

- **Title collisions**: If two screens have the same slugified title, the sequence number + timestamp make the filename unique regardless.
- **Session crash/timeout**: All screens already on disk. `session-meta.json` gets `closedReason: "timeout"`. Gallery missing but regenerable via `generate_gallery` tool.
- **Process crash without close**: `session-meta.json` will have no `closed` field. Gallery can be generated manually. A future enhancement could detect incomplete sessions on startup.
- **Very long sessions (>999 screens)**: Sequence number pads to 4+ digits automatically. Manifest is the source of truth for ordering, not filenames.
- **Concurrent sessions**: Each session has its own archive directory. No conflicts.
- **Disk write failures**: `archive.save()` logs warnings but does not throw. The in-memory path remains the primary delivery mechanism. `generateGallery()` failures are also non-fatal.
- **Full-document screens in gallery**: Gallery uses `<iframe srcdoc>`. Fragments are wrapped in the frame template (via `wrapInFrame()`) before embedding so they have proper CSS. Full documents are embedded as-is. `helper.js` is not injected in either case since the gallery is static (no WebSocket server).
- **Windows file locking**: Temp-file-then-rename retries up to 3 times on `EPERM`/`EACCES` with 50ms delay between attempts.

## Out of Scope

- Search/filtering across sessions
- Tags or annotations on individual screens
- Cross-session gallery (browsing all archived sessions)
- Export formats (PDF, image sequences)
- Archive size limits or cleanup policies

These can be added later if needed. The manifest-based architecture supports all of them.
