if (typeof browser === "undefined") globalThis.browser = chrome;

const toggle = document.getElementById("toggle");

// Load saved state
browser.storage.local.get({ enabled: true }).then(({ enabled }) => {
  toggle.checked = enabled;
});

document.getElementById("settings").addEventListener("click", (e) => {
  e.preventDefault();
  browser.runtime.openOptionsPage();
});

toggle.addEventListener("change", () => {
  const enabled = toggle.checked;
  browser.storage.local.set({ enabled });

  // Notify active tab's content script
  browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
    if (tabs[0]?.id) {
      browser.tabs.sendMessage(tabs[0].id, { type: "toggle", enabled });
    }
  });
});
