# Luna Assistant (Webion) 🌙

An intelligent, context-aware Chrome Extension (Manifest V3 Side Panel) designed to cut through chaotic web portals, government forms, and cluttered websites. 

Luna extracts the core purpose of any webpage, presents critical gatekeeping information (Eligibility Criteria, Documents Required, Deadlines, Fees) **separately and upfront**, filters out fake/ad download links to surface only verified direct files, provides an in-browser Document & Photo Converter/Compressor Studio, and features a SafeGuard content shield.

---

## ✨ Key Features

- **🎓 Separate Information Pillars (Eligibility, Documents, Dates & Fees)**:
  - **Eligibility & Criteria**: Clearly breaks down Age limits (with category relaxations), Minimum Qualifications, Income ceilings, and Domicile rules into dedicated rows so you know immediately if you qualify.
  - **Interactive "Quick Eligibility Checker"**: Enter your Age, Category, and Qualification to get an instant verdict (`✅ You Qualify!` or `⚠️ Age Exceeded`) before starting lengthy forms.
  - **Documents Required Checklist**: Structured checklist of official IDs, marksheets, income proofs, and photos you must possess to apply, with 1-click shortcuts to prepare them in Doc Studio.
  - **Deadlines & Important Dates**: Separate view of Start date, Last date to apply (with live countdown e.g. `⏳ 33 Days Remaining`), Fee submission deadline, and Correction window.
  - **Application Fees Breakdown**: Clear categorization of fees for General/OBC vs. SC/ST/PwD/Female, plus accepted payment modes.
  - **Critical Warnings & Rules**: Essential precautions (e.g. Aadhaar e-KYC, NPCI bank seeding) to prevent application rejection.

- **🖼️ In-Browser Doc & Photo Studio (Converter & Resizer)**:
  - **Format Conversion**: Convert between `PNG ⇄ JPG ⇄ PDF ⇄ WEBP` client-side with zero server uploads (100% private).
  - **Exact KB Size Adjustment**: Enforce strict portal size limits (e.g. "Max 50 KB" for photos, "Max 20 KB" for signatures, "Max 200 KB" for PDF certificates). Luna uses adaptive quality compression to guarantee the output file stays strictly under the target KB!
  - **Dimension & Aspect Ratio Resizer**: Set custom pixel dimensions or use standard portal ratios with smart center crop or fit scaling (e.g. Passport 3.5×4.5 cm / 350×450px).
  - **Direct PDF Generator**: Instantly generate clean, standard single-page PDF documents from image uploads right in the browser.
  - **1-Click Portal Presets**: Ready-made presets for Passport Photos, Scanned Signatures, Marksheets, and Certificates.

- **🛡️ Genuine Download Link Verifier**:
  - Automatically identifies authentic file downloads (`.pdf`, `.zip`, `.exe`, `.apk`, `.docx`, circulars, admit cards).
  - Eliminates deceptive ad buttons, tracking redirects (`doubleclick`, `monetag`, etc.), and empty link traps (`#`, `javascript:void(0)`).
  - Includes a dedicated **"Verified Direct Downloads"** card with glowing on-page link highlighting.

- **🎯 Purpose-Driven Action Extraction**:
  - Intelligently filters out boilerplate navigation links (Home, About Us, Contact Us, Privacy Policy, Footers, and Social links).
  - Highlights essential purpose actions (Application forms, registration buttons, status checks, login portals).

- **💬 Interactive Assistant Chat**:
  - Ask Luna questions about the current page, deadlines, rules, or button locations.
  - Interactive clickable links in chat automatically scroll and highlight target buttons on the live webpage.

- **🛡️ SafeGuard Content Shield**:
  - Automatic blurring and detection for adult/NSFW content, sensitive imagery, and extreme violence.
  - Configurable strict mode for family/minor safety with discretionary reveal buttons.

- **🎨 Vintage Editorial Design**:
  - Warm retro parchment aesthetics (`#f6efe2`), classic editorial typography, and soft espresso ink tones.
  - Clean side panel user experience that stays open alongside your active browsing tab.

---

## 🛠️ Installation & Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/devil15371/luna.git
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
├── content.js          # DOM extractor, link verification, document requirements & SafeGuard shield
├── sidepanel.html      # Luna Assistant interface with separate information pillars & Doc Studio
├── sidepanel.js        # Controller, AI extractor, pure JS PDF generator & eligibility checker
├── config.example.js   # Template configuration file for API credentials
└── README.md           # Documentation
```

---

## 📜 License

MIT License.
