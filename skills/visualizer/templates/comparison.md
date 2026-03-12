# Comparison Template

For side-by-side comparisons of designs, approaches, configurations, or options.

## Layout

```
┌──────────────────────────────────────────────┐
│  h2: "Which approach works better?"          │
│  .subtitle: Context for the decision         │
├──────────────────┬───────────────────────────┤
│  .split          │                           │
│  ┌────────────┐  │  ┌────────────┐           │
│  │ .mockup    │  │  │ .mockup    │           │
│  │ Option A   │  │  │ Option B   │           │
│  │            │  │  │            │           │
│  └────────────┘  │  └────────────┘           │
├──────────────────┴───────────────────────────┤
│  .pros-cons per option (optional)            │
├──────────────────────────────────────────────┤
│  .options for final selection                │
└──────────────────────────────────────────────┘
```

## Pattern

```html
<h2>Which layout structure works better?</h2>
<p class="subtitle">Consider content density and navigation clarity</p>

<div class="split">
  <div>
    <div class="mockup" data-choice="sidebar" onclick="toggleSelect(this)">
      <div class="mockup-header">Option A: Sidebar Navigation</div>
      <div class="mockup-body">
        <div style="display:flex; min-height:200px;">
          <div class="mock-sidebar">
            <div class="label">Navigation</div>
            <p style="font-size:0.8rem; color:var(--text-secondary)">Dashboard<br>Reports<br>Settings</p>
          </div>
          <div class="mock-content">
            <div class="placeholder">Main content area</div>
          </div>
        </div>
      </div>
    </div>
    <div class="pros-cons">
      <div class="pros"><h4>Pros</h4><ul><li>Always visible nav</li><li>Scales to many items</li></ul></div>
      <div class="cons"><h4>Cons</h4><ul><li>Takes horizontal space</li></ul></div>
    </div>
  </div>

  <div>
    <div class="mockup" data-choice="topnav" onclick="toggleSelect(this)">
      <div class="mockup-header">Option B: Top Navigation</div>
      <div class="mockup-body">
        <div class="mock-nav">Dashboard | Reports | Settings</div>
        <div class="mock-content" style="min-height:200px;">
          <div class="placeholder">Full-width content area</div>
        </div>
      </div>
    </div>
    <div class="pros-cons">
      <div class="pros"><h4>Pros</h4><ul><li>Full content width</li><li>Familiar pattern</li></ul></div>
      <div class="cons"><h4>Cons</h4><ul><li>Limited nav items</li></ul></div>
    </div>
  </div>
</div>
```

## Tips

- Show the SAME content in both options so the user compares structure, not content
- Include pros/cons only when the tradeoffs aren't visually obvious
- For more than 2 options, use `.cards` instead of `.split`
