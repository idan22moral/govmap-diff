const wasmUrl = chrome.runtime.getURL("algo/pkg/govmap_diff.js");

window.postMessage({
  type: "EXT_WASM_URL",
  url: wasmUrl
}, "*");
