if (typeof browser === "undefined") globalThis.browser = chrome;

// Digital-only set types that should be excluded by default
const DIGITAL_SET_TYPES = new Set([
  "memorabilia", "token", "minigame", "planar",
  "scheme", "vanguard", "funny", "alchemy",
]);

// All frame types with i18n keys
const FRAME_DEFS = {
  "1993": { nameKey: "frameOriginalOld", descKey: "frameOriginalOldDesc" },
  "1997": { nameKey: "frameRevisedOld", descKey: "frameRevisedOldDesc" },
  "2003": { nameKey: "frameModern", descKey: "frameModernDesc" },
  "2015": { nameKey: "frameNew", descKey: "frameNewDesc" },
  "future": { nameKey: "frameFuture", descKey: "frameFutureDesc" },
};

const DEFAULT_FRAME_PRIORITY = ["1993", "1997", "2003", "2015", "future"];

// Language definitions with i18n keys
const LANG_DEFS = {
  en: "langEnglish",
  ja: "langJapanese",
  zhs: "langSimplifiedChinese",
  zht: "langTraditionalChinese",
  ko: "langKorean",
  de: "langGerman",
  fr: "langFrench",
  es: "langSpanish",
  it: "langItalian",
  pt: "langPortuguese",
  ru: "langRussian",
};

const ALL_LANGS = ["en", "ja", "zhs", "zht", "ko", "de", "fr", "es", "it", "pt", "ru"];

function getDefaultLangPriority() {
  const browserLang = (navigator.language || "en").toLowerCase();
  const langMap = { zh: "zhs", "zh-cn": "zhs", "zh-tw": "zht", "zh-hk": "zht" };
  const primary = langMap[browserLang] || langMap[browserLang.split("-")[0]] || ALL_LANGS.find((l) => browserLang.startsWith(l)) || "en";
  return [primary, ...ALL_LANGS.filter((l) => l !== primary)];
}

const DEFAULT_LANG_PRIORITY = getDefaultLangPriority();

let allSets = [];
let setOrder = [];
let excludedSets = new Set();
let blockedPrintings = [];
let framePriority = [...DEFAULT_FRAME_PRIORITY];
let langPriority = [...DEFAULT_LANG_PRIORITY];
let activeFilter = "all";
let advancedMode = false;

// Fetch all sets from Scryfall
async function fetchSets() {
  try {
    const resp = await fetch("https://api.scryfall.com/sets");
    const data = await resp.json();
    return data.data
      .filter((s) => s.card_count > 0)
      .map((s) => ({
        code: s.code,
        name: s.name,
        released: s.released_at || "Unknown",
        year: s.released_at ? s.released_at.substring(0, 4) : "?",
        setType: s.set_type,
        digital: s.digital,
      }));
  } catch (err) {
    console.error("Failed to fetch sets:", err);
    return [];
  }
}

function getDefaultOrder(sets) {
  return sets.slice().sort((a, b) =>
    (a.released || "").localeCompare(b.released || "")
  ).map((s) => s.code);
}

function getDefaultExclusions(sets) {
  const excluded = new Set();
  for (const s of sets) {
    if (s.digital || DIGITAL_SET_TYPES.has(s.setType)) excluded.add(s.code);
  }
  return excluded;
}

function isDigitalSet(set) {
  return set.digital || DIGITAL_SET_TYPES.has(set.setType);
}

// Mode switching
function setMode(isAdvanced) {
  advancedMode = isAdvanced;

  document.getElementById("mode-simple").classList.toggle("active", !isAdvanced);
  document.getElementById("mode-advanced").classList.toggle("active", isAdvanced);
  document.getElementById("mode-desc").textContent = i18n(isAdvanced ? "modeAdvancedDesc" : "modeSimpleDesc");

  // Show/hide sections based on mode
  document.getElementById("section-frames").classList.toggle("hidden", isAdvanced);
  document.getElementById("section-sets").classList.toggle("hidden", !isAdvanced);
  document.getElementById("sort-row").classList.toggle("hidden", isAdvanced);
  document.getElementById("border-row").classList.toggle("hidden", isAdvanced);

  if (isAdvanced) renderSetList();
}

document.getElementById("mode-simple").addEventListener("click", () => setMode(false));
document.getElementById("mode-advanced").addEventListener("click", () => setMode(true));

// Load saved settings
async function loadSettings() {
  const stored = await browser.storage.local.get({
    setOrder: null,
    excludedSets: null,
    blockedPrintings: [],
    preferredFinish: "any",
    preferredBorder: "any",
    framePriority: DEFAULT_FRAME_PRIORITY,
    langPriority: DEFAULT_LANG_PRIORITY,
    sortDirection: "asc",
    advancedMode: false,
    setsCache: null,
    setsCacheTime: 0,
  });

  document.getElementById("finish").value = stored.preferredFinish || "any";
  document.getElementById("border").value = stored.preferredBorder || "any";
  document.getElementById("sort").value = stored.sortDirection || "asc";
  framePriority = stored.framePriority || [...DEFAULT_FRAME_PRIORITY];
  langPriority = stored.langPriority || [...DEFAULT_LANG_PRIORITY];
  advancedMode = stored.advancedMode || false;

  const cacheAge = Date.now() - (stored.setsCacheTime || 0);
  if (stored.setsCache && cacheAge < 86400000) {
    allSets = stored.setsCache;
  } else {
    allSets = await fetchSets();
    await browser.storage.local.set({ setsCache: allSets, setsCacheTime: Date.now() });
  }

  if (stored.setOrder) {
    setOrder = stored.setOrder;
    const known = new Set(setOrder);
    for (const s of allSets) {
      if (!known.has(s.code)) setOrder.push(s.code);
    }
  } else {
    setOrder = getDefaultOrder(allSets);
  }

  if (stored.excludedSets) {
    excludedSets = new Set(stored.excludedSets);
  } else {
    excludedSets = getDefaultExclusions(allSets);
  }

  blockedPrintings = stored.blockedPrintings || [];
  renderBlocklist();
  renderFrameList();
  renderLangList();
  setMode(advancedMode);
}

// Frame priority list (simple mode)
let draggedFrame = null;

function renderFrameList() {
  const container = document.getElementById("frame-list");
  container.innerHTML = "";

  framePriority.forEach((frame, idx) => {
    const def = FRAME_DEFS[frame];
    if (!def) return;

    const item = document.createElement("div");
    item.className = "frame-item";
    item.dataset.frame = frame;
    item.draggable = true;

    const rank = document.createElement("span");
    rank.className = "frame-rank";
    rank.textContent = idx + 1;
    const grip = document.createElement("span");
    grip.className = "frame-grip";
    grip.textContent = "\u2630";
    const name = document.createElement("span");
    name.className = "frame-name";
    name.textContent = i18n(def.nameKey);
    const desc = document.createElement("span");
    desc.className = "frame-desc";
    desc.textContent = i18n(def.descKey);

    const moveBtns = document.createElement("span");
    moveBtns.className = "move-btns";
    const upBtn = document.createElement("button");
    upBtn.className = "move-btn";
    upBtn.textContent = "\u25B2";
    upBtn.disabled = idx === 0;
    upBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (idx > 0) {
        framePriority.splice(idx, 1);
        framePriority.splice(idx - 1, 0, frame);
        renderFrameList();
      }
    });
    const downBtn = document.createElement("button");
    downBtn.className = "move-btn";
    downBtn.textContent = "\u25BC";
    downBtn.disabled = idx === framePriority.length - 1;
    downBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (idx < framePriority.length - 1) {
        framePriority.splice(idx, 1);
        framePriority.splice(idx + 1, 0, frame);
        renderFrameList();
      }
    });
    moveBtns.append(upBtn, downBtn);

    item.append(rank, grip, name, desc, moveBtns);

    item.addEventListener("dragstart", (e) => {
      draggedFrame = frame;
      item.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
    });

    item.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (item.dataset.frame !== draggedFrame) item.classList.add("drag-over");
    });

    item.addEventListener("dragleave", () => item.classList.remove("drag-over"));

    item.addEventListener("drop", (e) => {
      e.preventDefault();
      item.classList.remove("drag-over");
      if (draggedFrame && draggedFrame !== frame) {
        const fromIdx = framePriority.indexOf(draggedFrame);
        const toIdx = framePriority.indexOf(frame);
        if (fromIdx !== -1 && toIdx !== -1) {
          framePriority.splice(fromIdx, 1);
          framePriority.splice(toIdx, 0, draggedFrame);
          renderFrameList();
        }
      }
    });

    item.addEventListener("dragend", () => {
      item.classList.remove("dragging");
      document.querySelectorAll(".frame-item.drag-over").forEach((el) => el.classList.remove("drag-over"));
      draggedFrame = null;
    });

    container.appendChild(item);
  });
}

// Language priority list
let draggedLang = null;

function renderLangList() {
  const container = document.getElementById("lang-list");
  container.innerHTML = "";

  langPriority.forEach((lang, idx) => {
    const nameKey = LANG_DEFS[lang];
    if (!nameKey) return;

    const item = document.createElement("div");
    item.className = "lang-item";
    item.dataset.lang = lang;
    item.draggable = true;

    const rank = document.createElement("span");
    rank.className = "lang-rank";
    rank.textContent = idx + 1;
    const grip = document.createElement("span");
    grip.className = "lang-grip";
    grip.textContent = "\u2630";
    const nameEl = document.createElement("span");
    nameEl.className = "lang-name";
    nameEl.textContent = i18n(nameKey);
    const code = document.createElement("span");
    code.className = "lang-code";
    code.textContent = lang;

    const moveBtns = document.createElement("span");
    moveBtns.className = "move-btns";
    const upBtn = document.createElement("button");
    upBtn.className = "move-btn";
    upBtn.textContent = "\u25B2";
    upBtn.disabled = idx === 0;
    upBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (idx > 0) {
        langPriority.splice(idx, 1);
        langPriority.splice(idx - 1, 0, lang);
        renderLangList();
      }
    });
    const downBtn = document.createElement("button");
    downBtn.className = "move-btn";
    downBtn.textContent = "\u25BC";
    downBtn.disabled = idx === langPriority.length - 1;
    downBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (idx < langPriority.length - 1) {
        langPriority.splice(idx, 1);
        langPriority.splice(idx + 1, 0, lang);
        renderLangList();
      }
    });
    moveBtns.append(upBtn, downBtn);

    item.append(rank, grip, nameEl, code, moveBtns);

    item.addEventListener("dragstart", (e) => {
      draggedLang = lang;
      item.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
    });

    item.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (item.dataset.lang !== draggedLang) item.classList.add("drag-over");
    });

    item.addEventListener("dragleave", () => item.classList.remove("drag-over"));

    item.addEventListener("drop", (e) => {
      e.preventDefault();
      item.classList.remove("drag-over");
      if (draggedLang && draggedLang !== lang) {
        const fromIdx = langPriority.indexOf(draggedLang);
        const toIdx = langPriority.indexOf(lang);
        if (fromIdx !== -1 && toIdx !== -1) {
          langPriority.splice(fromIdx, 1);
          langPriority.splice(toIdx, 0, draggedLang);
          renderLangList();
        }
      }
    });

    item.addEventListener("dragend", () => {
      item.classList.remove("dragging");
      document.querySelectorAll(".lang-item.drag-over").forEach((el) => el.classList.remove("drag-over"));
      draggedLang = null;
    });

    container.appendChild(item);
  });
}

// Set list (advanced mode)
function getSetMap() {
  const m = new Map();
  for (const s of allSets) m.set(s.code, s);
  return m;
}

function renderSetList() {
  const container = document.getElementById("set-list");
  const searchTerm = document.getElementById("search").value.toLowerCase().trim();
  const setMap = getSetMap();
  const ordered = setOrder.map((code) => setMap.get(code)).filter(Boolean);

  const filtered = ordered.filter((s) => {
    if (searchTerm) {
      const match = s.name.toLowerCase().includes(searchTerm) || s.code.toLowerCase().includes(searchTerm);
      if (!match) return false;
    }
    if (activeFilter === "included" && excludedSets.has(s.code)) return false;
    if (activeFilter === "excluded" && !excludedSets.has(s.code)) return false;
    if (activeFilter === "paper" && isDigitalSet(s)) return false;
    if (activeFilter === "digital" && !isDigitalSet(s)) return false;
    return true;
  });

  document.getElementById("set-count").textContent =
    i18n("showingSets", String(filtered.length), String(allSets.length), String(setOrder.length - excludedSets.size));

  container.innerHTML = "";

  for (const s of filtered) {
    const item = document.createElement("div");
    item.className = "set-item" + (excludedSets.has(s.code) ? " excluded" : "");
    item.dataset.code = s.code;
    item.draggable = true;

    const gripEl = document.createElement("span");
    gripEl.className = "grip";
    gripEl.textContent = "\u2630";
    const nameEl = document.createElement("span");
    nameEl.className = "set-name";
    nameEl.title = s.name;
    nameEl.textContent = s.name;
    const codeEl = document.createElement("span");
    codeEl.className = "set-code";
    codeEl.textContent = s.code;
    const yearEl = document.createElement("span");
    yearEl.className = "set-year";
    yearEl.textContent = s.year;
    const typeEl = document.createElement("span");
    typeEl.className = "set-type";
    typeEl.title = s.setType;
    typeEl.textContent = formatType(s);
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = !excludedSets.has(s.code);
    cb.dataset.code = s.code;
    const setMoveBtns = document.createElement("span");
    setMoveBtns.className = "move-btns";
    const setUpBtn = document.createElement("button");
    setUpBtn.className = "move-btn";
    setUpBtn.textContent = "\u25B2";
    setUpBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const idx = setOrder.indexOf(s.code);
      if (idx > 0) {
        setOrder.splice(idx, 1);
        setOrder.splice(idx - 1, 0, s.code);
        renderSetList();
      }
    });
    const setDownBtn = document.createElement("button");
    setDownBtn.className = "move-btn";
    setDownBtn.textContent = "\u25BC";
    setDownBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const idx = setOrder.indexOf(s.code);
      if (idx < setOrder.length - 1) {
        setOrder.splice(idx, 1);
        setOrder.splice(idx + 1, 0, s.code);
        renderSetList();
      }
    });
    setMoveBtns.append(setUpBtn, setDownBtn);

    item.append(gripEl, nameEl, codeEl, yearEl, typeEl, cb, setMoveBtns);

    cb.addEventListener("change", () => {
      if (cb.checked) { excludedSets.delete(s.code); item.classList.remove("excluded"); }
      else { excludedSets.add(s.code); item.classList.add("excluded"); }
      updateCount();
    });

    item.addEventListener("dragstart", onDragStart);
    item.addEventListener("dragover", onDragOver);
    item.addEventListener("drop", onDrop);
    item.addEventListener("dragend", onDragEnd);
    item.addEventListener("dragleave", onDragLeave);

    container.appendChild(item);
  }
}

function formatType(s) {
  let t = s.setType.replace(/_/g, " ");
  if (s.digital) t += " (digital)";
  return t;
}

function updateCount() {
  document.getElementById("set-count").textContent =
    i18n("showingSets", String(document.querySelectorAll(".set-item").length), String(allSets.length), String(setOrder.length - excludedSets.size));
}

// Set list drag and drop
let draggedCode = null;

function onDragStart(e) {
  draggedCode = e.currentTarget.dataset.code;
  e.currentTarget.classList.add("dragging");
  e.dataTransfer.effectAllowed = "move";
}

function onDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  if (e.currentTarget.dataset.code !== draggedCode) e.currentTarget.classList.add("drag-over");
}

function onDragLeave(e) { e.currentTarget.classList.remove("drag-over"); }

function onDrop(e) {
  e.preventDefault();
  const targetCode = e.currentTarget.dataset.code;
  e.currentTarget.classList.remove("drag-over");
  if (draggedCode && draggedCode !== targetCode) {
    const fromIdx = setOrder.indexOf(draggedCode);
    const toIdx = setOrder.indexOf(targetCode);
    if (fromIdx !== -1 && toIdx !== -1) {
      setOrder.splice(fromIdx, 1);
      setOrder.splice(toIdx, 0, draggedCode);
      renderSetList();
    }
  }
}

function onDragEnd(e) {
  e.currentTarget.classList.remove("dragging");
  document.querySelectorAll(".drag-over").forEach((el) => el.classList.remove("drag-over"));
  draggedCode = null;
}

// Filter buttons
document.querySelectorAll(".filter-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".filter-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    activeFilter = btn.dataset.filter;
    renderSetList();
  });
});

document.getElementById("search").addEventListener("input", () => renderSetList());

// Blocklist
function renderBlocklist() {
  const container = document.getElementById("blocklist-tags");
  container.innerHTML = "";

  if (blockedPrintings.length === 0) {
    const span = document.createElement("span");
    span.className = "blocklist-empty";
    span.textContent = i18n("blockedEmpty");
    container.appendChild(span);
    return;
  }

  for (const entry of blockedPrintings) {
    const tag = document.createElement("span");
    tag.className = "blocklist-tag";
    tag.textContent = entry + " ";
    const removeBtn = document.createElement("button");
    removeBtn.className = "remove-tag";
    removeBtn.title = "Remove";
    removeBtn.textContent = "\u00d7";
    tag.appendChild(removeBtn);
    removeBtn.addEventListener("click", () => {
      blockedPrintings = blockedPrintings.filter((e) => e !== entry);
      renderBlocklist();
    });
    container.appendChild(tag);
  }
}

document.getElementById("blocklist-add").addEventListener("click", () => {
  const input = document.getElementById("blocklist-input");
  const val = input.value.trim().toLowerCase();
  if (!val) return;

  if (!/^[a-z0-9_]+(?::\d+(?:-\d+)?)?$/.test(val)) {
    alert(i18n("blockedInvalidFormat"));
    return;
  }

  if (!blockedPrintings.includes(val)) {
    blockedPrintings.push(val);
    renderBlocklist();
  }
  input.value = "";
});

document.getElementById("blocklist-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("blocklist-add").click();
});

function showStatus(text) {
  document.getElementById("status").textContent = text;
  setTimeout(() => { document.getElementById("status").textContent = ""; }, 3000);
}

// Save
document.getElementById("save").addEventListener("click", async () => {
  await browser.storage.local.set({
    setOrder,
    excludedSets: [...excludedSets],
    blockedPrintings,
    preferredFinish: document.getElementById("finish").value,
    preferredBorder: document.getElementById("border").value,
    framePriority,
    langPriority,
    sortDirection: document.getElementById("sort").value,
    advancedMode,
  });
  showStatus(i18n("statusSaved"));
});

// Reset
document.getElementById("reset").addEventListener("click", async () => {
  if (!confirm(i18n("resetConfirm"))) return;

  blockedPrintings = [];
  framePriority = [...DEFAULT_FRAME_PRIORITY];
  langPriority = [...DEFAULT_LANG_PRIORITY];
  excludedSets = getDefaultExclusions(allSets);
  setOrder = getDefaultOrder(allSets);
  document.getElementById("finish").value = "any";
  document.getElementById("border").value = "any";
  document.getElementById("sort").value = "asc";

  await browser.storage.local.set({
    setOrder,
    excludedSets: [...excludedSets],
    blockedPrintings,
    preferredFinish: "any",
    preferredBorder: "any",
    framePriority,
    langPriority,
    sortDirection: "asc",
    advancedMode,
  });

  renderFrameList();
  renderLangList();
  renderBlocklist();
  if (advancedMode) renderSetList();
  showStatus(i18n("statusReset"));
});

// Collapsible language section
document.getElementById("lang-toggle").addEventListener("click", () => {
  const body = document.getElementById("lang-body");
  const arrow = document.getElementById("lang-arrow");
  body.classList.toggle("hidden");
  arrow.classList.toggle("open");
});

// Init
async function init() {
  await loadSettings();
  document.getElementById("loading")?.remove();
}

init();
