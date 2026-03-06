if (typeof browser === "undefined") globalThis.browser = chrome;

function applyI18n() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const msg = browser.i18n.getMessage(el.dataset.i18n);
    if (msg) el.textContent = msg;
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const msg = browser.i18n.getMessage(el.dataset.i18nPlaceholder);
    if (msg) el.placeholder = msg;
  });
  document.querySelectorAll("[data-i18n-title]").forEach((el) => {
    const msg = browser.i18n.getMessage(el.dataset.i18nTitle);
    if (msg) el.title = msg;
  });
}

function i18n(key, ...subs) {
  return browser.i18n.getMessage(key, subs) || key;
}

applyI18n();
