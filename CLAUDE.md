# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A Claude Code plugin that pushes interactive HTML visualizations to a browser via MCP tools. Claude generates HTML (diagrams, mockups, dashboards) → MCP server serves it over HTTP+WebSocket → user sees it in their browser and clicks to interact → events flow back to Claude.

## Commands

```bash
npm test              # Run all tests (node --test tests/*.test.js)
npm start             # Start MCP server (node src/index.js)

# Run a single test file
node --test tests/renderer.test.js

# Test MCP server startup manually
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"capabilities":{},"clientInfo":{"name":"test","version":"1.0"},"protocolVersion":"2025-03-26"}}' | node src/index.js
```

No build step, no linter, no transpilation. Plain JavaScript with JSDoc types throughout.

## Architecture

**Composition root pattern**: `index.js` constructs `ArchiveManager` → `SessionManager` → `createMcpTools()`, then registers 6 MCP tools on `McpServer` and connects via `StdioServerTransport`.

**Data flow**:
```
Claude ──stdio/JSON-RPC──► index.js ──► mcp-server.js (tool handlers)
                                            ├──► session-manager.js (in-memory state)
                                            ├──► archive-manager.js (disk persistence)
                                            └──► http-server.js (Express + WebSocket per session)
                                                     └──► Browser (helper.js + sidebar.js injected)
                                                              └──► WebSocket events back to session-manager
```

**Key modules**:

- **`mcp-server.js`** — `createMcpTools(manager, archive)` factory returning async tool handlers. Creates HTTP servers on-demand. Manages session lifecycle including timeout cleanup and gallery generation.
- **`session-manager.js`** — `SessionManager` class. In-memory session CRUD, event accumulation, inactivity timeout (30min) via `_touch()` + `setTimeout` with `timer.unref()`.
- **`http-server.js`** — `createHttpServer(manager, sessionId, archive)` factory. Express + WebSocket server per session. Routes: `GET /` (live screen), `GET /archive/manifest`, `GET /archive/:index`.
- **`archive-manager.js`** — `ArchiveManager` class. Disk persistence with crash-safe writes (temp-file-then-rename, Windows EPERM retry). Generates self-contained static galleries.
- **`renderer.js`** — Detects fragments vs full documents (`isFullDocument()`). Wraps fragments in `frame-template.html`. Injects `helper.js` + `sidebar.js` before `</body>` in all output.
- **`helper.js`** / **`sidebar.js`** — Browser-side IIFEs. Read from disk at module load time and inlined as `<script>` blocks (no external script references).

**Plugin structure**: `.claude-plugin/plugin.json` (metadata), `.mcp.json` (stdio transport config), `hooks/hooks.json` (SessionStart hook for auto-installing deps), `skills/visualizer/SKILL.md` (Claude's instructions for using the tools).

## Design Patterns

- **Factory functions over classes** for `createMcpTools` and `createHttpServer` — they close over shared state (Maps, Sets).
- **Dual delivery**: Content served live (in-memory via HTTP/WS) AND persisted (on disk via archive). Archive failures are logged as warnings but never thrown — live path always works.
- **Event lifecycle**: Events accumulate per-screen in memory. On `push_screen`, previous screen's events are archived to `manifest.json` then cleared. Remaining events saved on session destroy.
- **Fragment vs full document**: Fragments get auto-wrapped in themed frame; full `<!DOCTYPE html>` documents pass through with only helper/sidebar injected.

## Testing

Tests use Node.js built-in `node:test` + `node:assert` (no Jest/Mocha). Test files are in `tests/` and cover renderer, session-manager, http-server, mcp-tools, integration, helper, and archive-manager.

## MCP Tools (6 total)

`launch_session`, `push_screen` (with optional `title`), `get_events` (with `since`/`clear` params), `list_sessions`, `close_session`, `generate_gallery`

## Version Management

Version is tracked in both `package.json` and `.claude-plugin/plugin.json` — keep them in sync.
