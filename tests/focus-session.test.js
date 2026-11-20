import test from 'node:test';
import assert from 'node:assert/strict';

// In-memory Chrome mock covering the calls made by lib/focus-session.js.
function browser(initialTabs, groups = []) {
  const state = { tabs: structuredClone(initialTabs), groups: structuredClone(groups), windows: new Set(initialTabs.map(t => t.windowId)), session: {}, nextWindow: 50, nextGroup: 500 };
  const reindex = () => {
    for (const w of state.windows) state.tabs.filter(t => t.windowId === w).sort((a, b) => a.index - b.index).forEach((t, i) => { t.index = i; });
  };
  const moveTo = (tab, windowId, index = 999) => {
    if (tab.windowId !== windowId) tab.groupId = -1; // Chrome drops the group on cross-window moves.
    tab.windowId = windowId; tab.index = index - 0.5; reindex();
  };
  globalThis.chrome = {
    runtime: { getURL: p => `chrome-extension://id/${p}` },
    storage: { session: {
      async get(k) { return k in state.session ? { [k]: structuredClone(state.session[k]) } : {}; },
      async set(v) { Object.assign(state.session, structuredClone(v)); },
      async remove(k) { delete state.session[k]; },
    } },
    windows: {
      async create({ tabId }) {
        const id = state.nextWindow++; state.windows.add(id);
        if (tabId !== undefined) moveTo(state.tabs.find(t => t.id === tabId), id, 0);
        else state.tabs.push({ id: 900 + id, windowId: id, index: 0, url: 'chrome-extension://id/focus.html', pinned: false, groupId: -1 });
        return { id };
      },
      async getAll() { return [...state.windows].map(id => ({ id })); },
      async update() {},
    },
    tabs: {
      async get(id) { return structuredClone(state.tabs.find(t => t.id === id)); },
      async query() { return structuredClone(state.tabs); },
      async move(id, { windowId, index }) { moveTo(state.tabs.find(t => t.id === id), windowId, index); },
      async update(id, props) { Object.assign(state.tabs.find(t => t.id === id), props); },
      async group({ tabIds, groupId, createProperties }) {
        const ids = [].concat(tabIds);
        let id = groupId;
        let windowId = createProperties?.windowId;
        if (id === undefined) {
          windowId ??= state.tabs.find(t => t.id === ids[0]).windowId;
          id = state.nextGroup++; state.groups.push({ id, windowId, title: '', color: 'grey' });
        } else windowId = state.groups.find(g => g.id === id).windowId;
        for (const tabId of ids) { const t = state.tabs.find(x => x.id === tabId); moveTo(t, windowId); t.groupId = id; t.pinned = false; }
        return id;
      },
    },
    tabGroups: {
      async get(id) { const g = state.groups.find(x => x.id === id); if (!g) throw new Error('No group'); return structuredClone(g); },
      async update(id, v) { Object.assign(state.groups.find(g => g.id === id), v); },
    },
  };
  return state;
}
const { start, end } = await import('../lib/focus-session.js');
const tab = (id, windowId, index, extra = {}) => ({ id, windowId, index, url: `https://example.com/${id}`, pinned: false, groupId: -1, ...extra });
const select = (state, ids) => new Map(ids.map(id => [id, structuredClone(state.tabs.find(t => t.id === id))]));

test('focus session moves the selection to a new window and returns it to the original places', async () => {
  const state = browser([
    tab(1, 1, 0), tab(2, 1, 1, { groupId: 10 }), tab(3, 2, 0, { pinned: true }), tab(4, 1, 2),
  ], [{ id: 10, windowId: 1, title: 'Docs', color: 'blue' }]);
  const msg = await start(true, { id: 1 }, select(state, [1, 2, 3]), 'INC-1');
  assert.equal(msg, 'Grouped 3 tabs.');
  const focusWindow = state.session.focusSession.windowId;
  assert.deepEqual(state.tabs.filter(t => [1, 2, 3].includes(t.id)).map(t => t.windowId), [focusWindow, focusWindow, focusWindow]);
  await assert.rejects(start(true, { id: 1 }, select(state, [4]), 'Other'), /End the existing focus session/);

  assert.equal(await end(true), 'Session tabs returned.');
  const byId = id => state.tabs.find(t => t.id === id);
  assert.equal(byId(1).windowId, 1);
  assert.equal(byId(2).windowId, 1);
  assert.equal(byId(3).windowId, 2);
  assert.equal(byId(3).pinned, true);
  const regrouped = state.groups.find(g => g.id === byId(2).groupId);
  assert.deepEqual([regrouped.title, regrouped.color, regrouped.windowId], ['Docs', 'blue', 1]);
  assert.equal(state.session.focusSession, undefined);
});

test('returning tabs whose original window closed creates a replacement window', async () => {
  const state = browser([tab(1, 1, 0), tab(2, 1, 1), tab(5, 3, 0)]);
  await start(true, { id: 3 }, select(state, [1, 2]), 'Topic');
  state.windows.delete(1);
  await end(true);
  const [a, b] = [1, 2].map(id => state.tabs.find(t => t.id === id));
  assert.notEqual(a.windowId, state.session.focusSession?.windowId);
  assert.equal(a.windowId, b.windowId);
  assert.ok(state.windows.has(a.windowId) && a.windowId !== 1);
});

test('refuses to start when a selected tab changed after review', async () => {
  const state = browser([tab(1, 1, 0), tab(2, 1, 1)]);
  const reviewed = select(state, [1, 2]);
  state.tabs[1].url = 'https://example.com/changed';
  await assert.rejects(start(true, { id: 1 }, reviewed, 'Topic'), /selected tab changed/);
  assert.equal(state.session.focusSession, undefined);
});

test('"Group selected here" groups in the current window without a session', async () => {
  const state = browser([tab(1, 1, 0), tab(2, 2, 0)]);
  await start(false, { id: 1 }, select(state, [1, 2]), 'Here');
  assert.deepEqual(state.tabs.map(t => t.windowId), [1, 1]);
  assert.equal(state.session.focusSession, undefined);
  assert.equal(await end(true), undefined);
});
