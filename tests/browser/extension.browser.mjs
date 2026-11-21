// In-browser acceptance tests. Run with `npm run test:browser`.
// Tests run in order and share one browser, like a person using the extension.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchExtension, waitFor } from './harness.mjs';

let b;
before(async () => {
  b = await launchExtension();
  // Wait for install-time setup to store defaults.
  await waitFor(async () => (await b.storage('autoGroup')).autoGroup === true, 'install defaults');
});
after(async () => { await b?.close(); });

const grouped = async (prefix) => (await b.tab(prefix))?.groupId > -1;

test('groups Amazon marketplaces into one orange AMZ group', async () => {
  await b.open('http://www.amazon.com/dp/B0EXAMPLE1');
  await b.open('http://www.amazon.co.uk/dp/B0EXAMPLE2');
  await waitFor(() => grouped('http://www.amazon.co.uk'), 'Amazon tabs grouped');
  const [us, uk] = [await b.tab('http://www.amazon.com'), await b.tab('http://www.amazon.co.uk')];
  const group = (await b.groups()).find((g) => g.id === us.groupId);
  assert.equal(us.groupId, uk.groupId);
  assert.deepEqual([group.title, group.color], ['AMZ', 'orange']);
});

test('groups a site only once it has two tabs, and never pinned tabs', async () => {
  await b.open('http://github.com/acme/docs');
  await new Promise((r) => setTimeout(r, 800));
  assert.equal(await grouped('http://github.com/acme/docs'), false);
  await b.open('http://github.com/acme/api');
  await b.open('http://github.com/acme/web');
  await waitFor(async () => (await b.tabs()).filter((t) => t.url.startsWith('http://github.com')).every((t) => t.groupId > -1), 'GitHub group');

  await b.open('http://news.example.org/story');
  const news = await b.tab('http://news.example.org/story');
  await b.sw((id) => chrome.tabs.update(id, { pinned: true }), news.id);
  await b.open('http://news.example.org/other');
  await new Promise((r) => setTimeout(r, 800));
  assert.equal(await grouped('http://news.example.org/story'), false);
});

test('a tab removed from a group stays out until "Group now"', async () => {
  const web = await b.tab('http://github.com/acme/web');
  await b.sw((id) => chrome.tabs.ungroup(id), web.id);
  await waitFor(async () => (await b.storage(null)) && (await b.sw(() => chrome.storage.session.get('releasedTabs'))).releasedTabs?.[web.id], 'release recorded');
  const docs = b.context.pages().find((p) => p.url().startsWith('http://github.com/acme/docs'));
  await docs.reload();
  await new Promise((r) => setTimeout(r, 1000));
  assert.equal(await grouped('http://github.com/acme/web'), false);

  const popup = await b.open(b.ext('popup.html'));
  const reply = await popup.evaluate(() => chrome.runtime.sendMessage({ type: 'GROUP_NOW' }));
  assert.equal(reply.ok, true);
  await waitFor(() => grouped('http://github.com/acme/web'), 'tab regrouped');
  await popup.close();
});

test('excluded sites are not auto-grouped; others still are (settings page)', async () => {
  const options = await b.open(b.ext('options.html'));
  await options.fill('#exclusionDomain', 'mail.google.com');
  await options.click('#addExclusion button[type=submit]');
  await waitFor(async () => (await b.storage('excludedSites')).excludedSites?.includes('mail.google.com'), 'exclusion saved');
  assert.match(await options.locator('#exclusions').innerText(), /mail\.google\.com/);

  await b.open('http://mail.google.com/mail/u/0');
  await b.open('http://mail.google.com/mail/u/1');
  await b.open('http://calendar.google.com/a');
  await b.open('http://calendar.google.com/b');
  await waitFor(() => grouped('http://calendar.google.com/b'), 'calendar grouped');
  await new Promise((r) => setTimeout(r, 500));
  const mail = (await b.tabs()).filter((t) => t.url.startsWith('http://mail.google.com'));
  assert.equal(mail.length, 2);
  assert.ok(mail.every((t) => t.groupId === -1), 'Gmail tabs stay ungrouped');

  await options.locator('#exclusions button').first().click();
  await waitFor(async () => !(await b.storage('excludedSites')).excludedSites?.length, 'exclusion removed');
  await waitFor(() => grouped('http://mail.google.com/mail/u/1'), 'Gmail groups again after removal');
  await options.close();
});

test('the popup "Don\'t auto-group" button excludes a site', async () => {
  await b.open('http://forum.example.com/1');
  await b.open('http://forum.example.com/2');
  await waitFor(() => grouped('http://forum.example.com/2'), 'forum grouped');
  const popup = await b.open(b.ext('popup.html'));
  const button = popup.getByRole('button', { name: 'Never auto-group example.com' });
  await button.click();
  await waitFor(async () => (await b.storage('excludedSites')).excludedSites?.includes('example.com'), 'popup exclusion saved');
  assert.match(await popup.locator('#status').innerText(), /won't be auto-grouped/);
  assert.equal(await popup.getByRole('button', { name: /example\.com is not auto-grouped/ }).isDisabled(), true);
  assert.equal(await grouped('http://forum.example.com/1'), true, 'existing group is left alone');
  await b.sw(() => chrome.storage.local.set({ excludedSites: [] }));
  await popup.close();
});

test('search by #tag, and page titles render as text', async () => {
  let dialogs = 0;
  const xss = await b.open('http://xss.example.net/');
  xss.on('dialog', (d) => { dialogs += 1; d.dismiss(); });
  await b.sw(() => chrome.storage.local.set({ annotations: { 'http://amazon.com/dp/B0EXAMPLE1': { label: 'Headphones — compare price', tags: ['shopping', 'gift'], note: '' } } }));
  const popup = await b.open(b.ext('popup.html'));
  popup.on('dialog', (d) => { dialogs += 1; d.dismiss(); });
  await popup.fill('#search', '#gift');
  await waitFor(async () => (await popup.locator('.tab-card').count()) === 1, 'one tag match');
  assert.match(await popup.locator('.tab-card').first().innerText(), /Headphones — compare price/);
  await popup.fill('#search', 'script');
  await waitFor(async () => (await popup.locator('.tab-card').count()) >= 1, 'xss tab listed');
  assert.match(await popup.locator('.tab-card .tab-title').first().innerText(), /<script>/);
  assert.equal(await popup.evaluate(() => document.querySelectorAll('#results script, #results b').length), 0);
  assert.equal(dialogs, 0);
  await popup.close();
});

test('duplicates: finds the exact copy and closes only the selected one after confirmation', async () => {
  await b.open('http://github.com/acme/docs');
  const popup = await b.open(b.ext('popup.html'));
  await waitFor(async () => (await popup.locator('#duplicateCount').innerText()) === '1', 'one duplicate');
  await popup.click('#showDuplicates');
  await popup.click('#selectExtras');
  popup.once('dialog', (d) => { assert.match(d.message(), /Ctrl\+Shift\+T/); d.accept(); });
  await popup.click('#closeDuplicates');
  await waitFor(async () => (await b.tabs()).filter((t) => t.url === 'http://github.com/acme/docs').length === 1, 'duplicate closed');
  await popup.close();
});

test('Review & focus moves INC-4821 tabs to a focus window and returns them', async () => {
  const w2 = await b.sw(() => chrome.windows.create({ url: ['http://docs.google.com/document/d/1', 'http://app.slack.com/client/T1/C1'] }));
  await waitFor(async () => (await b.tabs()).filter((t) => t.windowId === w2.id && t.status === 'complete').length === 2, 'second window loaded');
  const api = await b.tab('http://github.com/acme/api');
  const focus = await b.open(b.ext('focus.html#q=INC-4821'));
  await waitFor(async () => /^3 matches across 2 windows/.test(await focus.locator('#count').innerText()), 'three matches');
  // Tabs already in a group are listed but unticked by default.
  const ticked = await focus.locator('#results input[type=checkbox]:checked').count();
  assert.ok(ticked >= 2, `expected the docs and Slack tabs to be ticked, got ${ticked}`);
  await focus.click('#focus');
  const session = await waitFor(async () => (await b.sw(() => chrome.storage.session.get('focusSession'))).focusSession, 'focus session');
  await waitFor(async () => (await b.tabs()).filter((t) => t.windowId === session.windowId && t.url.startsWith('http')).length === ticked, 'ticked tabs moved');
  const page = await waitFor(async () => {
    for (const p of b.context.pages()) if (p.url().startsWith(b.ext('focus.html')) && await p.locator('#restore').isVisible().catch(() => false)) return p;
  }, 'focus page with return button');
  await page.click('#restore');
  await waitFor(async () => (await b.tab('http://github.com/acme/api')).windowId === api.windowId && (await b.tab('http://docs.google.com')).windowId === w2.id, 'tabs returned');
});

test('backup: export, wipe, and import (replace) restores everything', async () => {
  await b.sw(() => chrome.storage.local.set({
    excludedSites: ['mail.google.com'],
    incidentChecklist: 'Incident notes | docs.google.com',
    rules: [{ id: 'amz', label: 'AMZ', color: 'orange', domains: ['amazon.com', 'amazon.co.uk'] }, { id: 'news', label: 'NEWS', color: 'green', domains: ['news.example.org'] }],
  }));
  const before = await b.storage(['annotations', 'rules', 'excludedSites', 'incidentChecklist']);
  const options = await b.open(b.ext('options.html'));
  const [download] = await Promise.all([options.waitForEvent('download'), options.click('#exportData')]);
  assert.match(download.suggestedFilename(), /^domaindock-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const file = join(tmpdir(), download.suggestedFilename());
  await download.saveAs(file);
  const saved = JSON.parse(readFileSync(file, 'utf8'));
  assert.equal(saved.format, 'domaindock-backup');
  assert.match(await options.locator('#backupMessage').innerText(), /Exported 1 label, 2 rules and 1 excluded site/);

  await b.sw(() => chrome.storage.local.set({ annotations: {}, rules: [], excludedSites: [], incidentChecklist: '' }));
  await options.setInputFiles('#importFile', file);
  await waitFor(() => options.locator('#importPreview').isVisible(), 'import preview');
  assert.match(await options.locator('#importSummary').innerText(), /contains 1 label, 2 rules, 1 excluded site, an incident checklist/);
  await options.check('input[name=importMode][value=replace]');
  options.once('dialog', (d) => d.accept());
  await options.click('#applyImport');
  await waitFor(async () => (await options.locator('#backupMessage').innerText()) === 'Backup restored.', 'restore message');
  assert.deepEqual(await b.storage(['annotations', 'rules', 'excludedSites', 'incidentChecklist']), before);
  assert.match(await options.locator('#exclusions').innerText(), /mail\.google\.com/);
});

test('backup: an invalid file is rejected and nothing changes', async () => {
  const before = await b.storage(null);
  const options = b.context.pages().find((p) => p.url().startsWith(b.ext('options.html')));
  const bad = join(tmpdir(), 'not-a-backup.json');
  writeFileSync(bad, JSON.stringify({ hello: 'world' }));
  await options.setInputFiles('#importFile', bad);
  await waitFor(async () => /not a DomainDock backup/.test(await options.locator('#backupMessage').innerText()), 'rejection message');
  assert.equal(await options.locator('#importPreview').isVisible(), false);
  assert.deepEqual(await b.storage(null), before);
});

test('no errors or warnings in the service worker console', () => {
  assert.deepEqual(b.errors, []);
});
