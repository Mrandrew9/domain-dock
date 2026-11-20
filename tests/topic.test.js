import test from 'node:test';
import assert from 'node:assert/strict';
import { checklist, topicReasons } from '../lib/topic.js';
import { end } from '../lib/focus-session.js';
const rules = checklist('Notes | docs.google.com\nStatus | https://status.example/');
test('incident matches and fixed checklist pages', () => {
  assert.deepEqual(topicReasons({url:'https://docs.google.com/a',title:'INC-4821'}, {}, 'INC-4821', rules), ['Title','Checklist · Notes']);
  assert.deepEqual(topicReasons({url:'https://status.example/'}, {}, 'INC-4821', rules), ['Checklist · Status']);
  assert.deepEqual(topicReasons({url:'https://docs.google.com/a',title:'INC-4822'}, {}, 'INC-4821', rules), []);
  assert.deepEqual(topicReasons({url:'https://status.example/',incognito:true}, {}, '', rules), []);
  assert.throws(() => checklist('Status | javascript:alert(1)'));
});
test('return only original tabs still in the focus window, in original order', async () => {
  const moves = [];
  const originals = [3,2,1].map(id => ({id,index:id,windowId:1}));
  const s = {windowId:2, originals};
  globalThis.chrome = {storage:{session:{get:async()=>({focusSession:s}),set:async()=>{},remove:async()=>{}}},
    windows:{getAll:async()=>[{id:1},{id:2}]}, tabs:{query:async()=>[{id:1,windowId:2},{id:2,windowId:2},{id:3,windowId:4},{id:4,windowId:2}],
    move:async(id,options)=>moves.push([id,options.windowId])}};
  try { await end(true); assert.deepEqual(moves,[[1,1],[2,1]]); }
  finally {delete globalThis.chrome;}
});
