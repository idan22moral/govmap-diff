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

let gpuDevice, gpuPipeline, gpuSampler, gpuBindGroupLayout;

async function initGPU() {
    if (!navigator.gpu) return;

    const adapter = await navigator.gpu.requestAdapter();
    gpuDevice = await adapter.requestDevice();

    const shaderCode = `
struct Params {
    diffThreshold: f32,
    heatmapMax: f32,
}

@group(0) @binding(0) var img1: texture_2d<f32>;
@group(0) @binding(1) var img2: texture_2d<f32>;
@group(0) @binding(2) var samp: sampler;
@group(0) @binding(3) var<uniform> params: Params;

struct VSOut {
    @builtin(position) pos: vec4<f32>,
    @location(0) uv: vec2<f32>,
}

@vertex
fn vs(@builtin(vertex_index) i: u32) -> VSOut {
    var pos = array<vec2<f32>,6>(
        vec2(0,0),
        vec2(1,0),
        vec2(0,1),
        vec2(0,1),
        vec2(1,0),
        vec2(1,1)
    );
    var uv = array<vec2<f32>,6>(
        vec2(0,0),
        vec2(1,0),
        vec2(0,1),
        vec2(0,1),
        vec2(1,0),
        vec2(1,1)
    );
    var o: VSOut;
    o.pos = vec4(pos[i]*2.0-1.0, 0.0, 1.0); // map 0→1 quad to -1→1 clip
    o.uv = uv[i];
    return o;
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
    let c1 = textureSample(img1,samp,in.uv).rgb;
    let c2 = textureSample(img2,samp,in.uv).rgb;

    let y1 = dot(c1, vec3<f32>(0.299,0.587,0.114));
    let y2 = dot(c2, vec3<f32>(0.299,0.587,0.114));

    let diff = abs(y1-y2);

    if(diff < params.diffThreshold){
        return vec4(y1,y1,y1,1.0);
    }

    let t = min(diff/params.heatmapMax,1.0);
    return vec4<f32>(1.0,1.0-t,0.0,1.0);
}
`;

    const module = gpuDevice.createShaderModule({code: shaderCode});

    gpuPipeline = gpuDevice.createRenderPipeline({
        layout: "auto",
        vertex: {module, entryPoint: "vs"},
        fragment: {module, entryPoint: "fs", targets:[{format:"rgba8unorm"}]},
        primitive: {topology: "triangle-list"}
    });

    gpuSampler = gpuDevice.createSampler({magFilter:"linear", minFilter:"linear"});
    gpuBindGroupLayout = gpuPipeline.getBindGroupLayout(0);
}

initGPU();

function renderTileGPU(originalImage, compareImage, threshold, heatmapMax) {

    if(!gpuDevice) return;

    // create textures
    const tex1 = createTextureGPU(originalImage);
    const tex2 = createTextureGPU(compareImage);

    // uniform buffer
    const paramBuffer = gpuDevice.createBuffer({
        size:8,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    gpuDevice.queue.writeBuffer(paramBuffer,0,new Float32Array([settings.threshold/255,settings.heatmapMax/255]));

    // bind group
    const bindGroup = gpuDevice.createBindGroup({
        layout: gpuBindGroupLayout,
        entries:[
            {binding:0, resource:tex1.createView()},
            {binding:1, resource:tex2.createView()},
            {binding:2, resource:gpuSampler},
            {binding:3, resource:{buffer:paramBuffer}}
        ]
    });

    // encoder & render pass
    const encoder = gpuDevice.createCommandEncoder();
    const pass = encoder.beginRenderPass({
        colorAttachments: [{
            view: gpuContext.getCurrentTexture().createView(),
            loadOp: "load",
            storeOp: "store"
        }]
    });

    pass.setPipeline(gpuPipeline);
    pass.setBindGroup(0,bindGroup);

    // transform quad to tile position
    // map 0→1 to [dx,dx+dWidth], [dy,dy+dHeight]
    // You can modify the vertex shader to accept tile offset / scale if needed
    pass.draw(6);
    pass.end();

    gpuDevice.queue.submit([encoder.finish()]);
}

function createTextureGPU(image){
    const texture = gpuDevice.createTexture({
        size:[image.width,image.height],
        format:"rgba8unorm",
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
    });
    gpuDevice.queue.copyExternalImageToTexture(
        {source:image},
        {texture},
        [image.width,image.height]
    );
    return texture;
}

function patchedDrawImage(originalImage, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight) {
    const currentImageSrc = originalImage.src;
    if (!settings.enabled || !originalImage || !currentImageSrc) {
        originalDrawImage.call(this, originalImage, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight);
        return;
    }

    const boundDrawImage = window.originalDrawImageImpl.bind(this);

    const compareImageSrc = currentImageSrc.replace(settings.current, settings.compare);
    if (currentImageSrc === compareImageSrc) {
        renderTileGPU(originalImage, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight);
        return;
    }

    const { width: imageWidth, height: imageHeight } = originalImage;
    const ctx = window.diffCtx;
    const canvas = window.diffCanvas;

    // const cachedImageData = imageDataCache.get(compareImageSrc);
    // if (cachedImageData) {
    //     ctx.putImageData(cachedImageData, 0, 0);
    //     renderTileGPU(
    //         canvas,
    //         sx, sx,
    //         imageWidth - 2 * sx,
    //         imageHeight - 2 * sx,
    //         dx, dy,
    //         dWidth, dHeight
    //     );
    //     return;
    // }

    const compareImage = new Image();
    compareImage.crossOrigin = 'anonymous';
    compareImage.onload = () => {
        const diffImageData = renderTileGPU(originalImage, compareImage, settings);
        imageDataCache.set(compareImageSrc, diffImageData);

        // ctx.putImageData(diffImageData, 0, 0);
        // boundDrawImage(
        //     canvas,
        //     sx, sx,
        //     imageWidth - 2 * sx,
        //     imageHeight - 2 * sx,
        //     dx, dy,
        //     dWidth, dHeight
        // );
    };
    compareImage.src = compareImageSrc;
};


CanvasRenderingContext2D.prototype.drawImage = patchedDrawImage;
