// AI Tally - Content Script
// Injected into: claude.ai, chatgpt.com, gemini.google.com, notebooklm, perplexity, copilot

(function () {
  'use strict';

  // Detect which AI app we're on
  const hostname = window.location.hostname;
  let currentApp = null;

  if (hostname.includes('claude.ai')) currentApp = 'claude';
  else if (hostname.includes('chatgpt.com') || hostname.includes('openai.com')) currentApp = 'chatgpt';
  else if (hostname.includes('gemini.google.com')) currentApp = 'gemini';
  else if (hostname.includes('notebooklm.google.com')) currentApp = 'notebooklm';
  else if (hostname.includes('perplexity.ai')) currentApp = 'perplexity';
  else if (hostname.includes('copilot.microsoft.com')) currentApp = 'copilot';

  if (!currentApp) return;

  // Selectors per app for message input detection
  const APP_SELECTORS = {
    claude: {
      input: '[contenteditable="true"], textarea[placeholder*="message"], div[data-placeholder]',
      messages: '[data-testid="human-turn"], .human-turn, [class*="human"], .font-claude-message',
      limitText: '.limit-message, [class*="upgrade"], [class*="limit"]',
      sendBtn: 'button[aria-label*="Send"], button[type="submit"]'
    },
    chatgpt: {
      input: '#prompt-textarea, textarea[data-id="root"]',
      messages: '[data-message-author-role="user"]',
      limitText: '.text-token-text-secondary, [class*="limit"], [class*="upgrade"]',
      sendBtn: 'button[data-testid="send-button"]'
    },
    gemini: {
      input: '.ql-editor, rich-textarea textarea, [contenteditable="true"]',
      messages: '.user-query, [class*="user-turn"]',
      limitText: '[class*="limit"], [class*="upgrade"], .error-container',
      sendBtn: 'button[aria-label*="Send"]'
    },
    notebooklm: {
      input: 'textarea, [contenteditable="true"]',
      messages: '[class*="user"], [class*="human"]',
      limitText: '[class*="limit"], [class*="quota"]',
      sendBtn: 'button[type="submit"], button[aria-label*="Send"]'
    },
    perplexity: {
      input: 'textarea[placeholder*="Ask"], textarea',
      messages: '[class*="user"], [data-testid*="user"]',
      limitText: '[class*="limit"], [class*="pro"], [class*="upgrade"]',
      sendBtn: 'button[aria-label*="Submit"], button[type="submit"]'
    },
    copilot: {
      input: 'textarea, [contenteditable="true"]',
      messages: '[class*="user"]',
      limitText: '[class*="limit"], [class*="boost"]',
      sendBtn: 'button[aria-label*="Send"], button[type="submit"]'
    }
  };

  const selectors = APP_SELECTORS[currentApp];
  let messageCount = 0;
  let limitDetected = false;
  let observer = null;
  let overlayShown = false;

  // Limit detection phrases per app
  const LIMIT_PHRASES = {
    claude: ["you've reached your limit", "usage limit", "message limit", "upgrade to continue", "out of messages", "limit reached", "you've hit"],
    chatgpt: ["you've reached the limit", "gpt-4 limit", "upgrade to plus", "message limit reached", "too many messages", "hit your message cap", "you've sent a lot"],
    gemini: ["gemini advanced", "rate limit", "try again later", "daily limit", "request limit"],
    notebooklm: ["limit reached", "upgrade", "quota exceeded", "daily limit"],
    perplexity: ["pro searches", "limit reached", "upgrade to pro", "daily limit"],
    copilot: ["limit reached", "boost", "daily limit", "conversation limit"]
  };

  // Extract full conversation text from page
  function extractChat() {
    const chatParts = [];
    const messageEls = document.querySelectorAll(selectors.messages);

    if (messageEls.length === 0) {
      // Fallback: grab all visible text blocks that look like conversation
      const allP = document.querySelectorAll('p, [class*="message"], [class*="turn"]');
      allP.forEach(el => {
        const text = el.innerText?.trim();
        if (text && text.length > 10) chatParts.push(text);
      });
    } else {
      messageEls.forEach(el => {
        const text = el.innerText?.trim();
        if (text) chatParts.push(`You: ${text}`);
      });
    }

    return chatParts.join('\n\n---\n\n');
  }

  // Detect limit from DOM text content
  function checkForLimit() {
    if (limitDetected) return;
    const bodyText = document.body.innerText.toLowerCase();
    const phrases = LIMIT_PHRASES[currentApp] || [];
    
    const found = phrases.some(phrase => bodyText.includes(phrase.toLowerCase()));
    
    if (found) {
      limitDetected = true;
      console.log(`[AI Tally] Limit detected on ${currentApp}`);
      
      // Notify background
      chrome.runtime.sendMessage({ type: 'LIMIT_HIT', appKey: currentApp }, (response) => {
        if (response?.nextApp) {
          showSwitchOverlay(response.nextApp);
        }
      });
    }
  }

  // Detect when user sends a message
  function setupSendDetection() {
    const sendBtn = document.querySelector(selectors.sendBtn);
    if (sendBtn) {
      sendBtn.addEventListener('click', () => {
        setTimeout(() => {
          messageCount++;
          chrome.runtime.sendMessage({ type: 'INCREMENT_USAGE', appKey: currentApp });
        }, 500);
      });
    }

    // Also watch for Enter key in input
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        const active = document.activeElement;
        if (active && (active.matches(selectors.input) || active.contentEditable === 'true')) {
          setTimeout(() => {
            messageCount++;
            chrome.runtime.sendMessage({ type: 'INCREMENT_USAGE', appKey: currentApp });
          }, 500);
        }
      }
    });
  }

  // Show the switch overlay UI
  function showSwitchOverlay(nextApp) {
    if (overlayShown) return;
    overlayShown = true;

    const chatText = extractChat();

    const overlay = document.createElement('div');
    overlay.id = 'ai-tally-overlay';
    overlay.innerHTML = `
      <div id="ai-tally-backdrop"></div>
      <div id="ai-tally-card">
        <div id="ai-tally-header">
          <div id="ai-tally-logo">⚡</div>
          <div>
            <div id="ai-tally-title">Limit Reached</div>
            <div id="ai-tally-sub">AI Tally detected your usage limit on this app</div>
          </div>
          <button id="ai-tally-close">✕</button>
        </div>
        <div id="ai-tally-body">
          <div id="ai-tally-from">
            <div class="ai-tally-label">Current App</div>
            <div class="ai-tally-chip ai-tally-chip-warn">⚠️ ${currentApp.charAt(0).toUpperCase() + currentApp.slice(1)} — Limit Hit</div>
          </div>
          <div id="ai-tally-arrow">→</div>
          <div id="ai-tally-to">
            <div class="ai-tally-label">Switch To</div>
            <div class="ai-tally-chip ai-tally-chip-ok">✓ ${nextApp.name} — Available</div>
          </div>
        </div>
        <div id="ai-tally-chat-preview">
          <div class="ai-tally-label" style="margin-bottom:8px">Your conversation (${chatText.split(' ').length} words)</div>
          <div id="ai-tally-preview-text">${chatText.slice(0, 200) || 'No messages extracted yet.'}${chatText.length > 200 ? '...' : ''}</div>
        </div>
        <div id="ai-tally-actions">
          <button id="ai-tally-copy-btn" class="ai-tally-btn ai-tally-btn-secondary">📋 Copy Chat</button>
          <button id="ai-tally-switch-btn" class="ai-tally-btn ai-tally-btn-primary">Switch to ${nextApp.name} →</button>
        </div>
        <div id="ai-tally-tip">💡 Your chat is copied to clipboard when you switch — paste it in the new app to continue.</div>
      </div>
    `;

    // Inject styles
    const style = document.createElement('style');
    style.textContent = `
      #ai-tally-overlay { position:fixed; inset:0; z-index:2147483647; display:flex; align-items:center; justify-content:center; font-family:'Inter',system-ui,sans-serif; }
      #ai-tally-backdrop { position:absolute; inset:0; background:rgba(0,0,0,0.65); backdrop-filter:blur(8px); }
      #ai-tally-card {
        position:relative; z-index:1; width:420px; max-width:90vw;
        background:rgba(13,22,48,0.97);
        border:1px solid rgba(124,58,237,0.35);
        border-radius:20px; padding:28px;
        box-shadow:0 0 60px rgba(124,58,237,0.25), 0 20px 60px rgba(0,0,0,0.5);
        animation:ai-tally-in 0.3s cubic-bezier(0.34,1.56,0.64,1);
      }
      @keyframes ai-tally-in { from { opacity:0; transform:scale(0.88) translateY(20px); } to { opacity:1; transform:scale(1) translateY(0); } }
      #ai-tally-header { display:flex; align-items:center; gap:12px; margin-bottom:20px; }
      #ai-tally-logo { width:40px; height:40px; border-radius:12px; background:linear-gradient(135deg,#7c3aed,#0ea5e9); display:flex; align-items:center; justify-content:center; font-size:20px; flex-shrink:0; box-shadow:0 0 20px rgba(124,58,237,0.4); }
      #ai-tally-title { font-size:17px; font-weight:800; color:#e2e8f0; }
      #ai-tally-sub { font-size:12px; color:rgba(148,163,184,0.6); margin-top:2px; }
      #ai-tally-close { margin-left:auto; background:rgba(255,255,255,0.06); border:none; border-radius:8px; color:#94a3b8; width:30px; height:30px; cursor:pointer; font-size:14px; flex-shrink:0; }
      #ai-tally-body { display:flex; align-items:center; gap:12px; margin-bottom:16px; }
      #ai-tally-arrow { font-size:22px; color:rgba(148,163,184,0.4); flex-shrink:0; }
      .ai-tally-label { font-size:10px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:rgba(148,163,184,0.45); margin-bottom:6px; }
      .ai-tally-chip { font-size:12px; font-weight:600; padding:6px 14px; border-radius:20px; }
      .ai-tally-chip-warn { background:rgba(239,68,68,0.12); color:#f87171; border:1px solid rgba(239,68,68,0.25); }
      .ai-tally-chip-ok { background:rgba(16,185,129,0.12); color:#34d399; border:1px solid rgba(16,185,129,0.25); }
      #ai-tally-chat-preview { background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.07); border-radius:12px; padding:14px; margin-bottom:16px; }
      #ai-tally-preview-text { font-size:12px; color:rgba(148,163,184,0.55); line-height:1.6; max-height:80px; overflow:hidden; }
      #ai-tally-actions { display:flex; gap:10px; margin-bottom:12px; }
      .ai-tally-btn { flex:1; padding:11px; border-radius:12px; border:none; font-size:13px; font-weight:700; cursor:pointer; transition:all 0.2s; }
      .ai-tally-btn-secondary { background:rgba(255,255,255,0.06); color:rgba(148,163,184,0.8); border:1px solid rgba(255,255,255,0.1); }
      .ai-tally-btn-secondary:hover { background:rgba(255,255,255,0.1); }
      .ai-tally-btn-primary { background:linear-gradient(135deg,#7c3aed,#6d28d9); color:#fff; box-shadow:0 0 20px rgba(124,58,237,0.4); }
      .ai-tally-btn-primary:hover { box-shadow:0 0 28px rgba(124,58,237,0.6); transform:translateY(-1px); }
      #ai-tally-tip { font-size:11px; color:rgba(148,163,184,0.4); text-align:center; line-height:1.5; }
    `;
    document.head.appendChild(style);
    document.body.appendChild(overlay);

    // Wire up buttons
    document.getElementById('ai-tally-close').onclick = () => overlay.remove();
    document.getElementById('ai-tally-backdrop').onclick = () => overlay.remove();

    document.getElementById('ai-tally-copy-btn').onclick = async () => {
      try {
        await navigator.clipboard.writeText(chatText);
        const btn = document.getElementById('ai-tally-copy-btn');
        btn.textContent = '✓ Copied!';
        btn.style.color = '#10b981';
        setTimeout(() => { btn.textContent = '📋 Copy Chat'; btn.style.color = ''; }, 2000);
      } catch (e) {
        console.error('[AI Tally] Clipboard error:', e);
      }
    };

    document.getElementById('ai-tally-switch-btn').onclick = async () => {
      // Copy to clipboard first
      try { await navigator.clipboard.writeText(chatText); } catch (_) {}
      
      // Save to history
      chrome.runtime.sendMessage({
        type: 'SAVE_CHAT',
        appKey: currentApp,
        chatText,
        title: document.title || `Chat from ${currentApp}`
      });
      
      // Open next app
      chrome.runtime.sendMessage({ type: 'OPEN_APP', appKey: nextApp.key, url: nextApp.url });
      overlay.remove();
    };
  }

  // Listen for messages from popup (e.g. "extract chat now")
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'EXTRACT_CHAT') {
      const chatText = extractChat();
      sendResponse({ chatText, appKey: currentApp });
    }
    if (message.type === 'GET_APP') {
      sendResponse({ appKey: currentApp });
    }
    return true;
  });

  // Start observing DOM for limit messages
  function startObserver() {
    observer = new MutationObserver(() => {
      checkForLimit();
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    checkForLimit();
  }

  // Boot
  function init() {
    setupSendDetection();
    startObserver();
    // Re-setup send detection after SPA navigation
    let lastUrl = location.href;
    new MutationObserver(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        limitDetected = false;
        overlayShown = false;
        setTimeout(() => { setupSendDetection(); checkForLimit(); }, 1500);
      }
    }).observe(document, { subtree: true, childList: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
