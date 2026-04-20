// =====================================================
// Background Service Worker - Storybook Saver Extension
// =====================================================

// When extension icon is clicked
chrome.action.onClicked.addListener(async (tab) => {
  try {
    // First inject the CSS
    await chrome.scripting.insertCSS({
      target: { tabId: tab.id },
      files: ['style.css']
    });
    
    // Then inject the content script
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: createExtractionUI,
    });
  } catch (err) {
    console.error("Error injecting script:", err);
  }
});

// =================================================
// Content Script - Injected into the Gemini page
// =================================================
function createExtractionUI() {
  
  // ---- STEP 1: Extract storybook data from the DOM ----
  const extractStorybookData = () => {
    const bookData = {
      title: '',
      author: '',
      imageUrls: [],
      textContents: [],
      removeWatermark: true
    };

    // Strategy 1: Try multiple title selectors
    const titleSelectors = [
      '.cover-title',
      'storybook-cover .title',
      '[class*="cover"] [class*="title"]',
      'h1[class*="title"]',
      '.storybook-title'
    ];
    
    for (const sel of titleSelectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent.trim()) {
        bookData.title = el.textContent.trim();
        break;
      }
    }

    // Strategy 2: Try to get title from the storybook panel header
    if (!bookData.title) {
      // Look for the storybook header area
      const headerEls = document.querySelectorAll('[class*="storybook"] [class*="header"], [class*="story"] [class*="title"]');
      for (const el of headerEls) {
        const text = el.textContent.trim();
        if (text && text.length > 3 && text.length < 200) {
          bookData.title = text;
          break;
        }
      }
    }

    if (!bookData.title) {
      bookData.title = 'Gemini Storybook';
    }

    // Author detection
    const authorSelectors = [
      '.cover-subtitle',
      'storybook-cover .subtitle',
      '[class*="cover"] [class*="subtitle"]',
      '[class*="author"]'
    ];
    
    for (const sel of authorSelectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent.trim()) {
        bookData.author = el.textContent.trim();
        break;
      }
    }

    if (!bookData.author) {
      bookData.author = 'by Gemini AI';
    }

    // ---- IMAGE EXTRACTION ----
    // Multiple strategies to find ALL storybook images
    const imageSelectors = [
      // Direct storybook image selectors
      'storybook-page img',
      'storybook-image-page-content img',
      '.cover-image-container img',
      '.cover-art img',
      // Generic page images
      '.page:not([class*="cover"]) img',
      'div[class*="story"] img',
      'div[class*="page"] img',
      'div[class*="illustration"] img',
      // Broader selectors
      '[class*="storybook"] img',
      'img[class*="story"]',
      'img[class*="page"]',
      'img[class*="cover"]',
      'img[class*="illustration"]'
    ];

    const addedImageUrls = new Set();
    
    for (const sel of imageSelectors) {
      const imgs = document.querySelectorAll(sel);
      for (const img of imgs) {
        let src = img.src || img.getAttribute('data-src') || '';
        
        // Skip tiny images (icons, buttons etc)
        if (img.naturalWidth && img.naturalWidth < 100) continue;
        if (img.naturalHeight && img.naturalHeight < 100) continue;
        
        // Skip data: URLs that are too small (likely icons)
        if (src.startsWith('data:') && src.length < 500) continue;
        
        if (src && !addedImageUrls.has(src)) {
          // For Google hosted images, try to get highest resolution
          if (src.includes('googleusercontent.com') && !src.includes('=s')) {
            src = src.split('=')[0] + '=s1024';
          }
          bookData.imageUrls.push(src);
          addedImageUrls.add(src);
        }
      }
    }

    // If still no images found, try ALL images on the page that are large enough
    if (bookData.imageUrls.length === 0) {
      const allImgs = document.querySelectorAll('img');
      for (const img of allImgs) {
        const src = img.src || '';
        if (!src) continue;
        if (src.startsWith('data:') && src.length < 500) continue;
        
        // Only grab reasonably sized images
        const w = img.naturalWidth || img.width || 0;
        const h = img.naturalHeight || img.height || 0;
        
        if ((w > 200 || h > 200) && !addedImageUrls.has(src)) {
          bookData.imageUrls.push(src);
          addedImageUrls.add(src);
        }
      }
    }

    // ---- TEXT EXTRACTION ----
    const textSelectors = [
      'div.story-text-container p',
      'p.story-text',
      'storybook-text-page-content p',
      'storybook-text-page-content div',
      '[class*="story-text"] p',
      '[class*="text-page"] p',
      '[class*="page-text"] p',
      '[class*="storybook"] [class*="text"] p'
    ];

    const addedTextContent = new Set();
    
    for (const sel of textSelectors) {
      const els = document.querySelectorAll(sel);
      for (const el of els) {
        const text = el.textContent.trim();
        if (text && text.length > 10 && !addedTextContent.has(text)) {
          bookData.textContents.push(text);
          addedTextContent.add(text);
        }
      }
    }

    return bookData;
  };

  // ---- Execute extraction ----
  const bookData = extractStorybookData();

  if (!bookData || bookData.imageUrls.length === 0) {
    // Show a nicer error
    const errorOverlay = document.createElement('div');
    errorOverlay.id = 'storybook-extractor-overlay';
    errorOverlay.innerHTML = `
      <div id="storybook-extractor-container">
        <button id="storybook-extractor-close-btn">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
        <div style="font-size: 48px; margin-bottom: 16px;">😕</div>
        <h1>Storybook Nahi Mila!</h1>
        <p style="color: #6b7280; font-size: 14px; margin: 0 0 20px;">
          Is page pe koi storybook content nahi mila.<br><br>
          <strong>Ye check karein:</strong><br>
          1. Gemini Storybook page open hona chahiye<br>
          2. Share link (gemini.google.com/share/...) pe jaayein<br>
          3. Storybook fully load hone dein
        </p>
        <button id="storybook-extractor-download-btn" onclick="this.closest('#storybook-extractor-overlay').remove()">
          Samjha, Band Karo
        </button>
      </div>
    `;
    document.body.appendChild(errorOverlay);
    
    errorOverlay.querySelector('#storybook-extractor-close-btn').addEventListener('click', () => {
      errorOverlay.style.opacity = '0';
      setTimeout(() => errorOverlay.remove(), 300);
    });
    return;
  }

  // ---- STEP 2: Show the extraction UI ----
  const existingOverlay = document.getElementById('storybook-extractor-overlay');
  if (existingOverlay) existingOverlay.remove();

  const overlay = document.createElement('div');
  overlay.id = 'storybook-extractor-overlay';

  const container = document.createElement('div');
  container.id = 'storybook-extractor-container';

  // Close Button
  const closeButton = document.createElement('button');
  closeButton.id = 'storybook-extractor-close-btn';
  closeButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
  closeButton.title = "Close";

  // Title
  const titleElement = document.createElement('h1');
  titleElement.textContent = bookData.title;

  // Stats info
  const statsElement = document.createElement('p');
  statsElement.style.cssText = 'color: #6b7280; font-size: 13px; margin: 0 0 16px;';
  statsElement.textContent = `📷 ${bookData.imageUrls.length} images · 📝 ${bookData.textContents.length} text blocks`;

  // Preview Image
  const coverPreview = document.createElement('img');
  coverPreview.src = bookData.imageUrls[0];
  coverPreview.id = 'storybook-extractor-cover-preview';
  coverPreview.onerror = () => {
    coverPreview.style.display = 'none';
  };

  // Watermark Options
  const watermarkContainer = document.createElement('div');
  watermarkContainer.style.cssText = 'margin-bottom: 15px; display: flex; align-items: center; justify-content: center; gap: 8px;';

  const watermarkCheckbox = document.createElement('input');
  watermarkCheckbox.type = 'checkbox';
  watermarkCheckbox.id = 'storybook-extractor-watermark-check';
  watermarkCheckbox.checked = true;

  const watermarkLabel = document.createElement('label');
  watermarkLabel.htmlFor = 'storybook-extractor-watermark-check';
  watermarkLabel.textContent = 'Watermark Hatao (Remove Watermark)';
  watermarkLabel.style.cssText = 'font-size: 14px; color: #333; cursor: pointer;';

  watermarkContainer.appendChild(watermarkCheckbox);
  watermarkContainer.appendChild(watermarkLabel);

  // Download Button
  const downloadButton = document.createElement('button');
  downloadButton.textContent = '📥 PDF Download Karo';
  downloadButton.id = 'storybook-extractor-download-btn';

  // Assemble UI
  container.appendChild(closeButton);
  container.appendChild(titleElement);
  container.appendChild(statsElement);
  container.appendChild(coverPreview);
  container.appendChild(watermarkContainer);
  container.appendChild(downloadButton);
  overlay.appendChild(container);
  document.body.appendChild(overlay);

  // ---- EVENT HANDLERS ----
  downloadButton.addEventListener('click', () => {
    downloadButton.textContent = '⏳ Generating...';
    downloadButton.disabled = true;
    downloadButton.style.opacity = '0.7';
    downloadButton.style.cursor = 'wait';

    bookData.removeWatermark = watermarkCheckbox.checked;

    chrome.storage.local.set({ bookDataForGenerator: bookData }, () => {
      window.open(chrome.runtime.getURL('generator.html'), '_blank');
      setTimeout(() => overlay.remove(), 1000);
    });
  });

  closeButton.addEventListener('click', () => {
    overlay.style.opacity = '0';
    container.style.transform = 'scale(0.95) translateY(10px)';
    setTimeout(() => overlay.remove(), 300);
  });

  // Click outside to close
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.style.opacity = '0';
      container.style.transform = 'scale(0.95) translateY(10px)';
      setTimeout(() => overlay.remove(), 300);
    }
  });
}

// ---- IMAGE FETCHING (runs in background with full CORS access) ----
function fetchAsDataURL(url) {
  return new Promise(async (resolve, reject) => {
    try {
      const response = await fetch(url, { mode: 'cors' });
      if (!response.ok) throw new Error(`Network error: ${response.statusText}`);
      const blob = await response.blob();
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    } catch (error) {
      // Retry without CORS mode
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Network error: ${response.statusText}`);
        const blob = await response.blob();
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      } catch (retryError) {
        reject(retryError);
      }
    }
  });
}

// Listen for image fetch requests from generator page
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'fetchImage') {
    fetchAsDataURL(message.url)
      .then(dataUrl => { sendResponse({ success: true, dataUrl }); })
      .catch(error => {
        console.error(`Failed to fetch ${message.url}:`, error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep message channel open for async response
  }
});
