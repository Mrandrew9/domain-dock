import { DEFAULT_RULES, GROUP_COLORS, MAX_EXCLUDED_SITES, normalizeDomain, safeLabel, sanitizeExclusions, sanitizeRules } from './lib/core.js';
import { applyBackup, backupFileName, createBackup, parseBackup } from './lib/backup.js';

const $ = (id) => document.getElementById(id);
const colorMap = { grey:'#a7b1c7', blue:'#57a6ff', red:'#ff6e79', yellow:'#e8bb55', green:'#50d7a2', pink:'#f39acd', purple:'#a398ff', cyan:'#5fdcdb', orange:'#ffa455' };
let rules = [];
let excluded = [];
let pendingImport = null;

function render() {
  const list = $('rules'); list.replaceChildren();
  if (!rules.length) { list.textContent = 'No custom rules; tabs will group by website.'; return; }
  for (const rule of rules) {
    const container = document.createElement('div'); container.className = 'rule';
    const text = document.createElement('div'); text.className = 'rule-text';
    const title = document.createElement('div'); title.className = 'rule-title';
    const color = document.createElement('span'); color.className = 'color-dot'; color.style.background = colorMap[rule.color] || colorMap.blue;
    const name = document.createElement('span'); name.textContent = rule.label;
    title.append(color, name);
    const domains = document.createElement('div'); domains.className = 'rule-domains'; domains.textContent = rule.domains.join(' · ');
    text.append(title, domains);
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'subtle'; remove.textContent = 'Remove';
    remove.setAttribute('aria-label', `Remove ${rule.label} grouping rule`);
    remove.addEventListener('click', async () => {
      rules = rules.filter((r) => r.id !== rule.id);
      await persist();
    });
    container.append(text, remove); list.append(container);
  }
}

async function persist() {
  await chrome.storage.local.set({ rules: sanitizeRules(rules) });
  rules = sanitizeRules(rules); render();
  $('message').textContent = 'Saved';
}

$('addRule').addEventListener('submit', async (event) => {
  event.preventDefault();
  const label = safeLabel($('ruleName').value);
  const domains = [...new Set($('ruleDomains').value.split(',').map((s) => normalizeDomain(s)).filter(Boolean))];
  if (!label || !domains.length) { $('message').textContent = 'Enter a label and valid domains.'; return; }
  if (rules.some((r) => r.domains.some((d) => domains.includes(d)))) {
    $('message').textContent = 'One of these domains is already assigned to another rule.'; return;
  }
  const color = GROUP_COLORS.includes($('ruleColor').value) ? $('ruleColor').value : 'blue';
  rules.push({ id: `custom-${Date.now()}`, label, color, domains });
  await persist(); $('addRule').reset();
});
$('reset').addEventListener('click', async () => {
  if (!window.confirm('Restore the default AMZ grouping rule? Your other custom rules will be removed.')) return;
  rules = sanitizeRules(DEFAULT_RULES); await persist();
});
$('clearLabels').addEventListener('click', async () => {
  if (!window.confirm('Permanently delete all saved page labels, tags, and notes?')) return;
  await chrome.storage.local.set({ annotations: {} });
  $('message').textContent = 'Saved labels deleted';
});

// ---- Never auto-group ----------------------------------------------------
function renderExclusions() {
  const list = $('exclusions'); list.replaceChildren();
  if (!excluded.length) { list.textContent = 'No excluded sites. Every site can be auto-grouped.'; return; }
  for (const domain of excluded) {
    const row = document.createElement('div'); row.className = 'rule';
    const name = document.createElement('div'); name.className = 'rule-title'; name.textContent = domain;
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'subtle'; remove.textContent = 'Remove';
    remove.setAttribute('aria-label', `Allow ${domain} to be auto-grouped again`);
    remove.addEventListener('click', async () => {
      excluded = excluded.filter((d) => d !== domain);
      await chrome.storage.local.set({ excludedSites: excluded });
      renderExclusions();
      $('exclusionMessage').textContent = `${domain} can be auto-grouped again`;
    });
    row.append(name, remove); list.append(row);
  }
}

$('addExclusion').addEventListener('submit', async (event) => {
  event.preventDefault();
  const domain = normalizeDomain($('exclusionDomain').value);
  if (!domain) { $('exclusionMessage').textContent = 'Enter a website such as mail.google.com.'; return; }
  if (excluded.includes(domain)) { $('exclusionMessage').textContent = `${domain} is already excluded.`; return; }
  if (excluded.length >= MAX_EXCLUDED_SITES) { $('exclusionMessage').textContent = `You can exclude up to ${MAX_EXCLUDED_SITES} sites.`; return; }
  excluded = sanitizeExclusions([...excluded, domain]);
  await chrome.storage.local.set({ excludedSites: excluded });
  renderExclusions(); $('addExclusion').reset();
  $('exclusionMessage').textContent = `${domain} won't be auto-grouped`;
});

// ---- Backup -----------------------------------------------------------------
const STORED_KEYS = ['annotations', 'rules', 'excludedSites', 'incidentChecklist', 'autoGroup'];

$('exportData').addEventListener('click', async () => {
  try {
    const state = await chrome.storage.local.get(STORED_KEYS);
    const backup = createBackup(state, chrome.runtime.getManifest().version);
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url; link.download = backupFileName();
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    const count = Object.keys(backup.data.annotations).length;
    $('backupMessage').textContent = `Exported ${count} label${count === 1 ? '' : 's'}, ${backup.data.rules.length} rule${backup.data.rules.length === 1 ? '' : 's'} and ${backup.data.excludedSites.length} excluded site${backup.data.excludedSites.length === 1 ? '' : 's'}.`;
  } catch (error) {
    $('backupMessage').textContent = `Export failed: ${error.message}`;
  }
});

$('importData').addEventListener('click', () => $('importFile').click());
$('importFile').addEventListener('change', async () => {
  const file = $('importFile').files?.[0];
  $('importFile').value = '';
  if (!file) return;
  const result = parseBackup(await file.text());
  if (!result.ok) { pendingImport = null; $('importPreview').hidden = true; $('backupMessage').textContent = result.error; return; }
  pendingImport = result;
  const c = result.counts;
  const parts = [`${c.labels} label${c.labels === 1 ? '' : 's'}`, `${c.rules} rule${c.rules === 1 ? '' : 's'}`, `${c.excludedSites} excluded site${c.excludedSites === 1 ? '' : 's'}`];
  if (c.checklist) parts.push('an incident checklist');
  $('importSummary').textContent = `${file.name} contains ${parts.join(', ')}.${result.skipped ? ` ${result.skipped} invalid item${result.skipped === 1 ? ' was' : 's were'} skipped.` : ''}`;
  $('importPreview').hidden = false;
  $('backupMessage').textContent = '';
  $('applyImport').focus();
});

$('cancelImport').addEventListener('click', () => {
  pendingImport = null; $('importPreview').hidden = true; $('backupMessage').textContent = 'Import cancelled. Nothing changed.';
});

$('applyImport').addEventListener('click', async () => {
  if (!pendingImport) return;
  const mode = document.querySelector('input[name="importMode"]:checked')?.value;
  if (mode === 'replace' && !window.confirm('Replace your current labels and settings with this backup? This cannot be undone.')) return;
  try {
    const current = await chrome.storage.local.get(STORED_KEYS);
    await chrome.storage.local.set(applyBackup(current, pendingImport.data, mode));
    pendingImport = null; $('importPreview').hidden = true;
    await init();
    $('backupMessage').textContent = mode === 'replace' ? 'Backup restored.' : 'Backup merged.';
  } catch (error) {
    $('backupMessage').textContent = `Import failed: ${error.message}. Nothing changed.`;
  }
});

async function init() {
  const saved = await chrome.storage.local.get(['rules', 'excludedSites']);
  rules = sanitizeRules(saved.rules ?? DEFAULT_RULES);
  excluded = sanitizeExclusions(saved.excludedSites);
  render();
  renderExclusions();
}
init().catch((error) => { $('message').textContent = `Settings unavailable: ${error.message}`; });
