# Concept Map Template

For knowledge graphs, learning maps, scope visualization, and relationship exploration.

## Approach

Use a **full HTML document** with `<canvas>` for the interactive concept map. Nodes are draggable, edges connect related concepts.

## Key Features

- Draggable nodes with labels
- Edges drawn as curved lines between nodes
- Click to select a node (fires `data-choice` event via `window.visualizer`)
- Force-directed auto-layout on initial render
- Color-coding by category or knowledge level

## Canvas Pattern

```javascript
const canvas = document.getElementById('map');
const ctx = canvas.getContext('2d');

const nodes = [
  { id: 'auth', label: 'Authentication', x: 200, y: 150, category: 'security' },
  { id: 'db', label: 'Database', x: 400, y: 200, category: 'data' },
  // ...
];

const edges = [
  { from: 'auth', to: 'db', label: 'queries' },
  // ...
];

// Category colors
const COLORS = {
  security: { fill: '#fef3c7', stroke: '#f59e0b', text: '#78350f' },
  data: { fill: '#dcfce7', stroke: '#22c55e', text: '#14532d' },
  ui: { fill: '#dbeafe', stroke: '#3b82f6', text: '#1e3a5f' },
  infra: { fill: '#f3e8ff', stroke: '#a855f7', text: '#581c87' },
};
```

## Interaction

Use `window.visualizer.choice(nodeId, { label })` when a node is clicked, so Claude can read which concept the user selected.

## Sidebar Controls

Add a sidebar with knowledge-level toggles:
- Know (green) / Fuzzy (amber) / Unknown (red) per concept
- This helps Claude understand what to explain vs. skip
