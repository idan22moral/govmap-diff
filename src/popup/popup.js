const STORAGE_KEY = 'olDiffSettings';

const defaults = {
  enabled: true,
  current: 'orto2025me',
  compare: 'orto2023me',
  threshold: 20
};

const $ = (id) => document.getElementById(id);

const loadSettings = () => {
  return new Promise((resolve) => {
    chrome.storage.sync.get(STORAGE_KEY, (items) => {
      const stored = items[STORAGE_KEY];
      resolve(Object.assign({}, defaults, stored));
    });
  });
};

const saveSettings = (settings) => {
  return new Promise((resolve) => {
    const obj = {};
    obj[STORAGE_KEY] = settings;
    chrome.storage.sync.set(obj, () => {
      resolve();
    });
  });
};

const updateUi = (settings) => {
  const toggle = $('toggle');
  toggle.textContent = settings.enabled ? 'ON' : 'OFF';
  $('current').value = settings.current;
  $('compare').value = settings.compare;
  $('threshold').value = settings.threshold;
};

const refreshActiveTab = () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs || !tabs[0]) return;
    chrome.tabs.reload(tabs[0].id);
  });
};

window.addEventListener('DOMContentLoaded', async () => {
  const settings = await loadSettings();
  updateUi(settings);

  $('toggle').addEventListener('click', async () => {
    settings.enabled = !settings.enabled;
    await saveSettings(settings);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    updateUi(settings);
    refreshActiveTab();
  });

  $('save').addEventListener('click', async () => {
    settings.current = $('current').value.trim() || defaults.current;
    settings.compare = $('compare').value.trim() || defaults.compare;
    settings.threshold = $('threshold').value || defaults.threshold;
    await saveSettings(settings);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    updateUi(settings);

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || !tabs[0]) return;
      chrome.tabs.sendMessage(tabs[0].id, {
        type: 'olDiffSettings',
        settings
      });
    });

    refreshActiveTab();
  });
});
