# Dashboard Template

For metric displays, KPI layouts, status boards, and monitoring dashboards.

## Layout

Use a `.cards` grid for metric tiles with inline SVG sparklines and color-coded status indicators.

```
┌──────────────────────────────────────────────┐
│  h2: Title                                   │
│  .subtitle: Time range or context            │
├──────────────────────────────────────────────┤
│  .cards (KPI tiles)                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ Metric A │  │ Metric B │  │ Metric C │   │
│  │  1,234   │  │   89%    │  │  $45.2K  │   │
│  │  ~~~~~~  │  │  ~~~~~~  │  │  ~~~~~~  │   │
│  │  +12%    │  │  -3%     │  │  +8%     │   │
│  └──────────┘  └──────────┘  └──────────┘   │
├──────────────────────────────────────────────┤
│  Detail section (table, chart, or breakdown) │
├──────────────────────────────────────────────┤
│  .options for drill-down selection           │
└──────────────────────────────────────────────┘
```

## Pattern

```html
<h2>System Health Dashboard</h2>
<p class="subtitle">Last 24 hours — updated 5 minutes ago</p>

<div class="cards">
  <div class="card" data-choice="requests" onclick="toggleSelect(this)">
    <div class="card-body">
      <div class="label">Total Requests</div>
      <div style="font-size:2rem; font-weight:700; color:var(--text-primary); margin:0.25rem 0;">
        1,247,893
      </div>
      <svg width="100%" height="32" viewBox="0 0 120 32" preserveAspectRatio="none"
           style="display:block; margin:0.5rem 0;">
        <polyline points="0,28 15,24 30,26 45,18 60,20 75,12 90,14 105,8 120,4"
                  fill="none" stroke="#22c55e" stroke-width="2" stroke-linecap="round"
                  stroke-linejoin="round" />
      </svg>
      <div style="font-size:0.85rem; color:#22c55e; font-weight:600;">
        +12.3% from yesterday
      </div>
    </div>
  </div>

  <div class="card" data-choice="errors" onclick="toggleSelect(this)">
    <div class="card-body">
      <div class="label">Error Rate</div>
      <div style="font-size:2rem; font-weight:700; color:var(--text-primary); margin:0.25rem 0;">
        0.42%
      </div>
      <svg width="100%" height="32" viewBox="0 0 120 32" preserveAspectRatio="none"
           style="display:block; margin:0.5rem 0;">
        <polyline points="0,16 15,18 30,14 45,20 60,22 75,24 90,20 105,26 120,28"
                  fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round"
                  stroke-linejoin="round" />
      </svg>
      <div style="font-size:0.85rem; color:#ef4444; font-weight:600;">
        +0.08% from yesterday
      </div>
    </div>
  </div>

  <div class="card" data-choice="latency" onclick="toggleSelect(this)">
    <div class="card-body">
      <div class="label">P95 Latency</div>
      <div style="font-size:2rem; font-weight:700; color:var(--text-primary); margin:0.25rem 0;">
        142ms
      </div>
      <svg width="100%" height="32" viewBox="0 0 120 32" preserveAspectRatio="none"
           style="display:block; margin:0.5rem 0;">
        <polyline points="0,20 15,18 30,16 45,14 60,16 75,12 90,10 105,12 120,8"
                  fill="none" stroke="#22c55e" stroke-width="2" stroke-linecap="round"
                  stroke-linejoin="round" />
      </svg>
      <div style="font-size:0.85rem; color:#22c55e; font-weight:600;">
        -18ms from yesterday
      </div>
    </div>
  </div>
</div>
```

## Sparkline SVG Pattern

Inline SVG sparklines fit inside metric cards without any JavaScript libraries:

```html
<!-- Upward trend (green) -->
<svg width="100%" height="32" viewBox="0 0 120 32" preserveAspectRatio="none">
  <polyline points="0,28 15,24 30,26 45,18 60,20 75,12 90,14 105,8 120,4"
            fill="none" stroke="#22c55e" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round" />
</svg>

<!-- Downward trend (red) -->
<svg width="100%" height="32" viewBox="0 0 120 32" preserveAspectRatio="none">
  <polyline points="0,4 15,8 30,6 45,14 60,12 75,20 90,18 105,24 120,28"
            fill="none" stroke="#ef4444" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round" />
</svg>

<!-- Stable/flat (blue) -->
<svg width="100%" height="32" viewBox="0 0 120 32" preserveAspectRatio="none">
  <polyline points="0,16 15,14 30,18 45,16 60,14 75,18 90,16 105,14 120,16"
            fill="none" stroke="#3b82f6" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round" />
</svg>

<!-- Sparkline with area fill -->
<svg width="100%" height="32" viewBox="0 0 120 32" preserveAspectRatio="none">
  <polygon points="0,32 0,28 15,24 30,26 45,18 60,20 75,12 90,14 105,8 120,4 120,32"
           fill="#22c55e" fill-opacity="0.1" />
  <polyline points="0,28 15,24 30,26 45,18 60,20 75,12 90,14 105,8 120,4"
            fill="none" stroke="#22c55e" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round" />
</svg>
```

## Status Indicators

Use inline colored dots or badges for status:

```html
<!-- Status dot -->
<span style="display:inline-block; width:8px; height:8px; border-radius:50%;
             background:#22c55e; margin-right:0.5rem;"></span>Healthy

<!-- Status badge -->
<span style="display:inline-block; padding:0.15rem 0.5rem; border-radius:9999px;
             font-size:0.75rem; font-weight:600;
             background:#dcfce7; color:#14532d;">Operational</span>
```

### Status Color Reference

| Status | Dot/Badge Color | Background | Text |
|--------|----------------|------------|------|
| Healthy/Good | `#22c55e` | `#dcfce7` | `#14532d` |
| Warning | `#f59e0b` | `#fef3c7` | `#78350f` |
| Error/Critical | `#ef4444` | `#fee2e2` | `#7f1d1d` |
| Info/Neutral | `#3b82f6` | `#dbeafe` | `#1e3a5f` |
| Inactive/Unknown | `#94a3b8` | `#f1f5f9` | `#475569` |

## Change Indicators

Show positive/negative changes with color and direction:

```html
<!-- Positive change (good) -->
<div style="font-size:0.85rem; color:#22c55e; font-weight:600;">+12.3%</div>

<!-- Negative change (bad) -->
<div style="font-size:0.85rem; color:#ef4444; font-weight:600;">-4.7%</div>

<!-- Neutral change -->
<div style="font-size:0.85rem; color:#94a3b8; font-weight:600;">0.0%</div>
```

Note: Color meaning depends on the metric. For error rates, an increase is red (bad) and a decrease is green (good). For revenue, the opposite. Choose colors based on whether the change is desirable, not just direction.

## Interaction

Make each metric card clickable with `data-choice` so the user can drill into specific metrics. Use the selection to show detailed breakdowns, time-series charts, or related metrics on the next screen.

## Tips

- Keep to 3-6 KPI tiles in the top row; more than 6 gets overwhelming
- Put the most important metric first (top-left)
- Use sparklines to show trend, not precision; they should be glanceable
- Include a time range in the subtitle so the numbers have context
- For detail sections below the KPIs, use `.split` with a table on one side and a breakdown on the other
- Use `var(--text-primary)` and `var(--text-secondary)` for text colors to respect dark/light mode
