// Bridge script (isolated world) that reads settings from chrome.storage
// and exposes them to the page (MAIN world) where the patch runs.

function applySettings(stored) {
  const config = stored || {};
  window.__OL_DIFF_SETTINGS__ = {
    enabled: config.enabled !== false,
    current: config.current || 'orto2025me',
    compare: config.compare || 'orto2023me',
    threshold: config.threshold ?? 20,
    heatmapMax: config.heatmapMax ?? 80
  };

  // Make the settings available in the page world by dispatching a DOM event.
  try {
    const event = new CustomEvent('olDiffSettings', { detail: window.__OL_DIFF_SETTINGS__ });
    window.dispatchEvent(event);
  } catch {
    // Some pages may seal/lock window; ignore if dispatch fails.
  }

  try {
    localStorage.setItem('olDiffSettings', JSON.stringify(window.__OL_DIFF_SETTINGS__));
  } catch {
    // localStorage may be blocked in some contexts; ignore.
  }
}

chrome.storage.sync.get('olDiffSettings', (items) => {
  applySettings(items.olDiffSettings);
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.olDiffSettings) {
    applySettings(changes.olDiffSettings.newValue);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === 'olDiffSettings' && message.settings) {
    applySettings(message.settings);
    sendResponse({ ok: true });
  }
});
