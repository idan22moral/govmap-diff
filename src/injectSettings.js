// Bridge script (isolated world) that reads settings from chrome.storage
// and exposes them to the page (MAIN world) where the patch runs.

function applySettings(stored) {
  const config = stored || {};
  const settings = {
    enabled: config.enabled !== false,
    current: config.current || 'orto2025me',
    compare: config.compare || 'orto2023me',
    threshold: config.threshold ?? 20,
    heatmapMax: config.heatmapMax ?? 80
  };

  try {
    localStorage.setItem('olDiffSettings', JSON.stringify(settings));
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
