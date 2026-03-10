// Patch for drawImage to show a diff between two tile sources.
// Uses stored settings (enabled/current/compare/threshold/heatmapMax) from chrome.storage.sync.


const originalDrawImage = CanvasRenderingContext2D.prototype.drawImage;

const defaultSettings = {
    enabled: true,
    current: 'orto2025me',
    compare: 'orto2023me',
    threshold: 20,
    heatmapMax: 80
};

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
window.diffCtx = this.diffCanvas.getContext("2d", { willReadFrequently: true });
window.diffCtx.drawImage = window.originalDrawImageImpl.bind(window.diffCtx);

CanvasRenderingContext2D.prototype.drawImage = function (originalImage, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight) {
    if (!settings.enabled) {
        return originalDrawImage.call(this, originalImage, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight);
    }

    if (!originalImage || !originalImage.src) {
        return originalDrawImage.call(this, originalImage, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight);
    }

    const boundDrawImage = window.originalDrawImageImpl.bind(this);

    const src2 = originalImage.src.replace('2023me', '2025me');

    if (originalImage.src === src2) {
        boundDrawImage(originalImage, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight);
    }

    const img2 = new Image();
    img2.crossOrigin = "anonymous";

    img2.onload = () => {
        const w = originalImage.width;
        const h = originalImage.height;

        const buf = window.diffCanvas;
        const ctx = window.diffCtx;


        if (buf.width !== w || buf.height !== h) {
            buf.width = w;
            buf.height = h;
        }

        // draw first image
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(originalImage, 0, 0);
        const d1 = ctx.getImageData(0, 0, w, h);

        // draw second image
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(img2, 0, 0);
        const d2 = ctx.getImageData(0, 0, w, h);

        const out = ctx.createImageData(w, h);


        calcImage(d1.data, d2.data, out.data, settings.threshold, settings.heatmapMax);

        ctx.putImageData(out, 0, 0);

        boundDrawImage(
            buf,
            sx, sx,
            w - 2 * sx,
            h - 2 * sx,
            dx, dy,
            dWidth, dHeight
        );
    };

    img2.src = src2;
};

// the algorithm
function calcImage(image1, image2, out, diffThreshold, heatmapMax) {
    for (let p = 0; p < image1.length; p += 4) {

        const r1 = image1[p];
        const g1 = image1[p + 1];
        const b1 = image1[p + 2];

        const r2 = image2[p];
        const g2 = image2[p + 1];
        const b2 = image2[p + 2];

        // luminance
        const y1 = 0.299 * r1 + 0.587 * g1 + 0.114 * b1;
        const y2 = 0.299 * r2 + 0.587 * g2 + 0.114 * b2;

        const diff = Math.abs(y1 - y2);

        if (diff < diffThreshold) {
            // unchanged → grayscale background
            out[p] = y1;
            out[p + 1] = y1;
            out[p + 2] = y1;
            out[p + 3] = 255;
        } else {

            // heatmap: yellow → red
            const t = Math.min(diff / heatmapMax, 1);

            out[p] = 255;
            out[p + 1] = 255 * (1 - t);
            out[p + 2] = 0;
            out[p + 3] = 255;
        }
    }
}
