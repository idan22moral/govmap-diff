const luminance = (r, g, b) => (77 * r + 150 * g + 29 * b) >> 8;

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

export function generateDiffImage(ctx, originalImage, compareImage, settings) {
    const { width: imageWidth, height: imageHeight } = originalImage;

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
