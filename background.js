import { DEFAULT_RULES, getCategory, sanitizeRules } from './lib/core.js';
import { reconcileWindow } from './lib/group-engine.js';

const jobs = new Map();
const SESSION_PREFIX = 'managed-window-';
// Tabs the user took out of a group: { [tabId]: siteKey }. Session-scoped, like tab IDs.
const RELEASED_KEY = 'releasedTabs';
const LOCK = 'domain-dock-focus';

async function releasedTabs() {
  return (await chrome.storage.session.get(RELEASED_KEY))[RELEASED_KEY] || {};
}

async function updateReleased(change) {
  await navigator.locks.request(LOCK, async () => {
    const current = await releasedTabs();
    change(current);
    await chrome.storage.session.set({ [RELEASED_KEY]: current });
  });
}

async function settings() {
  const state = await chrome.storage.local.get(['autoGroup', 'rules']);
  return {
    autoGroup: state.autoGroup !== false,
    rules: sanitizeRules(state.rules ?? DEFAULT_RULES),
  };
}

async function processWindow(windowId, rules) {
  if (!Number.isInteger(windowId) || windowId < 0) return { groupsCreated: 0, tabsAdded: 0 };
  const sessionKey = `${SESSION_PREFIX}${windowId}`;
  const { [sessionKey]: old = {} } = await chrome.storage.session.get(sessionKey);
  const outcome = await reconcileWindow(chrome, windowId, rules, old, await releasedTabs());
  await chrome.storage.session.set({ [sessionKey]: outcome.managed });
  return outcome;
}

function enqueueWindow(windowId, rules) {
  const prev = jobs.get(windowId) || Promise.resolve();
  const task = prev.catch(() => {}).then(() => navigator.locks.request(LOCK, () => processWindow(windowId, rules)));
  jobs.set(windowId, task);
  task.finally(() => { if (jobs.get(windowId) === task) jobs.delete(windowId); }).catch(() => {});
  return task;
}

async function groupAll() {
  const { rules } = await settings();
  const windows = await chrome.windows.getAll({ windowTypes: ['normal'] });
  let created = 0;
  let added = 0;
  for (const window of windows) {
    if (window.incognito) continue;
    const result = await enqueueWindow(window.id, rules);
    created += result.groupsCreated;
    added += result.tabsAdded;
  }
  return { groupsCreated: created, tabsAdded: added };
}

function autoProcess(windowId) {
  settings().then((current) => {
    if (current.autoGroup) return enqueueWindow(windowId, current.rules);
  }).catch((error) => console.warn('DomainDock grouping skipped:', error?.message || 'Unknown error'));
}

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.storage.local.set({ autoGroup: true, rules: DEFAULT_RULES, annotations: {} })
      .then(groupAll)
      .catch((error) => console.warn('DomainDock setup:', error?.message));
  }
});
chrome.runtime.onStartup.addListener(() => {
  settings().then((s) => { if (s.autoGroup) return groupAll(); }).catch(console.warn);
});
chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
  if (tab.incognito) return;
  if (change.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE) {
    // The tab left a group (dragged out, ungrouped, or moved). Respect that choice.
    settings().then(({ rules }) => {
      const key = getCategory(tab.url, rules)?.key;
      if (key) return updateReleased((map) => { map[tabId] = key; });
    }).catch((error) => console.warn('DomainDock release tracking:', error?.message));
  }
  if (change.url || change.status === 'complete') autoProcess(tab.windowId);
});
chrome.tabs.onRemoved.addListener((tabId) => {
  updateReleased((map) => { delete map[tabId]; }).catch(() => {});
});
chrome.tabs.onAttached.addListener((_id, data) => autoProcess(data.newWindowId));
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.autoGroup?.newValue === true || changes.rules) {
    settings().then((s) => { if (s.autoGroup) return groupAll(); }).catch(console.warn);
  }
});
chrome.runtime.onMessage.addListener((message, _sender, reply) => {
  if (message?.type !== 'GROUP_NOW') return false;
  // An explicit "Group now" includes tabs the user previously took out of groups.
  chrome.storage.session.remove(RELEASED_KEY).then(groupAll).then((result) => reply({ ok: true, ...result }))
    .catch((error) => reply({ ok: false, error: error?.message || 'Unable to group tabs.' }));
  return true;
});
