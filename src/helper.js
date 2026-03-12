(function() {
  const WS_URL = 'ws://' + window.location.host;
  let ws = null;
  let eventQueue = [];

  function connect() {
    ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      eventQueue.forEach(e => ws.send(JSON.stringify(e)));
      eventQueue = [];
      const status = document.querySelector('.header .status');
      if (status) status.textContent = 'Connected';
    };

    ws.onmessage = (msg) => {
      const data = JSON.parse(msg.data);
      if (data.type === 'reload') {
        window.location.reload();
      }
    };

    ws.onclose = () => {
      const status = document.querySelector('.header .status');
      if (status) {
        status.textContent = 'Reconnecting...';
        status.style.color = 'var(--warning)';
      }
      setTimeout(connect, 1000);
    };
  }

  function sendEvent(event) {
    event.timestamp = Date.now();
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(event));
    } else {
      eventQueue.push(event);
    }
  }

  // Capture clicks on choice elements
  document.addEventListener('click', (e) => {
    const target = e.target.closest('[data-choice]');
    if (!target) return;

    sendEvent({
      type: 'click',
      text: target.textContent.trim(),
      choice: target.dataset.choice,
      id: target.id || null
    });

    setTimeout(() => {
      const indicator = document.getElementById('indicator-text');
      if (!indicator) return;
      const container = target.closest('.options') || target.closest('.cards');
      const selected = container ? container.querySelectorAll('.selected') : [];
      if (selected.length === 0) {
        indicator.textContent = 'Interact above, then return to the terminal';
      } else if (selected.length === 1) {
        const label = selected[0].querySelector('h3')?.textContent?.trim() || selected[0].dataset.choice;
        indicator.innerHTML = '<span class="selected-text">' + label + ' selected</span> — return to terminal to continue';
      } else {
        indicator.innerHTML = '<span class="selected-text">' + selected.length + ' selected</span> — return to terminal to continue';
      }
    }, 0);
  });

  window.selectedChoice = null;

  window.toggleSelect = function(el) {
    // Look for standard frame containers first, then SVG parent
    const container = el.closest('.options') || el.closest('.cards') || el.closest('svg');
    const multi = container && container.dataset && container.dataset.multiselect !== undefined;
    if (container && !multi) {
      // Deselect siblings: .option/.card in HTML containers, or [data-choice] in SVG
      const selector = container.tagName === 'svg'
        ? '[data-choice]'
        : '.option, .card';
      container.querySelectorAll(selector).forEach(o => o.classList.remove('selected'));
    }
    if (multi) {
      el.classList.toggle('selected');
    } else {
      el.classList.add('selected');
    }
    window.selectedChoice = el.dataset.choice;
  };

  window.visualizer = {
    send: sendEvent,
    choice: (value, metadata = {}) => sendEvent({ type: 'choice', value, ...metadata })
  };

  connect();
})();
