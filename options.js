import { DEFAULT_RULES, GROUP_COLORS, normalizeDomain, safeLabel, sanitizeRules } from './lib/core.js';

const $ = (id) => document.getElementById(id);
const colorMap = { grey:'#a7b1c7', blue:'#57a6ff', red:'#ff6e79', yellow:'#e8bb55', green:'#50d7a2', pink:'#f39acd', purple:'#a398ff', cyan:'#5fdcdb', orange:'#ffa455' };
let rules = [];

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

async function init() {
  const saved = await chrome.storage.local.get('rules');
  rules = sanitizeRules(saved.rules ?? DEFAULT_RULES);
  render();
}
init().catch((error) => { $('message').textContent = `Settings unavailable: ${error.message}`; });
