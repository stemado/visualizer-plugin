# Visualizer

A Claude Code plugin that pushes interactive HTML visualizations to a browser window. Claude generates diagrams, mockups, comparisons, and dashboards — you see them live in your browser while continuing to work in the terminal.

![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)
![Version](https://img.shields.io/badge/version-0.2.0-green.svg)

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

## What You Can Do With It

### Architecture & System Design

- **"Visualize the architecture of this project"** — SVG diagrams with clickable service nodes, showing data flow between layers
- **"Show me how the auth middleware connects to the session store"** — Trace a specific execution path visually
- **"Diagram the database schema for the users module"** — Entity-relationship diagrams with relationships
- **"Map out the microservices and their communication patterns"** — Service mesh visualization with protocol labels

### Decision-Making & Comparisons

- **"Compare Redux vs Zustand for our state management"** — Side-by-side mockups with pros/cons cards you can click to vote on
- **"Show me 3 approaches for the caching layer"** — Interactive option cards where you click your preference, then Claude drills deeper
- **"Help me choose between Postgres and DynamoDB for this use case"** — Comparison dashboard with trade-off matrices

### UI Mockups & Prototyping

- **"Mock up what the settings page could look like"** — HTML/CSS mockups with nav bars, sidebars, form elements
- **"Show me 2-3 layout options for the dashboard"** — Push multiple screens, iterate based on your clicks
- **"Prototype the onboarding flow"** — Multi-screen walkthrough where each click advances to the next step

### Flowcharts & Process Diagrams

- **"Diagram the CI/CD pipeline"** — SVG flowcharts with decision nodes, color-coded stages
- **"Map the user signup flow including error states"** — State machines with branching paths
- **"Show the deployment process step by step"** — Sequential flow with decision diamonds

### Concept Maps & Knowledge Graphs

- **"Map out how the modules in this codebase relate to each other"** — Canvas-based draggable node graphs with force-directed layout
- **"Create a concept map of our API endpoints and their dependencies"** — Interactive knowledge graph you can rearrange
- **"Visualize the dependency tree for this package"** — Hierarchical node layout

### Dashboards & Data Visualization

- **"Build a dashboard showing our test coverage by module"** — KPI tiles with sparkline charts and status indicators
- **"Visualize the performance metrics from these benchmark results"** — Bar/line charts with change indicators
- **"Show a health dashboard for the services"** — Real-time-style tiles with green/yellow/red status

### Data Exploration

- **"Help me explore this JSON schema interactively"** — Schema browsers with expandable nodes
- **"Build a query builder UI for the API"** — Interactive filter/query interfaces
- **"Visualize the data pipeline stages"** — Pipeline designers with syntax-highlighted previews

### Code Review & Refactoring

- **"Show me the before/after of this refactoring visually"** — Split-view comparison of code structure
- **"Visualize the call graph for this function"** — Trace which functions call what
- **"Diagram the class hierarchy"** — Inheritance/composition trees

### Project Planning

- **"Visualize the feature roadmap"** — Timeline/Gantt-style layouts
- **"Map out the migration plan phases"** — Sequential phase diagrams with dependencies
- **"Show the sprint breakdown visually"** — Kanban or phase-based layouts

### Interactive Exploration & Learning

- **"Walk me through how WebSockets work with a diagram"** — Educational multi-screen sequences
- **"Explain the event loop visually"** — Animated or step-by-step concept breakdowns
- **"Show me how this algorithm works step by step"** — Interactive stepping through logic

### The Key Differentiator: Interactivity

The killer feature is the **feedback loop** — you don't just look at static diagrams. You click choices in the browser (via `data-choice` attributes), and Claude reads those events to push refined screens. This makes it great for:

- **Iterative design** — "Show me 3 options" → click one → "Now show me variations of that"
- **Decision trees** — Each click branches into deeper detail
- **Guided exploration** — Click through a codebase visualization node by node

## MCP Tools

The plugin exposes 6 tools via the Model Context Protocol:

| Tool | Parameters | Description |
|------|-----------|-------------|
| `launch_session` | (none) | Start an HTTP+WebSocket server, returns a browser URL |
| `push_screen` | `session_id`, `html`, `title?` | Push HTML to the browser. Fragments auto-wrap in a themed frame |
| `get_events` | `session_id`, `since?`, `clear?` | Read user interactions (clicks on `[data-choice]` elements) |
| `list_sessions` | (none) | List active sessions with URLs and status |
| `close_session` | `session_id` | Stop the server, clean up, and generate a static gallery |
| `generate_gallery` | `session_id` | Generate a static HTML gallery for an archived session |

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

### Screen archive & gallery
Every screen pushed during a session is saved to `.visualizer/archive/<session_id>/`. A timeline sidebar in the browser lets you navigate back to any previous screen. When the session closes, a static HTML gallery is generated with timeline and grid views plus a lightbox — works offline without the MCP server.

### Session management
- Sessions auto-close after 30 minutes of inactivity
- Up to 5 concurrent sessions
- Automatic WebSocket reconnection in the browser

## Architecture

```
src/
├── index.js              # Entry point — wires MCP server to stdio transport
├── mcp-server.js         # 6 MCP tool handlers (launch, push, get_events, list, close, gallery)
├── http-server.js        # Express + WebSocket server factory
├── session-manager.js    # Session state: events, screens, timeouts
├── archive-manager.js    # Screen persistence, manifest tracking, static gallery generation
├── renderer.js           # Fragment → full document wrapping
├── helper.js             # Browser-side JS: WebSocket, click capture, window.visualizer API
├── sidebar.js            # Browser-side timeline sidebar for navigating screen history
├── frame-template.html   # Themed HTML frame with CSS variables and utility classes
└── gallery-template.html # Static gallery template with timeline/grid views and lightbox
```

## Development

```bash
# Clone
git clone https://github.com/stemado/visualizer-plugin.git
cd visualizer-plugin

# Install dependencies
npm install

# Run tests (7 suites)
npm test

# Test MCP server startup
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"capabilities":{},"clientInfo":{"name":"test","version":"1.0"},"protocolVersion":"2025-03-26"}}' | node src/index.js
```

### Test coverage

| Suite | What it covers |
|-------|---------------|
| renderer | Fragment detection, wrapping, helper injection |
| session-manager | CRUD, events, timeouts, max sessions |
| http-server | HTTP serving, WebSocket relay, broadcast reload |
| mcp-tools | Tool handlers, error cases, event clearing |
| integration | Full workflow: launch → push → interact → read → close |
| helper | Browser-side API surface verification |
| archive-manager | Archive save, manifest tracking, gallery generation |

## Tech Stack

- **Node.js** — runtime (no build step, plain JS with JSDoc types)
- **@modelcontextprotocol/sdk** — MCP stdio server
- **Express** — HTTP server
- **ws** — WebSocket server
- **Zod** — parameter validation for MCP tools

## License

MIT
