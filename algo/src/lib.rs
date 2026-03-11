/// A simple image diff algorithm ported from the JS implementation in `patch.js`.
///
/// The algorithm compares two RGBA images of identical dimensions and produces
/// an output image where unchanged pixels are rendered in grayscale and changed
/// pixels are rendered as a yellow→red heatmap.
///
/// All slices must be the same length and a multiple of 4.
///
/// # Parameters
/// - `image1` - first image (RGBA bytes)
/// - `image2` - second image (RGBA bytes)
/// - `out` - output buffer (must be same length as inputs)
/// - `diff_threshold` - pixels with luminance difference below this are treated as unchanged
/// - `heatmap_max` - maximum difference used to normalize the heatmap interpolation
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn calc_image(
    image1: &[u8],
    image2: &[u8],
    out: &mut [u8],
    diff_threshold: f32,
    heatmap_max: f32,
) {
    assert!(
        image1.len() == image2.len(),
        "image buffers must be the same length"
    );
    assert!(
        image1.len() == out.len(),
        "output buffer must be the same length as input buffers"
    );
    assert!(
        image1.len() % 4 == 0,
        "buffer length must be a multiple of 4 (RGBA pixels)"
    );

    for p in (0..image1.len()).step_by(4) {
        let r1 = image1[p] as f32;
        let g1 = image1[p + 1] as f32;
        let b1 = image1[p + 2] as f32;

        let r2 = image2[p] as f32;
        let g2 = image2[p + 1] as f32;
        let b2 = image2[p + 2] as f32;

        // luminance
        let y1 = 0.299 * r1 + 0.587 * g1 + 0.114 * b1;
        let y2 = 0.299 * r2 + 0.587 * g2 + 0.114 * b2;

        let diff = (y1 - y2).abs();

        if diff < diff_threshold {
            // unchanged → grayscale background
            let gray = y1.round().clamp(0.0, 255.0) as u8;
            out[p] = gray;
            out[p + 1] = gray;
            out[p + 2] = gray;
            out[p + 3] = 255;
        } else {
            // heatmap: yellow → red
            let t = (diff / heatmap_max).min(1.0);
            out[p] = 255;
            out[p + 1] = (255.0 * (1.0 - t)).round().clamp(0.0, 255.0) as u8;
            out[p + 2] = 0;
            out[p + 3] = 255;
        }
    }
}
