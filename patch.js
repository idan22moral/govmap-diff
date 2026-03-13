// Patch for drawImage to show a diff between two tile sources.
// Uses stored settings (enabled/current/compare/threshold/heatmapMax) from chrome.storage.sync.
class LRUCache {
    constructor(size) {
        this.size = size;
        this.map = new Map();
        this.queue = [];
    }

    get(key) {
        return this.map.get(key);
    }

    set(key, value) {
        this._makeRoom();
        this.map.set(key, value);
        this.queue.push(key);
    }

    _makeRoom() {
        if (this.queue.length === this.size) {
            const keyToDelete = this.queue.shift();
            this.map.delete(keyToDelete);
        }
    }
}

let wasmUrl;

window.addEventListener("message", async (e) => {
    if (e.source !== window) return;
    if (e.data?.type !== "EXT_WASM_URL") return;

    wasmUrl = e.data.url;
    console.log('wasmUrl', wasmUrl)


    //   const { instance } = await WebAssembly.instantiateStreaming(fetch(wasmUrl));
    window.diffAlgo = await import(wasmUrl);
    await window.diffAlgo.default();

    console.log("WASM loaded", window.diffAlgo);
});

const originalDrawImage = CanvasRenderingContext2D.prototype.drawImage;

const defaultSettings = {
    enabled: true,
    current: 'orto2025me',
    compare: 'orto2023me',
    threshold: 20,
    heatmapMax: 80
};

async function calcImage(image1, image2, out, diffThreshold, heatmapMax) {
    window.diffAlgo.calc_image(image1, image2, out, diffThreshold, heatmapMax);
}

let settings = { ...defaultSettings };

function applySettings(newSettings) {
    settings = { ...defaultSettings, ...newSettings };
    window.__OL_DIFF_SETTINGS__ = settings;
}

// Initialize from any settings already injected by the bridge script.
applySettings(window.__OL_DIFF_SETTINGS__ || {});

// Keep in sync when the bridge script updates settings.
window.addEventListener('olDiffSettings', (event) => {
    if (event?.detail) {
        applySettings(event.detail);
    }
});

window.originalDrawImageImpl = CanvasRenderingContext2D.prototype.drawImage;
window.diffCanvas = document.createElement("canvas");
window.diffCtx = window.diffCanvas.getContext("2d", { willReadFrequently: true });
window.diffCtx.drawImage = window.originalDrawImageImpl.bind(window.diffCtx);

const imageDataCache = new LRUCache(600);

CanvasRenderingContext2D.prototype.drawImage = function (originalImage, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight) {
    const currentImageSrc = originalImage.src;
    if (!settings.enabled || !originalImage || !currentImageSrc) {
        return originalDrawImage.call(this, originalImage, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight);
    }

    const boundDrawImage = window.originalDrawImageImpl.bind(this);

    const compareImageSrc = currentImageSrc.replace(settings.current, settings.compare);

    if (currentImageSrc === compareImageSrc) {
        boundDrawImage(originalImage, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight);
        return;
    }

    const imageWidth = originalImage.width;
    const imageHeight = originalImage.height;
    const ctx = window.diffCtx;
    const canvas = window.diffCanvas;

    const cachedImageData = imageDataCache.get(compareImageSrc);

    if (cachedImageData) {
        ctx.putImageData(cachedImageData, 0, 0);
        boundDrawImage(
            canvas,
            sx, sx,
            imageWidth - 2 * sx,
            imageHeight - 2 * sx,
            dx, dy,
            dWidth, dHeight
        );
        return;
    }

    const compareImage = new Image();
    compareImage.crossOrigin = "anonymous";

    compareImage.onload = () => {
        if (canvas.width !== imageWidth || canvas.height !== imageHeight) {
            canvas.width = imageWidth;
            canvas.height = imageHeight;
        }

        // draw first image
        ctx.clearRect(0, 0, imageWidth, imageHeight);
        ctx.drawImage(originalImage, 0, 0);
        const d1 = ctx.getImageData(0, 0, imageWidth, imageHeight);

        // draw second image
        ctx.clearRect(0, 0, imageWidth, imageHeight);
        ctx.drawImage(compareImage, 0, 0);
        const d2 = ctx.getImageData(0, 0, imageWidth, imageHeight);

        const out = ctx.createImageData(imageWidth, imageHeight);

        calcImage(d1.data, d2.data, out.data, settings.threshold, settings.heatmapMax);

        ctx.putImageData(out, 0, 0);
        imageDataCache.set(compareImageSrc, out);

        boundDrawImage(
            canvas,
            sx, sx,
            imageWidth - 2 * sx,
            imageHeight - 2 * sx,
            dx, dy,
            dWidth, dHeight
        );
    };

    compareImage.src = compareImageSrc;
};
