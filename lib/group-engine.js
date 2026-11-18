import { getCategory, isGroupable } from './core.js';

const NONE = -1;

/**
 * Group duplicate sites only, per window. Never modify tabs already in unmanaged groups.
 * The caller supplies a Chrome-like API and a per-window managed-group registry.
 */
export async function reconcileWindow(api, windowId, rules, registry = {}) {
  const [tabs, allGroups] = await Promise.all([
    api.tabs.query({ windowId }),
    api.tabGroups.query({ windowId }),
  ]);
  const groupIds = new Set(allGroups.map((g) => g.id));
  const next = { ...registry };
  const grouped = new Map();
  const free = new Map();
  for (const tab of tabs) {
    if (!isGroupable(tab)) continue;
    const category = getCategory(tab.url, rules);
    if (!category) continue;
    if (!grouped.has(category.key)) grouped.set(category.key, { category, tabIds: [] });
    if (tab.groupId === NONE || tab.groupId === undefined) {
      if (!free.has(category.key)) free.set(category.key, []);
      free.get(category.key).push(tab.id);
    } else {
      grouped.get(category.key).tabIds.push(tab.id);
    }
  }

  let groupsCreated = 0;
  let tabsAdded = 0;
  for (const [key, ids] of free) {
    const category = grouped.get(key).category;
    let groupId = next[key];
    if (!groupIds.has(groupId)) groupId = undefined;
    if (groupId !== undefined) {
      // If the user repurposed the group for another site, don't add to it.
      const currentMembers = tabs.filter((t) => t.groupId === groupId);
      if (currentMembers.some((t) => getCategory(t.url, rules)?.key !== key)) groupId = undefined;
    }

    if (groupId === undefined) {
      // Recover our previously created groups after browser restart, without moving
      // any tab out of a different group. An exact title and single-category members
      // are required. A manually created identical group might also be adopted.
      const candidate = allGroups.find((g) => g.title === category.title &&
        tabs.some((t) => t.groupId === g.id && getCategory(t.url, rules)?.key === key) &&
        tabs.filter((t) => t.groupId === g.id).every((t) => getCategory(t.url, rules)?.key === key));
      if (candidate) groupId = candidate.id;
    }

    if (groupId !== undefined) {
      await api.tabs.group({ groupId, tabIds: ids });
      next[key] = groupId;
      tabsAdded += ids.length;
    } else if (ids.length >= 2) {
      groupId = await api.tabs.group({ tabIds: ids });
      await api.tabGroups.update(groupId, { title: category.title, color: category.color });
      next[key] = groupId;
      groupsCreated += 1;
      tabsAdded += ids.length;
    }
  }

  for (const [key, id] of Object.entries(next)) {
    if (!groupIds.has(id) && ![...free].some(([k, ids]) => k === key && ids.length >= 2)) {
      // A newly-created group won't appear in allGroups; preserve its id if it
      // was created during this run. Existing stale ids can be safely discarded.
      if (registry[key] === id) delete next[key];
    }
  }
  return { managed: next, groupsCreated, tabsAdded };
}
