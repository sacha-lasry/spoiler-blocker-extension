// Global variables
let isEnabled = false;
let keywords = [];
let observerActive = false;
let observer;
let blockedElements = new Map(); // Map to track blocked elements and their keywords
let initialLoadComplete = false;

// Create and add overlay immediately to prevent content flash
function createInitialOverlay() {
  // Only create an overlay if we're not in an iframe
  if (window === window.top) {
    const overlay = document.createElement('div');
    overlay.className = 'spoiler-initializing-overlay';
    overlay.id = 'spoiler-initializing-overlay';
    
    // Add to document as early as possible
    if (document.documentElement) {
      document.documentElement.appendChild(overlay);
    } else {
      // If document not ready, wait for it
      document.addEventListener('DOMContentLoaded', () => {
        document.documentElement.appendChild(overlay);
      });
    }
    
    return overlay;
  }
  return null;
}

// Create initial overlay
const initialOverlay = createInitialOverlay();

// Function to remove overlay when processing is complete
function removeInitialOverlay() {
  if (initialOverlay) {
    initialOverlay.classList.add('hidden');
    // Remove after transition completes
    setTimeout(() => {
      initialOverlay.remove();
    }, 300);
  }
}

// On content script load, get settings from storage
chrome.storage.local.get(['enabled', 'keywords'], (result) => {
  isEnabled = result.enabled || false;
  keywords = result.keywords || [];
  
  // Setup an early DOM ready listener
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      if (isEnabled && keywords.length > 0) {
        processSpoilers();
      } else {
        // No processing needed, remove overlay
        removeInitialOverlay();
      }
    });
  } else {
    // DOM already loaded
    if (isEnabled && keywords.length > 0) {
      processSpoilers();
    } else {
      // No processing needed, remove overlay
      removeInitialOverlay();
    }
  }
});

// Listen for messages from popup or background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'updateSettings') {
    isEnabled = message.enabled;
    keywords = message.keywords || [];
    
    if (isEnabled && keywords.length > 0) {
      processSpoilers();
    } else {
      unblockAllSpoilers();
    }
  } else if (message.action === 'updateEnabledStatus') {
    isEnabled = message.enabled;
    
    if (isEnabled && keywords.length > 0) {
      processSpoilers();
    } else {
      unblockAllSpoilers();
    }
  }
  
  return true;
});

// Main function to process spoilers
function processSpoilers() {
  // First, unblock all spoilers to start fresh
  unblockAllSpoilers();
  
  // Scan all text on the page
  scanPageForSpoilers();
  
  // Set up mutation observer for dynamic content if not already active
  if (!observerActive) {
    setupMutationObserver();
  }
  
  // Apply special YouTube fixes if needed
  if (window.location.href.toLowerCase().includes('youtube.com')) {
    applyYouTubeSpecificFixes();
  }
  
  // Mark initial load as complete and remove overlay
  initialLoadComplete = true;
  removeInitialOverlay();
}

// YouTube specific processing
function processYouTube() {
  // Simple, focused approach: Process video elements directly
  const videoElements = document.querySelectorAll('ytd-video-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer, ytd-rich-item-renderer');
  
  videoElements.forEach(videoElement => {
    // Skip already processed elements
    if (videoElement.classList.contains('spoiler-processed')) return;
    
    // Mark as processed
    videoElement.classList.add('spoiler-processed');
    
    // Get title element
    const titleElement = videoElement.querySelector('#video-title, .title');
    if (!titleElement) return;
    
    const title = titleElement.textContent.toLowerCase();
    const matchingKeywords = findMatchingKeywords(title);
    
    if (matchingKeywords.length > 0) {
      // Find the thumbnail
      const thumbnail = videoElement.querySelector('ytd-thumbnail');
      if (thumbnail) {
        // Block ONLY the thumbnail, not the whole container
        blockElement(thumbnail, matchingKeywords);
        
        // Highlight the title
        titleElement.style.color = '#ff4d4d';
        titleElement.style.fontWeight = 'bold';
        
        // Add spoiler indicator
        if (!titleElement.querySelector('.yt-spoiler-indicator')) {
          const spoilerIndicator = document.createElement('span');
          spoilerIndicator.className = 'yt-spoiler-indicator';
          spoilerIndicator.textContent = ' [SPOILER]';
          spoilerIndicator.style.color = '#ff4d4d';
          spoilerIndicator.style.fontWeight = 'bold';
          titleElement.appendChild(spoilerIndicator);
        }
      }
    }
  });
  
  // Process channel names
  const channelElements = document.querySelectorAll('ytd-channel-renderer');
  
  channelElements.forEach(channelElement => {
    if (channelElement.classList.contains('spoiler-processed')) return;
    
    channelElement.classList.add('spoiler-processed');
    
    const nameElement = channelElement.querySelector('#text');
    if (!nameElement) return;
    
    const name = nameElement.textContent.toLowerCase();
    const matchingKeywords = findMatchingKeywords(name);
    
    if (matchingKeywords.length > 0) {
      // Block the avatar
      const avatar = channelElement.querySelector('#avatar');
      if (avatar) {
        blockElement(avatar, matchingKeywords);
      }
    }
  });
}

// Special function to apply YouTube-specific fixes for blur issues
function applyYouTubeSpecificFixes() {
  // Force all thumbnails to have blur directly applied
  document.querySelectorAll('ytd-thumbnail.spoiler-blocked').forEach(thumbnail => {
    // Make sure we're actually applying blur to the image elements
    const images = thumbnail.querySelectorAll('img, yt-image, yt-img-shadow img');
    images.forEach(img => {
      img.style.filter = 'blur(8px)';
    });
  });
  
  // Create and inject a targeted style fix for YouTube blur issues
  const styleElement = document.createElement('style');
  styleElement.textContent = `
    /* Isolate blurred thumbnails */
    ytd-thumbnail.spoiler-blocked {
      z-index: 2;
      position: relative;
    }
    
    /* Direct application of blur to ensure it works */
    ytd-thumbnail.spoiler-blocked img,
    ytd-thumbnail.spoiler-blocked yt-img-shadow img {
      filter: blur(8px) !important;
    }
    
    /* Fix the hover propagation issue */
    ytd-grid-video-renderer:hover ytd-thumbnail:not(.spoiler-blocked),
    ytd-video-renderer:hover ytd-thumbnail:not(.spoiler-blocked),
    ytd-compact-video-renderer:hover ytd-thumbnail:not(.spoiler-blocked) {
      filter: none !important;
    }
  `;
  
  // Only add the style element once
  if (!document.getElementById('spoiler-blocker-youtube-fix')) {
    styleElement.id = 'spoiler-blocker-youtube-fix';
    document.head.appendChild(styleElement);
  }
}

// Function to scan the page for spoilers
function scanPageForSpoilers() {
  // Process text nodes, skipping script and style tags
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        const parentNode = node.parentNode;
        // Skip script, style, and already processed nodes
        if (parentNode.nodeName === 'SCRIPT' || 
            parentNode.nodeName === 'STYLE' || 
            parentNode.classList.contains('spoiler-blocked') ||
            parentNode.classList.contains('spoiler-tooltip') ||
            parentNode.closest('.spoiler-tooltip') ||
            parentNode.closest('.spoiler-blocked')) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );
  
  const textNodes = [];
  let currentNode;
  
  while (currentNode = walker.nextNode()) {
    textNodes.push(currentNode);
  }
  
  // Process each text node
  textNodes.forEach(node => {
    // Skip nodes with no text
    if (!node.textContent.trim()) return;
    
    processTextNode(node);
  });
  
  // Process elements that often contain useful attributes (like titles, alts, etc.)
  processElementAttributes();
  
  // Special handling for images and media
  processImagesAndMedia();
  
  // Special processing for various websites
  processSiteSpecific();
}

// Function to process text nodes
function processTextNode(textNode) {
  const text = textNode.textContent.toLowerCase();
  const matchingKeywords = findMatchingKeywords(text);
  
  if (matchingKeywords.length > 0) {
    blockElement(textNode.parentNode, matchingKeywords);
    
    // Also check for nearby images that might be related to the text
    const parentElement = textNode.parentNode;
    const nearbyImages = findNearbyImages(parentElement);
    
    nearbyImages.forEach(image => {
      if (!image.classList.contains('spoiler-blocked')) {
        blockElement(image, matchingKeywords.map(k => `Associated with: ${k}`));
      }
    });
  }
}

// Find nearby images that might be related to text
function findNearbyImages(element) {
  const images = [];
  
  // Check siblings
  let sibling = element.previousElementSibling;
  while (sibling && images.length < 3) {
    if (sibling.tagName === 'IMG' || sibling.querySelector('img')) {
      const img = sibling.tagName === 'IMG' ? sibling : sibling.querySelector('img');
      if (img && !img.classList.contains('spoiler-blocked')) {
        images.push(img);
      }
    }
    sibling = sibling.previousElementSibling;
  }
  
  sibling = element.nextElementSibling;
  while (sibling && images.length < 5) {
    if (sibling.tagName === 'IMG' || sibling.querySelector('img')) {
      const img = sibling.tagName === 'IMG' ? sibling : sibling.querySelector('img');
      if (img && !img.classList.contains('spoiler-blocked')) {
        images.push(img);
      }
    }
    sibling = sibling.nextElementSibling;
  }
  
  // Check parent's children (for containers with text + image)
  if (element.parentElement) {
    const parent = element.parentElement;
    const childImages = parent.querySelectorAll('img:not(.spoiler-blocked)');
    
    childImages.forEach(img => {
      if (!images.includes(img)) {
        images.push(img);
      }
    });
  }
  
  return images;
}

// Enhanced processing for images and media
function processImagesAndMedia() {
  // Process all images on the page
  const images = document.querySelectorAll('img');
  
  images.forEach(image => {
    // Skip already processed images
    if (image.classList.contains('spoiler-blocked')) return;
    
    // Check image file name in src
    if (image.src) {
      const filename = image.src.split('/').pop().toLowerCase();
      const matchingKeywords = findMatchingKeywords(filename);
      
      if (matchingKeywords.length > 0) {
        blockElement(image, matchingKeywords);
        return;
      }
    }
    
    // Check context by examining parent containers
    let parent = image.parentElement;
    let depth = 0;
    const maxDepth = 3;
    
    while (parent && depth < maxDepth) {
      if (parent.textContent) {
        const text = parent.textContent.toLowerCase();
        const matchingKeywords = findMatchingKeywords(text);
        
        if (matchingKeywords.length > 0) {
          blockElement(image, matchingKeywords.map(k => `Context: ${k}`));
          return;
        }
      }
      
      // Check heading elements that might be captions or titles
      const headings = parent.querySelectorAll('h1, h2, h3, h4, h5, h6, figcaption, .caption');
      for (const heading of headings) {
        if (heading.textContent) {
          const text = heading.textContent.toLowerCase();
          const matchingKeywords = findMatchingKeywords(text);
          
          if (matchingKeywords.length > 0) {
            blockElement(image, matchingKeywords.map(k => `Caption: ${k}`));
            return;
          }
        }
      }
      
      parent = parent.parentElement;
      depth++;
    }
  });
  
  // Process video elements
  const videos = document.querySelectorAll('video, iframe[src*="youtube"], iframe[src*="vimeo"]');
  
  videos.forEach(video => {
    // Skip already processed videos
    if (video.classList.contains('spoiler-blocked')) return;
    
    // Check attributes
    const attributesToCheck = ['title', 'alt', 'aria-label', 'data-title'];
    let matchingKeywords = [];
    
    for (const attr of attributesToCheck) {
      if (video.hasAttribute(attr)) {
        const attrValue = video.getAttribute(attr).toLowerCase();
        const attrMatchingKeywords = findMatchingKeywords(attrValue);
        matchingKeywords = [...new Set([...matchingKeywords, ...attrMatchingKeywords])];
      }
    }
    
    // Check src for videos
    if (video.src) {
      const src = video.src.toLowerCase();
      const srcMatchingKeywords = findMatchingKeywords(src);
      matchingKeywords = [...new Set([...matchingKeywords, ...srcMatchingKeywords])];
    }
    
    // Check surrounding context
    let parent = video.parentElement;
    let depth = 0;
    const maxDepth = 3;
    
    while (parent && depth < maxDepth && matchingKeywords.length === 0) {
      if (parent.textContent) {
        const text = parent.textContent.toLowerCase();
        const contextMatchingKeywords = findMatchingKeywords(text);
        matchingKeywords = [...new Set([...matchingKeywords, ...contextMatchingKeywords])];
      }
      
      parent = parent.parentElement;
      depth++;
    }
    
    if (matchingKeywords.length > 0) {
      blockElement(video, matchingKeywords);
    }
  });
}

// Function to process element attributes that might contain spoilers
function processElementAttributes() {
  // Process elements with descriptive attributes
  const elements = document.querySelectorAll('a, [title], [aria-label], [alt], [data-content]');
  
  elements.forEach(element => {
    // Skip already processed elements
    if (element.classList.contains('spoiler-blocked')) return;
    
    const attributesToCheck = ['title', 'alt', 'aria-label', 'data-content', 'data-original-title'];
    let matchingKeywords = [];
    
    // Check text content first
    if (element.textContent) {
      matchingKeywords = findMatchingKeywords(element.textContent.toLowerCase());
    }
    
    // Check relevant attributes
    for (const attr of attributesToCheck) {
      if (element.hasAttribute(attr)) {
        const attrValue = element.getAttribute(attr).toLowerCase();
        const attrMatchingKeywords = findMatchingKeywords(attrValue);
        
        // Merge keywords
        matchingKeywords = [...new Set([...matchingKeywords, ...attrMatchingKeywords])];
      }
    }
    
    // If it's a link, also check the href (for URLs containing spoilers)
    if (element.tagName === 'A' && element.href) {
      const url = element.href.toLowerCase();
      const urlMatchingKeywords = findMatchingKeywords(url);
      matchingKeywords = [...new Set([...matchingKeywords, ...urlMatchingKeywords])];
    }
    
    if (matchingKeywords.length > 0) {
      blockElement(element, matchingKeywords);
    }
  });
}

// Site-specific processing (add more as needed)
function processSiteSpecific() {
  // URL-based detection for site-specific features
  const url = window.location.href.toLowerCase();
  
  // YouTube specific processing
  if (url.includes('youtube.com')) {
    processYouTube();
  }
  // Twitter specific processing
  else if (url.includes('twitter.com') || url.includes('x.com')) {
    processTwitter();
  }
  // Reddit specific processing
  else if (url.includes('reddit.com')) {
    processReddit();
  }
}

// Twitter specific processing
function processTwitter() {
  // Process tweets
  const tweetElements = document.querySelectorAll('article');
  
  tweetElements.forEach(tweetElement => {
    if (tweetElement.classList.contains('spoiler-blocked')) return;
    
    const tweetText = tweetElement.textContent.toLowerCase();
    const matchingKeywords = findMatchingKeywords(tweetText);
    
    if (matchingKeywords.length > 0) {
      blockElement(tweetElement, matchingKeywords);
    }
  });
}

// Reddit specific processing
function processReddit() {
  // Process posts
  const postElements = document.querySelectorAll('.Post');
  
  postElements.forEach(postElement => {
    if (postElement.classList.contains('spoiler-blocked')) return;
    
    const titleElement = postElement.querySelector('h1, h3');
    if (!titleElement) return;
    
    const title = titleElement.textContent.toLowerCase();
    const matchingKeywords = findMatchingKeywords(title);
    
    if (matchingKeywords.length > 0) {
      blockElement(postElement, matchingKeywords);
    }
  });
}

// Function to find matching keywords in text
function findMatchingKeywords(text) {
  if (!text) return [];
  
  return keywords.filter(keyword => {
    // Using word boundaries to match whole words/phrases
    const pattern = new RegExp(`\\b${escapeRegExp(keyword.toLowerCase())}\\b`, 'i');
    return pattern.test(text);
  });
}

// Helper function to escape regex special characters
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Function to block an element
function blockElement(element, matchingKeywords) {
  // Skip if already blocked
  if (element.classList.contains('spoiler-blocked')) return;
  
  // Add spoiler-blocked class
  element.classList.add('spoiler-blocked');
  
  // Special handling for YouTube thumbnails to ensure they're properly blurred
  const isYouTube = window.location.href.toLowerCase().includes('youtube.com');
  if (isYouTube && element.tagName === 'YTD-THUMBNAIL') {
    // Directly apply blur to images inside the thumbnail
    const images = element.querySelectorAll('img, yt-img-shadow img');
    images.forEach(img => {
      img.style.filter = 'blur(8px)';
    });
  }
  
  // Store element and its matching keywords in the map
  blockedElements.set(element, matchingKeywords);
  
  // Add click event to toggle blur
  element.addEventListener('click', function(e) {
    // Always stop propagation to prevent triggering parent elements
    e.stopPropagation();
    
    // Toggle unblocked class
    element.classList.toggle('spoiler-unblocked');
    
    // Special handling for YouTube thumbnails
    if (isYouTube && element.tagName === 'YTD-THUMBNAIL') {
      const images = element.querySelectorAll('img, yt-img-shadow img');
      
      if (element.classList.contains('spoiler-unblocked')) {
        // Remove blur for YouTube thumbnails
        images.forEach(img => {
          img.style.filter = 'none';
        });
      } else {
        // Reapply blur for YouTube thumbnails
        images.forEach(img => {
          img.style.filter = 'blur(8px)';
        });
      }
    }
  });
}

// Set up mutation observer to detect dynamically added content
function setupMutationObserver() {
  observer = new MutationObserver(mutations => {
    let shouldScan = false;
    
    mutations.forEach(mutation => {
      // If nodes are added, we should scan
      if (mutation.addedNodes.length > 0) {
        shouldScan = true;
      }
    });
    
    if (shouldScan && isEnabled && keywords.length > 0) {
      // Debounce the scan to improve performance
      clearTimeout(window.scanTimeout);
      window.scanTimeout = setTimeout(() => {
        scanPageForSpoilers();
      }, 100); // Reduced timeout for faster scanning
    }
  });
  
  // Start observing
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
  
  observerActive = true;
}

// Function to unblock all spoilers
function unblockAllSpoilers() {
  // Remove all spoiler-blocked elements
  document.querySelectorAll('.spoiler-blocked').forEach(element => {
    element.classList.remove('spoiler-blocked', 'spoiler-unblocked');
  });
  
  // Clear the blocked elements map
  blockedElements.clear();
  
  // Disconnect observer if active
  if (observerActive && observer) {
    observer.disconnect();
    observerActive = false;
  }
  
  // Remove overlay if present
  removeInitialOverlay();
} 