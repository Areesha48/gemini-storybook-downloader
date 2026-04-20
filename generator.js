// =====================================================
// PDF Generator Script - Storybook Saver v2
// Proper book-format PDF with watermark removal
// =====================================================

(async function() {
  'use strict';

  const statusTitle = document.getElementById('status-title');
  const statusMessage = document.getElementById('status-message');
  const spinner = document.getElementById('spinner');
  const progressContainer = document.getElementById('progress-container');
  const progressBar = document.getElementById('progress-bar');
  const progressText = document.getElementById('progress-text');
  const mainContent = document.getElementById('main-content');
  const footer = document.getElementById('footer');

  function updateProgress(current, total, message) {
    const percent = Math.round((current / total) * 100);
    progressBar.style.width = percent + '%';
    progressText.textContent = `${current} / ${total} images`;
    if (message) statusMessage.textContent = message;
  }

  function showSuccess(title, message) {
    spinner.style.display = 'none';
    progressContainer.style.display = 'none';
    progressText.style.display = 'none';
    const icon = document.createElement('div');
    icon.className = 'success-icon';
    icon.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
    mainContent.insertBefore(icon, statusTitle);
    statusTitle.textContent = title;
    statusMessage.textContent = message;
    footer.style.display = 'flex';
  }

  function showError(title, message) {
    spinner.style.display = 'none';
    progressContainer.style.display = 'none';
    progressText.style.display = 'none';
    const icon = document.createElement('div');
    icon.className = 'error-icon';
    icon.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
    mainContent.insertBefore(icon, statusTitle);
    statusTitle.textContent = title;
    statusMessage.innerHTML = message;
    footer.style.display = 'flex';
  }

  function fetchImageViaBackground(url) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'fetchImage', url }, (response) => {
        if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
        if (response && response.success) resolve(response.dataUrl);
        else reject(new Error(response?.error || 'Unknown error'));
      });
    });
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = src;
    });
  }

  function dataURLToUint8Array(dataUrl) {
    const base64 = dataUrl.split(',')[1];
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  // ============================================================
  // WATERMARK REMOVAL - Multiple strategies
  // ============================================================
  
  // Strategy 1: Reverse alpha blending (original WatermarkEngine)
  // Strategy 2: Canvas inpainting - paint over watermark area with surrounding pixels
  
  function removeWatermarkByInpainting(image) {
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);

    const w = canvas.width;
    const h = canvas.height;

    // Gemini watermark positions to try (bottom-right corner area)
    // The watermark is typically a small Google/Gemini logo
    const configs = [];
    
    // For high-res images (>1024px)
    if (w > 1024 && h > 1024) {
      configs.push({ size: 96, marginR: 64, marginB: 64 });
      configs.push({ size: 120, marginR: 50, marginB: 50 });
      configs.push({ size: 80, marginR: 40, marginB: 40 });
    }
    // For standard images
    configs.push({ size: 48, marginR: 32, marginB: 32 });
    configs.push({ size: 64, marginR: 24, marginB: 24 });
    configs.push({ size: 56, marginR: 28, marginB: 28 });
    
    // Also try a larger area to cover any variant
    configs.push({ size: Math.round(w * 0.08), marginR: Math.round(w * 0.04), marginB: Math.round(h * 0.04) });

    for (const cfg of configs) {
      const wmX = w - cfg.marginR - cfg.size;
      const wmY = h - cfg.marginB - cfg.size;
      
      if (wmX < 0 || wmY < 0) continue;

      // Sample colors from area just above and to the left of watermark
      // to create a smooth patch
      const sampleSize = 4;
      
      // Get surrounding pixel colors for inpainting
      const imageData = ctx.getImageData(wmX - sampleSize, wmY - sampleSize, cfg.size + sampleSize * 2, cfg.size + sampleSize * 2);
      
      // Use content-aware fill: sample from edges and interpolate
      const patchCanvas = document.createElement('canvas');
      patchCanvas.width = cfg.size;
      patchCanvas.height = cfg.size;
      const patchCtx = patchCanvas.getContext('2d');
      
      // Draw surrounding area stretched to fill the watermark region
      // Left edge sampling
      patchCtx.drawImage(canvas, 
        wmX - sampleSize * 3, wmY, sampleSize * 3, cfg.size, // source
        0, 0, cfg.size / 2, cfg.size // dest
      );
      // Top edge sampling
      patchCtx.drawImage(canvas,
        wmX, wmY - sampleSize * 3, cfg.size, sampleSize * 3,
        0, 0, cfg.size, cfg.size / 2
      );
      
      // Apply with slight transparency for blending
      ctx.globalAlpha = 0.92;
      ctx.drawImage(patchCanvas, wmX, wmY);
      ctx.globalAlpha = 1.0;
    }

    return canvas;
  }

  // Combined watermark removal
  async function processImageWatermark(dataUrl, watermarkEngine) {
    try {
      const img = await loadImage(dataUrl);
      
      // Try WatermarkEngine first (reverse alpha blending)
      let canvas;
      if (watermarkEngine) {
        try {
          canvas = await watermarkEngine.removeWatermarkFromImage(img);
        } catch (e) {
          console.warn('Alpha blending failed, using inpainting:', e);
          canvas = removeWatermarkByInpainting(img);
        }
      } else {
        canvas = removeWatermarkByInpainting(img);
      }
      
      // Also apply inpainting on top for extra coverage
      const finalImg = await loadImage(canvas.toDataURL('image/png'));
      const finalCanvas = removeWatermarkByInpainting(finalImg);
      
      return finalCanvas.toDataURL('image/jpeg', 0.95);
    } catch (err) {
      console.warn('All watermark removal failed:', err);
      return dataUrl; // Return original if all fails
    }
  }

  try {
    statusTitle.textContent = 'Loading Data...';
    statusMessage.textContent = 'Storybook data retrieve ho raha hai...';

    const result = await new Promise((resolve) => {
      chrome.storage.local.get('bookDataForGenerator', resolve);
    });
    const bookData = result.bookDataForGenerator;

    if (!bookData || !bookData.imageUrls || bookData.imageUrls.length === 0) {
      showError('Data Nahi Mila! 😕', 'Storybook data nahi mil raha. Wapas jaayein aur dobara try karein.');
      return;
    }

    chrome.storage.local.remove('bookDataForGenerator');
    const { title, author, imageUrls, textContents, removeWatermark } = bookData;
    const totalImages = imageUrls.length;

    statusTitle.textContent = '📖 Book Ban Rahi Hai...';
    statusMessage.textContent = `"${title}" - ${totalImages} images process ho rahi hain`;
    progressContainer.style.display = 'block';
    progressText.style.display = 'block';

    // Initialize Watermark Engine
    let watermarkEngine = null;
    if (removeWatermark && typeof WatermarkEngine !== 'undefined') {
      try {
        watermarkEngine = new WatermarkEngine();
        await watermarkEngine.loadBackgroundImages();
      } catch (e) {
        console.warn('WatermarkEngine init failed:', e);
      }
    }

    // Create PDF
    const { PDFDocument, rgb, StandardFonts } = PDFLib;
    const pdfDoc = await PDFDocument.create();
    
    // ===== BOOK DIMENSIONS =====
    // Using 6x9 inch book size (standard book/novel size)
    const pageWidth = 432;   // 6 inches * 72 dpi
    const pageHeight = 648;  // 9 inches * 72 dpi
    const margin = 54;       // 0.75 inch margins (proper book margins)
    const innerWidth = pageWidth - 2 * margin;
    const innerHeight = pageHeight - 2 * margin;

    // Fonts
    const fontRegular = await pdfDoc.embedFont(StandardFonts.TimesRoman);
    const fontBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
    const fontItalic = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);

    // ===== FETCH & PROCESS ALL IMAGES =====
    const processedImages = [];
    
    for (let i = 0; i < totalImages; i++) {
      updateProgress(i + 1, totalImages, `Image ${i + 1}/${totalImages} process ho rahi hai...`);

      try {
        let dataUrl = await fetchImageViaBackground(imageUrls[i]);
        
        // Remove watermark
        if (removeWatermark) {
          dataUrl = await processImageWatermark(dataUrl, watermarkEngine);
        }

        // Embed in PDF
        const imgBytes = dataURLToUint8Array(dataUrl);
        let embeddedImage;
        
        try {
          if (dataUrl.includes('image/png')) {
            embeddedImage = await pdfDoc.embedPng(imgBytes);
          } else {
            embeddedImage = await pdfDoc.embedJpg(imgBytes);
          }
        } catch (e) {
          // Fallback: convert to JPEG
          try {
            const img = await loadImage(dataUrl);
            const c = document.createElement('canvas');
            c.width = img.width; c.height = img.height;
            c.getContext('2d').drawImage(img, 0, 0);
            const jpgBytes = dataURLToUint8Array(c.toDataURL('image/jpeg', 0.92));
            embeddedImage = await pdfDoc.embedJpg(jpgBytes);
          } catch (e2) {
            console.error(`Image ${i} embed failed:`, e2);
            continue;
          }
        }

        processedImages.push({ image: embeddedImage, width: embeddedImage.width, height: embeddedImage.height });
      } catch (err) {
        console.error(`Image ${i} fetch failed:`, err);
      }
    }

    if (processedImages.length === 0) {
      showError('Images Download Nahi Hui! 😕', 'Koi image download nahi ho payi.');
      return;
    }

    updateProgress(totalImages, totalImages, 'Book pages design ho rahe hain...');

    // ===== HELPER: Draw page number =====
    function drawPageNumber(page, num) {
      const numStr = String(num);
      const numWidth = fontRegular.widthOfTextAtSize(numStr, 9);
      page.drawText(numStr, {
        x: (pageWidth - numWidth) / 2,
        y: 30,
        size: 9,
        font: fontRegular,
        color: rgb(0.5, 0.5, 0.5)
      });
    }

    // ===== HELPER: Draw decorative line =====
    function drawSeparator(page, y) {
      const lineWidth = 60;
      const startX = (pageWidth - lineWidth) / 2;
      page.drawRectangle({
        x: startX, y: y,
        width: lineWidth, height: 0.5,
        color: rgb(0.7, 0.7, 0.7)
      });
    }

    // ===== HELPER: Word wrap text =====
    function wrapText(text, font, fontSize, maxWidth) {
      const words = text.split(/\s+/);
      const lines = [];
      let currentLine = '';
      for (const word of words) {
        const testLine = currentLine ? currentLine + ' ' + word : word;
        try {
          if (font.widthOfTextAtSize(testLine, fontSize) > maxWidth && currentLine) {
            lines.push(currentLine);
            currentLine = word;
          } else {
            currentLine = testLine;
          }
        } catch (e) {
          // Skip problematic characters
          currentLine = testLine;
        }
      }
      if (currentLine) lines.push(currentLine);
      return lines;
    }

    // ===== PAGE 1: FULL COVER PAGE =====
    let pageNumber = 0;
    
    if (processedImages.length > 0) {
      const coverPage = pdfDoc.addPage([pageWidth, pageHeight]);
      const coverImg = processedImages[0];
      
      // Fill entire page with cover image
      const imgAspect = coverImg.width / coverImg.height;
      const pageAspect = pageWidth / pageHeight;
      let dw, dh, dx, dy;
      
      if (imgAspect > pageAspect) {
        dh = pageHeight; dw = dh * imgAspect;
        dx = (pageWidth - dw) / 2; dy = 0;
      } else {
        dw = pageWidth; dh = dw / imgAspect;
        dx = 0; dy = (pageHeight - dh) / 2;
      }

      coverPage.drawImage(coverImg.image, { x: dx, y: dy, width: dw, height: dh });

      // Dark gradient overlay at bottom
      for (let i = 0; i < 150; i++) {
        const opacity = (1 - i / 150) * 0.75;
        coverPage.drawRectangle({
          x: 0, y: i, width: pageWidth, height: 1,
          color: rgb(0, 0, 0), opacity
        });
      }

      // Title on cover
      const coverTitleSize = 22;
      const titleLines = wrapText(title, fontBold, coverTitleSize, pageWidth - 60);
      let ty = 90;
      for (const line of titleLines.reverse()) {
        coverPage.drawText(line, {
          x: 30, y: ty, size: coverTitleSize,
          font: fontBold, color: rgb(1, 1, 1)
        });
        ty += coverTitleSize * 1.3;
      }

      // Author
      coverPage.drawText(author, {
        x: 30, y: 55, size: 11,
        font: fontItalic, color: rgb(0.85, 0.85, 0.85)
      });
    }

    // ===== PAGE 2: TITLE PAGE (like a real book) =====
    const titlePage = pdfDoc.addPage([pageWidth, pageHeight]);
    
    // Title centered
    const tSize = 24;
    const tLines = wrapText(title, fontBold, tSize, innerWidth);
    let tY = pageHeight - 200;
    for (const line of tLines) {
      const lw = fontBold.widthOfTextAtSize(line, tSize);
      titlePage.drawText(line, {
        x: (pageWidth - lw) / 2, y: tY,
        size: tSize, font: fontBold, color: rgb(0.1, 0.1, 0.1)
      });
      tY -= tSize * 1.5;
    }

    // Decorative separator
    drawSeparator(titlePage, tY - 10);

    // Author centered
    const aText = author;
    const aWidth = fontItalic.widthOfTextAtSize(aText, 14);
    titlePage.drawText(aText, {
      x: (pageWidth - aWidth) / 2, y: tY - 40,
      size: 14, font: fontItalic, color: rgb(0.4, 0.4, 0.4)
    });

    // Bottom info
    const genText = 'Generated from Google Gemini Storybook';
    const genW = fontItalic.widthOfTextAtSize(genText, 9);
    titlePage.drawText(genText, {
      x: (pageWidth - genW) / 2, y: 50,
      size: 9, font: fontItalic, color: rgb(0.6, 0.6, 0.6)
    });

    // ===== CONTENT PAGES: Image on one page, Text on facing page =====
    const startIdx = 1;
    let textIdx = 0;

    for (let i = startIdx; i < processedImages.length; i++) {
      pageNumber++;
      
      // ---- IMAGE PAGE (full bleed with thin border) ----
      const imgPage = pdfDoc.addPage([pageWidth, pageHeight]);
      const img = processedImages[i];
      
      const imgMargin = 36; // smaller margin for images
      const imgAvailW = pageWidth - 2 * imgMargin;
      const imgAvailH = pageHeight - 2 * imgMargin - 30; // leave room for page num
      
      const iAspect = img.width / img.height;
      let iw, ih;
      if (iAspect > imgAvailW / imgAvailH) {
        iw = imgAvailW; ih = iw / iAspect;
      } else {
        ih = imgAvailH; iw = ih * iAspect;
      }

      const ix = (pageWidth - iw) / 2;
      const iy = (pageHeight - ih) / 2 + 10;

      // Light border around image
      imgPage.drawRectangle({
        x: ix - 2, y: iy - 2,
        width: iw + 4, height: ih + 4,
        borderColor: rgb(0.85, 0.85, 0.85),
        borderWidth: 0.5,
        color: rgb(1, 1, 1)
      });

      imgPage.drawImage(img.image, { x: ix, y: iy, width: iw, height: ih });
      drawPageNumber(imgPage, pageNumber);

      // ---- TEXT PAGE (facing page, like a real book) ----
      if (textIdx < textContents.length) {
        pageNumber++;
        const textPage = pdfDoc.addPage([pageWidth, pageHeight]);
        const text = textContents[textIdx];
        textIdx++;

        // Chapter-style header
        const chapterNum = String(i);
        const cnw = fontRegular.widthOfTextAtSize(chapterNum, 10);
        textPage.drawText(chapterNum, {
          x: (pageWidth - cnw) / 2,
          y: pageHeight - margin,
          size: 10, font: fontRegular, color: rgb(0.6, 0.6, 0.6)
        });

        drawSeparator(textPage, pageHeight - margin - 15);

        // Body text
        const fontSize = 11;
        const lineHeight = fontSize * 1.8; // generous line spacing for readability
        const lines = wrapText(text, fontRegular, fontSize, innerWidth);

        let y = pageHeight - margin - 50;
        for (const line of lines) {
          if (y < margin + 20) break;
          textPage.drawText(line, {
            x: margin, y,
            size: fontSize, font: fontRegular,
            color: rgb(0.12, 0.12, 0.12)
          });
          y -= lineHeight;
        }

        drawPageNumber(textPage, pageNumber);
      }
    }

    // ===== LAST PAGE: Back cover (blank with subtle branding) =====
    const backPage = pdfDoc.addPage([pageWidth, pageHeight]);
    const endText = '~ The End ~';
    const endW = fontItalic.widthOfTextAtSize(endText, 16);
    backPage.drawText(endText, {
      x: (pageWidth - endW) / 2,
      y: pageHeight / 2,
      size: 16, font: fontItalic, color: rgb(0.5, 0.5, 0.5)
    });

    drawSeparator(backPage, pageHeight / 2 - 25);

    // ===== SAVE & DOWNLOAD =====
    statusTitle.textContent = 'Book Finalize Ho Rahi Hai...';
    statusMessage.textContent = 'Bas thodi der aur...';

    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/[^a-zA-Z0-9\s]/g, '').trim() || 'storybook'} - Book.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);

    showSuccess(
      'Book Ready! 📖🎉',
      `"${title}" - ${processedImages.length} pages ki book download ho gayi!`
    );

  } catch (err) {
    console.error('PDF generation error:', err);
    showError('Error! 😢', `PDF nahi ban payi: ${err.message}<br><br>Console (F12) mein details dekhein.`);
  }
})();
