const script = document.createElement("script");

script.type = "module";
script.src = chrome.runtime.getURL("src/content/main.js");

(document.head || document.documentElement).appendChild(script);
script.remove();
