import test from 'node:test';
import assert from 'node:assert/strict';
import {
  duplicatePageKey, findDuplicateGroups, suggestedDuplicateIds,
  isClosableDuplicate, closeReviewedDuplicates,
} from '../lib/duplicates.js';

const tab = (id, url, overrides = {}) => ({
  id, url, title: `Tab ${id}`, windowId: 1, index: id,
  groupId: -1, active: false, pinned: false, incognito: false, audible: false,
  highlighted: false, ...overrides,
});

function browser(tabs) {
  let current = structuredClone(tabs);
  const removed = [];
  return {
    get current() { return current; },
    set current(value) { current = value; },
    removed,
    tabs: {
      async query() { return structuredClone(current); },
      async remove(ids) {
        removed.push(...ids);
        current = current.filter(t => !ids.includes(t.id));
      },
    },
  };
}

test('exact URL duplicates are detected; URL queries and fragments are significant', () => {
  const a = 'https://example.com/item?color=red#summary';
  const groups = findDuplicateGroups([
    tab(1,a),tab(2,a),tab(3,'https://example.com/item?color=blue#summary'),
    tab(4,'https://example.com/item?color=red#reviews'),
    tab(5,'https://example.com/item?color=red'),
  ]);
  assert.equal(groups.length,1);
  assert.deepEqual(groups[0].tabs.map(t=>t.id),[1,2]);
});

test('normalizes only URL-safe syntax, but not Amazon tracking differences', () => {
  assert.equal(duplicatePageKey('https://EXAMPLE.COM:443/a'), duplicatePageKey('https://example.com/a'));
  assert.notEqual(duplicatePageKey('https://amazon.com/dp/B08N5WRWNW?ref=abc'),
    duplicatePageKey('https://amazon.com/dp/B08N5WRWNW?ref=xyz'));
  for (const url of ['chrome://extensions','file:///a', 'javascript:alert(1)',
    'https://user:pass@example.com', 'not-a-url']) assert.equal(duplicatePageKey(url),null);
});

test('keeps protected active or pinned tabs, cannot close active/audio/pinned/highlighted', () => {
  const a='https://example.com/a';
  const tabs=[tab(1,a),tab(2,a,{active:true}),tab(3,a,{pinned:true}),
    tab(4,a,{audible:true}),tab(5,a,{highlighted:true}),tab(6,a)];
  const [group]=findDuplicateGroups(tabs);
  assert.equal(group.keepId,2);
  assert.deepEqual(group.closableIds.sort((a,b)=>a-b),[1,6]);
  for (const id of [2,3,4,5]) assert.equal(isClosableDuplicate(tabs.find(t=>t.id===id)),false);
});

test('excludes incognito, pending-navigation and internal URLs', () => {
  const a='https://example.com/a';
  assert.equal(findDuplicateGroups([
    tab(1,a), tab(2,a,{incognito:true}),
    tab(3,a,{pendingUrl:'https://example.com/b'}), tab(4,'chrome://newtab'),
  ]).length,0);
});

test('suggested extras limited to same-window duplicates', () => {
  const a='https://example.com/a';
  const groups = findDuplicateGroups([
    tab(1,a),tab(2,a), tab(3,a,{windowId:2}),
  ]);
  assert.deepEqual(suggestedDuplicateIds(groups),[2]);
});

test('bulk selection keeps one copy in every window, even if primary keeper is elsewhere', () => {
  const a='https://example.com/a';
  const groups=findDuplicateGroups([
    tab(1,a,{active:true,windowId:1}),
    tab(2,a,{windowId:2}),tab(3,a,{windowId:2}),tab(4,a,{windowId:2}),
  ]);
  assert.deepEqual(suggestedDuplicateIds(groups),[3,4]);
});

test('closing requires reviewed selection and retains the chosen keeper', async () => {
  const a='https://example.com/a';
  const original=[tab(1,a,{active:true}), tab(2,a),tab(3,a)];
  const api=browser(original);
  assert.equal(await closeReviewedDuplicates(api,original,[2,3]),2);
  assert.deepEqual(api.removed,[2,3]);
  assert.deepEqual(api.current.map(t=>t.id),[1]);
});

test('no close if URL, window, active state or keeper changed since review', async () => {
  const a='https://example.com/a';
  const original=[tab(1,a,{active:true}),tab(2,a)];
  for (const changed of [
    [tab(1,a,{active:true}),tab(2,'https://example.com/b')],
    [tab(1,'https://example.com/b',{active:true}),tab(2,a)],
    [tab(1,a,{active:true}),tab(2,a,{active:true})],
    [tab(1,a,{active:true}),tab(2,a,{windowId:2})],
    [tab(1,a,{active:true}),tab(2,a,{pendingUrl:'https://example.com/new'})],
  ]) {
    const api=browser(changed);
    await assert.rejects(closeReviewedDuplicates(api,original,[2]),/Tabs changed/);
    assert.deepEqual(api.removed,[]);
  }
});

test('rejects closing keepers, nonexistent tabs, or last remaining copies', async () => {
  const a='https://example.com/a';
  const original=[tab(1,a),tab(2,a)];
  const api=browser(original);
  await assert.rejects(closeReviewedDuplicates(api,original,[1]),/safe/);
  await assert.rejects(closeReviewedDuplicates(api,original,[99]),/safe/);
  api.current=[tab(2,a)];
  await assert.rejects(closeReviewedDuplicates(api,original,[2]),/Tabs changed/);
  assert.deepEqual(api.removed,[]);
});

test('manual group membership is preserved; no auto-close happens from scanning', () => {
  const a='https://example.com/a';
  const api=browser([tab(1,a,{groupId:5}),tab(2,a,{groupId:5})]);
  const groups=findDuplicateGroups(api.current);
  assert.equal(groups.length,1);
  assert.equal(api.removed.length,0);
  assert.equal(groups[0].keepId,1);
});
