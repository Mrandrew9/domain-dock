import { canonicalPageKey, cleanAnnotation, getCategory, matchesTab, safeLabel } from './lib/core.js';

const $ = (id) => document.getElementById(id);
let allTabs = [];
let annotations = {};
let rules = undefined;
let activeWindowId = null;
let editingKey = null;
let draftTabId = null;

function element(tag, className, content) {
  const item = document.createElement(tag);
  if (className) item.className = className;
  if (content !== undefined) item.textContent = content;
  return item;
}

function annotationFor(tab) { return annotations[canonicalPageKey(tab.url)] || {}; }

async function refresh() {
  try {
    const [tabs, settings, current] = await Promise.all([
      chrome.tabs.query({}),
      chrome.storage.local.get(['annotations', 'rules', 'autoGroup']),
      chrome.windows.getCurrent(),
    ]);
    allTabs = tabs.filter((tab) => !tab.incognito && tab.url?.startsWith('http'));
    annotations = settings.annotations || {};
    rules = settings.rules;
    activeWindowId = current.id;
    $('autoGroup').checked = settings.autoGroup !== false;
    render();
  } catch (error) {
    $('status').textContent = `Cannot read tabs: ${error.message}`;
  }
}

function makeEditor(tab, key, card) {
  const note = annotationFor(tab);
  const editor = element('form', 'tab-editor');
  const fields = [
    ['Label', 'label', note.label || '', 'e.g. Kindle Paperwhite comparison'],
    ['Tags (comma separated)', 'tags', (note.tags || []).join(', '), 'shopping, gift, review'],
    ['Note', 'note', note.note || '', 'Optional detail to help find this later'],
  ];
  const inputs = {};
  for (const [label, name, initial, placeholder] of fields) {
    const wrapper = element('label', '', label);
    const field = document.createElement('input');
    field.type = 'text'; field.name = name; field.maxLength = name === 'note' ? 400 : 160;
    field.value = initial; field.placeholder = placeholder;
    wrapper.append(field); editor.append(wrapper); inputs[name] = field;
  }
  const actions = element('div', 'editor-actions');
  const cancel = element('button', '', 'Cancel'); cancel.type = 'button';
  cancel.addEventListener('click', () => { editingKey = null; draftTabId = null; render(); });
  const save = element('button', 'save', 'Save label'); save.type = 'submit';
  actions.append(cancel, save); editor.append(actions);
  editor.addEventListener('submit', async (event) => {
    event.preventDefault();
    const updated = cleanAnnotation({ label: inputs.label.value, tags: inputs.tags.value, note: inputs.note.value });
    const latest = (await chrome.storage.local.get('annotations')).annotations || {};
    if (updated.label || updated.note || updated.tags.length) latest[key] = updated;
    else delete latest[key];
    await chrome.storage.local.set({ annotations: latest });
    editingKey = null; draftTabId = null;
    await refresh();
    $('status').textContent = 'Label saved locally';
  });
  card.append(editor);
  requestAnimationFrame(() => inputs.label.focus());
}

async function openTab(tab) {
  try {
    await chrome.windows.update(tab.windowId, { focused: true });
    await chrome.tabs.update(tab.id, { active: true });
    window.close();
  } catch (error) {
    $('status').textContent = `Could not focus tab: ${error.message}`;
    await refresh();
  }
}

function makeTab(tab) {
  const key = canonicalPageKey(tab.url);
  const annotation = annotationFor(tab);
  const card = element('article', `tab-card${tab.active ? ' current' : ''}`);
  const main = element('div', 'tab-main');
  const dot = element('span', 'site-dot', (getCategory(tab.url, rules)?.title || '?').charAt(0).toUpperCase());
  const action = element('button', 'tab-open');
  action.type = 'button'; action.title = 'Switch to tab';
  const title = element('span', 'tab-title', annotation.label || tab.title || 'Untitled page');
  const hostname = getCategory(tab.url, rules)?.domain || tab.url;
  const subtitle = element('span', 'tab-caption', annotation.label ? `${tab.title || 'Untitled'} · ${hostname}` : hostname);
  action.append(title, subtitle);
  action.addEventListener('click', () => openTab(tab));
  const edit = element('button', 'tag-button', annotation.label || annotation.tags?.length ? '✎ Edit' : '+ Label');
  edit.type = 'button'; edit.setAttribute('aria-label', `Edit label and tags for ${tab.title || 'tab'}`);
  edit.addEventListener('click', () => {
    if (!key) return;
    const isSame = editingKey === key && draftTabId === tab.id;
    editingKey = isSame ? null : key;
    draftTabId = isSame ? null : tab.id;
    render();
  });
  main.append(dot, action, edit); card.append(main);
  if (annotation.tags?.length) {
    const tags = element('div', 'chips');
    for (const label of annotation.tags) tags.append(element('span', 'chip', `#${label}`));
    card.append(tags);
  }
  if (editingKey === key && draftTabId === tab.id) makeEditor(tab, key, card);
  return card;
}

function render() {
  const scoped = allTabs.filter((tab) => $('allWindows').checked || tab.windowId === activeWindowId);
  const uniqueSites = new Set(scoped.map((tab) => getCategory(tab.url, rules)?.key));
  const tagged = scoped.filter((tab) => {
    const meta = annotationFor(tab); return Boolean(meta.label || meta.note || meta.tags?.length);
  });
  $('tabCount').textContent = String(scoped.length);
  $('siteCount').textContent = String(uniqueSites.size);
  $('taggedCount').textContent = String(tagged.length);

  const query = $('search').value;
  const filtered = scoped.filter((tab) => matchesTab(tab, annotationFor(tab), query));
  const container = $('results'); container.replaceChildren();
  $('resultsTitle').textContent = query ? `${filtered.length} matching tabs` : 'Your tabs';
  if (!filtered.length) {
    const empty = element('div', 'empty');
    empty.append(element('strong', '', 'No matching tabs'), element('span', '', 'Try a site name, product title, saved label, or #tag.'));
    container.append(empty); return;
  }
  const buckets = new Map();
  for (const tab of filtered) {
    const cat = getCategory(tab.url, rules);
    const k = cat?.key || 'unclassified';
    if (!buckets.has(k)) buckets.set(k, { title: safeLabel(cat?.title || 'Other tabs'), tabs: [] });
    buckets.get(k).tabs.push(tab);
  }
  for (const bucket of [...buckets.values()].sort((a, b) => b.tabs.length - a.tabs.length || a.title.localeCompare(b.title))) {
    const heading = element('div', 'site-head');
    heading.append(element('span', 'site-name', bucket.title), element('span', 'site-count', String(bucket.tabs.length)));
    container.append(heading);
    for (const tab of bucket.tabs) container.append(makeTab(tab));
  }
}

$('search').addEventListener('input', () => { editingKey = null; draftTabId = null; render(); });
$('allWindows').addEventListener('change', render);
$('settings').addEventListener('click', () => chrome.runtime.openOptionsPage());
$('autoGroup').addEventListener('change', async (event) => {
  await chrome.storage.local.set({ autoGroup: event.target.checked });
  $('status').textContent = event.target.checked ? 'Automatic grouping enabled' : 'Automatic grouping paused';
});
$('groupNow').addEventListener('click', async () => {
  const button = $('groupNow'); button.disabled = true;
  $('status').textContent = 'Organizing tabs…';
  try {
    const result = await chrome.runtime.sendMessage({ type: 'GROUP_NOW' });
    $('status').textContent = result?.ok ? `${result.groupsCreated} groups created · ${result.tabsAdded} tabs grouped` : (result?.error || 'Grouping failed');
    await refresh();
    $('status').textContent = result?.ok ? `${result.groupsCreated} groups created · ${result.tabsAdded} tabs grouped` : (result?.error || 'Grouping failed');
  } catch (error) {
    $('status').textContent = error.message || 'Grouping failed';
  } finally { button.disabled = false; }
});
document.addEventListener('keydown', (event) => {
  if (event.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
    event.preventDefault(); $('search').focus();
  }
  if (event.key === 'Escape' && editingKey) { editingKey = null; draftTabId = null; render(); }
});
chrome.tabs.onCreated.addListener(refresh);
chrome.tabs.onRemoved.addListener(refresh);
chrome.tabs.onUpdated.addListener((_id, changes) => { if (changes.title || changes.url) refresh(); });
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.annotations || changes.rules)) refresh();
});
refresh();
