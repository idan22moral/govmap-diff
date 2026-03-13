class LRUCache {
    constructor(size) {
        this.size = size;
        this.map = new Map();
    }

    get(key) {
        if (!this.map.has(key)) return undefined;

        const value = this.map.get(key);
        this.map.delete(key);
        this.map.set(key, value); // move to most recent
        return value;
    }

    set(key, value) {
        if (this.map.has(key)) {
            this.map.delete(key);
        }

        this.map.set(key, value);

        this._cleanup();
    }

    _cleanup() {
        if (this.map.size > this.size) {
            const oldestKey = this.map.keys().next().value;
            this.map.delete(oldestKey);
        }
    }
}

const originalDrawImage = CanvasRenderingContext2D.prototype.drawImage;

const defaultSettings = {
    enabled: true,
    current: 'orto2025me',
    compare: 'orto2023me',
    threshold: 20,
    heatmapMax: 80
};

function calcDiffImageData(image1, image2, out, diffThreshold, heatmapMax) {
    const invHeat = 1 / heatmapMax;
    for (let p = 0; p < image1.length; p += 4) {
        const r1 = image1[p];
        const g1 = image1[p + 1];
        const b1 = image1[p + 2];

        const r2 = image2[p];
        const g2 = image2[p + 1];
        const b2 = image2[p + 2];

        // luminance
        const y1 = luminance(r1, g1, b1);
        const y2 = luminance(r2, g2, b2);

        const diff = Math.abs(y1 - y2);

        if (diff < diffThreshold) {
            // unchanged → grayscale background
            out[p] = y1;
            out[p + 1] = y1;
            out[p + 2] = y1;
            out[p + 3] = 255;
        } else {

            // heatmap: yellow → red
            let t = diff * invHeat;
            if (t > 1) t = 1;

            out[p] = 255;
            out[p + 1] = 255 * (1 - t);
            out[p + 2] = 0;
            out[p + 3] = 255;
        }
    }
}

const luminance = (r, g, b) => (77 * r + 150 * g + 29 * b) >> 8;


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

const imageDataCache = new LRUCache(1000);

function generateDiffImage(originalImage, compareImage, settings) {
    const { diffCanvas: canvas, diffCtx: ctx } = window;
    const { width: imageWidth, height: imageHeight } = originalImage;

    if (canvas.width !== imageWidth || canvas.height !== imageHeight) {
        canvas.width = imageWidth;
        canvas.height = imageHeight;
    }

    // draw first image
    ctx.clearRect(0, 0, imageWidth, imageHeight);
    ctx.drawImage(originalImage, 0, 0);
    const currentImageData = ctx.getImageData(0, 0, imageWidth, imageHeight);

    // draw second image
    ctx.clearRect(0, 0, imageWidth, imageHeight);
    ctx.drawImage(compareImage, 0, 0);
    const compareImageData = ctx.getImageData(0, 0, imageWidth, imageHeight);

    const diffImageData = ctx.createImageData(imageWidth, imageHeight);
    calcDiffImageData(currentImageData.data, compareImageData.data, diffImageData.data, settings.threshold, settings.heatmapMax);

    return diffImageData;
};

function patchedDrawImage(originalImage, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight) {
    const currentImageSrc = originalImage.src;
    if (!settings.enabled || !originalImage || !currentImageSrc) {
        originalDrawImage.call(this, originalImage, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight);
        return;
    }

    const boundDrawImage = window.originalDrawImageImpl.bind(this);

    const compareImageSrc = currentImageSrc.replace(settings.current, settings.compare);
    if (currentImageSrc === compareImageSrc) {
        boundDrawImage(originalImage, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight);
        return;
    }

    const { width: imageWidth, height: imageHeight } = originalImage;
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
    compareImage.crossOrigin = 'anonymous';
    compareImage.onload = () => {
        const diffImageData = generateDiffImage(originalImage, compareImage, settings);
        imageDataCache.set(compareImageSrc, diffImageData);

        ctx.putImageData(diffImageData, 0, 0);
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

CanvasRenderingContext2D.prototype.drawImage = patchedDrawImage;
