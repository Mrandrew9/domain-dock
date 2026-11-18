/** Pure, testable logic shared by the popup and Manifest V3 service worker. */
export const GROUP_COLORS = ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'];

export const DEFAULT_RULES = Object.freeze([
  {
    id: 'amazon',
    label: 'AMZ',
    color: 'orange',
    domains: ['amazon.com', 'amazon.co.uk', 'amazon.ca', 'amazon.de', 'amazon.fr', 'amazon.es', 'amazon.it', 'amazon.co.jp', 'amazon.in', 'amazon.com.au', 'amazon.com.br', 'amazon.com.mx', 'amazon.nl', 'amazon.se', 'amazon.pl', 'amazon.ae', 'amazon.sg'],
  },
]);

const COMMON_COMPOUND_SUFFIXES = new Set([
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'com.au', 'net.au', 'org.au',
  'co.nz', 'com.br', 'com.mx', 'co.jp', 'ne.jp', 'co.kr', 'com.sg', 'com.tr',
  'com.hk', 'com.tw', 'co.in', 'com.cn', 'com.ar', 'co.za', 'com.sa', 'com.my',
]);
const TRACKING_PARAMS = /^(utm_[\w-]+|fbclid|gclid|msclkid|mc_cid|mc_eid)$/i;
const AMAZON_REF_PARAMS = /^(ref|ref_|tag|ascsubtag|linkcode|camp|creative|th|psc|smid)$/i;
const SENSITIVE_PARAMS = /^(access_token|id_token|refresh_token|auth_token|api_key|apikey|client_secret|session_token|oauth_token|code|signature)$/i;

export function hostnameFromUrl(raw) {
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    return url.hostname.toLowerCase().replace(/\.$/, '');
  } catch {
    return null;
  }
}

/** A practical offline domain heuristic. Not a full Public Suffix List implementation. */
export function rootDomain(hostname) {
  if (!hostname) return null;
  if (hostname === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(hostname) || hostname.includes(':')) {
    return hostname;
  }
  const parts = hostname.split('.');
  if (parts.length <= 2) return hostname;
  const suffix = parts.slice(-2).join('.');
  return parts.slice(-(COMMON_COMPOUND_SUFFIXES.has(suffix) ? 3 : 2)).join('.');
}

export function normalizeDomain(input) {
  let host = String(input || '').trim().toLowerCase();
  try {
    if (host.includes('://')) host = new URL(host).hostname.toLowerCase();
  } catch { return null; }
  host = host.split('/')[0].split(':')[0].replace(/\.$/, '');
  if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(host) || host.includes('..')) return null;
  return host;
}

export function domainMatches(host, base) {
  return host === base || host.endsWith(`.${base}`);
}

export function safeLabel(value) {
  return String(value || '').trim().slice(0, 26);
}

export function sanitizeRules(rules) {
  if (!Array.isArray(rules)) return DEFAULT_RULES.map((r) => ({ ...r, domains: [...r.domains] }));
  return rules.slice(0, 60).flatMap((rule) => {
    if (!rule || typeof rule !== 'object') return [];
    const domains = [...new Set((Array.isArray(rule.domains) ? rule.domains : [])
      .map(normalizeDomain).filter(Boolean))].slice(0, 40);
    const label = safeLabel(rule.label);
    if (!domains.length || !label) return [];
    return [{
      id: String(rule.id || domains[0]).slice(0, 90),
      label,
      color: GROUP_COLORS.includes(rule.color) ? rule.color : 'blue',
      domains,
    }];
  });
}

export function getCategory(rawUrl, rules = DEFAULT_RULES) {
  const host = hostnameFromUrl(rawUrl);
  if (!host) return null;
  for (const rule of sanitizeRules(rules)) {
    if (rule.domains.some((domain) => domainMatches(host, domain))) {
      return { key: `rule:${rule.id}`, title: rule.label, color: rule.color, domain: host };
    }
  }
  const root = rootDomain(host);
  const title = root.split('.')[0].replace(/(?:^|[-_])(\w)/g, (_, ch) => ch.toUpperCase());
  const index = [...root].reduce((sum, ch) => (sum * 31 + ch.charCodeAt(0)) >>> 0, 7) % (GROUP_COLORS.length - 1);
  return { key: `site:${root}`, title: safeLabel(title) || root, color: GROUP_COLORS[index + 1], domain: root };
}

export function isGroupable(tab) {
  return Boolean(tab && Number.isInteger(tab.id) && !tab.pinned && !tab.incognito && hostnameFromUrl(tab.url));
}

/** Metadata is saved against a recognizable page URL, not a transient tab ID. */
export function canonicalPageKey(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    const host = url.hostname.toLowerCase();
    // Never persist URL credentials, OAuth fragments, or known auth query params.
    url.username = '';
    url.password = '';
    url.hash = '';
    const amazon = /(^|\.)amazon\./.test(host);
    if (amazon) {
      const m = url.pathname.match(/\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})(?:[/?]|$)/i);
      if (m) return `${url.protocol}//${rootDomain(host)}/dp/${m[1].toUpperCase()}`;
    }
    const keys = [...url.searchParams.keys()];
    for (const key of keys) {
      if (TRACKING_PARAMS.test(key) || SENSITIVE_PARAMS.test(key) || (amazon && AMAZON_REF_PARAMS.test(key))) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    return url.href;
  } catch {
    return null;
  }
}

export function parseTags(raw) {
  return [...new Set(String(raw || '').split(',').map((s) => s.trim()).filter(Boolean).map((s) => s.slice(0, 32)))].slice(0, 12);
}

export function cleanAnnotation(value) {
  const label = String(value?.label || '').trim().slice(0, 100);
  const note = String(value?.note || '').trim().slice(0, 400);
  const tags = Array.isArray(value?.tags) ? parseTags(value.tags.join(',')) : parseTags(value?.tags);
  return { label, note, tags };
}

export function matchesTab(tab, annotation, query) {
  const words = String(query || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const tagText = (annotation?.tags || []).join(' ').toLowerCase();
  const allText = [tab.title, tab.url, annotation?.label, annotation?.note, tagText]
    .filter(Boolean).join(' ').toLowerCase();
  return words.every((word) => word.startsWith('#') ? tagText.includes(word.slice(1)) : allText.includes(word));
}
