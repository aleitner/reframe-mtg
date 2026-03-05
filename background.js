if (typeof browser === "undefined") globalThis.browser = chrome;

// Cache: cardName -> { imageUrl, timestamp }
const cache = new Map();
// In-flight lookups: cardName -> Promise (prevents duplicate parallel requests)
const pending = new Map();
const CACHE_TTL = 1000 * 60 * 60; // 1 hour
const REQUEST_DELAY = 100; // ms between Scryfall requests (rate limit)

let lastRequestTime = 0;

async function waitForRateLimit() {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < REQUEST_DELAY) {
    await new Promise((resolve) => setTimeout(resolve, REQUEST_DELAY - elapsed));
  }
  lastRequestTime = Date.now();
}

const DEFAULT_FRAME_PRIORITY = ["1993", "1997", "2003", "2015", "future"];

async function loadPreferences() {
  const stored = await browser.storage.local.get({
    setOrder: null,
    excludedSets: null,
    blockedPrintings: [],
    preferredFinish: "any",
    preferredBorder: "any",
    framePriority: DEFAULT_FRAME_PRIORITY,
    sortDirection: "asc",
    advancedMode: false,
  });
  return {
    setOrder: stored.setOrder,
    excludedSets: stored.excludedSets ? new Set(stored.excludedSets) : null,
    blockedPrintings: stored.blockedPrintings || [],
    preferredFinish: stored.preferredFinish || "any",
    preferredBorder: stored.preferredBorder || "any",
    framePriority: stored.framePriority || DEFAULT_FRAME_PRIORITY,
    sortDirection: stored.sortDirection || "asc",
    advancedMode: stored.advancedMode || false,
  };
}

// Fetch ALL printings of a card
async function fetchAllPrintings(cardName) {
  let allCards = [];
  let url = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(`!"${cardName}"`)}&unique=prints&order=released&dir=asc`;

  while (url) {
    await waitForRateLimit();
    const response = await fetch(url);
    if (!response.ok) return allCards;

    const data = await response.json();
    if (data.data) allCards = allCards.concat(data.data);
    url = data.has_more ? data.next_page : null;
  }

  return allCards;
}

function isBlocked(card, blockedPrintings) {
  const set = card.set;
  const num = parseInt(card.collector_number, 10);

  for (const entry of blockedPrintings) {
    if (!entry.includes(":")) {
      if (set === entry) return true;
      continue;
    }

    const [blockSet, blockRange] = entry.split(":");
    if (set !== blockSet) continue;

    if (blockRange.includes("-")) {
      const [lo, hi] = blockRange.split("-").map(Number);
      if (!isNaN(num) && num >= lo && num <= hi) return true;
    } else {
      if (num === parseInt(blockRange, 10)) return true;
    }
  }

  return false;
}

function getImageUrl(card) {
  return (
    card.image_uris?.normal ||
    card.card_faces?.[0]?.image_uris?.normal ||
    null
  );
}

async function findPreferredPrinting(cardName) {
  const prefs = await loadPreferences();

  try {
    const printings = await fetchAllPrintings(cardName);
    if (printings.length === 0) {
      cache.set(cardName, { imageUrl: null, timestamp: Date.now() });
      return null;
    }

    // Filter out excluded sets
    let candidates = printings;
    if (prefs.excludedSets) {
      candidates = candidates.filter((c) => !prefs.excludedSets.has(c.set));
    }

    // Filter out blocked printings
    if (prefs.blockedPrintings.length > 0) {
      candidates = candidates.filter((c) => !isBlocked(c, prefs.blockedPrintings));
    }

    // Filter by preferred finish
    if (prefs.preferredFinish !== "any") {
      const finishFiltered = candidates.filter(
        (c) => c.finishes && c.finishes.includes(prefs.preferredFinish)
      );
      if (finishFiltered.length > 0) {
        candidates = finishFiltered;
      }
    }

    // Filter by preferred border
    if (prefs.preferredBorder !== "any") {
      const borderFiltered = candidates.filter(
        (c) => c.border_color === prefs.preferredBorder
      );
      if (borderFiltered.length > 0) {
        candidates = borderFiltered;
      }
    }

    if (candidates.length === 0) {
      cache.set(cardName, { imageUrl: null, timestamp: Date.now() });
      return null;
    }

    if (prefs.advancedMode) {
      // Advanced mode: sort by set order, then release date
      const setOrderMap = new Map();
      if (prefs.setOrder) {
        prefs.setOrder.forEach((code, idx) => setOrderMap.set(code, idx));
      }
      const maxSetPriority = prefs.setOrder ? prefs.setOrder.length : 0;

      candidates.sort((a, b) => {
        if (prefs.setOrder) {
          const aSet = setOrderMap.has(a.set) ? setOrderMap.get(a.set) : maxSetPriority;
          const bSet = setOrderMap.has(b.set) ? setOrderMap.get(b.set) : maxSetPriority;
          if (aSet !== bSet) return aSet - bSet;
        }
        const dateCompare = (a.released_at || "").localeCompare(b.released_at || "");
        return prefs.sortDirection === "desc" ? -dateCompare : dateCompare;
      });
    } else {
      // Simple mode: sort by per-card frame, then release date
      const framePriorityMap = new Map();
      prefs.framePriority.forEach((frame, idx) => framePriorityMap.set(frame, idx));
      const maxFramePriority = prefs.framePriority.length;

      candidates.sort((a, b) => {
        const aFrame = framePriorityMap.has(a.frame) ? framePriorityMap.get(a.frame) : maxFramePriority;
        const bFrame = framePriorityMap.has(b.frame) ? framePriorityMap.get(b.frame) : maxFramePriority;
        if (aFrame !== bFrame) return aFrame - bFrame;

        const dateCompare = (a.released_at || "").localeCompare(b.released_at || "");
        return prefs.sortDirection === "desc" ? -dateCompare : dateCompare;
      });
    }

    const imageUrl = getImageUrl(candidates[0]);
    cache.set(cardName, { imageUrl, timestamp: Date.now() });
    return imageUrl;
  } catch (err) {
    console.error("[MTG Printing Prefs] Lookup failed for:", cardName, err);
    cache.set(cardName, { imageUrl: null, timestamp: Date.now() });
    return null;
  }
}

// Clear cache when settings change
browser.storage.onChanged.addListener((changes) => {
  if (
    changes.setOrder || changes.excludedSets || changes.blockedPrintings ||
    changes.preferredFinish || changes.preferredBorder || changes.framePriority ||
    changes.sortDirection || changes.advancedMode
  ) {
    cache.clear();
  }
});

// Deduplicated lookup
function lookup(cardName) {
  const cached = cache.get(cardName);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return Promise.resolve(cached.imageUrl);
  }

  if (pending.has(cardName)) {
    return pending.get(cardName);
  }

  const promise = findPreferredPrinting(cardName).finally(() => {
    pending.delete(cardName);
  });
  pending.set(cardName, promise);
  return promise;
}

// Listen for messages from content script
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "lookup") {
    lookup(message.cardName).then((imageUrl) => {
      sendResponse({ imageUrl });
    });
    return true;
  }
});
