import { matchesTab } from './core.js';

export function checklist(text) {
  return text.split('\n').filter(line => line.trim()).map(line => {
    const split = line.indexOf('|');
    const label = line.slice(0, split).trim();
    const target = line.slice(split + 1).trim();
    if (split < 1 || !label || !target) throw Error('Each line needs a name | address or hostname.');
    const exact = /^https?:\/\//i.test(target);
    const url = new URL(exact ? target : 'https://' + target);
    if (url.username || url.password || (!exact && url.host !== target.toLowerCase())) {
      throw Error('Use a plain hostname or a web address without embedded credentials.');
    }
    return { label, exact, target: exact ? url.href : url.hostname };
  });
}

export function topicReasons(tab, annotation, query, rules) {
  if (tab.incognito || tab.pendingUrl || !/^https?:\/\//i.test(tab.url || '')) return [];
  const reasons = [];
  if (query && matchesTab(tab, annotation, query)) {
    const fields = { Title: tab.title, URL: tab.url, Label: annotation.label, Note: annotation.note, Tag: annotation.tags?.join(' ') };
    for (const [label, value] of Object.entries(fields)) {
      if (query.toLowerCase().split(/\s+/).some(word => value?.toLowerCase().includes(word.replace(/^#/, '')))) reasons.push(label);
    }
  }
  const url = new URL(tab.url);
  for (const rule of rules) {
    const matched = rule.exact ? url.href === rule.target :
      query && url.hostname === rule.target && matchesTab(tab, {}, query);
    if (matched) reasons.push('Checklist · ' + rule.label);
  }
  return reasons;
}
