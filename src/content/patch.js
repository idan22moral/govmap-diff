import { generateDiffImage } from './diff.js';
import { LRUCache } from './utils/lruCache.js';
import { getCurrentSettings } from './settings.js';

const originalDrawImage = CanvasRenderingContext2D.prototype.drawImage;

const diffCanvas = document.createElement("canvas");
const ctx = diffCanvas.getContext("2d", { willReadFrequently: true });
ctx.drawImage = originalDrawImage.bind(ctx);

const imageDataCache = new LRUCache(1000);

const settings = getCurrentSettings();

function patchedDrawImage(originalImage, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight) {
    const currentImageSrc = originalImage.src;
    if (!settings.enabled || !originalImage || !currentImageSrc) {
        originalDrawImage.call(this, originalImage, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight);
        return;
    }

    const boundDrawImage = originalDrawImage.bind(this);

    const compareImageSrc = currentImageSrc.replace(settings.current, settings.compare);
    if (currentImageSrc === compareImageSrc) {
        boundDrawImage(originalImage, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight);
        return;
    }

    const { width: imageWidth, height: imageHeight } = originalImage;

    const cachedImageData = imageDataCache.get(compareImageSrc);
    if (cachedImageData) {
        ctx.putImageData(cachedImageData, 0, 0);
        boundDrawImage(
            diffCanvas,
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
        const { width: imageWidth, height: imageHeight } = originalImage;

        if (diffCanvas.width !== imageWidth || diffCanvas.height !== imageHeight) {
            diffCanvas.width = imageWidth;
            diffCanvas.height = imageHeight;
        }
        compareImage
        const diffImageData = generateDiffImage(ctx, originalImage, compareImage, settings);
        imageDataCache.set(compareImageSrc, diffImageData);

        ctx.putImageData(diffImageData, 0, 0);
        boundDrawImage(
            diffCanvas,
            sx, sx,
            imageWidth - 2 * sx,
            imageHeight - 2 * sx,
            dx, dy,
            dWidth, dHeight
        );
    };
    compareImage.src = compareImageSrc;
};

export function applyPatch() {
    CanvasRenderingContext2D.prototype.drawImage = patchedDrawImage;
}
