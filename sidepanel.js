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
