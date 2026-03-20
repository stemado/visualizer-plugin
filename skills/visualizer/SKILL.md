---
name: visualizer
description: Create interactive HTML visualizations in a browser window — architecture diagrams, UI mockups, comparisons, concept maps, flowcharts, and dashboards. Use when the user asks to visualize, diagram, mock up, explore, or compare things visually.
---

# Visualizer

Push interactive HTML visualizations to a browser window. The user sees rich visual content — diagrams, mockups, comparisons — while continuing to work in the terminal.

## Feedback loop

**On session start:** Read `feedback.log` (in this skill's directory) before doing anything else.
Apply all logged preferences to the current session.

**During the session:** When the user corrects your approach or states a preference:
1. Apply the correction immediately.
2. Determine if it's a **general preference** (applies to future sessions) or **context-specific** (only relevant now).
3. If general, append it to `feedback.log` immediately. Use judgment on detail — some entries are one line, others need a sentence or two of context to be actionable later.
4. Skip anything that only matters for the current task.

## When to Use

When the user asks to **see** something, not just read about it:

- Architecture diagrams, system maps, data flows
- UI mockups, wireframes, component designs
- Side-by-side comparisons of options
- Concept maps, relationship graphs
- Process flowcharts, state machines
- Dashboards, metric displays

**Don't use** for pure text/tabular content — keep that in the terminal.

## Quick Start

1. Call `launch_session` to start the server
2. Tell the user to open the URL in their browser
3. Call `push_screen` with HTML content and an optional `title` (e.g., "layout-options", "color-palette")
4. Tell the user what's on screen, ask them to interact
5. On next turn, call `get_events` to read their clicks
6. Iterate until done
7. Call `close_session` when finished

## Writing HTML Content

**Write fragments by default.** The server auto-wraps them in a themed frame with dark/light mode, header, indicator bar, and all CSS classes.

Only write full `<!DOCTYPE html>` documents when you need complete page control (e.g., canvas-based diagrams, custom layouts).

### Minimal Example

```html
<h2>Which architecture fits?</h2>
<p class="subtitle">Consider scalability and team familiarity</p>

<div class="options">
  <div class="option" data-choice="monolith" onclick="toggleSelect(this)">
    <div class="letter">A</div>
    <div class="content">
      <h3>Monolith</h3>
      <p>Single deployable, shared database</p>
    </div>
  </div>
  <div class="option" data-choice="microservices" onclick="toggleSelect(this)">
    <div class="letter">B</div>
    <div class="content">
      <h3>Microservices</h3>
      <p>Independent services, event-driven</p>
    </div>
  </div>
</div>
```

### Available CSS Classes

**Options** (A/B/C choices): `.options` > `.option[data-choice]` with `.letter` + `.content`
**Cards** (visual grid): `.cards` > `.card[data-choice]` with `.card-image` + `.card-body`
**Mockup**: `.mockup` > `.mockup-header` + `.mockup-body`
**Split view**: `.split` (side-by-side grid, collapses on mobile)
**Pros/Cons**: `.pros-cons` > `.pros` + `.cons` with `<h4>` + `<ul>`
**Mock elements**: `.mock-nav`, `.mock-sidebar`, `.mock-content`, `.mock-button`, `.mock-input`, `.placeholder`
**Typography**: `h2` (title), `h3` (section), `.subtitle`, `.section`, `.label`

**Multi-select:** Add `data-multiselect` to the `.options` or `.cards` container.

### Interactivity

Add `data-choice="value"` and `onclick="toggleSelect(this)"` to any clickable element. User clicks are captured and returned by `get_events`.

For custom interactivity beyond click selection, use the `window.visualizer` API:
- `window.visualizer.send(event)` — send any event object to the server
- `window.visualizer.choice(value, metadata)` — send a choice event

### Full Documents

When writing full HTML documents (for canvas, SVG, or custom layouts), `helper.js` is still auto-injected. You get WebSocket auto-reload and the `window.visualizer` API without any setup.

## Reading User Events

Call `get_events` with `clear: true` after the user responds in the terminal. This returns events and removes them so they won't be re-read on subsequent calls.

```json
{"events": [
  {"type": "click", "choice": "microservices", "text": "Microservices...", "timestamp": 1706000101}
]}
```

Merge events with the user's terminal text. The terminal message is primary; events provide structured data.

**Important:** Without `clear: true`, the same events are returned on every call until a new screen is pushed. Use `clear: true` for normal operation. Omit it only if you need to peek at events without consuming them.

## Template Reference

Load a template from `templates/` to guide your HTML generation for specific visualization types:

| Template | Use For |
|----------|---------|
| `architecture.md` | System components, service diagrams, layer maps |
| `comparison.md` | Side-by-side design/approach comparisons |
| `concept-map.md` | Learning maps, knowledge graphs, scope mapping |
| `data-explorer.md` | Data queries, pipeline builders, schema explorers |
| `flowchart.md` | Process flows, state machines, decision trees |
| `dashboard.md` | Metric displays, KPI layouts, status boards |

## Screen Archiving

Every screen you push is automatically archived to `.visualizer/archive/` in the project directory. This provides:

- **In-session navigation**: A sidebar in the browser lets the user flip back to earlier screens
- **Post-session gallery**: When you close the session, a static `index.html` gallery is generated that works without the server

### Title Parameter

When calling `push_screen`, include a descriptive `title` to label the screen in the archive:

```json
{ "session_id": "abc123", "html": "<h2>Layout</h2>...", "title": "homepage-layout" }
```

Titles appear in the sidebar and gallery. They're optional but recommended.

### Gallery Generation

The `generate_gallery` tool creates a static HTML gallery at any time:

```json
{ "session_id": "abc123" }
```

Returns `{ "path": ".visualizer/archive/abc123/index.html" }`. This is called automatically on `close_session`, but you can call it mid-session for a snapshot.

## Session Lifecycle

- Sessions are **ephemeral** — they live only as long as the MCP server process. When the conversation ends, all sessions and their HTTP servers are destroyed.
- Sessions **auto-close after 30 minutes of inactivity** (no push_screen, get_events, or browser interaction). The browser will show "Reconnecting..." when this happens.
- Maximum **5 concurrent sessions**. Close unused sessions to free slots.
- Always call `close_session` when you're done to free the port immediately.
- If the user says "continue where we left off," you must start a fresh session — there is no persistence.

## Design Principles

- **Scale fidelity to the question** — wireframes for layout, polish for style questions
- **2-4 options max** per screen
- **Explain the question on each page** — "Which layout feels more professional?" not "Pick one"
- **Iterate before advancing** — if feedback changes current screen, push a new version
