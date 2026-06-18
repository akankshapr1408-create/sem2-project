// AI Tally - Background Service Worker
// Handles: usage tracking, limit detection alerts, storage management

const AI_APPS = {
  claude: {
    name: 'Claude',
    domain: 'claude.ai',
    url: 'https://claude.ai/new',
    color: '#d97706',
    emoji: '🤖',
    dailyLimit: 40,
    limitPhrases: [
      "you've reached your limit",
      "usage limit",
      "message limit",
      "upgrade to continue",
      "you're out of messages",
      "limit reached"
    ]
  },
  chatgpt: {
    name: 'ChatGPT',
    domain: 'chatgpt.com',
    url: 'https://chatgpt.com/',
    color: '#10b981',
    emoji: '💬',
    dailyLimit: 40,
    limitPhrases: [
      "you've reached the limit",
      "gpt-4 limit",
      "upgrade to plus",
      "message limit reached",
      "too many messages",
      "you've hit your message cap"
    ]
  },
  gemini: {
    name: 'Gemini',
    domain: 'gemini.google.com',
    url: 'https://gemini.google.com/app',
    color: '#4285f4',
    emoji: '✨',
    dailyLimit: 60,
    limitPhrases: [
      "gemini advanced",
      "rate limit",
      "try again later",
      "you've reached your daily limit"
    ]
  },
  notebooklm: {
    name: 'NotebookLM',
    domain: 'notebooklm.google.com',
    url: 'https://notebooklm.google.com/',
    color: '#8b5cf6',
    emoji: '📔',
    dailyLimit: 50,
    limitPhrases: [
      "limit reached",
      "upgrade",
      "quota exceeded"
    ]
  },
  perplexity: {
    name: 'Perplexity',
    domain: 'perplexity.ai',
    url: 'https://www.perplexity.ai/',
    color: '#06b6d4',
    emoji: '🔍',
    dailyLimit: 10,
    limitPhrases: [
      "pro searches",
      "limit reached",
      "upgrade to pro"
    ]
  },
  copilot: {
    name: 'Copilot',
    domain: 'copilot.microsoft.com',
    url: 'https://copilot.microsoft.com/',
    color: '#0ea5e9',
    emoji: '🪁',
    dailyLimit: 30,
    limitPhrases: [
      "limit reached",
      "boost",
      "daily limit"
    ]
  }
};

// Initialize storage with default values
async function initStorage() {
  const data = await chrome.storage.local.get(['usage', 'lastReset', 'settings', 'chatHistory']);
  
  if (!data.usage) {
    const defaultUsage = {};
    Object.keys(AI_APPS).forEach(key => {
      defaultUsage[key] = { count: 0, limitHit: false, lastUsed: null };
    });
    await chrome.storage.local.set({ usage: defaultUsage });
  }

  if (!data.lastReset) {
    await chrome.storage.local.set({ lastReset: new Date().toDateString() });
  }

  if (!data.settings) {
    await chrome.storage.local.set({
      settings: {
        autoDetect: true,
        notifications: true,
        switchOrder: ['chatgpt', 'gemini', 'perplexity', 'copilot', 'claude', 'notebooklm']
      }
    });
  }

  if (!data.chatHistory) {
    await chrome.storage.local.set({ chatHistory: [] });
  }
}

// Reset daily usage counts
async function checkDailyReset() {
  const data = await chrome.storage.local.get(['lastReset', 'usage']);
  const today = new Date().toDateString();
  
  if (data.lastReset !== today) {
    const resetUsage = {};
    const currentUsage = data.usage || {};
    
    Object.keys(AI_APPS).forEach(key => {
      resetUsage[key] = { 
        count: 0, 
        limitHit: false, 
        lastUsed: currentUsage[key]?.lastUsed || null 
      };
    });
    
    await chrome.storage.local.set({ usage: resetUsage, lastReset: today });
    console.log('[AI Tally] Daily usage reset');
  }
}

// Increment message count for an app
async function incrementUsage(appKey) {
  await checkDailyReset();
  const data = await chrome.storage.local.get('usage');
  const usage = data.usage || {};
  
  if (!usage[appKey]) {
    usage[appKey] = { count: 0, limitHit: false, lastUsed: null };
  }
  
  usage[appKey].count += 1;
  usage[appKey].lastUsed = new Date().toISOString();
  
  const app = AI_APPS[appKey];
  if (usage[appKey].count >= app.dailyLimit) {
    usage[appKey].limitHit = true;
  }
  
  await chrome.storage.local.set({ usage });
  return usage[appKey];
}

// Mark app as limit-hit
async function markLimitHit(appKey) {
  const data = await chrome.storage.local.get('usage');
  const usage = data.usage || {};
  
  if (!usage[appKey]) usage[appKey] = { count: 0, limitHit: false };
  usage[appKey].limitHit = true;
  
  await chrome.storage.local.set({ usage });

  // Send notification
  const settings = (await chrome.storage.local.get('settings')).settings;
  if (settings?.notifications) {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: `AI Tally — ${AI_APPS[appKey]?.name} limit reached`,
      message: 'Click to switch to your next available AI instantly.',
      priority: 2
    });
  }
}

// Save exported chat to history
async function saveChatExport(appKey, chatText, title) {
  const data = await chrome.storage.local.get('chatHistory');
  const history = data.chatHistory || [];
  
  const entry = {
    id: Date.now(),
    fromApp: appKey,
    title: title || `Chat from ${AI_APPS[appKey]?.name}`,
    content: chatText,
    timestamp: new Date().toISOString(),
    wordCount: chatText.split(' ').length
  };
  
  history.unshift(entry);
  // Keep last 20 chats only
  if (history.length > 20) history.pop();
  
  await chrome.storage.local.set({ chatHistory: history });
  return entry;
}

// Get next available app to switch to
async function getNextAvailableApp(currentAppKey) {
  const data = await chrome.storage.local.get(['usage', 'settings']);
  const usage = data.usage || {};
  const switchOrder = data.settings?.switchOrder || Object.keys(AI_APPS);
  
  for (const appKey of switchOrder) {
    if (appKey !== currentAppKey && !usage[appKey]?.limitHit) {
      return { key: appKey, ...AI_APPS[appKey] };
    }
  }
  return null;
}

// Listen for messages from content scripts and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    switch (message.type) {
      case 'INCREMENT_USAGE':
        const usageData = await incrementUsage(message.appKey);
        sendResponse({ success: true, usage: usageData });
        break;

      case 'LIMIT_HIT':
        await markLimitHit(message.appKey);
        const nextApp = await getNextAvailableApp(message.appKey);
        sendResponse({ success: true, nextApp });
        break;

      case 'GET_USAGE':
        await checkDailyReset();
        const allData = await chrome.storage.local.get(['usage', 'settings', 'chatHistory', 'lastReset']);
        sendResponse({ ...allData, apps: AI_APPS });
        break;

      case 'SAVE_CHAT':
        const saved = await saveChatExport(message.appKey, message.chatText, message.title);
        sendResponse({ success: true, entry: saved });
        break;

      case 'OPEN_APP':
        const app = AI_APPS[message.appKey];
        if (app) {
          chrome.tabs.create({ url: message.url || app.url });
        }
        sendResponse({ success: true });
        break;

      case 'RESET_APP':
        const resetData = await chrome.storage.local.get('usage');
        const resetUsage = resetData.usage || {};
        if (resetUsage[message.appKey]) {
          resetUsage[message.appKey] = { count: 0, limitHit: false, lastUsed: null };
          await chrome.storage.local.set({ usage: resetUsage });
        }
        sendResponse({ success: true });
        break;

      case 'RESET_ALL':
        const freshUsage = {};
        Object.keys(AI_APPS).forEach(key => {
          freshUsage[key] = { count: 0, limitHit: false, lastUsed: null };
        });
        await chrome.storage.local.set({ usage: freshUsage, lastReset: new Date().toDateString() });
        sendResponse({ success: true });
        break;

      case 'UPDATE_SETTINGS':
        const currentSettings = (await chrome.storage.local.get('settings')).settings || {};
        await chrome.storage.local.set({ settings: { ...currentSettings, ...message.settings } });
        sendResponse({ success: true });
        break;

      case 'DELETE_CHAT':
        const chatData = await chrome.storage.local.get('chatHistory');
        const filtered = (chatData.chatHistory || []).filter(c => c.id !== message.chatId);
        await chrome.storage.local.set({ chatHistory: filtered });
        sendResponse({ success: true });
        break;

      default:
        sendResponse({ error: 'Unknown message type' });
    }
  })();
  return true; // Keep channel open for async
});

// Set up daily reset alarm
chrome.alarms.create('dailyReset', { periodInMinutes: 60 });
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'dailyReset') await checkDailyReset();
});

// Init on install / startup
chrome.runtime.onInstalled.addListener(initStorage);
chrome.runtime.onStartup.addListener(async () => {
  await initStorage();
  await checkDailyReset();
});

initStorage();
