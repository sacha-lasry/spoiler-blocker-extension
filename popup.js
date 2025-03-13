document.addEventListener('DOMContentLoaded', () => {
  const toggleExtension = document.getElementById('toggle-extension');
  const statusText = document.getElementById('status-text');
  const keywordInput = document.getElementById('keyword-input');
  const addKeywordBtn = document.getElementById('add-keyword');
  const keywordsList = document.getElementById('keywords-list');
  const saveSettingsBtn = document.getElementById('save-settings');

  // Load saved settings
  loadSettings();

  // Event listeners
  toggleExtension.addEventListener('change', updateToggleStatus);
  addKeywordBtn.addEventListener('click', addKeyword);
  keywordInput.addEventListener('keyup', (e) => {
    if (e.key === 'Enter') addKeyword();
  });
  saveSettingsBtn.addEventListener('click', saveSettings);

  // Function to load saved settings
  function loadSettings() {
    chrome.storage.local.get(['enabled', 'keywords'], (result) => {
      // Set extension toggle state
      if (result.enabled !== undefined) {
        toggleExtension.checked = result.enabled;
        updateStatusText(result.enabled);
      }

      // Load keywords
      if (result.keywords && Array.isArray(result.keywords)) {
        result.keywords.forEach(keyword => {
          addKeywordToList(keyword);
        });
      }
    });
  }

  // Function to update toggle status text
  function updateToggleStatus() {
    const isEnabled = toggleExtension.checked;
    updateStatusText(isEnabled);
    
    // Send message to background script
    chrome.runtime.sendMessage({
      action: 'toggleExtension',
      enabled: isEnabled
    });
  }

  // Update status text based on toggle state
  function updateStatusText(isEnabled) {
    statusText.textContent = isEnabled ? 'Extension is ON' : 'Extension is OFF';
    statusText.style.color = isEnabled ? '#4CAF50' : '#FF5722';
  }

  // Function to add a new keyword
  function addKeyword() {
    const keyword = keywordInput.value.trim();
    
    if (keyword === '') return;
    
    // Check if keyword already exists
    const existingKeywords = Array.from(keywordsList.children).map(
      li => li.querySelector('span').textContent.toLowerCase()
    );
    
    if (existingKeywords.includes(keyword.toLowerCase())) {
      alert('This keyword already exists!');
      return;
    }
    
    // Add to list
    addKeywordToList(keyword);
    
    // Clear input
    keywordInput.value = '';
    keywordInput.focus();
  }

  // Function to add a keyword to the list
  function addKeywordToList(keyword) {
    const li = document.createElement('li');
    
    const keywordSpan = document.createElement('span');
    keywordSpan.textContent = keyword;
    
    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = '×';
    deleteBtn.className = 'delete-keyword';
    deleteBtn.addEventListener('click', () => {
      li.remove();
    });
    
    li.appendChild(keywordSpan);
    li.appendChild(deleteBtn);
    keywordsList.appendChild(li);
  }

  // Function to save settings
  function saveSettings() {
    // Get all keywords
    const keywords = Array.from(keywordsList.children).map(
      li => li.querySelector('span').textContent
    );
    
    // Save settings to storage
    chrome.storage.local.set({
      enabled: toggleExtension.checked,
      keywords: keywords
    }, () => {
      // Visual feedback that settings were saved
      const saveBtn = document.getElementById('save-settings');
      const originalText = saveBtn.textContent;
      
      saveBtn.textContent = 'Saved!';
      saveBtn.disabled = true;
      
      setTimeout(() => {
        saveBtn.textContent = originalText;
        saveBtn.disabled = false;
      }, 1500);
      
      // Send message to content script to update filtering
      chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, {
            action: 'updateSettings',
            enabled: toggleExtension.checked,
            keywords: keywords
          });
        }
      });
    });
  }
}); 