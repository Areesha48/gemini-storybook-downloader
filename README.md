# 📚 Storybook Saver - Gemini Storybook Downloader

> One-click Chrome Extension to download Google Gemini Storybooks as beautiful, print-ready PDF books — with automatic watermark removal!

![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?logo=googlechrome&logoColor=white)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-green)
![License](https://img.shields.io/badge/License-MIT-blue)

## ✨ Features

- 📥 **One-Click Download** — Click the extension icon, get a PDF book
- 📷 **Full Image Extraction** — All storybook illustrations captured in high quality  
- 🧹 **Automatic Watermark Removal** — Gemini watermarks removed using reverse-alpha blending + canvas inpainting
- 📖 **Real Book Format** — 6×9 inch pages, cover page, title page, alternating image/text layout
- 🔒 **100% Client-Side** — No servers, no uploads. Everything runs locally in your browser
- 📄 **Print-Ready PDF** — Ready for printing or e-book readers

## 📸 How It Works

1. Open any Gemini Storybook (or shared storybook link)
2. Click the **Storybook Saver** extension icon
3. Preview appears → Click **"📥 PDF Download Karo"**
4. Beautiful PDF book downloads automatically!

## 🛠️ Installation

Since this extension is not on the Chrome Web Store, you need to load it manually:

1. **Download** this repository:
   ```bash
   git clone https://github.com/YOUR_USERNAME/gemini-storybook-downloader.git
   ```

2. Open Chrome and go to:
   ```
   chrome://extensions/
   ```

3. Enable **Developer Mode** (toggle in top-right corner)

4. Click **"Load unpacked"**

5. Select the downloaded `gemini-storybook-downloader` folder

6. Done! The extension icon will appear in your toolbar 🎉

## 📁 Project Structure

```
gemini-storybook-downloader/
├── manifest.json        # Extension configuration (Manifest V3)
├── background.js        # Content extraction + image fetching
├── generator.html       # PDF generation page
├── generator.js         # PDF creation with book layout
├── watermark.js         # Watermark removal engine
├── style.css            # UI styles
├── rules.json           # CORS bypass for Google images
├── icons/               # Extension icons
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── lib/                 # Third-party libraries
    ├── pdf-lib.min.js   # PDF creation
    └── fontkit.umd.min.js
```

## 🔧 How Watermark Removal Works

The extension uses two combined techniques:

1. **Reverse Alpha Blending** — Detects the Gemini watermark overlay and mathematically reverses the blending to recover original pixels
2. **Canvas Inpainting** — Samples surrounding pixels and paints over the watermark area for extra coverage

## 🤝 Contributing

Contributions are welcome! Feel free to:

- 🐛 Report bugs via [Issues](../../issues)
- 💡 Suggest features
- 🔀 Submit Pull Requests

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Credits

- [pdf-lib](https://pdf-lib.js.org/) — PDF creation library
- [fontkit](https://github.com/foliojs/fontkit) — Font embedding
- Watermark removal logic inspired by [GeminiWatermarkTool](https://github.com/allenk/GeminiWatermarkTool)

---

**Made with ❤️ for the Gemini Storybook community**
