# Luna Assistant (Webion) 🌙

An intelligent, context-aware Chrome Extension (Manifest V3 Side Panel) designed to cut through chaotic web portals, government forms, and cluttered websites. 

Luna extracts the core purpose of any webpage, filters out fake/ad download links to surface only verified direct files, removes repetitive navigation clutter, and features a SafeGuard content shield.

---

## ✨ Features

- **🛡️ Genuine Download Link Verifier**:
  - Automatically identifies authentic file downloads (`.pdf`, `.zip`, `.exe`, `.apk`, `.docx`, circulars, admit cards).
  - Eliminates deceptive ad buttons, tracking redirects (`doubleclick`, `monetag`, etc.), and empty link traps (`#`, `javascript:void(0)`).
  - Includes a dedicated **"Verified Direct Downloads"** card with quick jump-to-link highlighting.

- **🎯 Purpose-Driven Action Extraction**:
  - Intelligently filters out boilerplate navigation links (Home, About Us, Contact Us, Privacy Policy, Footers, and Social links).
  - Highlights essential purpose actions (Application forms, registration buttons, status checks, login portals).

- **🧠 Core Purpose Webpage Summaries**:
  - Summarizes *why* the website exists for the visitor and what key actions they need to take.
  - Extracts critical dates, deadlines, eligibility criteria, and fees.
  - Recommends the single most important next step with automatic visual element highlighting.

- **💬 Interactive Assistant Chat**:
  - Ask Luna questions about the current page, deadlines, rules, or button locations.
  - Interactive clickable links in chat automatically scroll and highlight target buttons on the live webpage.

- **🛡️ SafeGuard Content Shield**:
  - Automatic blurring and detection for adult/NSFW content, sensitive imagery, and extreme violence.
  - Configurable strict mode for family/minor safety.
  - Discretionary reveal buttons for flagged media.

- **🎨 Vintage Editorial Design**:
  - Warm retro parchment aesthetics (`#f6efe2`), classic editorial typography, and soft espresso ink tones.
  - Clean side panel user experience that stays open alongside your active browsing tab.

---

## 🛠️ Installation & Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/devil15371/webion.git
   ```

2. **Load into Google Chrome**:
   - Open Chrome and navigate to `chrome://extensions/`.
   - Enable **Developer mode** (toggle in the top-right corner).
   - Click **Load unpacked**.
   - Select the `webion` directory.

3. **Open Luna Assistant**:
   - Click the extension icon in your Chrome toolbar or open the side panel.
   - Luna is ready to assist you on any active webpage!

---

## 📁 Repository Structure

```
webion/
├── manifest.json       # Chrome Extension Manifest (V3 Side Panel & Permissions)
├── background.js       # Background service worker (side panel activation)
├── content.js          # DOM extractor, link verification & SafeGuard media shield
├── sidepanel.html      # Luna Assistant interface (Vintage aesthetic)
├── sidepanel.js        # Controller, AI summarization & interactive element mapper
└── README.md           # Documentation
```

---

## 📜 License

MIT License.
