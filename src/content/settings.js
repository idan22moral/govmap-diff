const STORAGE_KEY = 'olDiffSettings';
const defaultSettings = {
    enabled: true,
    current: 'orto2025me',
    compare: 'orto2023me',
    threshold: 20,
    heatmapMax: 80
};

export function getCurrentSettings() {
    if (window.__GOVMAP_DIFF_SETTINGS__) {
        return window.__GOVMAP_DIFF_SETTINGS__;
    }

    const storedSettings = JSON.parse(localStorage.getItem(STORAGE_KEY) || {});
    const mergedSettings = { ...defaultSettings, ...storedSettings };

    window.__GOVMAP_DIFF_SETTINGS__ = mergedSettings;

    return mergedSettings;
}
