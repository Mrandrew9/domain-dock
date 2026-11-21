import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileWindow } from '../lib/group-engine.js';

function fakeBrowser(tabsInput) {
  const state = {
    tabs: structuredClone(tabsInput),
    groups: [],
    next: 100,
    updates: [],
  };
  const api = {
    tabs: {
      async query({ windowId }) { return state.tabs.filter(t => t.windowId === windowId); },
      async group({ tabIds, groupId }) {
        const id = groupId ?? state.next++;
        if (groupId === undefined) state.groups.push({ id, windowId: 1, title: '', color: 'grey' });
        for (const tabId of tabIds) state.tabs.find(t => t.id === tabId).groupId = id;
        return id;
      },
    },
    tabGroups: {
      async query({ windowId }) { return state.groups.filter(g => g.windowId === windowId); },
      async update(id, values) {
        const g = state.groups.find(g=>g.id===id);
        Object.assign(g,values); state.updates.push([id,values]);
      },
    },
  };
  return {state,api};
}

const tab = (id,url,groupId=-1, pinned=false) => ({id,url,windowId:1,groupId,pinned,incognito:false});

test('groups duplicate domains, preserves pinned and manually grouped tabs', async () => {
  const {api,state} = fakeBrowser([
    tab(1,'https://amazon.com/dp/B08N5WRWNW'),
    tab(2,'https://www.amazon.co.uk/dp/B08N5WRWNW'),
    tab(3,'https://example.com'),
    tab(4,'https://amazon.com',-1,true),
    tab(5,'https://github.com',67),
  ]);
  state.groups.push({id:67,windowId:1,title:'My manual group',color:'green'});
  const result = await reconcileWindow(api,1,undefined,{});
  assert.equal(result.groupsCreated,1);
  assert.equal(result.tabsAdded,2);
  assert.equal(state.groups.find(g=>g.title==='AMZ').color,'orange');
  assert.equal(state.tabs.find(t=>t.id===3).groupId,-1);
  assert.equal(state.tabs.find(t=>t.id===4).groupId,-1);
  assert.equal(state.tabs.find(t=>t.id===5).groupId,67);
});

test('new matching tabs join previously managed group', async () => {
  const {api,state} = fakeBrowser([tab(1,'https://amazon.com'),tab(2,'https://amazon.ca')]);
  const first = await reconcileWindow(api,1,undefined,{});
  state.tabs.push(tab(3,'https://amazon.com/s?k=headphones'));
  const next = await reconcileWindow(api,1,undefined,first.managed);
  assert.equal(next.groupsCreated,0);
  assert.equal(next.tabsAdded,1);
  assert.equal(state.tabs.find(t=>t.id===3).groupId,state.tabs.find(t=>t.id===1).groupId);
});

test('same-title group may be adopted after service worker/browser restart', async () => {
  const {api,state} = fakeBrowser([tab(1,'https://amazon.com'),tab(2,'https://amazon.ca')]);
  await reconcileWindow(api,1,undefined,{});
  state.tabs.push(tab(3,'https://amazon.co.uk'));
  const result = await reconcileWindow(api,1,undefined,{});
  assert.equal(result.groupsCreated,0);
  assert.equal(result.tabsAdded,1);
});

test('singletons do not generate noisy one-tab groups', async () => {
  const {api} = fakeBrowser([tab(1,'https://github.com'),tab(2,'https://amazon.com')]);
  const result = await reconcileWindow(api,1,undefined,{});
  assert.equal(result.groupsCreated,0);
});

test('does not pull a tab the user removed back into its group', async () => {
  const {api,state} = fakeBrowser([
    tab(1,'https://github.com/a'), tab(2,'https://github.com/b'), tab(3,'https://github.com/c'),
  ]);
  const first = await reconcileWindow(api,1,[],{});
  const groupId = state.tabs[0].groupId;
  assert.equal(state.tabs.every(t => t.groupId === groupId), true);
  // The user drags tab 3 out of the group.
  state.tabs[2].groupId = -1;
  const released = { 3: 'site:github.com' };
  const second = await reconcileWindow(api,1,[],first.managed,released);
  assert.equal(state.tabs[2].groupId, -1);
  assert.equal(second.tabsAdded, 0);
  // Without the release record (e.g. after "Group now"), the tab is grouped again.
  await reconcileWindow(api,1,[],second.managed,{});
  assert.equal(state.tabs[2].groupId, groupId);
});

test('a released tab becomes eligible again after navigating to another site', async () => {
  const {api,state} = fakeBrowser([
    tab(1,'https://example.com/a'), tab(2,'https://example.com/b'),
  ]);
  // Tab 1 was released while it showed github.com; it now shows example.com.
  const result = await reconcileWindow(api,1,[],{},{ 1: 'site:github.com' });
  assert.equal(result.groupsCreated, 1);
  assert.equal(state.tabs[0].groupId, state.tabs[1].groupId);
});

test('two released tabs of the same site do not form a new group', async () => {
  const {api,state} = fakeBrowser([tab(1,'https://github.com/a'), tab(2,'https://github.com/b')]);
  const result = await reconcileWindow(api,1,[],{},{ 1: 'site:github.com', 2: 'site:github.com' });
  assert.equal(result.groupsCreated, 0);
  assert.equal(state.tabs.every(t => t.groupId === -1), true);
});

test('excluded sites are never auto-grouped; other sites still are', async () => {
  const {api,state} = fakeBrowser([
    tab(1,'https://mail.google.com/a'), tab(2,'https://mail.google.com/b'),
    tab(3,'https://docs.google.com/1'), tab(4,'https://docs.google.com/2'),
    tab(5,'https://github.com/a'), tab(6,'https://github.com/b'),
  ]);
  const result = await reconcileWindow(api,1,[],{},{},['mail.google.com']);
  assert.equal(result.groupsCreated, 2);
  assert.equal(state.tabs[0].groupId, -1);
  assert.equal(state.tabs[1].groupId, -1);
  assert.notEqual(state.tabs[2].groupId, -1);
  assert.equal(state.tabs[2].groupId, state.tabs[3].groupId);
  assert.equal(state.tabs[4].groupId, state.tabs[5].groupId);
});

test('excluding a site leaves tabs already in a group where they are', async () => {
  const {api,state} = fakeBrowser([tab(1,'https://github.com/a'), tab(2,'https://github.com/b')]);
  const first = await reconcileWindow(api,1,[],{});
  const groupId = state.tabs[0].groupId;
  const second = await reconcileWindow(api,1,[],first.managed,{},['github.com']);
  assert.equal(second.tabsAdded, 0);
  assert.equal(state.tabs.every(t => t.groupId === groupId), true);
});
