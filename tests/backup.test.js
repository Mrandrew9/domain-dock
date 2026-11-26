import test from 'node:test';
import assert from 'node:assert/strict';
import { applyBackup, BACKUP_FORMAT, backupFileName, createBackup, MAX_BACKUP_BYTES, parseBackup } from '../lib/backup.js';

const state = {
  annotations: {
    'https://github.com/acme/api': { label: 'API repo', tags: ['work'], note: '' },
    'https://example.com/empty': { label: '', tags: [], note: '' },
  },
  rules: [{ id: 'shop', label: 'SHOP', color: 'green', domains: ['shop.example'] }],
  excludedSites: ['mail.google.com'],
  incidentChecklist: 'Incident notes | docs.google.com',
  autoGroup: false,
};
const file = (over = {}) => JSON.stringify({ format: BACKUP_FORMAT, version: 1, data: { ...createBackup(state).data, ...over } });

test('export → import (replace) round-trips everything the user wrote', () => {
  const backup = createBackup(state, '0.5.0', new Date('2026-11-21T10:00:00Z'));
  assert.equal(backup.exportedAt, '2026-11-21T10:00:00.000Z');
  assert.equal(backup.extensionVersion, '0.5.0');
  assert.deepEqual(Object.keys(backup.data.annotations), ['https://github.com/acme/api']);
  const parsed = parseBackup(JSON.stringify(backup));
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.counts, { labels: 1, rules: 1, excludedSites: 1, checklist: true });
  const restored = applyBackup({}, parsed.data, 'replace');
  assert.deepEqual(restored.annotations, backup.data.annotations);
  assert.deepEqual(restored.rules, backup.data.rules);
  assert.deepEqual(restored.excludedSites, ['mail.google.com']);
  assert.equal(restored.incidentChecklist, state.incidentChecklist);
  assert.equal(restored.autoGroup, false);
  assert.equal(backupFileName(new Date('2026-11-21T10:00:00Z')), 'domaindock-backup-2026-11-21.json');
});

test('rejects files that are not DomainDock backups', () => {
  assert.match(parseBackup('not json').error, /not valid JSON/);
  assert.match(parseBackup('{"hello":1}').error, /not a DomainDock backup/);
  assert.match(parseBackup(JSON.stringify({ format: BACKUP_FORMAT, version: 99, data: {} })).error, /version 99/);
  assert.match(parseBackup('x'.repeat(MAX_BACKUP_BYTES + 1)).error, /larger than 5 MB/);
});

test('cleans imported values like typed input and strips secrets from URLs', () => {
  const parsed = parseBackup(file({
    annotations: {
      'https://example.com/page?utm_source=x&access_token=SECRET': { label: 'L'.repeat(300), tags: 'a, b, a', note: 'n' },
      'javascript:alert(1)': { label: 'bad' },
      'https://example.com/blank': { label: '   ' },
    },
    rules: [{ id: 'x', label: '<b>Bad</b>', color: 'neon', domains: ['ok.example', 'not a domain'] }],
    excludedSites: ['GOOD.example', 'bad domain'],
    incidentChecklist: 'no separator line',
    autoGroup: 'yes',
  }));
  assert.equal(parsed.ok, true);
  const [key] = Object.keys(parsed.data.annotations);
  assert.equal(key, 'https://example.com/page');
  assert.equal(parsed.data.annotations[key].label.length, 100);
  assert.deepEqual(parsed.data.annotations[key].tags, ['a', 'b']);
  assert.equal(parsed.data.rules[0].color, 'blue');
  assert.deepEqual(parsed.data.rules[0].domains, ['ok.example']);
  assert.deepEqual(parsed.data.excludedSites, ['good.example']);
  assert.equal(parsed.data.incidentChecklist, null, 'an invalid checklist would break the Review & focus page');
  assert.equal(parsed.data.autoGroup, null);
  assert.equal(parsed.skipped, 4);
});

test('merge adds to existing data without clobbering rules or settings', () => {
  const current = {
    annotations: { 'https://github.com/acme/api': { label: 'Old label', tags: [], note: '' }, 'https://keep.example/': { label: 'Keep', tags: [], note: '' } },
    rules: [{ id: 'mine', label: 'MINE', color: 'red', domains: ['shop.example'] }],
    excludedSites: ['twitter.com'],
    incidentChecklist: 'My notes | notes.example',
    autoGroup: true,
  };
  const parsed = parseBackup(file({ rules: [{ id: 'shop', label: 'SHOP', color: 'green', domains: ['shop.example'] }, { id: 'news', label: 'NEWS', color: 'blue', domains: ['news.example'] }] }));
  const merged = applyBackup(current, parsed.data, 'merge');
  assert.equal(merged.annotations['https://github.com/acme/api'].label, 'API repo', 'the file wins for the same page');
  assert.equal(merged.annotations['https://keep.example/'].label, 'Keep');
  assert.deepEqual(merged.rules.map((r) => r.id), ['mine', 'news'], 'a rule sharing a domain is skipped');
  assert.deepEqual(merged.excludedSites, ['twitter.com', 'mail.google.com']);
  assert.equal(merged.incidentChecklist, undefined, 'existing checklist kept');
  assert.equal(merged.autoGroup, undefined, 'existing setting kept');
  assert.throws(() => applyBackup(current, parsed.data, 'overwrite'), /merge or replace/);
});

test('settings-only restores preserve labels and an empty checklist clears the saved one', () => {
  const partial = data => parseBackup(JSON.stringify({ format: BACKUP_FORMAT, version: 1, data }));
  const parsed = partial({ incidentChecklist: '', autoGroup: false });
  assert.equal(parsed.ok, true);
  assert.deepEqual(applyBackup(state, parsed.data, 'replace'), { incidentChecklist: '', autoGroup: false });
  assert.equal(Object.hasOwn(applyBackup(state, parsed.data, 'merge'), 'annotations'), false);
  for (const malformed of [null, [], {}, {annotations: []}, {annotations: null}]) {
    assert.equal(partial(malformed).ok, false);
  }
  assert.deepEqual(applyBackup(state, partial({ annotations: {} }).data, 'replace'), {annotations: {}});
});
