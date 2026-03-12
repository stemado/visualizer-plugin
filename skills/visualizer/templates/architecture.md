# Architecture Diagram Template

For system architecture, service maps, component relationships, and layer diagrams.

## Layout

Use SVG for the diagram area. Organize nodes in horizontal bands by layer:

```
┌─────────────────────────────────────────────┐
│  h2: Title                                  │
│  .subtitle: Description                     │
├─────────────────────────────────────────────┤
│                                             │
│  <svg> diagram area                         │
│    ┌─────┐     ┌─────┐     ┌─────┐         │
│    │ API │────→│Cache│────→│ DB  │         │
│    └─────┘     └─────┘     └─────┘         │
│                                             │
├─────────────────────────────────────────────┤
│  Comment/annotation area (optional)         │
└─────────────────────────────────────────────┘
```

## SVG Patterns

### Nodes (rounded rectangles)
```html
<rect x="50" y="30" width="120" height="50" rx="8"
      fill="#dbeafe" stroke="#3b82f6" stroke-width="1.5"
      data-choice="api-gateway" onclick="toggleSelect(this)"
      style="cursor: pointer;" />
<text x="110" y="60" text-anchor="middle" font-size="13"
      fill="#1e3a5f" font-family="system-ui">API Gateway</text>
```

### Connections (curved paths)
```html
<path d="M170,55 C200,55 210,55 240,55"
      fill="none" stroke="#94a3b8" stroke-width="1.5"
      marker-end="url(#arrow)" />
```

### Arrow marker definition
```html
<defs>
  <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5"
          markerWidth="6" markerHeight="6" orient="auto-start-reverse">
    <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
  </marker>
</defs>
```

### Layer color palette
| Layer | Fill | Stroke | Text |
|-------|------|--------|------|
| Client/UI | `#dbeafe` | `#3b82f6` | `#1e3a5f` |
| Server/API | `#fef3c7` | `#f59e0b` | `#78350f` |
| Data/Storage | `#dcfce7` | `#22c55e` | `#14532d` |
| External | `#fce7f3` | `#ec4899` | `#831843` |
| Infrastructure | `#f3e8ff` | `#a855f7` | `#581c87` |

### Connection types
| Type | Color | Style |
|------|-------|-------|
| Data flow | `#3b82f6` | Solid |
| API call | `#22c55e` | Solid |
| Event/async | `#f59e0b` | Dashed (`stroke-dasharray="5,5"`) |
| Dependency | `#94a3b8` | Dotted (`stroke-dasharray="2,4"`) |

## Interaction

Make nodes clickable with `data-choice` to let the user select components they want to discuss or modify. Use the selection to drive follow-up questions.

## Full Document Note

Architecture diagrams should be written as **full HTML documents** (starting with `<!DOCTYPE html>`) since they need precise SVG positioning. The helper.js is still auto-injected.
