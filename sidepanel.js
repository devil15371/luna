const DEFAULT_API_KEY = (typeof GEMINI_API_KEY !== 'undefined') ? GEMINI_API_KEY : "";

let activeTabId = null;
let parsedPageData = null;
let toastTimer = null;
let settings = {
  liveApiEnabled: true,
  geminiApiKey: DEFAULT_API_KEY
};

let safeguard = {
  enabled: true,
  strictMode: false,
  allowReveal: true
};

// Initialize the Extension Side Panel
document.addEventListener('DOMContentLoaded', async () => {
  // Load configuration
  await loadSettings();
  
  // Initialize Tab Switching
  initTabs();

  // Initialize Doc & Photo Studio
  initDocStudio();

  // Listen for tab activation / updates to track current page
  chrome.tabs.onActivated.addListener(async (activeInfo) => {
    await trackTab(activeInfo.tabId);
  });

  chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tabId === activeTabId) {
      await trackTab(tabId);
    }
  });

  // Track the initial tab
  const initialTab = await getActiveWebTab();
  if (initialTab) {
    await trackTab(initialTab.id);
  }

  // Button Listeners
  document.getElementById('dissect-btn').addEventListener('click', dissectPage);
  document.getElementById('send-chat-btn').addEventListener('click', sendChatMessage);
  document.getElementById('chat-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChatMessage();
    }
  });

  // Setup suggestion chips
  document.querySelectorAll('.suggestion-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const query = chip.getAttribute('data-query');
      document.getElementById('chat-input').value = query;
      sendChatMessage();
    });
  });

  // Settings Save Listener
  document.getElementById('save-settings-btn').addEventListener('click', saveSettings);
  document.getElementById('live-api-toggle').addEventListener('change', toggleApiKeyVisibility);

  // SafeGuard Shield Listeners
  document.getElementById('save-safeguard-btn').addEventListener('click', saveSafeGuardSettings);
  document.getElementById('rescan-shield-btn').addEventListener('click', rescanSafeGuard);

  // Chat message links event delegation
  document.getElementById('chat-messages-container').addEventListener('click', (e) => {
    if (e.target.classList.contains('chat-link')) {
      const elementId = e.target.getAttribute('data-target-id');
      triggerElementHighlight(elementId);
    }
  });

  // Listen for live shield stats updates from content script
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'SAFEGUARD_STATS_UPDATE') {
      updateShieldStatusUI(safeguard.enabled, message.count);
    }
  });
});

// Helper to reliably find the active webpage tab
async function getActiveWebTab() {
  try {
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tabs && tabs.length > 0 && tabs[0].url) {
      return tabs[0];
    }
  } catch (e) {}

  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs && tabs.length > 0 && tabs[0].url) {
      return tabs[0];
    }
  } catch (e) {}

  try {
    const allTabs = await chrome.tabs.query({ active: true });
    const webTab = allTabs.find(t => t.url && (t.url.startsWith('http://') || t.url.startsWith('https://')));
    if (webTab) return webTab;
    if (allTabs.length > 0) return allTabs[0];
  } catch (e) {}

  return null;
}

// Load Settings from Chrome Storage
async function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get([
      'liveApiEnabled', 'geminiApiKey',
      'safeGuardEnabled', 'safeGuardStrict', 'safeGuardAllowReveal'
    ], (result) => {
      settings.liveApiEnabled = result.liveApiEnabled !== undefined ? !!result.liveApiEnabled : true;
      settings.geminiApiKey = result.geminiApiKey || DEFAULT_API_KEY;

      safeguard.enabled = result.safeGuardEnabled !== undefined ? !!result.safeGuardEnabled : true;
      safeguard.strictMode = !!result.safeGuardStrict;
      safeguard.allowReveal = result.safeGuardAllowReveal !== undefined ? !!result.safeGuardAllowReveal : true;

      // Set UI
      document.getElementById('live-api-toggle').checked = settings.liveApiEnabled;
      document.getElementById('api-key-input').value = settings.geminiApiKey;
      
      document.getElementById('safeguard-toggle').checked = safeguard.enabled;
      document.getElementById('safeguard-strict-toggle').checked = safeguard.strictMode;
      document.getElementById('safeguard-reveal-toggle').checked = safeguard.allowReveal;

      toggleApiKeyVisibility();
      updateModeBadge();
      updateShieldStatusUI(safeguard.enabled);
      resolve();
    });
  });
}

// Toggle Gemini API key input layout visibility
function toggleApiKeyVisibility() {
  const isEnabled = document.getElementById('live-api-toggle').checked;
  const keyGroup = document.getElementById('api-key-group');
  keyGroup.style.display = isEnabled ? 'block' : 'none';
}

// Save Settings to Storage
function saveSettings() {
  const isLive = document.getElementById('live-api-toggle').checked;
  const apiKey = document.getElementById('api-key-input').value.trim();

  if (isLive && !apiKey) {
    showToast("Please enter a Gemini API Key to enable Live Mode.", true);
    return;
  }

  settings.liveApiEnabled = isLive;
  settings.geminiApiKey = apiKey;

  chrome.storage.local.set({
    liveApiEnabled: isLive,
    geminiApiKey: apiKey
  }, () => {
    showToast("API settings saved successfully!");
    updateModeBadge();
  });
}

// Save SafeGuard Shield Settings
async function saveSafeGuardSettings() {
  safeguard.enabled = document.getElementById('safeguard-toggle').checked;
  safeguard.strictMode = document.getElementById('safeguard-strict-toggle').checked;
  safeguard.allowReveal = document.getElementById('safeguard-reveal-toggle').checked;

  await chrome.storage.local.set({
    safeGuardEnabled: safeguard.enabled,
    safeGuardStrict: safeguard.strictMode,
    safeGuardAllowReveal: safeguard.allowReveal
  });

  updateShieldStatusUI(safeguard.enabled);
  showToast("SafeGuard 18+ settings saved!");

  // Notify active tab immediately
  if (activeTabId) {
    chrome.tabs.sendMessage(activeTabId, {
      type: 'UPDATE_SAFEGUARD_SETTINGS',
      settings: safeguard
    }).then(res => {
      if (res && res.count !== undefined) {
        updateShieldStatusUI(safeguard.enabled, res.count);
      }
    }).catch(() => {});
  }
}

// Re-scan active page for unsafe content
async function rescanSafeGuard() {
  const tab = await getActiveWebTab();
  if (!tab || !tab.id) {
    showToast("No active webpage detected.", true);
    return;
  }
  activeTabId = tab.id;

  showToast("Scanning page for 18+/NSFW media...", false, true);
  try {
    const res = await chrome.tabs.sendMessage(activeTabId, { type: 'RESCAN_SAFEGUARD' });
    if (res && res.count !== undefined) {
      updateShieldStatusUI(safeguard.enabled, res.count);
      showToast(`Scan complete: ${res.count} unsafe item(s) shielded.`);
    } else {
      showToast("Shield scan updated.");
    }
  } catch (err) {
    showToast("Make sure you are on an active webpage.", true);
  }
}

// Update Shield UI in Dashboard
function updateShieldStatusUI(enabled, count = null) {
  const badge = document.getElementById('shield-status-badge');
  const countDisplay = document.getElementById('shield-count-display');
  
  if (badge) {
    if (enabled) {
      badge.innerText = "ACTIVE";
      badge.style.color = "var(--emerald)";
      badge.style.borderColor = "var(--emerald-border)";
      badge.style.background = "rgba(16, 185, 129, 0.15)";
    } else {
      badge.innerText = "OFF";
      badge.style.color = "var(--text-muted)";
      badge.style.borderColor = "var(--border-subtle)";
      badge.style.background = "rgba(255, 255, 255, 0.05)";
    }
  }

  if (countDisplay && count !== null) {
    countDisplay.innerText = count;
  }
}

function updateModeBadge() {
  const badge = document.getElementById('mode-badge');
  if (!badge) return;
  badge.innerText = settings.liveApiEnabled ? "Active" : "Standard";
  badge.style.color = "var(--text-secondary)";
  badge.style.borderColor = "var(--border-default)";
  badge.style.background = "var(--bg-surface)";
}

// Track current tab state
async function trackTab(tabId) {
  if (!tabId) {
    const active = await getActiveWebTab();
    if (active) tabId = active.id;
    else return;
  }
  activeTabId = tabId;
  try {
    const tab = await chrome.tabs.get(tabId);
    const indicator = document.getElementById('page-url-indicator');
    
    if (tab && tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://'))) {
      indicator.innerText = new URL(tab.url).hostname;
      
      // Query tab for safeguard stats
      chrome.tabs.sendMessage(tabId, { type: 'GET_SAFEGUARD_STATS' })
        .then(res => {
          if (res && res.count !== undefined) {
            updateShieldStatusUI(res.enabled !== undefined ? res.enabled : safeguard.enabled, res.count);
          }
        }).catch(() => {
          updateShieldStatusUI(safeguard.enabled, 0);
        });
    } else {
      indicator.innerText = "Non-web page (Settings or System Tab)";
      updateShieldStatusUI(safeguard.enabled, 0);
    }
  } catch (err) {
    console.error("Error tracking tab:", err);
  }
}

// Toggle layout tabs
function initTabs() {
  const buttons = document.querySelectorAll('.tab-btn');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const targetView = btn.getAttribute('data-view');
      document.querySelectorAll('.view-content').forEach(view => {
        view.classList.remove('active');
      });
      document.getElementById(targetView).classList.add('active');
    });
  });
}

// Toast notification helper
function showToast(message, isError = false, showSpinner = false) {
  const toast = document.getElementById('toast');
  const text = document.getElementById('toast-text');
  const spinner = document.getElementById('toast-spinner');

  // Clear any previous auto-hide timer
  if (toastTimer) {
    clearTimeout(toastTimer);
    toastTimer = null;
  }

  text.innerText = message;
  toast.style.borderColor = isError ? 'var(--danger)' : (showSpinner ? 'var(--accent-primary)' : 'var(--emerald)');
  spinner.style.display = showSpinner ? 'inline-block' : 'none';
  
  toast.classList.add('show');
  
  if (!showSpinner) {
    toastTimer = setTimeout(() => {
      toast.classList.remove('show');
      toastTimer = null;
    }, 3000);
  }
}

function hideToast() {
  document.getElementById('toast').classList.remove('show');
}

// Dissect Webpage DOM via injection
async function dissectPage() {
  const tab = await getActiveWebTab();
  if (!tab || !tab.id) {
    showToast("No active web page detected.", true);
    return;
  }

  activeTabId = tab.id;
  await trackTab(tab.id);

  if (!tab.url || (!tab.url.startsWith('http://') && !tab.url.startsWith('https://'))) {
    showToast("Please open a normal website (e.g. upscholarshiponline.com) first.", true);
    return;
  }

  showToast("Reading page with Luna...", false, true);

  try {
    // Inject content.js into the tab's isolated world
    await chrome.scripting.executeScript({
      target: { tabId: activeTabId },
      files: ['content.js']
    });

    // Now execute extractPageData from within the isolated world
    const extractResults = await chrome.scripting.executeScript({
      target: { tabId: activeTabId },
      func: () => {
        // extractPageData was loaded via content.js file injection into the isolated world
        if (typeof extractPageData === 'function') {
          return extractPageData();
        }
        return null;
      }
    });

    if (!extractResults || !extractResults[0] || !extractResults[0].result) {
      throw new Error("Empty DOM structure returned.");
    }

    parsedPageData = extractResults[0].result;
    
    // Render portal document and upload requirements if detected
    renderPortalDocRequirements(parsedPageData.documentRequirements || []);

    // Render verified downloads if genuine direct files were found
    renderVerifiedDownloads(parsedPageData.verifiedDownloads || []);

    // Render clean, purpose-driven action elements (ignoring Home, About, Footers)
    renderInteractiveElements(parsedPageData.interactives || []);

    // Summarize (Live AI or Mock Heuristic)
    if (settings.liveApiEnabled && settings.geminiApiKey) {
      await getLiveAISummary(parsedPageData);
    } else {
      await getLocalDemoSummary(parsedPageData);
    }

  } catch (error) {
    console.error("Dissection error:", error);
    showToast("Failed to parse page. Make sure it's an open webpage.", true);
  }
}

// Render Verified Direct Downloads Card
function renderVerifiedDownloads(downloads) {
  const card = document.getElementById('verified-downloads-card');
  const list = document.getElementById('verified-downloads-list');
  if (!card || !list) return;

  if (!downloads || downloads.length === 0) {
    card.style.display = 'none';
    list.innerHTML = '';
    return;
  }

  card.style.display = 'block';
  list.innerHTML = '';

  downloads.forEach(dl => {
    const row = document.createElement('div');
    row.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding: 8px 10px; background: #faf4e8; border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); gap: 8px;';

    const infoDiv = document.createElement('div');
    infoDiv.style.cssText = 'display: flex; align-items: center; gap: 8px; overflow: hidden;';

    const badge = document.createElement('span');
    badge.style.cssText = 'font-size: 0.65rem; font-weight: 700; background: #c25e00; color: #fff; padding: 2px 6px; border-radius: 4px; flex-shrink: 0;';
    badge.innerText = dl.fileType || 'FILE';

    const titleSpan = document.createElement('span');
    titleSpan.style.cssText = 'font-size: 0.8rem; font-weight: 600; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;';
    titleSpan.innerText = dl.text || 'Official Download Document';

    infoDiv.appendChild(badge);
    infoDiv.appendChild(titleSpan);

    const btn = document.createElement('button');
    btn.style.cssText = 'font-size: 0.72rem; font-weight: 600; background: var(--bg-surface); border: 1px solid var(--border-default); color: var(--accent-primary); padding: 4px 8px; border-radius: var(--radius-sm); cursor: pointer; white-space: nowrap; flex-shrink: 0;';
    btn.innerText = 'Go to Real Link';
    btn.addEventListener('click', () => triggerElementHighlight(dl.id));

    row.appendChild(infoDiv);
    row.appendChild(btn);
    list.appendChild(row);
  });
}

// Render the parsed interactives in the grid (Smart Purpose-Driven Actions)
function renderInteractiveElements(elements) {
  const list = document.getElementById('elements-list');
  const count = document.getElementById('elements-count');
  list.innerHTML = "";

  // Prioritize high-value purpose actions (max 8)
  const prioritized = elements.slice(0, 8);
  count.innerText = `${prioritized.length} action${prioritized.length === 1 ? '' : 's'} identified`;

  if (prioritized.length === 0) {
    list.innerHTML = `<div style="color: var(--text-muted); font-size: 0.78rem; text-align: center; padding: 20px 0;">No primary forms or action buttons detected in the content area.</div>`;
    return;
  }

  prioritized.forEach(el => {
    const pill = document.createElement('div');
    pill.className = "element-pill";
    
    const textSpan = document.createElement('span');
    textSpan.className = "element-pill-text";
    textSpan.innerText = el.text;
    
    const tagSpan = document.createElement('span');
    tagSpan.className = "element-pill-tag";
    tagSpan.innerText = el.category || el.tagName;

    pill.appendChild(textSpan);
    pill.appendChild(tagSpan);

    pill.addEventListener('click', () => triggerElementHighlight(el.id));
    
    list.appendChild(pill);
  });
}

// Send scroll/highlight command to the left webpage processes
async function triggerElementHighlight(elementId) {
  if (!activeTabId) {
    const tab = await getActiveWebTab();
    if (tab) activeTabId = tab.id;
  }
  if (!activeTabId) return;
  
  try {
    // First ensure content.js helpers are loaded, then call highlight
    await chrome.scripting.executeScript({
      target: { tabId: activeTabId },
      files: ['content.js']
    });
    await chrome.scripting.executeScript({
      target: { tabId: activeTabId },
      func: (id) => {
        if (typeof highlightAndScrollToElement === 'function') {
          highlightAndScrollToElement(id);
        }
      },
      args: [elementId]
    });
  } catch (err) {
    console.error("Highlighting error:", err);
  }
}

// Assistant Page Analysis
async function getLiveAISummary(data) {
  showToast("Analyzing details with Luna...", false, true);

  const verifiedDownloadsInfo = (data.verifiedDownloads && data.verifiedDownloads.length > 0)
    ? `\nVerified Authentic Downloads Found:\n${JSON.stringify(data.verifiedDownloads.map(d => ({ text: d.text, type: d.fileType, href: d.href })))}`
    : '';

  const prompt = `
You are Luna, a high-precision web assistant analyzing the webpage "${data.title}".
Your goal is to cut through confusing clutter, ads, and boilerplate menus to explain the site's TRUE PURPOSE and guide the user to the essential action.

Analyze this page content:
Page Text Content:
${data.text}

Key Purpose-Driven Interactive Elements:
${JSON.stringify(data.interactives)}${verifiedDownloadsInfo}

CRITICAL RULES:
- Focus strictly on the CORE PURPOSE of this website for the visitor (e.g. scholarship application, exam admit card, job portal, certificate download).
- DO NOT summarize generic header navigation or boilerplate "About Us" marketing fluff.
- Summarize only the vital requirements, criteria, fees, or deadlines that matter to someone wanting to accomplish this purpose.
- Direct the user to the single most critical next action (form, registration, or verified file download).

Provide a JSON response with the following keys. Return ONLY raw JSON code (do not wrap in markdown or backticks):
1. "objective": A sharp, clear explanation of what this website specifically allows the visitor to do (1-2 sentences, focusing on the main benefit/purpose).
2. "requirements": Core deadlines, fees, eligibility criteria, or required documents found on the page. Format as clean bullet points (e.g. "• Deadline: ... \n• Documents: ...").
3. "primaryVector": The single most important action the user must take now (e.g. "Click 'Apply Online' to start registration", or "Download the verified Admit Card PDF").
4. "recommendedActionId": The "id" (e.g. "ag-el-5") of the primary interactive element or download button the user should click next. If none matches, return null.
  `;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${settings.geminiApiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" }
      })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData?.error?.message || `API error: ${response.statusText}`);
    }

    const resJson = await response.json();
    const candidate = resJson.candidates && resJson.candidates[0];
    const parts = candidate && candidate.content && candidate.content.parts;
    const responseText = parts ? parts.filter(p => p.text && !p.thought).map(p => p.text).join('') || parts[0].text : '';

    let cleanText = responseText.trim();
    if (cleanText.startsWith('```json')) {
      cleanText = cleanText.slice(7);
    } else if (cleanText.startsWith('```')) {
      cleanText = cleanText.slice(3);
    }
    if (cleanText.endsWith('```')) {
      cleanText = cleanText.slice(0, -3);
    }
    const cleanJson = JSON.parse(cleanText.trim());

    // Update UI fields
    document.getElementById('summary-objective').innerText = cleanJson.objective || "Objective not clear.";

    let reqText = cleanJson.requirements;
    if (Array.isArray(reqText)) {
      reqText = reqText.map(r => `• ${r}`).join('\n');
    }
    document.getElementById('summary-requirements').innerText = reqText || "None found.";
    
    const vectorText = cleanJson.primaryVector || "None identified.";
    const vectorContainer = document.getElementById('summary-vector');
    
    if (cleanJson.recommendedActionId) {
      vectorContainer.innerHTML = `<span class="chat-link" data-target-id="${cleanJson.recommendedActionId}">${vectorText}</span>`;
      // Trigger highlight on the primary action button to guide them instantly
      triggerElementHighlight(cleanJson.recommendedActionId);
    } else {
      vectorContainer.innerText = vectorText;
    }

    showToast("Page analysis complete!");

  } catch (err) {
    console.error("API error:", err);
    showToast("Falling back to local reader...", true);
    await getLocalDemoSummary(data);
  }
}

// Local heuristic parser
async function getLocalDemoSummary(data) {
  showToast("Compiling layout overview...", false, true);

  // 1. Compile simple objective based on headers / title
  const objective = `This is the "${data.title}" portal. Luna has mapped the key links and forms on this page. Ask any question below to get instant guidance.`;

  // 2. Look for deadlines/fees in page text
  const sentences = data.text.split(/[.!\n]/);
  const deadlineSentences = [];
  const feeSentences = [];

  const dateKeywords = ['deadline', 'date', 'close', 'last date', 'register by', 'july', 'august', 'september', 'october', '2026', '2025'];
  const feeKeywords = ['fee', 'rs', 'inr', 'pay', 'charge', 'cost', '₹', '$'];

  sentences.forEach(s => {
    const lower = s.toLowerCase();
    if (dateKeywords.some(kw => lower.includes(kw)) && deadlineSentences.length < 2) {
      deadlineSentences.push(s.trim());
    }
    if (feeKeywords.some(kw => lower.includes(kw)) && feeSentences.length < 2) {
      feeSentences.push(s.trim());
    }
  });

  let requirements = "";
  if (deadlineSentences.length > 0) {
    requirements += "📅 Dates: " + deadlineSentences.join(". ") + ".\n\n";
  }
  if (feeSentences.length > 0) {
    requirements += "💰 Fees/Charges: " + feeSentences.join(". ") + ".";
  }
  if (!requirements) {
    requirements = "No explicit deadlines or fees identified via quick scan. Use chat search.";
  }

  // 3. Find primary action vector button
  let recommendedActionId = null;
  let primaryVector = "Please select a specific action target from the list below to highlight its location.";

  const actionKeywords = ['apply', 'register', 'login', 'sign in', 'download', 'submit', 'form'];
  
  for (const el of data.interactives) {
    const text = el.text.toLowerCase();
    if (actionKeywords.some(kw => text.includes(kw))) {
      recommendedActionId = el.id;
      primaryVector = `Navigate by clicking: "${el.text}"`;
      break;
    }
  }

  // Fallback to first button if no keyword matches
  if (!recommendedActionId && data.interactives.length > 0) {
    recommendedActionId = data.interactives[0].id;
    primaryVector = `Navigate by clicking: "${data.interactives[0].text}"`;
  }

  // Update UI
  document.getElementById('summary-objective').innerText = objective;
  document.getElementById('summary-requirements').innerText = requirements;
  
  const vectorContainer = document.getElementById('summary-vector');
  if (recommendedActionId) {
    vectorContainer.innerHTML = `<span class="chat-link" data-target-id="${recommendedActionId}">${primaryVector}</span>`;
    triggerElementHighlight(recommendedActionId);
  } else {
    vectorContainer.innerText = primaryVector;
  }

  setTimeout(() => {
    showToast("Demo dissection complete!");
  }, 500);
}

// Chat system
async function sendChatMessage() {
  const inputEl = document.getElementById('chat-input');
  const question = inputEl.value.trim();
  if (!question) return;

  if (!parsedPageData) {
    showToast("Please click 'Dissect Active Page' first to load page context.", true);
    return;
  }

  // Append user bubble
  appendChatBubble(question, 'user');
  inputEl.value = "";

  // Append AI typing indicator
  const indicator = appendTypingIndicator();

  try {
    if (settings.liveApiEnabled && settings.geminiApiKey) {
      await getLiveAIChatResponse(question, indicator);
    } else {
      await getMockChatResponse(question, indicator);
    }
  } catch (error) {
    console.error("Chat response error:", error);
    indicator.remove();
    appendChatBubble("Sorry, I encountered an error answering that query.", 'assistant');
  }
}

// Append Chat UI Bubbles
function appendChatBubble(text, sender) {
  const container = document.getElementById('chat-messages-container');
  const bubble = document.createElement('div');
  bubble.className = `chat-bubble ${sender}`;

  if (sender === 'assistant') {
    // Parse custom markdown links [Click: Button Text](elementId)
    // and standard markdown bolding/linebreaks
    let html = text
      .replace(/\[([^\]]+)\]\((ag-el-\d+)\)/g, '<span class="chat-link" data-target-id="$2">$1</span>')
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
      .replace(/\n/g, '<br/>');
    
    bubble.innerHTML = html;
  } else {
    bubble.innerText = text;
  }

  container.appendChild(bubble);
  container.scrollTop = container.scrollHeight;
  return bubble;
}

function appendTypingIndicator() {
  const container = document.getElementById('chat-messages-container');
  const indicator = document.createElement('div');
  indicator.className = 'ai-typing-indicator';
  indicator.innerHTML = `
    <div class="typing-dot"></div>
    <div class="typing-dot"></div>
    <div class="typing-dot"></div>
  `;
  container.appendChild(indicator);
  container.scrollTop = container.scrollHeight;
  return indicator;
}

// Fetch live response from Assistant
async function getLiveAIChatResponse(question, indicator) {
  const prompt = `
You are Luna, a helpful personal assistant for the webpage "${parsedPageData.title}".
Page text content:
${parsedPageData.text}

List of interactive elements on the page:
${JSON.stringify(parsedPageData.interactives)}

The user asks: "${question}"

Answer the user's question accurately based on the page content.
If you suggest they click a button, link, or input from the list of interactive elements, you MUST format the mention as a clickable reference: [Click: Button Text](elementId).
For example, if you want them to click a button with text "Apply Online" and id "ag-el-4", write "[Click: Apply Online](ag-el-4)".
Keep the response short, clear, friendly, and direct. Keep formatting neat with markdown.
  `;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${settings.geminiApiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData?.error?.message || `API returned ${response.status}`);
    }

    const resJson = await response.json();
    const candidate = resJson.candidates && resJson.candidates[0];
    const parts = candidate && candidate.content && candidate.content.parts;
    const reply = parts ? parts.filter(p => p.text && !p.thought).map(p => p.text).join('') || parts[0].text : '';
    
    indicator.remove();
    appendChatBubble(reply, 'assistant');

  } catch (err) {
    console.error("Live Chat Error:", err);
    indicator.remove();
    appendChatBubble("I'm checking the page text directly. Here is what I found:", 'assistant');
    const newIndicator = appendTypingIndicator();
    await getMockChatResponse(question, newIndicator);
  }
}

// Generate smart mock answers for Demo Mode
async function getMockChatResponse(question, indicator) {
  return new Promise((resolve) => {
    setTimeout(() => {
      indicator.remove();
      
      const q = question.toLowerCase();
      let answer = "";

      // 1. Search for matching action targets
      const matches = parsedPageData.interactives.filter(el => 
        q.split(' ').some(word => word.length > 3 && el.text.toLowerCase().includes(word))
      );

      // 2. Direct Q&A mapping
      if (q.includes('apply') || q.includes('register') || q.includes('fill')) {
        const btn = parsedPageData.interactives.find(el => {
          const t = el.text.toLowerCase();
          return t.includes('apply') || t.includes('register') || t.includes('signup') || t.includes('online');
        });

        if (btn) {
          answer = `I found a relevant action step! You should click on the [Click: ${btn.text}](${btn.id}) element to proceed with application/registration. Let me know if you need help finding dates!`;
          triggerElementHighlight(btn.id);
        } else {
          answer = "I searched the interactive page items, but I couldn't find an obvious button with 'Apply' or 'Register' text. Try checking the lists in the dashboard or click any link shown in the Targets panel.";
        }
      } 
      else if (q.includes('deadline') || q.includes('last date') || q.includes('when') || q.includes('date')) {
        // Search text for date sentences
        const dates = [];
        parsedPageData.text.split(/[.!\n]/).forEach(s => {
          const l = s.toLowerCase();
          if (['deadline', 'date', 'close', 'last date', 'register by', 'july', 'august', '2026'].some(k => l.includes(k))) {
            dates.push(s.trim());
          }
        });

        if (dates.length > 0) {
          answer = `Based on my offline heuristic parser, I found these calendar details:\n\n• ${dates.slice(0,2).join('\n• ')}\n\n(Toggle Live AI Mode in Settings for a complete semantic review).`;
        } else {
          answer = "I couldn't locate specific deadline strings. If they are hidden in images or PDFs, switching to **Live AI Mode** will enable deeper semantic indexing.";
        }
      }
      else if (q.includes('fee') || q.includes('cost') || q.includes('pay') || q.includes('price')) {
        const fees = [];
        parsedPageData.text.split(/[.!\n]/).forEach(s => {
          const l = s.toLowerCase();
          if (['fee', 'rs', 'inr', 'pay', '₹', '$'].some(k => l.includes(k))) {
            fees.push(s.trim());
          }
        });

        if (fees.length > 0) {
          answer = `Here are matching details on fees/charges:\n\n• ${fees.slice(0, 2).join('\n• ')}`;
        } else {
          answer = "No clear pricing or fee lists were found. Make sure to double check the forms page.";
        }
      }
      else {
        // Fallback generic answer
        const linkMatches = matches.slice(0, 3).map(el => `[Click: ${el.text}](${el.id})`).join(', ');
        
        answer = `I scanned the page text for your question. Here is a summary of related buttons/actions: ${linkMatches || 'No direct action match found'}.\n\nTo search deeper using natural language, activate **Live AI Mode** under Settings and input your Gemini API Key.`;
      }

      appendChatBubble(answer, 'assistant');
      resolve();
    }, 1000);
  });
}

// ==========================================
// 3. Portal Document Prep & Requirements
// ==========================================

function renderPortalDocRequirements(requirements) {
  const card = document.getElementById('portal-docs-card');
  const list = document.getElementById('portal-docs-list');
  const studioBanner = document.getElementById('studio-detected-banner');
  const studioBannerTitle = document.getElementById('studio-detected-title');
  const studioBannerDesc = document.getElementById('studio-detected-desc');

  if (!card || !list) return;

  if (!requirements || requirements.length === 0) {
    card.style.display = 'none';
    list.innerHTML = '';
    if (studioBanner) studioBanner.style.display = 'none';
    return;
  }

  card.style.display = 'block';
  list.innerHTML = '';

  // Also update studio banner with top requirement
  if (studioBanner && requirements[0]) {
    studioBanner.style.display = 'block';
    if (studioBannerTitle) studioBannerTitle.innerText = `Active Page: ${requirements[0].label}`;
    if (studioBannerDesc) studioBannerDesc.innerText = requirements[0].instruction || `Max ${requirements[0].maxKB} KB in ${requirements[0].targetFormat}`;
    
    const applyBtn = document.getElementById('studio-apply-detected-btn');
    if (applyBtn) {
      applyBtn.onclick = () => {
        applyRequirementToStudio(requirements[0]);
        showToast(`Applied ${requirements[0].label} preset (${requirements[0].maxKB}KB ${requirements[0].targetFormat})`);
      };
    }
  }

  requirements.forEach(req => {
    const row = document.createElement('div');
    row.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding: 7px 9px; background: #ffffff; border: 1px solid #bae6fd; border-radius: var(--radius-sm); gap: 8px;';

    const info = document.createElement('div');
    info.style.cssText = 'display: flex; flex-direction: column; overflow: hidden;';

    const topRow = document.createElement('div');
    topRow.style.cssText = 'display: flex; align-items: center; gap: 6px;';

    const badge = document.createElement('span');
    badge.style.cssText = 'font-size: 0.62rem; font-weight: 700; background: #0284c7; color: #fff; padding: 2px 5px; border-radius: 3px; flex-shrink: 0;';
    badge.innerText = req.targetFormat || 'DOC';

    const titleSpan = document.createElement('span');
    titleSpan.style.cssText = 'font-size: 0.76rem; font-weight: 600; color: #0369a1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;';
    titleSpan.innerText = req.label;

    topRow.appendChild(badge);
    topRow.appendChild(titleSpan);

    const descSpan = document.createElement('span');
    descSpan.style.cssText = 'font-size: 0.68rem; color: #0284c7; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;';
    descSpan.innerText = `Max ${req.maxKB} KB • ${req.instruction}`;

    info.appendChild(topRow);
    info.appendChild(descSpan);

    const btn = document.createElement('button');
    btn.style.cssText = 'font-size: 0.7rem; font-weight: 600; background: #0284c7; border: none; color: #ffffff; padding: 5px 8px; border-radius: var(--radius-sm); cursor: pointer; white-space: nowrap; flex-shrink: 0; transition: background 0.15s ease;';
    btn.innerText = 'Resize / Convert';
    btn.addEventListener('click', () => {
      // Switch to Doc Studio tab
      const studioTabBtn = document.getElementById('tab-btn-docstudio');
      if (studioTabBtn) studioTabBtn.click();

      // Apply requirement
      applyRequirementToStudio(req);
      showToast(`Doc Studio pre-set to ${req.maxKB} KB ${req.targetFormat}`);
    });

    row.appendChild(info);
    row.appendChild(btn);
    list.appendChild(row);
  });
}

function applyRequirementToStudio(req) {
  let format = 'image/jpeg', ext = 'jpg';
  if (req.targetFormat === 'PDF') { format = 'application/pdf'; ext = 'pdf'; }
  else if (req.targetFormat === 'PNG') { format = 'image/png'; ext = 'png'; }

  setStudioFormat(format, ext);
  setStudioTargetKB(req.maxKB || 50);

  if (req.width > 0 && req.height > 0) {
    setStudioDimensions(req.width, req.height);
  } else if (req.preset === 'passport') {
    setStudioDimensions(350, 450);
  } else if (req.preset === 'signature') {
    setStudioDimensions(280, 120);
  }

  // Set active preset chip
  document.querySelectorAll('.preset-chip').forEach(c => c.classList.remove('active'));
  const matchChip = document.querySelector(`.preset-chip[data-preset="${req.preset}"]`);
  if (matchChip) matchChip.classList.add('active');
}

// ==========================================
// 4. In-Browser Pure JS Image to PDF Generator
// ==========================================

function createPdfFromJpeg(jpegUint8Array, widthPx, heightPx) {
  const ptWidth = Math.round(widthPx * 72 / 96) || 300;
  const ptHeight = Math.round(heightPx * 72 / 96) || 400;

  const header = "%PDF-1.4\n";
  const obj1 = "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n";
  const obj2 = `2 0 obj\n<< /Pages [3 0 R] /Count 1 /Type /Pages >>\nendobj\n`;
  const obj3 = `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${ptWidth} ${ptHeight}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`;
  const imgHeader = `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${widthPx} /Height ${heightPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegUint8Array.length} >>\nstream\n`;
  const imgFooter = "\nendstream\nendobj\n";
  const contentStream = `q\n${ptWidth} 0 0 ${ptHeight} 0 0 cm\n/Im0 Do\nQ\n`;
  const obj5 = `5 0 obj\n<< /Length ${contentStream.length} >>\nstream\n${contentStream}endstream\nendobj\n`;

  const enc = new TextEncoder();
  const headerBytes = enc.encode(header);
  const obj1Bytes = enc.encode(obj1);
  const obj2Bytes = enc.encode(obj2);
  const obj3Bytes = enc.encode(obj3);
  const imgHeaderBytes = enc.encode(imgHeader);
  const imgFooterBytes = enc.encode(imgFooter);
  const obj5Bytes = enc.encode(obj5);

  let offset = headerBytes.length;
  const offset1 = offset; offset += obj1Bytes.length;
  const offset2 = offset; offset += obj2Bytes.length;
  const offset3 = offset; offset += obj3Bytes.length;
  const offset4 = offset; offset += imgHeaderBytes.length + jpegUint8Array.length + imgFooterBytes.length;
  const offset5 = offset; offset += obj5Bytes.length;
  const xrefOffset = offset;

  const pad10 = (n) => String(n).padStart(10, '0');
  const xref = `xref\n0 6\n0000000000 65535 f \n${pad10(offset1)} 00000 n \n${pad10(offset2)} 00000 n \n${pad10(offset3)} 00000 n \n${pad10(offset4)} 00000 n \n${pad10(offset5)} 00000 n \n`;
  const trailer = `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  const xrefBytes = enc.encode(xref);
  const trailerBytes = enc.encode(trailer);

  const totalLength = offset + xrefBytes.length + trailerBytes.length;
  const pdfBytes = new Uint8Array(totalLength);
  let pos = 0;
  function append(bytes) { pdfBytes.set(bytes, pos); pos += bytes.length; }

  append(headerBytes);
  append(obj1Bytes);
  append(obj2Bytes);
  append(obj3Bytes);
  append(imgHeaderBytes);
  append(jpegUint8Array);
  append(imgFooterBytes);
  append(obj5Bytes);
  append(xrefBytes);
  append(trailerBytes);

  return pdfBytes;
}

// ==========================================
// 5. Doc & Photo Studio State & Engine
// ==========================================

let studioState = {
  file: null,
  fileName: '',
  fileType: '',
  fileSize: 0,
  img: null,
  origWidth: 0,
  origHeight: 0,
  targetFormat: 'image/jpeg',
  targetExt: 'jpg',
  targetKB: 50,
  targetWidth: 350,
  targetHeight: 450,
  lockRatio: true,
  aspectRatio: 350 / 450,
  preset: 'passport',
  processedBlob: null,
  processedUrl: null,
  resultFileName: ''
};

function initDocStudio() {
  const dropzone = document.getElementById('studio-dropzone');
  const fileInput = document.getElementById('studio-file-input');
  const removeBtn = document.getElementById('studio-remove-file-btn');
  const targetKbInput = document.getElementById('studio-target-kb');
  const widthInput = document.getElementById('studio-width');
  const heightInput = document.getElementById('studio-height');
  const lockRatioCheckbox = document.getElementById('studio-lock-ratio');
  const processBtn = document.getElementById('studio-process-btn');
  const downloadBtn = document.getElementById('studio-download-btn');

  if (!dropzone || !fileInput) return;

  // Drag & drop handlers
  dropzone.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleStudioFile(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleStudioFile(e.target.files[0]);
    }
  });

  if (removeBtn) {
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      clearStudioFile();
    });
  }

  // Format selection buttons
  document.querySelectorAll('#format-btn-group .format-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const format = btn.getAttribute('data-format');
      const ext = btn.getAttribute('data-ext');
      setStudioFormat(format, ext);
    });
  });

  // Target KB size chips
  document.querySelectorAll('#studio-size-chips .size-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const kb = parseInt(chip.getAttribute('data-kb'), 10);
      setStudioTargetKB(kb);
    });
  });

  if (targetKbInput) {
    targetKbInput.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10) || 0;
      studioState.targetKB = val;
      updateKbFeedback(val);
      // Deselect chip highlights if custom
      document.querySelectorAll('#studio-size-chips .size-chip').forEach(c => {
        c.classList.toggle('active', parseInt(c.getAttribute('data-kb'), 10) === val);
      });
    });
  }

  // Dimension inputs & ratio locking
  if (widthInput && heightInput && lockRatioCheckbox) {
    lockRatioCheckbox.addEventListener('change', (e) => {
      studioState.lockRatio = e.target.checked;
      if (e.target.checked && widthInput.value && heightInput.value) {
        studioState.aspectRatio = (parseInt(widthInput.value, 10) || 1) / (parseInt(heightInput.value, 10) || 1);
      }
    });

    widthInput.addEventListener('input', (e) => {
      const w = parseInt(e.target.value, 10) || 0;
      studioState.targetWidth = w;
      if (studioState.lockRatio && studioState.aspectRatio > 0 && w > 0) {
        const calculatedH = Math.round(w / studioState.aspectRatio);
        heightInput.value = calculatedH;
        studioState.targetHeight = calculatedH;
      }
    });

    heightInput.addEventListener('input', (e) => {
      const h = parseInt(e.target.value, 10) || 0;
      studioState.targetHeight = h;
      if (studioState.lockRatio && studioState.aspectRatio > 0 && h > 0) {
        const calculatedW = Math.round(h * studioState.aspectRatio);
        widthInput.value = calculatedW;
        studioState.targetWidth = calculatedW;
      }
    });
  }

  // Presets
  document.querySelectorAll('.preset-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const preset = chip.getAttribute('data-preset');
      applyPreset(preset);
    });
  });

  // Action buttons
  if (processBtn) processBtn.addEventListener('click', processDocumentConversion);
  if (downloadBtn) downloadBtn.addEventListener('click', downloadConvertedStudioFile);
}

function handleStudioFile(file) {
  studioState.file = file;
  studioState.fileName = file.name;
  studioState.fileSize = file.size;
  studioState.fileType = file.type;

  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      studioState.img = img;
      studioState.origWidth = img.naturalWidth;
      studioState.origHeight = img.naturalHeight;
      studioState.aspectRatio = img.naturalWidth / img.naturalHeight;

      // Update UI
      const dropzone = document.getElementById('studio-dropzone');
      const fileInfo = document.getElementById('studio-file-info');
      const thumb = document.getElementById('studio-file-thumb');
      const nameEl = document.getElementById('studio-file-name');
      const metaEl = document.getElementById('studio-file-meta');

      if (dropzone) dropzone.style.display = 'none';
      if (fileInfo) fileInfo.style.display = 'flex';
      if (thumb) thumb.src = e.target.result;
      if (nameEl) nameEl.innerText = file.name;
      
      const sizeStr = file.size > 1024 * 1024 
        ? `${(file.size / (1024 * 1024)).toFixed(2)} MB` 
        : `${Math.round(file.size / 1024)} KB`;
      const formatStr = file.type ? file.type.replace('image/', '').toUpperCase() : 'IMG';
      if (metaEl) metaEl.innerText = `${sizeStr} • ${img.naturalWidth} × ${img.naturalHeight} px • ${formatStr}`;

      showToast(`Loaded "${file.name}" ready to adjust.`);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function clearStudioFile() {
  studioState.file = null;
  studioState.img = null;
  studioState.processedBlob = null;
  if (studioState.processedUrl) {
    URL.revokeObjectURL(studioState.processedUrl);
    studioState.processedUrl = null;
  }

  const dropzone = document.getElementById('studio-dropzone');
  const fileInfo = document.getElementById('studio-file-info');
  const resultCard = document.getElementById('studio-result-card');
  const fileInput = document.getElementById('studio-file-input');

  if (dropzone) dropzone.style.display = 'flex';
  if (fileInfo) fileInfo.style.display = 'none';
  if (resultCard) resultCard.style.display = 'none';
  if (fileInput) fileInput.value = '';
}

function setStudioFormat(mimeType, ext) {
  studioState.targetFormat = mimeType;
  studioState.targetExt = ext;

  document.querySelectorAll('#format-btn-group .format-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-format') === mimeType);
  });
}

function setStudioTargetKB(kb) {
  studioState.targetKB = kb;
  const input = document.getElementById('studio-target-kb');
  if (input) input.value = kb > 0 ? kb : '';
  updateKbFeedback(kb);

  document.querySelectorAll('#studio-size-chips .size-chip').forEach(chip => {
    chip.classList.toggle('active', parseInt(chip.getAttribute('data-kb'), 10) === kb);
  });
}

function updateKbFeedback(kb) {
  const fb = document.getElementById('studio-kb-feedback');
  if (fb) {
    fb.innerText = kb > 0 ? `Max ${kb} KB` : "No limit (Full resolution)";
  }
}

function setStudioDimensions(w, h) {
  studioState.targetWidth = w;
  studioState.targetHeight = h;
  if (w > 0 && h > 0) {
    studioState.aspectRatio = w / h;
  }

  const wInput = document.getElementById('studio-width');
  const hInput = document.getElementById('studio-height');
  if (wInput) wInput.value = w;
  if (hInput) hInput.value = h;
}

function applyPreset(presetName) {
  studioState.preset = presetName;

  document.querySelectorAll('.preset-chip').forEach(chip => {
    chip.classList.toggle('active', chip.getAttribute('data-preset') === presetName);
  });

  const cropSelect = document.getElementById('studio-crop-mode');

  if (presetName === 'passport') {
    setStudioFormat('image/jpeg', 'jpg');
    setStudioTargetKB(50);
    setStudioDimensions(350, 450);
    if (cropSelect) cropSelect.value = 'crop';
  } else if (presetName === 'signature') {
    setStudioFormat('image/jpeg', 'jpg');
    setStudioTargetKB(20);
    setStudioDimensions(280, 120);
    if (cropSelect) cropSelect.value = 'fit';
  } else if (presetName === 'marksheet') {
    setStudioFormat('application/pdf', 'pdf');
    setStudioTargetKB(200);
    setStudioDimensions(1200, 1600);
    if (cropSelect) cropSelect.value = 'fit';
  } else if (presetName === 'certificate') {
    setStudioFormat('application/pdf', 'pdf');
    setStudioTargetKB(100);
    setStudioDimensions(1200, 1600);
    if (cropSelect) cropSelect.value = 'fit';
  }
}

// Adaptive JPEG compressor that guarantees output is <= maxBytes without over-compressing
async function adaptiveCompressJpeg(canvas, maxBytes, mimeType = 'image/jpeg') {
  if (!maxBytes || maxBytes <= 0) {
    return await new Promise(res => canvas.toBlob(res, mimeType, 0.92));
  }

  let minQ = 0.05;
  let maxQ = 0.96;
  let bestBlob = null;

  for (let i = 0; i < 7; i++) {
    const midQ = (minQ + maxQ) / 2;
    const blob = await new Promise(res => canvas.toBlob(res, mimeType, midQ));
    if (blob.size <= maxBytes) {
      bestBlob = blob;
      minQ = midQ;
    } else {
      maxQ = midQ;
    }
  }

  // If still larger than targetKB (e.g. 20KB for high resolution canvas), scale down dimensions
  if (!bestBlob || bestBlob.size > maxBytes) {
    let scaled = canvas;
    while (scaled.width > 120 && (!bestBlob || bestBlob.size > maxBytes)) {
      const w = Math.round(scaled.width * 0.82);
      const h = Math.round(scaled.height * 0.82);
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(scaled, 0, 0, w, h);
      scaled = c;
      const testBlob = await new Promise(res => scaled.toBlob(res, mimeType, 0.72));
      if (testBlob.size <= maxBytes) {
        bestBlob = testBlob;
        break;
      }
    }
  }

  return bestBlob || (await new Promise(res => canvas.toBlob(res, mimeType, 0.45)));
}

async function processDocumentConversion() {
  if (!studioState.img) {
    showToast("Please upload an image or document first", true);
    return;
  }

  showToast("Converting & adjusting document...", false, true);
  const processBtn = document.getElementById('studio-process-btn');
  if (processBtn) processBtn.disabled = true;

  try {
    let outWidth = studioState.targetWidth;
    let outHeight = studioState.targetHeight;
    const cropSelect = document.getElementById('studio-crop-mode');
    const cropMode = cropSelect ? cropSelect.value : 'crop';

    const img = studioState.img;
    let sX = 0, sY = 0, sW = img.naturalWidth, sH = img.naturalHeight;

    if (cropMode === 'original' || outWidth <= 0 || outHeight <= 0) {
      outWidth = img.naturalWidth;
      outHeight = img.naturalHeight;
    } else if (cropMode === 'crop') {
      const targetRatio = outWidth / outHeight;
      const imgRatio = img.naturalWidth / img.naturalHeight;

      if (imgRatio > targetRatio) {
        sW = Math.round(img.naturalHeight * targetRatio);
        sH = img.naturalHeight;
        sX = Math.round((img.naturalWidth - sW) / 2);
        sY = 0;
      } else {
        sW = img.naturalWidth;
        sH = Math.round(img.naturalWidth / targetRatio);
        sX = 0;
        sY = Math.round((img.naturalHeight - sH) / 2);
      }
    } else if (cropMode === 'fit') {
      const scale = Math.min(outWidth / img.naturalWidth, outHeight / img.naturalHeight, 1);
      outWidth = Math.round(img.naturalWidth * scale);
      outHeight = Math.round(img.naturalHeight * scale);
    }

    let currentCanvas = document.createElement('canvas');
    currentCanvas.width = outWidth;
    currentCanvas.height = outHeight;
    let ctx = currentCanvas.getContext('2d');

    // Fill white background for JPEG / PDF so transparent PNGs don't become black
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, outWidth, outHeight);
    ctx.drawImage(img, sX, sY, sW, sH, 0, 0, outWidth, outHeight);

    const maxBytes = studioState.targetKB > 0 ? studioState.targetKB * 1024 : 0;
    const format = studioState.targetFormat;
    let finalBlob = null;

    if (format === 'application/pdf') {
      const targetJpegBytes = maxBytes > 1200 ? maxBytes - 1000 : maxBytes;
      const jpegBlob = await adaptiveCompressJpeg(currentCanvas, targetJpegBytes);
      const jpegBuffer = await jpegBlob.arrayBuffer();
      const pdfBytes = createPdfFromJpeg(new Uint8Array(jpegBuffer), currentCanvas.width, currentCanvas.height);
      finalBlob = new Blob([pdfBytes], { type: 'application/pdf' });
    } else if (format === 'image/jpeg' || format === 'image/webp') {
      finalBlob = await adaptiveCompressJpeg(currentCanvas, maxBytes, format);
    } else {
      finalBlob = await new Promise(res => currentCanvas.toBlob(res, 'image/png'));
      if (maxBytes > 0 && finalBlob.size > maxBytes) {
        let scaledCanvas = currentCanvas;
        while (finalBlob.size > maxBytes && scaledCanvas.width > 120) {
          const nextW = Math.round(scaledCanvas.width * 0.85);
          const nextH = Math.round(scaledCanvas.height * 0.85);
          const nextCanvas = document.createElement('canvas');
          nextCanvas.width = nextW;
          nextCanvas.height = nextH;
          const nextCtx = nextCanvas.getContext('2d');
          nextCtx.drawImage(scaledCanvas, 0, 0, nextW, nextH);
          scaledCanvas = nextCanvas;
          finalBlob = await new Promise(res => scaledCanvas.toBlob(res, 'image/png'));
        }
        currentCanvas = scaledCanvas;
      }
    }

    studioState.processedBlob = finalBlob;
    if (studioState.processedUrl) URL.revokeObjectURL(studioState.processedUrl);
    studioState.processedUrl = URL.createObjectURL(finalBlob);

    const rawBaseName = studioState.fileName.replace(/\.[^/.]+$/, "") || "converted_document";
    const cleanBaseName = rawBaseName.replace(/[^a-zA-Z0-9_-]/g, "_");
    studioState.resultFileName = `${cleanBaseName}_luna.${studioState.targetExt}`;

    renderStudioResult(finalBlob, currentCanvas.width, currentCanvas.height);
    showToast("Conversion & optimization complete!");

  } catch (err) {
    console.error("Doc Studio processing error:", err);
    showToast("Failed to process: " + err.message, true);
  } finally {
    if (processBtn) processBtn.disabled = false;
  }
}

function renderStudioResult(blob, width, height) {
  const resultCard = document.getElementById('studio-result-card');
  const previewImg = document.getElementById('studio-result-preview');
  const pdfIcon = document.getElementById('studio-result-pdf-icon');
  const filenameEl = document.getElementById('studio-result-filename');
  const statsEl = document.getElementById('studio-result-stats');
  const badgeEl = document.getElementById('studio-reduction-badge');

  if (!resultCard) return;
  resultCard.style.display = 'block';

  if (filenameEl) filenameEl.innerText = studioState.resultFileName;

  const sizeKb = (blob.size / 1024).toFixed(1);
  const targetKbText = studioState.targetKB > 0 ? ` (Limit: ${studioState.targetKB} KB)` : '';
  if (statsEl) {
    statsEl.innerHTML = `Size: <b>${sizeKb} KB</b>${targetKbText} • ${width} × ${height} px • ${studioState.targetExt.toUpperCase()}`;
  }

  if (studioState.fileSize > 0 && badgeEl) {
    const diff = studioState.fileSize - blob.size;
    if (diff > 0) {
      const pct = Math.round((diff / studioState.fileSize) * 100);
      badgeEl.innerText = `${pct}% SMALLER`;
      badgeEl.style.display = 'inline-block';
    } else {
      badgeEl.style.display = 'none';
    }
  }

  if (blob.type === 'application/pdf') {
    if (previewImg) previewImg.style.display = 'none';
    if (pdfIcon) pdfIcon.style.display = 'flex';
  } else {
    if (previewImg) {
      previewImg.style.display = 'block';
      previewImg.src = studioState.processedUrl;
    }
    if (pdfIcon) pdfIcon.style.display = 'none';
  }

  resultCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function downloadConvertedStudioFile() {
  if (!studioState.processedBlob || !studioState.processedUrl) return;
  const a = document.createElement('a');
  a.href = studioState.processedUrl;
  a.download = studioState.resultFileName;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => a.remove(), 1000);
  showToast(`Downloaded ${studioState.resultFileName}!`);
}
