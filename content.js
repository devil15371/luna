// content.js
// Luna Assistant: Intelligent Page Extractor & SafeGuard Content Shield

(() => {
  if (window.__LUNA_CONTENT_SCRIPT_INITIALIZED__) {
    return;
  }
  window.__LUNA_CONTENT_SCRIPT_INITIALIZED__ = true;

  let safeGuardSettings = {
  enabled: true,
  strictMode: false,
  allowReveal: true
};

let shieldedCount = 0;
const shieldedElementsSet = new WeakSet();

// ==========================================
// 1. SafeGuard 18+ & NSFW Content Shield
// ==========================================

// Taxonomy of adult, graphic violence, and inappropriate terms
const NSFW_KEYWORDS = [
  // Nudity & Sexual content
  'nude', 'nudity', 'naked', 'nsfw', 'porn', 'porno', 'xxx', 'sex', 'sexy',
  'erotic', 'erotica', 'boobs', 'breasts', 'penis', 'vagina', 'bikini',
  'lingerie', 'underwear', 'thong', 'cleavage', 'topless', 'bottomless',
  'bdsm', 'fetish', 'adult', '18+', 'explicit', 'strip', 'playboy',
  'onlyfans', 'escort', 'camgirl', 'orgasm', 'intercourse', 'swinger',
  
  // Graphic Violence, Gore & Seriously Harmful Content
  'gore', 'bloody', 'corpse', 'beheading', 'decapitat', 'mutilat', 'autopsy',
  'dead body', 'suicide', 'execution', 'massacre', 'gunshot', 'gruesome',
  'slaughter', 'severed', 'murder', 'blood bath'
];

const STRICT_KEYWORDS = [
  // Drugs, Gambling & Suggestive Material (Below 18 protection)
  'casino', 'gambling', 'betting', 'marijuana', 'weed', 'cannabis',
  'cocaine', 'heroin', 'meth', 'vape', 'tobacco', 'cigarette',
  'swimwear', 'swimsuit', 'hot model', 'provocative', 'sensual'
];

// Initialize Shield Styles in Document
function injectSafeGuardStyles() {
  if (document.getElementById('airguide-safeguard-style')) return;
  
  const style = document.createElement('style');
  style.id = 'airguide-safeguard-style';
  style.textContent = `
    .airguide-shielded-media {
      filter: blur(35px) brightness(0.65) saturate(120%) !important;
      opacity: 0.9 !important;
      pointer-events: none !important;
      user-select: none !important;
      transition: filter 0.3s ease, opacity 0.3s ease !important;
    }
    .airguide-shield-wrapper {
      position: relative !important;
      display: inline-block !important;
      overflow: hidden !important;
      max-width: 100% !important;
      border-radius: 8px !important;
    }
    .airguide-shield-overlay {
      position: absolute !important;
      top: 0 !important;
      left: 0 !important;
      right: 0 !important;
      bottom: 0 !important;
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important;
      justify-content: center !important;
      background: rgba(15, 18, 26, 0.72) !important;
      backdrop-filter: blur(16px) saturate(180%) !important;
      z-index: 2147483640 !important;
      padding: 16px !important;
      text-align: center !important;
      pointer-events: auto !important;
      font-family: -apple-system, BlinkMacSystemFont, 'Plus Jakarta Sans', 'Segoe UI', Roboto, sans-serif !important;
    }
    .airguide-shield-badge {
      display: inline-flex !important;
      align-items: center !important;
      gap: 6px !important;
      background: rgba(255, 255, 255, 0.08) !important;
      border: 1px solid rgba(255, 255, 255, 0.15) !important;
      color: #f1f5f9 !important;
      font-size: 11px !important;
      font-weight: 600 !important;
      letter-spacing: 0.2px !important;
      padding: 4px 10px !important;
      border-radius: 20px !important;
      margin-bottom: 6px !important;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2) !important;
    }
    .airguide-shield-desc {
      color: #94a3b8 !important;
      font-size: 11px !important;
      font-weight: 400 !important;
      margin-bottom: 10px !important;
      max-width: 220px !important;
      line-height: 1.4 !important;
    }
    .airguide-shield-reveal-btn {
      background: rgba(255, 255, 255, 0.12) !important;
      border: 1px solid rgba(255, 255, 255, 0.2) !important;
      color: #ffffff !important;
      font-size: 11px !important;
      font-weight: 500 !important;
      padding: 5px 12px !important;
      border-radius: 6px !important;
      cursor: pointer !important;
      transition: all 0.15s ease !important;
    }
    .airguide-shield-reveal-btn:hover {
      background: rgba(255, 255, 255, 0.22) !important;
      border-color: rgba(255, 255, 255, 0.35) !important;
    }
    .airguide-revealed {
      filter: none !important;
      opacity: 1 !important;
      pointer-events: auto !important;
    }
  `;
  
  if (document.head) {
    document.head.appendChild(style);
  } else {
    document.addEventListener('DOMContentLoaded', () => document.head.appendChild(style));
  }
}

// Inspect text attributes of an element for NSFW/violence markers
function evaluateTextForNSFW(text) {
  if (!text || typeof text !== 'string') return false;
  const lower = text.toLowerCase();
  
  for (const kw of NSFW_KEYWORDS) {
    if (lower.includes(kw)) return true;
  }
  
  if (safeGuardSettings.strictMode) {
    for (const kw of STRICT_KEYWORDS) {
      if (lower.includes(kw)) return true;
    }
  }
  
  return false;
}

// Check if an image or media element is explicit or inappropriate
function isMediaSuspicious(el) {
  // 1. Check direct attributes
  const src = el.src || el.currentSrc || el.getAttribute('data-src') || el.getAttribute('srcset') || "";
  const alt = el.alt || el.getAttribute('aria-label') || "";
  const title = el.title || "";
  const className = el.className || "";
  const id = el.id || "";

  if (evaluateTextForNSFW(src) || evaluateTextForNSFW(alt) || evaluateTextForNSFW(title) || evaluateTextForNSFW(className) || evaluateTextForNSFW(id)) {
    return true;
  }

  // 2. Check parent link and container attributes
  const parentAnchor = el.closest('a');
  if (parentAnchor) {
    const href = parentAnchor.href || "";
    const anchorText = parentAnchor.innerText || parentAnchor.title || "";
    if (evaluateTextForNSFW(href) || evaluateTextForNSFW(anchorText)) {
      return true;
    }
  }

  // 3. Check surrounding caption or figure text
  const figure = el.closest('figure');
  if (figure) {
    const caption = figure.querySelector('figcaption');
    if (caption && evaluateTextForNSFW(caption.innerText)) {
      return true;
    }
  }

  return false;
}

// Fast Canvas skin-tone exposure check for loaded images (if CORS allows)
function checkSkinExposure(img) {
  try {
    if (!img.complete || img.naturalWidth < 60 || img.naturalHeight < 60) return false;
    
    // Create an in-memory small canvas to sample pixels
    const canvas = document.createElement('canvas');
    canvas.width = 30;
    canvas.height = 30;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, 30, 30);
    
    const imageData = ctx.getImageData(0, 0, 30, 30);
    const data = imageData.data;
    let skinPixels = 0;
    const totalPixels = 30 * 30;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      // Standard RGB skin-color chromatic rule
      const isSkin = (r > 95 && g > 40 && b > 20) &&
                     ((Math.max(r, g, b) - Math.min(r, g, b)) > 15) &&
                     (Math.abs(r - g) > 15) &&
                     (r > g && r > b);

      if (isSkin) skinPixels++;
    }

    const skinRatio = skinPixels / totalPixels;
    // Over 48% skin density in an image indicates substantial exposed body/unclad surface
    return skinRatio > 0.48;
  } catch (err) {
    // Cross-origin restriction; cannot read pixel data safely
    return false;
  }
}

// Apply blur and safety badge to an element
function shieldElement(el, reason = "Flagged as 18+ or Inappropriate") {
  if (shieldedElementsSet.has(el)) return;
  shieldedElementsSet.add(el);

  // Mark element with blurred class
  el.classList.add('airguide-shielded-media');

  // If already wrapped or parented, avoid nested wrappers
  let wrapper = el.parentElement;
  if (!wrapper || !wrapper.classList.contains('airguide-shield-wrapper')) {
    wrapper = document.createElement('div');
    wrapper.className = 'airguide-shield-wrapper';
    el.parentNode.insertBefore(wrapper, el);
    wrapper.appendChild(el);
  }

  // Create overlay
  const overlay = document.createElement('div');
  overlay.className = 'airguide-shield-overlay';

  const badge = document.createElement('div');
  badge.className = 'airguide-shield-badge';
  badge.innerHTML = `🛡️ Sensitive Media Shielded`;

  const desc = document.createElement('div');
  desc.className = 'airguide-shield-desc';
  desc.innerText = "Content shielded by Luna to protect sensitive viewers.";

  overlay.appendChild(badge);
  overlay.appendChild(desc);

  if (safeGuardSettings.allowReveal) {
    const revealBtn = document.createElement('button');
    revealBtn.className = 'airguide-shield-reveal-btn';
    revealBtn.innerText = 'Show Media';
    revealBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (confirm("⚠️ Sensitive Content Warning:\n\nThis media was shielded by Luna as potentially explicit or inappropriate. Are you sure you want to show it?")) {
        el.classList.remove('airguide-shielded-media');
        el.classList.add('airguide-revealed');
        overlay.remove();
        notifyShieldStats(-1);
      }
    });
    overlay.appendChild(revealBtn);
  }

  wrapper.appendChild(overlay);
  notifyShieldStats(1);
}

// Notify side panel of total shielded items
function notifyShieldStats(delta = 0) {
  shieldedCount = Math.max(0, shieldedCount + delta);
  try {
    chrome.runtime.sendMessage({
      type: 'SAFEGUARD_STATS_UPDATE',
      count: shieldedCount,
      url: window.location.href
    }).catch(() => {});
  } catch (e) {}
}

// Scan all media elements on the page
function scanAndShieldPage() {
  if (!safeGuardSettings.enabled) return;

  const images = document.querySelectorAll('img, video, [style*="background-image"]');
  images.forEach(el => {
    if (shieldedElementsSet.has(el)) return;

    if (isMediaSuspicious(el)) {
      shieldElement(el, "Explicit/NSFW keyword detected");
    } else if (el.tagName.toLowerCase() === 'img') {
      // Check skin tone on complete or when loaded
      if (el.complete) {
        if (checkSkinExposure(el)) {
          shieldElement(el, "High skin exposure / unclad visual detected");
        }
      } else {
        el.addEventListener('load', () => {
          if (!shieldedElementsSet.has(el) && checkSkinExposure(el)) {
            shieldElement(el, "High skin exposure / unclad visual detected");
          }
        }, { once: true });
      }
    }
  });
}

// Continuous DOM Observer for dynamic media (infinite scroll, ads, popups)
let observer = null;
function startSafeGuardObserver() {
  if (observer) observer.disconnect();

  observer = new MutationObserver((mutations) => {
    if (!safeGuardSettings.enabled) return;

    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          if (node.matches && node.matches('img, video')) {
            if (isMediaSuspicious(node)) {
              shieldElement(node);
            }
          }
          const nested = node.querySelectorAll ? node.querySelectorAll('img, video') : [];
          nested.forEach(img => {
            if (isMediaSuspicious(img)) {
              shieldElement(img);
            }
          });
        }
      }
    }
  });

  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      observer.observe(document.body, { childList: true, subtree: true });
    });
  }
}

// Unshield all media when shield is turned off
function unshieldAll() {
  document.querySelectorAll('.airguide-shielded-media').forEach(el => {
    el.classList.remove('airguide-shielded-media');
  });
  document.querySelectorAll('.airguide-shield-overlay').forEach(el => {
    el.remove();
  });
  shieldedCount = 0;
  notifyShieldStats(0);
}

// Initialize SafeGuard Shield
function initSafeGuard() {
  injectSafeGuardStyles();

  // Load user settings from chrome.storage.local
  try {
    chrome.storage.local.get(['safeGuardEnabled', 'safeGuardStrict', 'safeGuardAllowReveal'], (res) => {
      safeGuardSettings.enabled = res.safeGuardEnabled !== undefined ? !!res.safeGuardEnabled : true;
      safeGuardSettings.strictMode = !!res.safeGuardStrict;
      safeGuardSettings.allowReveal = res.safeGuardAllowReveal !== undefined ? !!res.safeGuardAllowReveal : true;

      if (safeGuardSettings.enabled) {
        scanAndShieldPage();
        startSafeGuardObserver();
      }
    });
  } catch (e) {
    // Fallback enabled
    scanAndShieldPage();
    startSafeGuardObserver();
  }

  // Periodic rescan for delayed or lazy images
  setTimeout(scanAndShieldPage, 1500);
  setTimeout(scanAndShieldPage, 4000);
}

// Listen for messages from side panel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'UPDATE_SAFEGUARD_SETTINGS') {
    safeGuardSettings.enabled = !!message.settings.enabled;
    safeGuardSettings.strictMode = !!message.settings.strictMode;
    safeGuardSettings.allowReveal = !!message.settings.allowReveal;

    if (safeGuardSettings.enabled) {
      scanAndShieldPage();
      startSafeGuardObserver();
    } else {
      unshieldAll();
    }
    sendResponse({ status: 'ok', count: shieldedCount });
  } else if (message.type === 'GET_SAFEGUARD_STATS') {
    sendResponse({ count: shieldedCount, enabled: safeGuardSettings.enabled });
  } else if (message.type === 'RESCAN_SAFEGUARD') {
    scanAndShieldPage();
    sendResponse({ count: shieldedCount });
  }
  return true;
});

// Run safeguard immediately
initSafeGuard();

// ==========================================
// 2. Luna Webpage Extractor & Link Verifier
// ==========================================

// Known ad networks and tracking redirectors to detect fake download buttons
const AD_DOMAINS = [
  'doubleclick.net', 'googleadservices.com', 'googlesyndication.com',
  'adnxs.com', 'adroll.com', 'taboola.com', 'outbrain.com', 'mgid.com',
  'propellerads.com', 'monetag.com', 'trafficjunky.com', 'popads.net',
  'clickserve', 'yieldmanager', 'adclick', 'adservice', 'affiliate',
  'track', 'redirect', 'cpm', 'zedo.com', 'revcontent.com', 'exoclick.com'
];

// Boilerplate navigation keywords that should NOT clutter page actions
const BOILERPLATE_NAV_KEYWORDS = [
  'home', 'main page', 'homepage', 'about', 'about us', 'about the',
  'contact', 'contact us', 'get in touch', 'privacy', 'privacy policy',
  'terms', 'terms of service', 'terms & conditions', 'terms of use',
  'disclaimer', 'copyright', 'sitemap', 'site map', 'faq', 'faqs',
  'frequently asked questions', 'feedback', 'help', 'helpdesk',
  'careers', 'jobs', 'press', 'press release', 'news', 'blog',
  'skip to content', 'skip to main content', 'back to top', 'top',
  'all rights reserved', 'cookie policy', 'accessibility'
];

const SOCIAL_DOMAINS = [
  'facebook.com', 'twitter.com', 'x.com', 'instagram.com', 'linkedin.com',
  'youtube.com', 'pinterest.com', 'reddit.com', 't.me', 'whatsapp.com',
  'github.com'
];

const FILE_EXTENSIONS = ['.pdf', '.zip', '.rar', '.7z', '.exe', '.dmg', '.apk', '.docx', '.xlsx', '.csv', '.tar.gz', '.iso', '.msi'];

// Determines if an element is a trivial navigation link (e.g. Home, About Us, Footer)
function isBoilerplateNavigation(el) {
  const text = (el.innerText || el.value || el.title || el.getAttribute('aria-label') || '').toLowerCase().trim();
  const href = (el.getAttribute('href') || '').toLowerCase().trim();

  // If it's a social link, filter out
  if (href && SOCIAL_DOMAINS.some(d => href.includes(d))) return true;

  // Filter out empty anchors or javascript void
  if (href === '#' || href === 'javascript:void(0)' || href === 'javascript:;' || href === '') {
    if (el.tagName.toLowerCase() === 'a' && text.length === 0) {
      return true;
    }
  }

  // Check if text matches boilerplate navigation keywords
  if (BOILERPLATE_NAV_KEYWORDS.some(kw => text === kw || text.startsWith(kw + ' ') || text.endsWith(' ' + kw))) {
    return true;
  }

  // Check if inside header, nav, or footer
  const navParent = el.closest('header, nav, footer, aside, [role="navigation"], .navbar, .nav-menu, .site-footer, .footer-links, .social-share');
  if (navParent && el.tagName.toLowerCase() === 'a') {
    // If inside nav/header, only keep it if it is an explicit primary action like "Apply", "Register", "Download"
    const isPrimaryAction = ['apply', 'register', 'sign up', 'status', 'download', 'pay fee', 'otr', 'portal'].some(kw => text.includes(kw));
    if (!isPrimaryAction) return true;
  }

  return false;
}

// Determines if a download candidate is a fake ad or a genuine file
function analyzeDownloadCandidate(el) {
  const text = (el.innerText || el.value || el.title || el.getAttribute('aria-label') || '').toLowerCase().trim();
  const href = el.getAttribute('href') || el.src || '';
  const hrefLower = href.toLowerCase();

  const hasDownloadKeyword = ['download', 'get file', 'download pdf', 'admit card', 'circular', 'brochure', 'prospectus', 'get certificate', 'official link'].some(kw => text.includes(kw)) || el.hasAttribute('download');
  const hasFileExtension = FILE_EXTENSIONS.some(ext => hrefLower.includes(ext));

  if (!hasDownloadKeyword && !hasFileExtension) {
    return null; // Not a download candidate
  }

  // 1. Check for Fake / Ad Deceptive Link
  const inAdContainer = !!el.closest('ins.adsbygoogle, [class*="ad-"], [class*="ads-"], [id*="ad-"], [id*="google_ads"], [class*="banner"], [class*="sponsored"], [data-ad], [data-ad-client], iframe');
  const isAdNetworkDomain = AD_DOMAINS.some(adDomain => hrefLower.includes(adDomain));
  const isEmptyTrap = href === '#' || href === 'javascript:void(0)' || href === '' || hrefLower.startsWith('javascript:;');

  if (inAdContainer || isAdNetworkDomain || (hasDownloadKeyword && isEmptyTrap && el.tagName.toLowerCase() === 'a')) {
    return {
      status: 'fake_ad',
      reason: isAdNetworkDomain ? 'Ad network redirect' : (inAdContainer ? 'Inside advertisement container' : 'Empty dummy link trap'),
      text: text || 'Download Ad',
      href: href
    };
  }

  // 2. Check for Genuine Verified Download
  let fileType = 'Document';
  if (hrefLower.includes('.pdf')) fileType = 'PDF';
  else if (hrefLower.includes('.zip') || hrefLower.includes('.rar') || hrefLower.includes('.7z')) fileType = 'ZIP';
  else if (hrefLower.includes('.exe') || hrefLower.includes('.msi') || hrefLower.includes('.dmg')) fileType = 'Installer';
  else if (hrefLower.includes('.apk')) fileType = 'APK';
  else if (hrefLower.includes('.docx') || hrefLower.includes('.xlsx') || hrefLower.includes('.csv')) fileType = 'Office File';

  const isLegitimatePath = hasFileExtension || el.hasAttribute('download') || ['/download', '/files/', '/uploads/', '/pdf/', '/docs/'].some(p => hrefLower.includes(p));

  return {
    status: 'verified',
    fileType: fileType,
    text: text || `Download ${fileType}`,
    href: href,
    isLegitimatePath: isLegitimatePath
  };
}

// Extracts high-value page text, headers, verified downloads, and purpose-driven actions
function extractPageData() {
  const existingTags = document.querySelectorAll('[data-airguide-id]');
  existingTags.forEach(el => el.removeAttribute('data-airguide-id'));

  const title = document.title || "Untitled Webpage";
  const interactiveElements = Array.from(document.querySelectorAll('a, button, input[type="button"], input[type="submit"], [role="button"]'));
  
  const interactives = [];
  const verifiedDownloads = [];
  let interactiveIndex = 0;

  interactiveElements.forEach(el => {
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    const isVisible = rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';

    if (!isVisible) return;

    // Check if this is a download candidate (genuine vs fake ad)
    const downloadAnalysis = analyzeDownloadCandidate(el);
    if (downloadAnalysis && downloadAnalysis.status === 'fake_ad') {
      // Discard deceptive download ads completely so user is never tricked
      return;
    }

    // Filter out generic navigation boilerplate (e.g. Home, About Us, Footer links)
    if (isBoilerplateNavigation(el) && (!downloadAnalysis || downloadAnalysis.status !== 'verified')) {
      return;
    }

    const id = `ag-el-${interactiveIndex++}`;
    el.setAttribute('data-airguide-id', id);

    let text = el.innerText || el.value || el.placeholder || el.title || "";
    text = text.replace(/\s+/g, ' ').trim();

    if (text.length === 0 && el.tagName.toLowerCase() !== 'input') {
      return;
    }

    // Determine clean action category
    let category = 'Action';
    const lowerText = text.toLowerCase();
    if (downloadAnalysis && downloadAnalysis.status === 'verified') {
      category = downloadAnalysis.fileType || 'Download';
      verifiedDownloads.push({
        id: id,
        text: text || `Download ${downloadAnalysis.fileType}`,
        fileType: downloadAnalysis.fileType,
        href: downloadAnalysis.href
      });
    } else if (lowerText.includes('apply') || lowerText.includes('register') || lowerText.includes('sign up') || lowerText.includes('form') || el.type === 'submit') {
      category = 'Form';
    } else if (lowerText.includes('status') || lowerText.includes('check') || lowerText.includes('track') || lowerText.includes('otr')) {
      category = 'Status';
    } else if (lowerText.includes('login') || lowerText.includes('sign in')) {
      category = 'Login';
    }

    interactives.push({
      id: id,
      text: text || `[${el.tagName.toLowerCase()}]`,
      tagName: el.tagName.toLowerCase(),
      category: category,
      isDownload: !!(downloadAnalysis && downloadAnalysis.status === 'verified'),
      role: el.getAttribute('role') || 'none',
      type: el.getAttribute('type') || 'none'
    });
  });

  const textBlocks = [];
  const allElements = document.querySelectorAll('h1, h2, h3, h4, p, li, table');
  
  allElements.forEach(el => {
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    const isVisible = rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';

    if (isVisible) {
      const tagName = el.tagName.toLowerCase();
      let text = el.innerText.replace(/\s+/g, ' ').trim();
      
      if (text.length > 5) {
        if (tagName.startsWith('h')) {
          textBlocks.push(`${'#'.repeat(parseInt(tagName[1]))} ${text}`);
        } else if (tagName === 'table') {
          const rows = Array.from(el.querySelectorAll('tr')).map(tr => 
            Array.from(tr.querySelectorAll('th, td')).map(cell => cell.innerText.trim()).join(' | ')
          );
          if (rows.length > 0) {
            textBlocks.push(`\nTable content:\n${rows.join('\n')}\n`);
          }
        } else {
          textBlocks.push(text);
        }
      }
    }
  });

  const fullText = textBlocks.join('\n\n');
  const truncatedText = fullText.length > 25000 ? fullText.substring(0, 25000) + "\n\n[Content truncated for length...]" : fullText;

  // Extract document and photo upload specifications safely
  let documentRequirements = [];
  try {
    documentRequirements = extractDocumentRequirements(fullText);
  } catch (e) {
    console.warn("Luna: Document requirement extraction error:", e);
  }

  return {
    title: title,
    url: window.location.href,
    text: truncatedText,
    interactives: interactives,
    verifiedDownloads: verifiedDownloads,
    documentRequirements: documentRequirements
  };
}

// Analyzes page text and file inputs to extract specific upload specifications
function extractDocumentRequirements(fullText) {
  const requirements = [];
  const seenTypes = new Set();

  try {
    // 1. Inspect any <input type="file"> elements on the page
    const fileInputs = document.querySelectorAll('input[type="file"]');
    fileInputs.forEach((input) => {
      let label = input.closest('label');
      if (!label && input.id) {
        try {
          label = document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
        } catch (e) {
          label = null;
        }
      }
      if (!label) {
        label = input.closest('.form-group, .field, tr, td, div');
      }
      const containerText = label ? label.innerText.replace(/\s+/g, ' ').trim() : '';
      const accept = input.getAttribute('accept') || '';

      if (containerText.length > 3) {
        const parsed = parseRequirementText(containerText, accept);
        if (parsed && !seenTypes.has(parsed.type + parsed.maxKB)) {
          seenTypes.add(parsed.type + parsed.maxKB);
          requirements.push(parsed);
        }
      }
    });

    // 2. Scan text blocks for common requirement sentences
    const sentences = (fullText || '').split(/[.\n;]/);
    const docKeywords = ['photograph', 'passport photo', 'photo', 'signature', 'sign', 'marksheet', 'certificate', 'domicile', 'caste certificate', 'income certificate', 'id proof'];
    
    sentences.forEach(sentence => {
      const lower = sentence.toLowerCase();
      const hasDocKeyword = docKeywords.some(kw => lower.includes(kw));
      const hasSizeOrFormat = lower.includes('kb') || lower.includes('mb') || lower.includes('jpg') || lower.includes('jpeg') || lower.includes('png') || lower.includes('pdf') || lower.includes('pixel') || lower.includes('dimension') || lower.includes('3.5');

      if (hasDocKeyword && hasSizeOrFormat && sentence.trim().length > 10 && sentence.trim().length < 250) {
        const parsed = parseRequirementText(sentence.trim());
        if (parsed && !seenTypes.has(parsed.type + parsed.maxKB)) {
          seenTypes.add(parsed.type + parsed.maxKB);
          requirements.push(parsed);
        }
      }
    });
  } catch (err) {
    console.warn("Luna: Document requirement extraction error:", err);
  }

  return requirements.slice(0, 6);
}

function parseRequirementText(rawText, acceptAttr = '') {
  const lower = rawText.toLowerCase();

  let type = 'document';
  let label = 'Official Document';
  let targetFormat = 'PDF';
  let maxKB = 200;
  let minKB = 0;
  let width = 0;
  let height = 0;
  let preset = 'custom';

  if (lower.includes('photo') || lower.includes('photograph') || lower.includes('pic') || lower.includes('image')) {
    type = 'photo';
    label = 'Passport Photograph';
    targetFormat = 'JPG';
    maxKB = 50;
    minKB = 20;
    width = 350;
    height = 450;
    preset = 'passport';
  } else if (lower.includes('sign') || lower.includes('signature')) {
    type = 'signature';
    label = 'Scanned Signature';
    targetFormat = 'JPG';
    maxKB = 20;
    minKB = 5;
    width = 280;
    height = 120;
    preset = 'signature';
  } else if (lower.includes('marksheet') || lower.includes('result') || lower.includes('grade') || lower.includes('10th') || lower.includes('12th')) {
    type = 'marksheet';
    label = 'Marksheet / Degree';
    targetFormat = 'PDF';
    maxKB = 200;
    preset = 'marksheet';
  } else if (lower.includes('certificate') || lower.includes('caste') || lower.includes('domicile') || lower.includes('income')) {
    type = 'certificate';
    label = 'Official Certificate';
    targetFormat = 'PDF';
    maxKB = 150;
    preset = 'certificate';
  }

  // Extract explicit KB limits if present
  const kbMatches = lower.match(/(?:max|maximum|under|less than|up to|not exceed|between \d+\s*(?:kb)?\s*to)?\s*(\d+)\s*kb/i);
  if (kbMatches && kbMatches[1]) {
    const num = parseInt(kbMatches[1], 10);
    if (num >= 5 && num <= 10000) {
      maxKB = num;
    }
  }

  const mbMatches = lower.match(/(?:max|maximum|under|less than|up to)?\s*(\d+(?:\.\d+)?)\s*mb/i);
  if (mbMatches && mbMatches[1]) {
    const numMb = parseFloat(mbMatches[1]);
    if (numMb > 0 && numMb <= 25) {
      maxKB = Math.round(numMb * 1024);
    }
  }

  // Extract format
  if (lower.includes('pdf') || acceptAttr.includes('pdf')) {
    targetFormat = 'PDF';
  } else if (lower.includes('jpg') || lower.includes('jpeg') || acceptAttr.includes('jpeg') || acceptAttr.includes('jpg')) {
    targetFormat = 'JPG';
  } else if (lower.includes('png') || acceptAttr.includes('png')) {
    targetFormat = 'PNG';
  }

  return {
    type: type,
    label: label,
    instruction: rawText.replace(/\s+/g, ' ').trim().slice(0, 150),
    targetFormat: targetFormat,
    maxKB: maxKB,
    minKB: minKB,
    width: width,
    height: height,
    preset: preset
  };
}

// Highlights a tracked element on the page, scrolls to it, and applies a glow effect
function highlightAndScrollToElement(elementId) {
  let el = null;
  try {
    el = document.querySelector(`[data-airguide-id="${CSS.escape(elementId)}"]`);
  } catch (e) {
    el = document.querySelector(`[data-airguide-id="${elementId}"]`);
  }
  if (!el) return false;

  const activeGlows = document.querySelectorAll('.airguide-glowing-highlight');
  activeGlows.forEach(glow => {
    glow.classList.remove('airguide-glowing-highlight');
    glow.style.boxShadow = '';
    glow.style.outline = '';
    glow.style.borderRadius = '';
    glow.style.transition = '';
  });

  if (!document.getElementById('airguide-global-style')) {
    const style = document.createElement('style');
    style.id = 'airguide-global-style';
    style.innerHTML = `
      @keyframes airguideFocusPulse {
        0% { box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.5); }
        50% { box-shadow: 0 0 0 6px rgba(59, 130, 246, 0.2); }
        100% { box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.5); }
      }
      .airguide-glowing-highlight {
        animation: airguideFocusPulse 1.8s infinite ease-in-out !important;
        outline: 2.5px solid #3b82f6 !important;
        outline-offset: 3px !important;
        border-radius: 6px !important;
        transition: all 0.25s ease !important;
      }
    `;
    document.head.appendChild(style);
  }

  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.add('airguide-glowing-highlight');

  setTimeout(() => {
    el.style.transition = 'all 1s ease';
  }, 1000);

  return true;
}

  // Expose to window for extension programmatic execution
  window.extractPageData = extractPageData;
  window.highlightAndScrollToElement = highlightAndScrollToElement;
})();

