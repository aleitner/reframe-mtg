if (typeof browser === "undefined") globalThis.browser = chrome;

const SCRYFALL_IMG_RE = /cards\.scryfall\.io/;

// Track replaced images: img element -> { original, replacement }
const replaced = new Map();
// Track in-flight replacements to avoid duplicate work
const inflight = new WeakSet();

let enabled = true;
let observer = null;
let restoring = false;

function getCardNameFromImg(img) {
  if (img.alt && img.alt.trim().length > 0) {
    return img.alt.trim();
  }

  const dataName =
    img.dataset.cardName ||
    img.dataset.name ||
    img.closest("[data-card-name]")?.dataset.cardName ||
    img.closest("[data-name]")?.dataset.name;
  if (dataName) return dataName.trim();

  if (img.title && img.title.trim().length > 0) {
    return img.title.trim();
  }

  return null;
}

function isScryfall(src) {
  return src && SCRYFALL_IMG_RE.test(src);
}

async function replaceImage(img) {
  if (!enabled) return;
  if (inflight.has(img)) return;
  if (replaced.has(img)) return;

  const cardName = getCardNameFromImg(img);
  if (!cardName) return;

  const skipNames = ["Plains", "Island", "Swamp", "Mountain", "Forest"];
  if (skipNames.includes(cardName)) return;

  const originalSrc = img.src;
  const face = /\/normal\/back\//.test(originalSrc) ? "back" : "front";
  inflight.add(img);

  try {
    const response = await browser.runtime.sendMessage({
      type: "lookup",
      cardName,
      face,
    });

    if (response?.imageUrl && enabled) {
      replaced.set(img, { original: originalSrc, replacement: response.imageUrl });
      img.src = response.imageUrl;
      if (img.srcset) img.srcset = "";
    }
  } catch (err) {
    // Extension context may have been invalidated
  } finally {
    inflight.delete(img);
  }
}

function scanForCards() {
  // Clean up stale entries from SPA navigation
  for (const [img] of replaced) {
    if (!document.contains(img)) replaced.delete(img);
  }

  const images = document.querySelectorAll("img");
  for (const img of images) {
    if (isScryfall(img.src) && !replaced.has(img)) {
      replaceImage(img);
    }
  }
}

function restoreAll() {
  restoring = true;
  for (const [img, { original }] of replaced) {
    img.src = original;
  }
  replaced.clear();
  restoring = false;
}

function startObserver() {
  if (observer) return;

  observer = new MutationObserver((mutations) => {
    if (!enabled || restoring) return;

    for (const mutation of mutations) {
      // New nodes added
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;

        if (node.tagName === "IMG" && isScryfall(node.src) && !replaced.has(node)) {
          replaceImage(node);
        }

        const imgs = node.querySelectorAll?.("img");
        if (imgs) {
          for (const img of imgs) {
            if (isScryfall(img.src) && !replaced.has(img)) {
              replaceImage(img);
            }
          }
        }
      }

      // Src attribute changed on an existing image
      if (
        mutation.type === "attributes" &&
        mutation.attributeName === "src" &&
        mutation.target.tagName === "IMG"
      ) {
        const img = mutation.target;
        if (inflight.has(img)) continue;

        if (isScryfall(img.src)) {
          const entry = replaced.get(img);
          if (entry) {
            // If src matches our replacement, this is our own change — ignore
            if (img.src === entry.replacement) continue;
            // Otherwise the site changed it (SPA nav) — clear and re-process
            replaced.delete(img);
          }
          replaceImage(img);
        }
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["src"],
  });
}

function stopObserver() {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
}

// Listen for toggle messages from popup
browser.runtime.onMessage.addListener((message) => {
  if (message.type === "toggle") {
    enabled = message.enabled;
    if (enabled) {
      startObserver();
      scanForCards();
    } else {
      stopObserver();
      restoreAll();
    }
  }
});

// Detect SPA navigation via History API
let lastUrl = location.href;
new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    if (enabled) {
      // Small delay to let the new page content render
      setTimeout(scanForCards, 500);
    }
  }
}).observe(document, { subtree: true, childList: true });

async function init() {
  const stored = await browser.storage.local.get({ enabled: true });
  enabled = stored.enabled;

  if (enabled) {
    scanForCards();
    startObserver();
  }
}

init();
