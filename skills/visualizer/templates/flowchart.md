# Flowchart Template

For process flows, state machines, decision trees, and sequential workflows.

## Layout

Use SVG for the flowchart. Arrange nodes vertically (top-to-bottom) or horizontally (left-to-right) depending on the process length.

```
┌─────────────────────────────────────────────┐
│  h2: Title                                  │
│  .subtitle: Description                     │
├─────────────────────────────────────────────┤
│                                             │
│  <svg> flowchart area                       │
│    ┌─────────┐                              │
│    │  Start  │                              │
│    └────┬────┘                              │
│         │                                   │
│     ◇───┴───◇                               │
│    ╱ Decision ╲                              │
│   ╱           ╲                             │
│  Yes          No                            │
│   │            │                            │
│   ▼            ▼                            │
│ ┌──────┐   ┌──────┐                        │
│ │ Step │   │ Step │                        │
│ └──────┘   └──────┘                        │
│                                             │
├─────────────────────────────────────────────┤
│  Legend / annotation area (optional)        │
└─────────────────────────────────────────────┘
```

## SVG Patterns

### Process node (rounded rectangle)
```html
<rect x="140" y="20" width="140" height="50" rx="8"
      fill="#dbeafe" stroke="#3b82f6" stroke-width="1.5"
      data-choice="validate-input" onclick="toggleSelect(this)"
      style="cursor: pointer;" />
<text x="210" y="50" text-anchor="middle" font-size="13"
      fill="#1e3a5f" font-family="system-ui">Validate Input</text>
```

### Decision node (diamond)
```html
<polygon points="210,120 300,160 210,200 120,160"
         fill="#fef3c7" stroke="#f59e0b" stroke-width="1.5"
         data-choice="is-valid" onclick="toggleSelect(this)"
         style="cursor: pointer;" />
<text x="210" y="165" text-anchor="middle" font-size="12"
      fill="#78350f" font-family="system-ui">Is valid?</text>
```

### Start/End node (pill shape)
```html
<rect x="160" y="10" width="100" height="36" rx="18"
      fill="#dcfce7" stroke="#22c55e" stroke-width="1.5" />
<text x="210" y="33" text-anchor="middle" font-size="13"
      fill="#14532d" font-family="system-ui">Start</text>
```

### Connections (straight lines with arrows)
```html
<!-- Vertical connection -->
<line x1="210" y1="70" x2="210" y2="120"
      stroke="#94a3b8" stroke-width="1.5"
      marker-end="url(#arrow)" />

<!-- Branch with label -->
<line x1="300" y1="160" x2="380" y2="160"
      stroke="#94a3b8" stroke-width="1.5"
      marker-end="url(#arrow)" />
<text x="340" y="152" text-anchor="middle" font-size="11"
      fill="#64748b" font-family="system-ui">Yes</text>
```

### Dashed connections (async or optional paths)
```html
<line x1="210" y1="200" x2="210" y2="260"
      stroke="#94a3b8" stroke-width="1.5"
      stroke-dasharray="5,5"
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

## Node Color Palette

| Node Type | Fill | Stroke | Text |
|-----------|------|--------|------|
| Start/End | `#dcfce7` | `#22c55e` | `#14532d` |
| Process | `#dbeafe` | `#3b82f6` | `#1e3a5f` |
| Decision | `#fef3c7` | `#f59e0b` | `#78350f` |
| Error/Reject | `#fee2e2` | `#ef4444` | `#7f1d1d` |
| External/Async | `#f3e8ff` | `#a855f7` | `#581c87` |

## Connection Types

| Type | Style | Use For |
|------|-------|---------|
| Solid | `stroke-width="1.5"` | Normal flow |
| Dashed | `stroke-dasharray="5,5"` | Optional or async path |
| Dotted | `stroke-dasharray="2,4"` | Error or fallback path |
| Bold | `stroke-width="2.5"` | Primary/happy path |

## State Machine Variation

For state machines, use the same node shapes but add self-loops and bidirectional edges:

```html
<!-- Self-loop (curved path back to same node) -->
<path d="M250,40 C290,0 330,0 290,40"
      fill="none" stroke="#94a3b8" stroke-width="1.5"
      marker-end="url(#arrow)" />
<text x="290" y="-5" text-anchor="middle" font-size="10"
      fill="#64748b" font-family="system-ui">retry</text>
```

## Interaction

Make nodes clickable with `data-choice` to let the user select steps they want to discuss, modify, or drill into. Decision nodes are especially useful as interaction points since the user can explore different branches.

## Full Document Note

Flowcharts should be written as **full HTML documents** (starting with `<!DOCTYPE html>`) since they need precise SVG positioning and may require JavaScript for layout calculations. The helper.js is still auto-injected.

## Tips

- Keep the SVG `viewBox` wide enough for branches (at least 500px wide for two branches)
- Use consistent vertical spacing (80-100px between node rows)
- Label every connection, especially branches from decision nodes
- Highlight the "happy path" with bolder strokes
- For complex flows with many branches, consider splitting into multiple screens
