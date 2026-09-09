// Background service worker.
//
// Wires the global shortcut (Alt+Shift+X) and the toolbar action to inject the
// on-demand content script, then tells the page (via a message) to activate
// the element picker.

async function injectAndActivate(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || tab.id === undefined) return;

  // Only inject into web pages (skip chrome://, edge://, chrome-extension://).
  const url = tab.url ?? "";
  if (!/^(https?|file):/i.test(url)) return;

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"],
    });
    await chrome.tabs.sendMessage(tab.id, { type: "PURERIP_ACTIVATE" });
  } catch (err) {
    console.error("PureRip: injection or activation failed", err);
  }
}

chrome.commands.onCommand.addListener((command) => {
  if (command === "toggle-picker") {
    void injectAndActivate();
  }
});

chrome.action.onClicked.addListener(() => {
  void injectAndActivate();
});
