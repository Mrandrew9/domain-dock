// Shared setup for in-browser tests: a local server for demo pages and a Chromium
// with DomainDock loaded unpacked. Hostnames such as github.com are mapped to the
// local server, so no real website is contacted.
import { chromium } from 'playwright';
import http from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const EXTENSION_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const TITLES = {
  'github.com/acme/api': 'acme/api: Incident INC-4821 hotfix · GitHub',
  'github.com/acme/web': 'acme/web: Pull request #212 · GitHub',
  'github.com/acme/docs': 'acme/docs · GitHub',
  'docs.google.com/document/d/1': 'INC-4821 incident notes – Google Docs',
  'app.slack.com/client/T1/C1': '#inc-4821 (Channel) – Slack',
  'xss.example.net/': '<script>alert(1)</script> & <b>bold</b>',
};

function startServer() {
  return new Promise((done) => {
    const server = http.createServer((req, res) => {
      const key = `${req.headers.host}${req.url.split('?')[0]}`;
      const title = TITLES[key] ?? req.headers.host;
      const safe = title.replace(/&/g, '&amp;').replace(/</g, '&lt;');
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html><title>${safe}</title><body>${safe}</body>`);
    });
    server.listen(0, '127.0.0.1', () => done(server));
  });
}

/** Launch Chromium with the extension. Set CHROME_PATH to use a specific Chrome for Testing build. */
export async function launchExtension() {
  const server = await startServer();
  const profile = mkdtempSync(join(tmpdir(), 'domaindock-'));
  const context = await chromium.launchPersistentContext(profile, {
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chromium' }),
    headless: false,
    viewport: null,
    acceptDownloads: true,
    args: ['--headless=new', `--disable-extensions-except=${EXTENSION_DIR}`, `--load-extension=${EXTENSION_DIR}`,
      `--host-resolver-rules=MAP * 127.0.0.1:${server.address().port}, EXCLUDE localhost`, '--no-first-run'],
  });
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker', { timeout: 20000 });
  const id = new URL(worker.url()).host;
  const errors = [];
  worker.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
  const sw = (fn, arg) => worker.evaluate(fn, arg);
  const browser = {
    context, worker, id, errors, sw,
    ext: (path) => `chrome-extension://${id}/${path}`,
    tabs: () => sw(() => chrome.tabs.query({})),
    groups: () => sw(() => chrome.tabGroups.query({})),
    storage: (keys) => sw((k) => chrome.storage.local.get(k), keys),
    async tab(prefix) { return (await browser.tabs()).find((t) => t.url.startsWith(prefix)); },
    async open(url) { const page = await context.newPage(); await page.goto(url); return page; },
    async close() { await context.close(); server.close(); rmSync(profile, { recursive: true, force: true }); },
  };
  return browser;
}

/** Poll until check() returns a truthy value; fail with a clear message after the timeout. */
export async function waitFor(check, message, timeout = 8000) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    last = await check();
    if (last) return last;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Timed out waiting for: ${message}`);
}
