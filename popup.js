import { canonicalPageKey, cleanAnnotation, getCategory, isExcluded, matchesTab, safeLabel, sanitizeExclusions } from './lib/core.js';
import { closeReviewedDuplicates, findDuplicateGroups, suggestedDuplicateIds } from './lib/duplicates.js';

const $ = (id) => document.getElementById(id);
let allTabs = [];
let annotations = {};
let rules = undefined;
let excludedSites = [];
let activeWindowId = null;
let editingKey = null;
let draftTabId = null;
let view = 'all';
let selectedDuplicateIds = new Set();
let visibleDuplicateGroups = [];
let keyboardTabId = null;
let windowNames = new Map();

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
      chrome.storage.local.get(['annotations', 'rules', 'autoGroup', 'excludedSites']),
      chrome.windows.getCurrent(),
    ]);
    allTabs = tabs.filter((tab) => !tab.incognito && tab.url?.startsWith('http'));
    annotations = settings.annotations || {};
    rules = settings.rules;
    excludedSites = sanitizeExclusions(settings.excludedSites);
    activeWindowId = current.id;
    const otherWindows = [...new Set(allTabs.map((tab) => tab.windowId))]
      .filter((id) => id !== activeWindowId).sort((a, b) => a - b);
    windowNames = new Map(otherWindows.map((id, index) => [id, `Other window ${index + 1}`]));
    windowNames.set(activeWindowId, 'This window');
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
    const activated = await chrome.tabs.update(tab.id, { active: true });
    await chrome.windows.update(activated.windowId, { focused: true });
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
  action.dataset.switchTab = tab.id;
  const title = element('span', 'tab-title', annotation.label || tab.title || 'Untitled page');
  const hostname = getCategory(tab.url, rules)?.domain || tab.url;
  const page = annotation.label ? `${tab.title || 'Untitled'} · ${hostname}` : hostname;
  const subtitle = element('span', 'tab-caption', `${page} · ${windowNames.get(tab.windowId)}`);
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

function renderDuplicateItem(tab, group) {
  const isKeeper = tab.id === group.keepId;
  const closable = group.closableIds.includes(tab.id);
  const row = element('div', 'duplicate-item');
  const check = document.createElement('input');
  check.className = 'duplicate-check'; check.type = 'checkbox';
  check.disabled = !closable;
  check.checked = closable && selectedDuplicateIds.has(tab.id);
  const location = `${windowNames.get(tab.windowId)}, tab ${tab.index + 1}`;
  check.setAttribute('aria-label', `Select duplicate in ${location}: ${tab.title || tab.url}`);
  check.addEventListener('change', () => {
    if (check.checked) selectedDuplicateIds.add(tab.id);
    else selectedDuplicateIds.delete(tab.id);
    updateDuplicateAction();
  });
  const content = element('div', 'duplicate-item-main');
  content.append(
    element('span', 'tab-title', annotationFor(tab).label || tab.title || 'Untitled page'),
    element('span', 'tab-caption', `Tab ${tab.index + 1}`),
  );
  const flags = [];
  if (isKeeper) flags.push('Keep');
  if (tab.active) flags.push('Active');
  if (tab.pinned) flags.push('Pinned');
  if (tab.audible) flags.push('Playing audio');
  if (tab.highlighted && !tab.active) flags.push('Highlighted');
  if (!closable && !flags.length) flags.push('Protected');
  const open = element('button', 'duplicate-focus', 'Go to');
  open.type = 'button';
  open.dataset.switchTab = tab.id;
  open.setAttribute('aria-label', `Switch to ${location}: ${tab.title || tab.url}`);
  open.addEventListener('click', () => openTab(tab));
  row.append(check, content);
  if (flags.length) row.append(element('span', 'duplicate-state', flags.join(' · ')));
  row.append(open);
  return row;
}

function updateDuplicateAction() {
  const button = $('closeDuplicates');
  button.disabled = !selectedDuplicateIds.size;
  button.textContent = `Close selected (${selectedDuplicateIds.size})`;
}

function renderDuplicates(scoped) {
  const groups = findDuplicateGroups(scoped);
  const query = $('search').value.trim();
  visibleDuplicateGroups = query ? groups.filter((group) => group.tabs.some((tab) =>
    matchesTab(tab, annotationFor(tab), query))) : groups;
  const allowed = new Set(visibleDuplicateGroups.flatMap((group) => group.closableIds));
  selectedDuplicateIds = new Set([...selectedDuplicateIds].filter((id) => allowed.has(id)));
  updateDuplicateAction();
  const results = $('results'); results.replaceChildren();
  $('resultsTitle').textContent = `${visibleDuplicateGroups.length} duplicate sets`;
  if (!visibleDuplicateGroups.length) {
    const empty = element('div', 'empty');
    empty.append(element('strong', '', 'No exact duplicate tabs found'),
      element('span', '', 'DomainDock matches complete page URLs, including query strings and #fragments. Similar pages are not automatically treated as duplicates.'));
    results.append(empty); return;
  }
  for (const group of visibleDuplicateGroups) {
    const box = element('section', 'duplicate-group');
    const first = group.tabs[0];
    const site = getCategory(first.url, rules)?.title || new URL(group.key).hostname;
    const groupTitle = element('div', 'duplicate-group-header', `${site} · ${group.tabs.length} copies`);
    box.append(groupTitle);
    const windows = new Map();
    for (const tab of group.tabs) {
      if (!windows.has(tab.windowId)) windows.set(tab.windowId, []);
      windows.get(tab.windowId).push(tab);
    }
    const windowIds = [...windows.keys()].sort((a, b) =>
      Number(b === activeWindowId) - Number(a === activeWindowId) || a - b);
    for (const id of windowIds) {
      box.append(element('h3', 'duplicate-window', windowNames.get(id)));
      for (const tab of windows.get(id).sort((a, b) => a.index - b.index)) {
        box.append(renderDuplicateItem(tab, group));
      }
    }
    results.append(box);
  }
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
  $('duplicateCount').textContent = String(findDuplicateGroups(scoped).reduce((n, group) => n + group.tabs.length - 1, 0));
  $('showAll').classList.toggle('active', view === 'all');
  $('showAll').setAttribute('aria-pressed', String(view === 'all'));
  $('showDuplicates').classList.toggle('active', view === 'duplicates');
  $('showDuplicates').setAttribute('aria-pressed', String(view === 'duplicates'));
  $('duplicateActions').hidden = view !== 'duplicates';
  $('groupNow').hidden = view === 'duplicates';
  if (view === 'duplicates') {
    renderDuplicates(scoped);
    updateKeyboardSelection();
    return;
  }

  const query = $('search').value;
  const filtered = scoped.filter((tab) => matchesTab(tab, annotationFor(tab), query));
  const container = $('results'); container.replaceChildren();
  $('resultsTitle').textContent = query ? `${filtered.length} matching tabs` : 'Your tabs';
  if (!filtered.length) {
    const empty = element('div', 'empty');
    empty.append(element('strong', '', 'No matching tabs'), element('span', '', 'Try a site name, product title, saved label, or #tag.'));
    container.append(empty);
    updateKeyboardSelection();
    return;
  }
  const buckets = new Map();
  for (const tab of filtered) {
    const cat = getCategory(tab.url, rules);
    const k = cat?.key || 'unclassified';
    if (!buckets.has(k)) buckets.set(k, { key: k, title: safeLabel(cat?.title || 'Other tabs'), tabs: [] });
    buckets.get(k).tabs.push(tab);
  }
  for (const bucket of [...buckets.values()].sort((a, b) => b.tabs.length - a.tabs.length || a.title.localeCompare(b.title))) {
    const heading = element('div', 'site-head');
    heading.append(element('span', 'site-name', bucket.title));
    const side = element('span', 'site-side');
    const site = bucket.key.startsWith('site:') ? bucket.key.slice(5) : null;
    if (site) {
      const excludedNow = isExcluded(`https://${site}/`, excludedSites);
      const toggle = element('button', 'site-exclude', excludedNow ? 'Not auto-grouped' : "Don't auto-group");
      toggle.type = 'button';
      toggle.disabled = excludedNow;
      toggle.setAttribute('aria-label', excludedNow ? `${site} is not auto-grouped. Change this in Settings.` : `Never auto-group ${site}`);
      toggle.addEventListener('click', () => excludeSite(site));
      side.append(toggle);
    }
    side.append(element('span', 'site-count', String(bucket.tabs.length)));
    heading.append(side);
    container.append(heading);
    for (const tab of bucket.tabs) container.append(makeTab(tab));
  }
  updateKeyboardSelection();
}

async function excludeSite(site) {
  const { excludedSites: saved } = await chrome.storage.local.get('excludedSites');
  excludedSites = sanitizeExclusions([...(saved || []), site]);
  await chrome.storage.local.set({ excludedSites });
  $('status').textContent = `${site} won't be auto-grouped. Existing groups stay. Undo in Settings.`;
  render();
}

function updateKeyboardSelection() {
  const previous = $('results').querySelector('.keyboard-selected');
  previous?.classList.remove('keyboard-selected');
  const selected = keyboardTabId === null ? null :
    $('results').querySelector(`[data-switch-tab="${keyboardTabId}"]`);
  keyboardTabId = selected?.dataset.switchTab ?? null;
  selected?.closest('.tab-card, .duplicate-item').classList.add('keyboard-selected');
  if (!selected) $('keyboardStatus').textContent = '';
  return selected;
}

$('search').addEventListener('keydown', (event) => {
  if (event.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  if (!['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) return;
  const buttons = [...$('results').querySelectorAll('[data-switch-tab]')];
  if (!buttons.length) return;
  const index = buttons.findIndex((button) => button.dataset.switchTab === keyboardTabId);
  if (event.key === 'Enter') {
    if (index < 0 && !$('search').value.trim()) return;
    event.preventDefault();
    if (!event.repeat) buttons[Math.max(index, 0)].click();
    return;
  }

  event.preventDefault();
  const next = event.key === 'ArrowDown' ? Math.min(index + 1, buttons.length - 1) :
    index < 0 ? buttons.length - 1 : Math.max(index - 1, 0);
  keyboardTabId = buttons[next].dataset.switchTab;
  const selected = updateKeyboardSelection();
  selected.closest('.tab-card, .duplicate-item').scrollIntoView({ block: 'nearest' });
  $('keyboardStatus').textContent = `${next + 1} of ${buttons.length}. ${selected.getAttribute('aria-label') || selected.innerText}`;
});

$('search').addEventListener('input', () => { keyboardTabId = null; editingKey = null; draftTabId = null; selectedDuplicateIds.clear(); render(); });
$('allWindows').addEventListener('change', () => { selectedDuplicateIds.clear(); render(); });
$('showAll').addEventListener('click', () => { keyboardTabId = null; view = 'all'; selectedDuplicateIds.clear(); render(); });
$('showDuplicates').addEventListener('click', () => { keyboardTabId = null; view = 'duplicates'; selectedDuplicateIds.clear(); render(); });
$('selectExtras').addEventListener('click', () => {
  selectedDuplicateIds = new Set(suggestedDuplicateIds(visibleDuplicateGroups));
  render();
  $('status').textContent = `${selectedDuplicateIds.size} same-window duplicate tabs selected for review`;
});
$('closeDuplicates').addEventListener('click', async () => {
  const requested = [...selectedDuplicateIds];
  if (!requested.length) return;
  const accepted = window.confirm(`Close ${requested.length} selected duplicate tab(s)?\n\nTabs may contain unsaved data. Nothing is closed until you confirm.\n\nClosed by mistake? Reopen tabs with Ctrl+Shift+T (Cmd+Shift+T on Mac).`);
  if (!accepted) return;
  const button = $('closeDuplicates'); button.disabled = true;
  try {
    const closed = await closeReviewedDuplicates(chrome, allTabs, requested);
    selectedDuplicateIds.clear();
    await refresh();
    $('status').textContent = `${closed} duplicate tab(s) closed`;
  } catch (error) {
    selectedDuplicateIds.clear();
    await refresh();
    $('status').textContent = error.message || 'Unable to close selected tabs';
  } finally { updateDuplicateAction(); }
});
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

$('topic').addEventListener('click', () => {
  const url = new URL(chrome.runtime.getURL('focus.html'));
  url.hash = new URLSearchParams({ q: $('search').value });
  chrome.tabs.create({ url: url.href });
});
