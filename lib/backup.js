import { canonicalPageKey, cleanAnnotation, sanitizeExclusions, sanitizeRules } from './core.js';
import { checklist } from './topic.js';

/*
 * Backup files: user-initiated export and import of everything the user wrote.
 * Pure functions so they can be tested without Chrome. Every imported value goes
 * through the same cleaners as typed input; nothing in a file is trusted as-is.
 */

export const BACKUP_FORMAT = 'domaindock-backup';
export const BACKUP_VERSION = 1;
export const MAX_BACKUP_BYTES = 5 * 1024 * 1024;
export const MAX_IMPORTED_LABELS = 5000;
const MAX_CHECKLIST_CHARS = 5000;

const hasContent = (a) => Boolean(a.label || a.note || a.tags.length);

/** Build the export object from current storage. */
export function createBackup(state, extensionVersion = '', now = new Date()) {
  const annotations = {};
  for (const [key, value] of Object.entries(state?.annotations || {})) {
    const clean = cleanAnnotation(value);
    if (canonicalPageKey(key) === key && hasContent(clean)) annotations[key] = clean;
  }
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    extensionVersion: String(extensionVersion || ''),
    data: {
      annotations,
      rules: sanitizeRules(state?.rules),
      excludedSites: sanitizeExclusions(state?.excludedSites),
      incidentChecklist: typeof state?.incidentChecklist === 'string' ? state.incidentChecklist : '',
      autoGroup: state?.autoGroup !== false,
    },
  };
}

export function backupFileName(now = new Date()) {
  return `domaindock-backup-${now.toISOString().slice(0, 10)}.json`;
}

/**
 * Validate a backup file's text. Returns { ok: true, data, counts, skipped } or
 * { ok: false, error } with a message suitable for showing to the user.
 */
export function parseBackup(text) {
  const raw = String(text ?? '');
  if (new TextEncoder().encode(raw).length > MAX_BACKUP_BYTES) {
    return { ok: false, error: 'This file is larger than 5 MB and was not imported.' };
  }
  let parsed;
  try { parsed = JSON.parse(raw); } catch { return { ok: false, error: 'This file is not valid JSON.' }; }
  if (!parsed || parsed.format !== BACKUP_FORMAT) {
    return { ok: false, error: 'This is not a DomainDock backup file.' };
  }
  if (parsed.version !== BACKUP_VERSION) {
    return { ok: false, error: `Backup version ${parsed.version} is not supported by this version of DomainDock.` };
  }
  const source = parsed.data;
  if (!source || typeof source !== 'object' || Array.isArray(source) ||
      !['annotations', 'rules', 'excludedSites', 'incidentChecklist', 'autoGroup'].some(key => Object.hasOwn(source, key))) {
    return { ok: false, error: 'This backup contains no recognized settings or labels.' };
  }
  const hasLabels = Object.hasOwn(source, 'annotations');
  if (hasLabels && (!source.annotations || typeof source.annotations !== 'object' || Array.isArray(source.annotations))) {
    return { ok: false, error: 'The labels in this backup are invalid.' };
  }
  let skipped = 0;

  const annotations = {};
  const entries = Object.entries(source.annotations ?? {});
  if (entries.length > MAX_IMPORTED_LABELS) {
    return { ok: false, error: `This backup exceeds the limit of ${MAX_IMPORTED_LABELS} labels.` };
  }
  for (const [rawKey, value] of entries) {
    const key = canonicalPageKey(rawKey);
    const clean = cleanAnnotation(value);
    if (!key || !hasContent(clean)) { skipped += 1; continue; }
    annotations[key] = clean;
  }

  const rules = Array.isArray(source.rules) ? sanitizeRules(source.rules) : null;
  const excludedSites = Array.isArray(source.excludedSites) ? sanitizeExclusions(source.excludedSites) : null;

  if (rules) skipped += source.rules.length - rules.length;
  if (excludedSites) skipped += source.excludedSites.length - excludedSites.length;

  let incidentChecklist = null;
  if (typeof source.incidentChecklist === 'string') {
    try {
      if (source.incidentChecklist.length > MAX_CHECKLIST_CHARS) throw new Error('too long');
      checklist(source.incidentChecklist);
      incidentChecklist = source.incidentChecklist;
    } catch { skipped += 1; }
  }
  const autoGroup = typeof source.autoGroup === 'boolean' ? source.autoGroup : null;

  const data = { annotations: hasLabels ? annotations : null, rules, excludedSites, incidentChecklist, autoGroup };
  return {
    ok: true,
    data,
    skipped,
    counts: {
      labels: Object.keys(annotations).length,
      rules: rules?.length ?? 0,
      excludedSites: excludedSites?.length ?? 0,
      checklist: Boolean(incidentChecklist?.trim()),
    },
  };
}

/**
 * Combine current storage with validated backup data.
 * - "replace": the file's values replace current ones (fields absent from the file are kept).
 * - "merge": labels and excluded sites are added (the file wins for the same page); rules are
 *   added unless they share a domain with an existing rule; the checklist and auto-group
 *   setting are only filled in when not set yet.
 */
export function applyBackup(current, data, mode) {
  if (mode !== 'merge' && mode !== 'replace') throw new Error('Choose merge or replace.');
  const now = {
    annotations: current?.annotations || {},
    rules: sanitizeRules(current?.rules),
    excludedSites: sanitizeExclusions(current?.excludedSites),
    incidentChecklist: current?.incidentChecklist,
    autoGroup: current?.autoGroup,
  };
  const next = {};
  if (mode === 'replace') {
    if (data.annotations !== null) next.annotations = { ...data.annotations };
    if (data.rules) next.rules = data.rules;
    if (data.excludedSites) next.excludedSites = data.excludedSites;
    if (data.incidentChecklist !== null) next.incidentChecklist = data.incidentChecklist;
    if (data.autoGroup !== null) next.autoGroup = data.autoGroup;
    return next;
  }
  if (data.annotations !== null) next.annotations = { ...now.annotations, ...data.annotations };
  if (data.rules) {
    const used = new Set(now.rules.flatMap((r) => r.domains));
    const ids = new Set(now.rules.map((r) => r.id));
    const added = data.rules.filter((r) => !ids.has(r.id) && !r.domains.some((d) => used.has(d)));
    next.rules = sanitizeRules([...now.rules, ...added]);
  }
  if (data.excludedSites) next.excludedSites = sanitizeExclusions([...now.excludedSites, ...data.excludedSites]);
  if (data.incidentChecklist !== null && !String(now.incidentChecklist || '').trim()) next.incidentChecklist = data.incidentChecklist;
  if (data.autoGroup !== null && typeof now.autoGroup !== 'boolean') next.autoGroup = data.autoGroup;
  return next;
}
