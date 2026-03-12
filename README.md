# Visualizer

A Claude Code plugin that pushes interactive HTML visualizations to a browser window. Claude generates diagrams, mockups, comparisons, and dashboards — you see them live in your browser while continuing to work in the terminal.

![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)
![Version](https://img.shields.io/badge/version-0.1.0-green.svg)

## How It Works

```
┌──────────────┐    stdio/JSON-RPC    ┌──────────────┐    HTTP + WebSocket    ┌──────────────┐
│  Claude Code  │◄──────────────────►│  MCP Server   │◄────────────────────►│   Browser     │
│  (terminal)   │                    │  (Node.js)    │                      │  (localhost)  │
└──────────────┘                    └──────────────┘                      └──────────────┘
       │                                   │                                      │
  You ask Claude                  Serves HTML, relays                    You see & interact
  to visualize                    user events back                      with visualizations
```

Claude calls MCP tools to push HTML screens to the browser and read your interactions (clicks, selections) back. No filesystem intermediary — content flows directly through WebSocket.

## Install

### From the marketplace

```bash
claude plugin install visualizer@visualizer
```

### Or add the marketplace first, then install

```bash
claude plugin marketplace add stemado/visualizer-plugin
claude plugin install visualizer
```

Dependencies are installed automatically on first session start.

## Quick Start

Just ask Claude to visualize something:

> "Visualize the architecture of this project"

> "Show me a side-by-side comparison of these two API designs"

> "Mock up a dashboard for our deployment metrics"

Claude will:
1. Launch a session and give you a URL (e.g., `http://localhost:54321`)
2. Open it in your browser
3. Push interactive HTML content
4. Read your clicks and selections
5. Iterate based on your feedback

## What It Can Visualize

| Type | Description | Example Prompt |
|------|-------------|----------------|
| **Architecture diagrams** | SVG system maps with clickable nodes | "Diagram the service architecture" |
| **Comparisons** | Side-by-side mockups with pros/cons | "Compare sidebar vs top nav layouts" |
| **Concept maps** | Interactive knowledge graphs on canvas | "Map out the auth system concepts" |
| **Data explorers** | Query builders, schema browsers | "Build an explorer for this database schema" |
| **Flowcharts** | Process flows, state machines, decision trees | "Flowchart the deployment pipeline" |
| **Dashboards** | KPI tiles, sparklines, status boards | "Dashboard for API latency metrics" |

## MCP Tools

The plugin exposes 5 tools via the Model Context Protocol:

| Tool | Parameters | Description |
|------|-----------|-------------|
| `launch_session` | (none) | Start an HTTP+WebSocket server, returns a browser URL |
| `push_screen` | `session_id`, `html` | Push HTML to the browser. Fragments auto-wrap in a themed frame |
| `get_events` | `session_id`, `since?`, `clear?` | Read user interactions (clicks on `[data-choice]` elements) |
| `list_sessions` | (none) | List active sessions with URLs and status |
| `close_session` | `session_id` | Stop the server and clean up |

## Features

### Auto-theming
HTML fragments are automatically wrapped in a themed frame with light/dark mode support (follows system preference), a header bar, and an indicator showing selection state.

### Built-in CSS classes
The frame template includes ready-to-use classes for common UI patterns:

- **Options** — A/B/C choice cards with selection highlighting
- **Cards** — responsive grid with hover effects
- **Mockups** — browser-chrome-style containers
- **Split view** — side-by-side comparison (responsive)
- **Pros/Cons** — color-coded tradeoff lists
- **Mock elements** — nav bars, sidebars, buttons, inputs, placeholders

### Click capture
Any element with `data-choice="value"` and `onclick="toggleSelect(this)"` becomes interactive. Clicks are captured and returned to Claude via `get_events`, enabling multi-turn visual conversations.

### Full document support
Need complete page control for canvas or complex SVG? Push a full `<!DOCTYPE html>` document — the WebSocket helper is still auto-injected.

### Session management
- Sessions auto-close after 30 minutes of inactivity
- Up to 5 concurrent sessions
- Automatic WebSocket reconnection in the browser

## Architecture

```
src/
├── index.js              # Entry point — wires MCP server to stdio transport
├── mcp-server.js         # 5 MCP tool handlers (launch, push, get_events, list, close)
├── http-server.js        # Express + WebSocket server factory
├── session-manager.js    # Session state: events, screens, timeouts
├── renderer.js           # Fragment → full document wrapping
├── helper.js             # Browser-side JS: WebSocket, click capture, window.visualizer API
└── frame-template.html   # Themed HTML frame with CSS variables and utility classes
```

## Development

```bash
# Clone
git clone https://github.com/stemado/visualizer-plugin.git
cd visualizer-plugin

# Install dependencies
npm install

# Run tests (40 tests across 6 suites)
npm test

# Test MCP server startup
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"capabilities":{},"clientInfo":{"name":"test","version":"1.0"},"protocolVersion":"2025-03-26"}}' | node src/index.js
```

### Test coverage

| Suite | Tests | What it covers |
|-------|-------|---------------|
| renderer | 6 | Fragment detection, wrapping, helper injection |
| session-manager | 13 | CRUD, events, timeouts, max sessions |
| http-server | 5 | HTTP serving, WebSocket relay, broadcast reload |
| mcp-tools | 8 | Tool handlers, error cases, event clearing |
| integration | 1 | Full workflow: launch → push → interact → read → close |
| helper | 7 | Browser-side API surface verification |

## Tech Stack

- **Node.js** — runtime (no build step, plain JS with JSDoc types)
- **@modelcontextprotocol/sdk** — MCP stdio server
- **Express** — HTTP server
- **ws** — WebSocket server
- **Zod** — parameter validation for MCP tools

## License

MIT
