/**
 * Safe, exact-URL duplicate detection.
 *
 * A duplicate is the same fully normalized HTTP(S) URL, including query string
 * and fragment. We intentionally do not use canonicalPageKey() here: that
 * function strips tracking/auth parameters and rewrites Amazon product URLs
 * for label reuse; those transformations are too broad for closing tabs.
 *
 * No tab is ever closed by detection. Closure requires an explicit selection,
 * a user confirmation in the popup, and a fresh Chrome tab-state validation.
 */

export function duplicatePageKey(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl) return null;
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    // Avoid treating URLs containing embedded credentials as cleanup targets.
    if (url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

function isNavigating(tab) {
  return Boolean(tab.pendingUrl && tab.pendingUrl !== tab.url);
}

export function isClosableDuplicate(tab) {
  return Boolean(tab && Number.isInteger(tab.id) && Number.isInteger(tab.windowId) &&
    !tab.incognito && !tab.active && !tab.pinned && !tab.audible &&
    !tab.highlighted && !isNavigating(tab) && duplicatePageKey(tab.url));
}

function isCandidate(tab) {
  return Boolean(tab && Number.isInteger(tab.id) && Number.isInteger(tab.windowId) &&
    !tab.incognito && !isNavigating(tab) && duplicatePageKey(tab.url));
}

function keepScore(tab) {
  // Preserve tabs most likely to contain an active or important session.
  return Number(Boolean(tab.active)) * 32 +
    Number(Boolean(tab.pinned)) * 16 +
    Number(Boolean(tab.audible)) * 8 +
    Number(Boolean(tab.highlighted)) * 4 +
    Number(Number.isInteger(tab.groupId) && tab.groupId >= 0) * 2;
}

export function findDuplicateGroups(tabs) {
  const byKey = new Map();
  for (const tab of Array.isArray(tabs) ? tabs : []) {
    if (!isCandidate(tab)) continue;
    const key = duplicatePageKey(tab.url);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(tab);
  }
  const result = [];
  for (const [key, entries] of byKey) {
    if (entries.length < 2) continue;
    entries.sort((a, b) => keepScore(b) - keepScore(a) ||
      a.windowId - b.windowId || (a.index ?? 0) - (b.index ?? 0) || a.id - b.id);
    result.push({
      key,
      keepId: entries[0].id,
      tabs: entries,
      closableIds: entries.slice(1).filter(isClosableDuplicate).map((tab) => tab.id),
    });
  }
  return result.sort((a, b) => b.tabs.length - a.tabs.length || a.key.localeCompare(b.key));
}

export function suggestedDuplicateIds(groups) {
  // Keep at least one tab per window, even if identical pages are open in
  // separate windows. Only unprotected extras are suggested for bulk closure.
  const suggested = [];
  for (const group of groups) {
    const byWindow = new Map();
    for (const tab of group.tabs) {
      if (!byWindow.has(tab.windowId)) byWindow.set(tab.windowId, []);
      byWindow.get(tab.windowId).push(tab);
    }
    for (const entries of byWindow.values()) {
      if (entries.length < 2) continue;
      // group.tabs is already sorted by keeper preference.
      for (const tab of entries.slice(1)) {
        if (group.closableIds.includes(tab.id)) suggested.push(tab.id);
      }
    }
  }
  return suggested;
}

/**
 * Called only after the user confirms selected tab IDs in the popup.
 * Refuses all selected closures if any target, original keeper, or URL has
 * changed. Never closes an active, pinned, audible, or highlighted tab.
 */
export async function closeReviewedDuplicates(api, inspectedTabs, selectedTabIds) {
  const requested = [...new Set(selectedTabIds)];
  if (!requested.length) return 0;
  if (!requested.every(Number.isInteger)) throw new Error('Invalid tab selection. Scan again.');

  const oldGroups = findDuplicateGroups(inspectedTabs);
  const oldById = new Map();
  for (const group of oldGroups) {
    for (const tab of group.tabs) oldById.set(tab.id, { tab, group });
  }
  for (const id of requested) {
    const original = oldById.get(id);
    if (!original || !original.group.closableIds.includes(id)) {
      throw new Error('Selection is no longer safe. Scan again.');
    }
  }

  const freshTabs = await api.tabs.query({});
  const freshById = new Map(freshTabs.map((tab) => [tab.id, tab]));
  const freshGroups = new Map(findDuplicateGroups(freshTabs).map((group) => [group.key, group]));

  for (const id of requested) {
    const { tab: original, group: oldGroup } = oldById.get(id);
    const current = freshById.get(id);
    const keeper = freshById.get(oldGroup.keepId);
    const matched = freshGroups.get(oldGroup.key);
    if (!current || !keeper || !matched ||
        !isClosableDuplicate(current) ||
        duplicatePageKey(original.url) !== duplicatePageKey(current.url) ||
        current.windowId !== original.windowId ||
        duplicatePageKey(keeper.url) !== oldGroup.key ||
        keeper.windowId !== oldGroup.tabs.find((tab) => tab.id === oldGroup.keepId).windowId ||
        !matched.tabs.some((tab) => tab.id === id) ||
        !matched.tabs.some((tab) => tab.id === oldGroup.keepId) ||
        requested.includes(oldGroup.keepId)) {
      throw new Error('Tabs changed since review. Refresh duplicates and select again.');
    }
  }

  // Each reviewed group must retain its specifically chosen keeper.
  await api.tabs.remove(requested);
  return requested.length;
}
