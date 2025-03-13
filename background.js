// Initialize default settings when extension is installed
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['enabled', 'keywords'], (result) => {
    // If settings don't exist, set defaults
    if (result.enabled === undefined) {
      chrome.storage.local.set({ enabled: false });
    }
    
    if (!result.keywords) {
      chrome.storage.local.set({ keywords: [] });
    }
  });
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'toggleExtension') {
    // Update the enabled status in storage
    chrome.storage.local.set({ enabled: message.enabled });
    
    // Notify all tabs about the change
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, {
          action: 'updateEnabledStatus',
          enabled: message.enabled
        }).catch(error => {
          // Suppress errors from tabs that don't have content scripts
          // This is normal for chrome:// pages, new tabs, etc.
        });
      });
    });
  }
}); 