import { start, end } from './lib/focus-session.js';
import { canonicalPageKey } from './lib/core.js';
import { checklist, topicReasons } from './lib/topic.js';

const $ = id => document.getElementById(id);
const current = await chrome.windows.getCurrent();
const selected = new Map();
let activeRules = [];
let rows = [];
let session;
let busy = false;
let refreshVersion = 0;

function node(tag, text) {
  const el = document.createElement(tag);
  el.textContent = text;
  return el;
}

function preview() {
  const count = selected.size;
  const elsewhere = [...selected.values()].filter(t => t.windowId !== current.id).length;
  $('preview').textContent = count + ' selected · ' + elsewhere + ' from other windows. Group here or move the selection to a new focus window.';
  $('group').disabled = $('focus').disabled = busy || !count || !$('name').value.trim() || !!session;
}

async function refresh() {
  const version = ++refreshVersion;
  const [tabs, local, state] = await Promise.all([chrome.tabs.query({windowType:'normal'}), chrome.storage.local.get('annotations'), chrome.storage.session.get('focusSession')]);
  if (version !== refreshVersion) return;
  session = state.focusSession;
  $('session').hidden = !session;
  $('sessionName').textContent = session ? 'Focus session · ' + session.name : '';
  const query = $('query').value.trim();
  const rules = $('incident').checked ? activeRules : [];
  const previous = new Map(selected);
  const known = new Set(rows.map(r => r.tab.id));
  rows = tabs.map(tab => ({ tab, reasons: topicReasons(tab, local.annotations?.[canonicalPageKey(tab.url)] || {}, query, rules) })).filter(row => row.reasons.length);
  selected.clear();
  $('results').replaceChildren();
  for (const {tab, reasons} of rows) {
    const label = node('label','');
    label.className = 'result';
    const check = document.createElement('input');
    check.type = 'checkbox';
    const ambiguous = reasons.some(reason => reason.startsWith('Checklist · ') &&
      rows.some(other => other.tab.id !== tab.id && other.reasons.includes(reason)));
    check.checked = known.has(tab.id) ? previous.has(tab.id) : !ambiguous && !tab.pinned && tab.groupId === -1;
    if (check.checked) selected.set(tab.id, tab);
    check.onchange = () => { if (check.checked) selected.set(tab.id,tab); else selected.delete(tab.id); preview(); };
    label.append(check, ' ' + (tab.title || tab.url), node('small', [new URL(tab.url).hostname, tab.windowId === current.id ? 'This window' : 'Window ' + tab.windowId, ...reasons, tab.pinned && 'Pinned · grouping unpins', tab.groupId !== -1 && 'Already grouped'].filter(Boolean).join(' · ')));
    $('results').append(label);
  }
  $('missing').replaceChildren();
  for (const rule of rules) {
    const n = rows.filter(r => r.reasons.includes('Checklist · ' + rule.label)).length;
    const item = node('p', rule.label + ' · ' + (n > 1 ? n + ' candidates — review below' : n ? 'Open' : 'Missing'));
    if (!n && rule.exact) {
      const open = node('button','Open page');
      open.onclick = () => run(async () => { await chrome.tabs.create({url:rule.target,active:false}); });
      item.append(' ',open);
    }
    $('missing').append(item);
  }
  $('count').textContent = rows.length + ' matches across ' + new Set(rows.map(r => r.tab.windowId)).size + ' windows';
  preview();
}

async function run(action) {
  if (busy) return;
  busy = true;
  preview();
  try {
    const message = await navigator.locks.request('domain-dock-focus', action);
    if (message) $('status').textContent = message;
  } catch (error) { $('status').textContent = error.message; }
  finally { busy = false; await refresh(); }
}

$('query').value = new URLSearchParams(location.hash.slice(1)).get('q') || '';
$('name').value = $('query').value;
$('rules').value = (await chrome.storage.local.get('incidentChecklist')).incidentChecklist ?? 'Incident notes | docs.google.com\nIncident channel | app.slack.com';
activeRules = checklist($('rules').value);
$('query').oninput = () => { $('name').value = $('query').value; rows = []; refresh(); };
$('name').oninput = preview;
$('incident').onchange = () => { rows = []; refresh(); };
$('save').onclick = () => run(async () => {
  const rules = checklist($('rules').value);
  if (new Set(rules.map(r => r.label)).size !== rules.length) throw Error('Use a different name for each checklist item.');
  await chrome.storage.local.set({incidentChecklist:$('rules').value});
  activeRules = rules;
  $('status').textContent = 'Checklist saved.';
});
$('group').onclick = () => run(() => start(false, current, selected, $('name').value.trim()));
$('focus').onclick = () => run(() => start(true, current, selected, $('name').value.trim()));
$('restore').onclick = () => run(() => end(true));
$('keep').onclick = () => run(() => end(false));
window.addEventListener('focus', () => { if (!busy) refresh(); });
chrome.storage.onChanged.addListener((changes,area) => {
  if (area === 'session' && changes.focusSession && !busy) refresh();
});
await refresh();
