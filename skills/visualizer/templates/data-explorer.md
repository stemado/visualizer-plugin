# Data Explorer Template

For data queries, pipeline builders, schema explorers, API designers, and structured configuration tools.

## Layout

```
┌──────────────────────────────────────────────┐
│  h2: Title                                   │
│  .subtitle: Description                      │
├──────────────┬───────────────────────────────┤
│              │                               │
│  Controls    │  Formatted output             │
│  grouped by: │  (syntax-highlighted code,    │
│  • Source    │   table preview, or           │
│  • Fields   │   visual diagram)             │
│  • Filters  │                               │
│  • Grouping │                               │
│  • Ordering │                               │
│  • Limits   │                               │
│              ├───────────────────────────────┤
│              │  Summary / action area        │
│              │  [ Apply ] [ Reset ]          │
├──────────────┴───────────────────────────────┤
│  .options for next-step selection             │
└──────────────────────────────────────────────┘
```

## Pattern

```html
<h2>Build your query</h2>
<p class="subtitle">Select tables, columns, and filters to explore the data</p>

<div class="split">
  <div>
    <div class="section">
      <div class="label">Tables</div>
      <div class="cards" data-multiselect>
        <div class="card" data-choice="users" onclick="toggleSelect(this)">
          <div class="card-body">
            <h3>users</h3>
            <p>id, name, email, created_at</p>
          </div>
        </div>
        <div class="card" data-choice="orders" onclick="toggleSelect(this)">
          <div class="card-body">
            <h3>orders</h3>
            <p>id, user_id, total, status</p>
          </div>
        </div>
        <div class="card" data-choice="products" onclick="toggleSelect(this)">
          <div class="card-body">
            <h3>products</h3>
            <p>id, name, price, category</p>
          </div>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="label">Filters</div>
      <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
        <div class="mock-input" style="flex:1; min-width:120px;">Column</div>
        <div class="mock-input" style="width:60px;">=</div>
        <div class="mock-input" style="flex:1; min-width:120px;">Value</div>
      </div>
    </div>

    <div class="section">
      <div class="label">Options</div>
      <div class="options">
        <div class="option" data-choice="group-by" onclick="toggleSelect(this)">
          <div class="letter">G</div>
          <div class="content"><h3>Group By</h3><p>Aggregate results</p></div>
        </div>
        <div class="option" data-choice="order-by" onclick="toggleSelect(this)">
          <div class="letter">O</div>
          <div class="content"><h3>Order By</h3><p>Sort results</p></div>
        </div>
      </div>
    </div>
  </div>

  <div>
    <div class="mockup">
      <div class="mockup-header">Query Preview</div>
      <div class="mockup-body">
        <pre style="margin:0; font-size:0.85rem; line-height:1.6; color:var(--text-primary);">
<span style="color:#3b82f6; font-weight:600;">SELECT</span> *
<span style="color:#3b82f6; font-weight:600;">FROM</span> <span style="color:#22c55e;">users</span>
<span style="color:#3b82f6; font-weight:600;">JOIN</span> <span style="color:#22c55e;">orders</span>
  <span style="color:#3b82f6; font-weight:600;">ON</span> users.id = orders.user_id
<span style="color:#3b82f6; font-weight:600;">LIMIT</span> <span style="color:#f59e0b;">100</span></pre>
      </div>
    </div>

    <div style="margin-top:1rem; display:flex; gap:0.5rem;">
      <div class="mock-button" data-choice="run-query" onclick="toggleSelect(this)"
           style="flex:1; text-align:center; cursor:pointer;">Run Query</div>
      <div class="mock-button" data-choice="reset" onclick="toggleSelect(this)"
           style="flex:1; text-align:center; cursor:pointer; opacity:0.7;">Reset</div>
    </div>
  </div>
</div>
```

## Control Types by Decision

| Decision | Control | Example |
|---|---|---|
| Select from available items | Clickable `.card` or chips | table names, columns, HTTP methods |
| Add filter/condition rows | Row of `.mock-input` elements | WHERE column op value |
| Join type or aggregation | `.option` selectors | INNER/LEFT/RIGHT, COUNT/SUM/AVG |
| Limit/offset | Range input or `.mock-input` | result count 1-500 |
| Ordering | `.option` with ASC/DESC | order by column |
| On/off features | Toggle-style `.option` | show descriptions, include header |

## Interaction

- Use `data-choice` on tables, columns, filters, and action buttons
- Use `data-multiselect` on containers where multiple selections make sense (e.g., columns to include)
- For complex interactions (drag-to-reorder, slider values), use `window.visualizer.send({ type: 'config', ... })` to pass structured configuration back to the server
- Action buttons like "Run Query" or "Apply" should use `window.visualizer.choice('run-query', { tables: [...], filters: [...] })` to send the full configuration

## Preview Rendering

Render syntax-highlighted output using inline `<span>` styles within a `<pre>` block:

- **Keywords** (SELECT, FROM, WHERE): bold blue `#3b82f6`
- **Tables/identifiers**: green `#22c55e`
- **Strings**: amber `#f59e0b`
- **Numbers**: amber `#f59e0b`

For pipeline-style explorers, render a horizontal flow using positioned divs with arrow connectors instead of a code preview.

## Tips

- Start with table/source selection, then progressively reveal columns, filters, and options as selections are made
- Always show a live preview of the generated query or configuration on the right side
- Use `.cards` with `data-multiselect` for column selection since users typically pick several
- Frame action buttons as next steps: "Run Query", "Export Config", "Generate Code"
- For schema exploration, show column types and sample values inside each `.card`

## Example Topics

- SQL query builder (tables, joins, filters, group by, order by, limit)
- API endpoint designer (routes, methods, request/response fields)
- Data transformation pipeline (source, filter, map, aggregate, output)
- Schema explorer (browse tables, inspect columns, view relationships)
- Configuration builder (structured settings with validation preview)
