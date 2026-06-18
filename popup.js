// AI Tally — Popup UI (Vanilla JS, no framework needed for extension popup)

const AI_APPS_META = {
  claude:      { name:'Claude',      domain:'claude.ai',               url:'https://claude.ai/new',              color:'#d97706', emoji:'🤖' },
  chatgpt:     { name:'ChatGPT',     domain:'chatgpt.com',             url:'https://chatgpt.com/',               color:'#10b981', emoji:'💬' },
  gemini:      { name:'Gemini',      domain:'gemini.google.com',       url:'https://gemini.google.com/app',      color:'#4285f4', emoji:'✨' },
  notebooklm:  { name:'NotebookLM', domain:'notebooklm.google.com',   url:'https://notebooklm.google.com/',     color:'#8b5cf6', emoji:'📔' },
  perplexity:  { name:'Perplexity',  domain:'perplexity.ai',           url:'https://www.perplexity.ai/',         color:'#06b6d4', emoji:'🔍' },
  copilot:     { name:'Copilot',     domain:'copilot.microsoft.com',   url:'https://copilot.microsoft.com/',     color:'#0ea5e9', emoji:'🪁' },
};

const DAILY_LIMITS = {
  claude:10, chatgpt:40, gemini:60, notebooklm:50, perplexity:10, copilot:30
};

let state = { usage:{}, settings:{}, chatHistory:[], apps:{}, lastReset:'' };
let activeTab = 'tracker';
let currentAppKey = null;

// ── Messaging helpers ──────────────────────────────────────────────────────
function sendBg(type, data = {}) {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ type, ...data }, resolve);
  });
}

async function getActiveTabApp() {
  return new Promise(resolve => {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      if (!tabs[0]) return resolve(null);
      chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_APP' }, resp => {
        if (chrome.runtime.lastError) resolve(null);
        else resolve(resp?.appKey || null);
      });
    });
  });
}

async function extractChatFromTab() {
  return new Promise(resolve => {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      if (!tabs[0]) return resolve(null);
      chrome.tabs.sendMessage(tabs[0].id, { type: 'EXTRACT_CHAT' }, resp => {
        if (chrome.runtime.lastError) resolve(null);
        else resolve(resp);
      });
    });
  });
}

// ── Toast ──────────────────────────────────────────────────────────────────
function showToast(msg, color = '#34d399', borderColor = 'rgba(16,185,129,0.35)') {
  const old = document.querySelector('.toast');
  if (old) old.remove();
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  t.style.color = color;
  t.style.borderColor = borderColor;
  t.style.background = `${borderColor.replace('0.35', '0.12')}`;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}

// ── Render helpers ─────────────────────────────────────────────────────────
function barColor(pct) {
  if (pct >= 90) return '#ef4444';
  if (pct >= 70) return '#f59e0b';
  return '#10b981';
}

function timeAgo(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h/24)}d ago`;
}

// ── Build tracker tab ──────────────────────────────────────────────────────
function renderTracker() {
  const pane = document.getElementById('pane-tracker');
  const usage = state.usage || {};
  const appKeys = Object.keys(AI_APPS_META);

  // Summary strip
  const totalMsgs = appKeys.reduce((s, k) => s + (usage[k]?.count || 0), 0);
  const limitHits  = appKeys.filter(k => usage[k]?.limitHit).length;
  const available  = appKeys.filter(k => !usage[k]?.limitHit).length;

  // Switch prompt: if current app hit limit
  let switchPromptHTML = '';
  if (currentAppKey && usage[currentAppKey]?.limitHit) {
    const next = appKeys.find(k => k !== currentAppKey && !usage[k]?.limitHit);
    if (next) {
      const nm = AI_APPS_META[next];
      switchPromptHTML = `
        <div class="switch-prompt">
          <div class="switch-prompt-text">
            ⚡ <strong>${AI_APPS_META[currentAppKey]?.name}</strong> limit hit —
            switch to <strong>${nm.name}</strong> with your chat
          </div>
          <button class="switch-now-btn" id="quick-switch-btn" data-next="${next}">
            Switch →
          </button>
        </div>`;
    }
  }

  const cardsHTML = appKeys.map(key => {
    const meta = AI_APPS_META[key];
    const u = usage[key] || { count:0, limitHit:false };
    const limit = DAILY_LIMITS[key];
    const pct = Math.min(100, Math.round((u.count / limit) * 100));
    const isActive = key === currentAppKey;

    return `
      <div class="app-card ${u.limitHit ? 'limit-hit' : ''}">
        <div class="app-row">
          <div class="app-icon">${meta.emoji}</div>
          <div>
            <div class="app-name" style="color:${meta.color}">${meta.name} ${isActive ? '<span style="font-size:9px;color:rgba(148,163,184,0.5)">● active</span>' : ''}</div>
            <div class="app-domain">${meta.domain}</div>
          </div>
          <div class="app-badges">
            <span class="badge badge-cnt">${u.count}/${limit}</span>
            <span class="badge ${u.limitHit ? 'badge-warn' : 'badge-ok'}">${u.limitHit ? '⚠ Limit' : '✓ OK'}</span>
          </div>
        </div>
        <div class="app-progress">
          <div class="app-progress-label">
            <span>${pct}% used today</span>
            <span>${u.lastUsed ? timeAgo(u.lastUsed) : 'never used'}</span>
          </div>
          <div class="app-bar-track">
            <div class="app-bar" style="width:${pct}%; background:${barColor(pct)}"></div>
          </div>
        </div>
        <div class="app-actions">
          <button class="app-btn app-btn-open" data-open="${key}">🚀 Open</button>
          <button class="app-btn app-btn-export" data-export="${key}">📋 Copy Chat</button>
          <button class="app-btn app-btn-reset" data-reset="${key}" title="Reset count">↺</button>
        </div>
      </div>`;
  }).join('');

  pane.innerHTML = `
    <div class="summary-strip" style="padding:0 0 4px">
      <div class="summary-box">
        <div class="summary-val" style="color:#a78bfa">${totalMsgs}</div>
        <div class="summary-lbl">Messages Today</div>
      </div>
      <div class="summary-box">
        <div class="summary-val" style="color:#10b981">${available}</div>
        <div class="summary-lbl">Available Apps</div>
      </div>
      <div class="summary-box">
        <div class="summary-val" style="color:#ef4444">${limitHits}</div>
        <div class="summary-lbl">Limits Hit</div>
      </div>
    </div>
    ${switchPromptHTML}
    ${cardsHTML}`;

  // Wire up buttons
  pane.querySelectorAll('[data-open]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.open;
      chrome.tabs.create({ url: AI_APPS_META[key].url });
    });
  });

  pane.querySelectorAll('[data-export]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const key = btn.dataset.export;
      const resp = await extractChatFromTab();
      if (resp && resp.appKey === key && resp.chatText) {
        await navigator.clipboard.writeText(resp.chatText);
        await sendBg('SAVE_CHAT', { appKey: key, chatText: resp.chatText });
        showToast('✓ Chat copied & saved to history!');
        loadData();
      } else {
        // Fallback: open the app and note
        showToast('Open the app tab first, then click again', '#f59e0b', 'rgba(245,158,11,0.35)');
      }
    });
  });

  pane.querySelectorAll('[data-reset]').forEach(btn => {
    btn.addEventListener('click', async () => {
      await sendBg('RESET_APP', { appKey: btn.dataset.reset });
      await loadData();
      showToast('↺ Count reset');
    });
  });

  const quickSwitch = document.getElementById('quick-switch-btn');
  if (quickSwitch) {
    quickSwitch.addEventListener('click', async () => {
      const next = quickSwitch.dataset.next;
      const resp = await extractChatFromTab();
      if (resp?.chatText) {
        await navigator.clipboard.writeText(resp.chatText);
        await sendBg('SAVE_CHAT', { appKey: currentAppKey, chatText: resp.chatText });
      }
      chrome.tabs.create({ url: AI_APPS_META[next].url });
      showToast(`✓ Switching to ${AI_APPS_META[next].name}!`);
    });
  }
}

// ── Build history tab ──────────────────────────────────────────────────────
function renderHistory() {
  const pane = document.getElementById('pane-history');
  const history = state.chatHistory || [];

  if (history.length === 0) {
    pane.innerHTML = `
      <div class="empty">
        <div class="empty-icon">💬</div>
        <div class="empty-text">No chats saved yet.<br>Export a conversation using the Tracker tab.</div>
      </div>`;
    return;
  }

  pane.innerHTML = history.map(chat => {
    const meta = AI_APPS_META[chat.fromApp] || { name: chat.fromApp, color:'#888', emoji:'🤖' };
    const date = new Date(chat.timestamp);
    const dateStr = date.toLocaleDateString('en-IN', { day:'numeric', month:'short' });
    return `
      <div class="chat-item">
        <div class="chat-item-header">
          <span class="chat-from" style="background:${meta.color}22;color:${meta.color};border:1px solid ${meta.color}44">
            ${meta.emoji} ${meta.name}
          </span>
          <span class="chat-time">${dateStr}</span>
        </div>
        <div class="chat-title">${chat.title}</div>
        <div class="chat-preview">${chat.content.slice(0, 120)}...</div>
        <div class="chat-footer">
          <span class="chat-words">~${chat.wordCount} words</span>
          <button class="chat-copy" data-copy="${chat.id}">📋 Copy</button>
          <button class="chat-delete" data-del="${chat.id}">✕</button>
        </div>
      </div>`;
  }).join('');

  pane.querySelectorAll('[data-copy]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = parseInt(btn.dataset.copy);
      const chat = history.find(c => c.id === id);
      if (chat) {
        await navigator.clipboard.writeText(chat.content);
        showToast('✓ Chat copied to clipboard!');
      }
    });
  });

  pane.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', async () => {
      await sendBg('DELETE_CHAT', { chatId: parseInt(btn.dataset.del) });
      await loadData();
      showToast('Deleted', '#f87171', 'rgba(239,68,68,0.3)');
    });
  });
}

// ── Build settings tab ─────────────────────────────────────────────────────
function renderSettings() {
  const pane = document.getElementById('pane-settings');
  const s = state.settings || {};

  pane.innerHTML = `
    <div class="settings-section">
      <div class="settings-label">Auto-Detection</div>
      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-name">Detect usage limits</div>
          <div class="setting-desc">Auto-detects when you hit a rate limit on any AI site</div>
        </div>
        <button class="toggle ${s.autoDetect ? 'on' : ''}" data-toggle="autoDetect"></button>
      </div>
      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-name">Desktop notifications</div>
          <div class="setting-desc">Get notified when a limit is detected</div>
        </div>
        <button class="toggle ${s.notifications ? 'on' : ''}" data-toggle="notifications"></button>
      </div>
    </div>

    <div class="settings-section">
      <div class="settings-label">Switch Priority Order</div>
      <div style="font-size:11px;color:rgba(148,163,184,0.4);margin-bottom:8px;line-height:1.5">
        When you hit a limit, AI Tally will suggest the first available app from this list.
      </div>
      ${(s.switchOrder || Object.keys(AI_APPS_META)).map((key, i) => {
        const m = AI_APPS_META[key];
        return `
          <div class="setting-row" style="margin-bottom:5px">
            <div class="app-icon" style="font-size:14px;width:22px;margin-right:4px">${m?.emoji}</div>
            <div class="setting-info">
              <div class="setting-name">${i+1}. ${m?.name}</div>
            </div>
            <div style="display:flex;gap:4px">
              ${i > 0 ? `<button class="app-btn app-btn-export" style="padding:4px 8px;font-size:12px" data-move-up="${i}">↑</button>` : '<div style="width:28px"></div>'}
              ${i < (s.switchOrder?.length||0)-1 ? `<button class="app-btn app-btn-export" style="padding:4px 8px;font-size:12px" data-move-dn="${i}">↓</button>` : '<div style="width:28px"></div>'}
            </div>
          </div>`;
      }).join('')}
    </div>

    <div class="settings-section">
      <div class="settings-label">Daily Limits (editable)</div>
      ${Object.keys(AI_APPS_META).map(key => {
        const m = AI_APPS_META[key];
        return `
          <div class="setting-row">
            <div class="setting-info">
              <div class="setting-name">${m.emoji} ${m.name}</div>
            </div>
            <input type="number" min="1" max="200" value="${DAILY_LIMITS[key]}"
              style="width:60px;text-align:center;margin:0"
              data-limit-key="${key}">
          </div>`;
      }).join('')}
    </div>

    <div class="settings-section">
      <div class="settings-label">Data</div>
      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-name">Reset all counts</div>
          <div class="setting-desc">Clears usage for all apps today</div>
        </div>
        <button class="app-btn app-btn-reset" style="flex:0;padding:7px 14px" id="reset-all-btn">Reset All</button>
      </div>
    </div>`;

  // Toggle handlers
  pane.querySelectorAll('[data-toggle]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const key = btn.dataset.toggle;
      const cur = state.settings[key];
      btn.classList.toggle('on', !cur);
      state.settings[key] = !cur;
      await sendBg('UPDATE_SETTINGS', { settings: { [key]: !cur } });
    });
  });

  // Move up/down in switch order
  pane.querySelectorAll('[data-move-up]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const i = parseInt(btn.dataset.moveUp);
      const order = [...(state.settings.switchOrder || Object.keys(AI_APPS_META))];
      [order[i-1], order[i]] = [order[i], order[i-1]];
      state.settings.switchOrder = order;
      await sendBg('UPDATE_SETTINGS', { settings: { switchOrder: order } });
      renderSettings();
    });
  });
  pane.querySelectorAll('[data-move-dn]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const i = parseInt(btn.dataset.moveDn);
      const order = [...(state.settings.switchOrder || Object.keys(AI_APPS_META))];
      [order[i], order[i+1]] = [order[i+1], order[i]];
      state.settings.switchOrder = order;
      await sendBg('UPDATE_SETTINGS', { settings: { switchOrder: order } });
      renderSettings();
    });
  });

  // Reset all
  document.getElementById('reset-all-btn')?.addEventListener('click', async () => {
    await sendBg('RESET_ALL');
    await loadData();
    showToast('↺ All counts reset');
  });
}

// ── Tab switching ──────────────────────────────────────────────────────────
function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  document.querySelectorAll('.pane').forEach(p => p.classList.toggle('hidden', p.id !== `pane-${tab}`));
  if (tab === 'tracker')  renderTracker();
  if (tab === 'history')  renderHistory();
  if (tab === 'settings') renderSettings();
}

// ── Load data and render ───────────────────────────────────────────────────
async function loadData() {
  const data = await sendBg('GET_USAGE');
  state.usage       = data.usage || {};
  state.settings    = data.settings || {};
  state.chatHistory = data.chatHistory || [];
  state.apps        = data.apps || {};
  state.lastReset   = data.lastReset || '';

  currentAppKey = await getActiveTabApp();

  if (activeTab === 'tracker')  renderTracker();
  if (activeTab === 'history')  renderHistory();
  if (activeTab === 'settings') renderSettings();
}

// ── Build skeleton HTML ────────────────────────────────────────────────────
function buildSkeleton() {
  document.getElementById('root').innerHTML = `
    <div class="header">
      <div class="header-logo">⚡</div>
      <div>
        <div class="header-title">AI Tally</div>
        <div class="header-sub">Switch AI chats seamlessly</div>
      </div>
      <button class="header-reset" id="header-reset" title="Reset all counts">↺</button>
    </div>
    <div class="tabs">
      <button class="tab active" data-tab="tracker">📊 Tracker</button>
      <button class="tab" data-tab="history">💬 History</button>
      <button class="tab" data-tab="settings">⚙️ Settings</button>
    </div>
    <div class="pane" id="pane-tracker"></div>
    <div class="pane hidden" id="pane-history"></div>
    <div class="pane hidden" id="pane-settings"></div>`;

  document.querySelectorAll('.tab').forEach(t => {
    t.addEventListener('click', () => switchTab(t.dataset.tab));
  });

  document.getElementById('header-reset').addEventListener('click', async () => {
    await sendBg('RESET_ALL');
    await loadData();
    showToast('↺ All counts reset');
  });
}

// ── Boot ───────────────────────────────────────────────────────────────────
buildSkeleton();
loadData();

// Auto-refresh every 30s
setInterval(loadData, 30000);
