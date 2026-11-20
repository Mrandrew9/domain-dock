import test from 'node:test';
import assert from 'node:assert/strict';

// Minimal Chrome mock: enough to load background.js and drive its listeners.
const listeners = {};
const on = (name) => ({ addListener(fn) { listeners[name] = fn; } });
const store = { local: { autoGroup: true }, session: {} };
const area = (name) => ({
  async get(keys) {
    const list = Array.isArray(keys) ? keys : [keys];
    return Object.fromEntries(list.filter(k => k in store[name]).map(k => [k, structuredClone(store[name][k])]));
  },
  async set(values) { Object.assign(store[name], structuredClone(values)); },
  async remove(key) { delete store[name][key]; },
});
const tabs = [
  { id: 1, windowId: 1, url: 'https://github.com/a', groupId: 7, pinned: false, incognito: false },
  { id: 2, windowId: 1, url: 'https://github.com/b', groupId: 7, pinned: false, incognito: false },
  { id: 3, windowId: 1, url: 'https://github.com/c', groupId: -1, pinned: false, incognito: false },
];
const grouped = [];
globalThis.chrome = {
  storage: { local: area('local'), session: area('session'), onChanged: on('storage.onChanged') },
  runtime: { onInstalled: on('onInstalled'), onStartup: on('onStartup'), onMessage: on('onMessage') },
  tabs: {
    onUpdated: on('tabs.onUpdated'), onAttached: on('tabs.onAttached'), onRemoved: on('tabs.onRemoved'),
    async query() { return tabs; },
    async group({ groupId, tabIds }) { grouped.push({ groupId, tabIds }); for (const id of tabIds) tabs.find(t => t.id === id).groupId = groupId; return groupId; },
  },
  tabGroups: { TAB_GROUP_ID_NONE: -1, async query() { return [{ id: 7, title: 'Github', windowId: 1 }]; }, async update() {} },
  windows: { async getAll() { return [{ id: 1, incognito: false }]; } },
};
if (!globalThis.navigator?.locks) {
  Object.defineProperty(globalThis, 'navigator', { value: { locks: { request: async (_name, fn) => fn() } }, configurable: true });
}
store.session['managed-window-1'] = { 'site:github.com': 7 };
await import('../background.js');
const settle = () => new Promise(resolve => setTimeout(resolve, 20));

test('a tab dragged out of a group is remembered and not regrouped on page load', async () => {
  listeners['tabs.onUpdated'](3, { groupId: -1 }, tabs[2]);
  await settle();
  assert.deepEqual(store.session.releasedTabs, { 3: 'site:github.com' });
  listeners['tabs.onUpdated'](1, { status: 'complete' }, tabs[0]);
  await settle();
  assert.equal(grouped.length, 0);
  assert.equal(tabs[2].groupId, -1);
});

test('"Group now" clears released tabs and groups them again', async () => {
  const reply = await new Promise(resolve => listeners.onMessage({ type: 'GROUP_NOW' }, {}, resolve));
  assert.equal(reply.ok, true);
  assert.equal(store.session.releasedTabs, undefined);
  assert.deepEqual(grouped, [{ groupId: 7, tabIds: [3] }]);
});

test('closing a tab forgets its release record', async () => {
  listeners['tabs.onUpdated'](3, { groupId: -1 }, { ...tabs[2], groupId: -1 });
  await settle();
  assert.ok(store.session.releasedTabs[3]);
  listeners['tabs.onRemoved'](3);
  await settle();
  assert.deepEqual(store.session.releasedTabs, {});
});
