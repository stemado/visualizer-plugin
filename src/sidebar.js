(function() {
  const SIDEBAR_WIDTH = '220px';
  const COLLAPSED_KEY = 'visualizer-sidebar-collapsed';

  // Build sidebar DOM
  const sidebar = document.createElement('div');
  sidebar.id = 'viz-sidebar';
  sidebar.innerHTML = `
    <div class="viz-sidebar-header">
      <span class="viz-sidebar-title">History</span>
      <span class="viz-sidebar-toggle" title="Collapse">\u2039</span>
    </div>
    <div class="viz-sidebar-entries"></div>
    <div class="viz-sidebar-footer"></div>
  `;

  // Inject styles
  const style = document.createElement('style');
  style.textContent = `
    #viz-sidebar {
      position: fixed; left: 0; top: 0; bottom: 0; width: ${SIDEBAR_WIDTH};
      background: #111; border-right: 1px solid #2a2a2a; z-index: 9999;
      display: flex; flex-direction: column; font-family: system-ui, sans-serif;
      transition: transform 0.2s ease;
    }
    #viz-sidebar.collapsed { transform: translateX(-100%); }
    .viz-sidebar-header {
      padding: 12px 14px; border-bottom: 1px solid #2a2a2a;
      display: flex; justify-content: space-between; align-items: center;
    }
    .viz-sidebar-title { font-size: 11px; font-weight: 600; color: #888; letter-spacing: 1px; text-transform: uppercase; }
    .viz-sidebar-toggle { font-size: 16px; color: #555; cursor: pointer; user-select: none; }
    .viz-sidebar-entries { flex: 1; overflow-y: auto; padding: 8px; }
    .viz-sidebar-footer { padding: 10px 14px; border-top: 1px solid #2a2a2a; text-align: center; font-size: 10px; color: #555; }
    .viz-sidebar-entry {
      padding: 10px; margin-bottom: 6px; border-radius: 8px;
      background: #1a1a1a; border: 1px solid #2a2a2a; cursor: pointer;
    }
    .viz-sidebar-entry:hover { border-color: #444; }
    .viz-sidebar-entry.current { background: #1a2e1a; border-color: #4caf50; }
    .viz-sidebar-entry .entry-badge {
      font-size: 10px; font-weight: 700; background: #222; color: #888;
      padding: 2px 6px; border-radius: 4px; display: inline-block; margin-bottom: 4px;
    }
    .viz-sidebar-entry.current .entry-badge { background: #1a3a1a; color: #4caf50; }
    .viz-sidebar-entry .entry-current-tag { font-size: 10px; color: #4caf50; font-weight: 600; margin-left: 6px; }
    .viz-sidebar-entry .entry-title { font-size: 12px; color: #ccc; font-weight: 500; margin-bottom: 2px; }
    .viz-sidebar-entry.current .entry-title { color: #c8e6c9; }
    .viz-sidebar-entry .entry-time { font-size: 10px; color: #666; }
    #viz-sidebar-expand {
      position: fixed; left: 0; top: 50%; transform: translateY(-50%);
      width: 24px; height: 48px; background: #222; border: 1px solid #444;
      border-left: none; border-radius: 0 6px 6px 0;
      display: none; align-items: center; justify-content: center;
      cursor: pointer; z-index: 9998; color: #888; font-size: 14px;
    }
    #viz-sidebar-expand.visible { display: flex; }
    .viz-archive-banner {
      position: fixed; top: 0; left: ${SIDEBAR_WIDTH}; right: 0;
      background: #2d1a1a; color: #ffcc80; padding: 6px 16px;
      font-size: 12px; z-index: 9998; display: none; text-align: center;
    }
    .viz-archive-banner a { color: #4caf50; cursor: pointer; text-decoration: underline; }
    .viz-archive-banner.visible { display: block; }
    body { margin-left: ${SIDEBAR_WIDTH}; transition: margin-left 0.2s ease; }
    body.viz-sidebar-collapsed { margin-left: 0; }
    @media (max-width: 900px) {
      #viz-sidebar { transform: translateX(-100%); }
      #viz-sidebar-expand { display: flex; }
      body { margin-left: 0; }
    }
  `;

  document.head.appendChild(style);
  document.body.appendChild(sidebar);

  // Expand tab
  const expandBtn = document.createElement('div');
  expandBtn.id = 'viz-sidebar-expand';
  expandBtn.textContent = '\u203A';
  document.body.appendChild(expandBtn);

  // Archive banner
  const banner = document.createElement('div');
  banner.className = 'viz-archive-banner';
  banner.innerHTML = 'Viewing archived screen \u2014 <a onclick="window.location.href=\'/\'">return to live</a>';
  document.body.appendChild(banner);

  // State
  const isArchiveView = typeof window.__visualizerArchiveIndex === 'number';
  var collapsed = localStorage.getItem(COLLAPSED_KEY) === 'true';

  function updateCollapsed() {
    sidebar.classList.toggle('collapsed', collapsed);
    expandBtn.classList.toggle('visible', collapsed);
    document.body.classList.toggle('viz-sidebar-collapsed', collapsed);
    localStorage.setItem(COLLAPSED_KEY, collapsed);
  }

  sidebar.querySelector('.viz-sidebar-toggle').addEventListener('click', function() {
    collapsed = true;
    updateCollapsed();
  });
  expandBtn.addEventListener('click', function() {
    collapsed = false;
    updateCollapsed();
  });
  updateCollapsed();

  // Show archive banner if viewing archived screen
  if (isArchiveView) {
    banner.classList.add('visible');
  }

  // Fetch and render manifest
  function loadManifest() {
    fetch('/archive/manifest')
      .then(function(res) { return res.ok ? res.json() : null; })
      .then(function(manifest) { if (manifest) renderEntries(manifest.screens); })
      .catch(function() { /* Sidebar is non-critical */ });
  }

  function renderEntries(screens) {
    var container = sidebar.querySelector('.viz-sidebar-entries');
    var footer = sidebar.querySelector('.viz-sidebar-footer');

    if (screens.length === 0) {
      container.innerHTML = '<div style="padding:1rem;text-align:center;color:#555;font-size:11px;">No screens yet</div>';
      footer.textContent = '0 screens';
      return;
    }

    // Reverse: newest first
    var reversed = screens.slice().reverse();
    var latestIndex = reversed[0].index;

    container.innerHTML = reversed.map(function(s) {
      var isCurrent = !isArchiveView && s.index === latestIndex;
      var isViewing = isArchiveView && s.index === window.__visualizerArchiveIndex;
      var time = new Date(s.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      var cls = isCurrent || isViewing ? 'current' : '';
      var href = isCurrent ? '/' : '/archive/' + s.index;
      return '<div class="viz-sidebar-entry ' + cls + '" onclick="window.location.href=\'' + href + '\'">' +
        '<span class="entry-badge">' + s.index + '</span>' +
        (isCurrent ? '<span class="entry-current-tag">CURRENT</span>' : '') +
        (isViewing ? '<span class="entry-current-tag">VIEWING</span>' : '') +
        '<div class="entry-title">' + s.title + '</div>' +
        '<div class="entry-time">' + time + '</div>' +
      '</div>';
    }).join('');

    footer.textContent = screens.length + ' screen' + (screens.length !== 1 ? 's' : '');
  }

  // If viewing archive and a reload comes in (new screen pushed), go to live view
  if (isArchiveView) {
    var archiveWs = new WebSocket('ws://' + window.location.host);
    archiveWs.onmessage = function(msg) {
      try {
        var data = JSON.parse(msg.data);
        if (data.type === 'reload') {
          window.location.href = '/';
        }
      } catch (e) {}
    };
  }

  loadManifest();
})();
