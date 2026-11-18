# DomainDock — Smart Tab Groups & Finder

> **Chrome extension · Manifest V3 · local-first · no dependencies**

Reduce tab clutter without losing your place. DomainDock groups tabs from the same website into **native Chrome tab groups**, then helps you find specific pages by searching **tab titles, URLs, saved labels, notes, and tags**.

## Features

- **Auto-group open tabs:** two or more ungrouped tabs from the same website become a native Chrome group (per browser window).
- **AMZ rule out of the box:** `amazon.com`, `amazon.co.uk`, `amazon.ca`, etc. all become **AMZ**. Default group color: orange.
- **Custom group rules:** map several related domains to one personalized name and color, e.g. `github.com` → `CODE`.
- **Find tabs instantly:** search across all windows, or restrict the list to the current window. Type `#shopping` to find tags.
- **Save a useful label:** turn an ambiguous tab title into **"Headphones — compare price"**, with tags like `shopping, gift` and an optional note.
- **Persistent page labels:** labels are keyed by page URL rather than Chrome's temporary tab ID; recognized Amazon product links are normalized to `/dp/ASIN` on the marketplace root domain.
- **Privacy-first:** no server, tracking, analytics, remote scripts, content injection, or third-party libraries.
- **Respect existing groups:** tabs in user-created groups aren't moved. Pinned tabs and incognito windows are excluded.
- **Quick access:** extension toolbar icon or suggested shortcut `Ctrl+Shift+K` (`Command+Shift+K` on Mac), configurable at `chrome://extensions/shortcuts`.

## Install locally (developer mode)

1. Download this repository or extract the ZIP so that `manifest.json` is visible at the top level.
2. Open **`chrome://extensions`** in Chrome.
3. Enable **Developer mode** (top right).
4. Click **Load unpacked** and select this repository's directory (not the ZIP).
5. Pin **DomainDock** from the Extensions toolbar.
6. Open two Amazon tabs: they should form an orange **AMZ** group. Click the extension to search tabs and add page labels.

No account, build step, npm install, or API key is required.

## How to use labels and tags

1. Open an Amazon product tab.
2. Open DomainDock and click **+ Label** beside that tab.
3. Save **Label:** `Noise-canceling headphones — shortlist`.
4. Save **Tags:** `shopping, electronics, compare`.
5. Later search for `headphones`, `shortlist`, or `#compare` and click the result to jump to the correct tab.

The label appears in **DomainDock's finder**, not Chrome's native tab title. The URL-based label survives closing and reopening the same page. Amazon links with recognized ASIN-style paths survive common referral/tracking URL changes.

## Custom grouping rules

Open the extension's **Settings** button (gear icon), then add a rule:

| Name | Domains | Color |
|---|---|---|
| `AMZ` (built in) | `amazon.com`, `amazon.co.uk`, ... | Orange |
| `WORK` | `asana.com`, `miro.com` | Purple |
| `CODE` | `github.com`, `gitlab.com` | Blue |

Rules have priority over ordinary website grouping. Use **Group now** to organize existing tabs. Turn off **Auto-group** to pause future organization; it does not dissolve existing groups.

## Permissions

| Permission | Reason |
|---|---|
| `tabs` | Read tab titles/URLs to classify websites and search open tabs; focus a result |
| `tabGroups` | Create, inspect, and name Chrome's native tab groups |
| `storage` | Save local labels, tags, rules, and extension-managed group bookkeeping |

No `host_permissions`, `<all_urls>`, or content scripts are requested. See [PRIVACY.md](PRIVACY.md).

## Limitations of v0.1

- **Page content is not indexed.** Search covers a tab's title, URL, your label, tags, and notes. To find a product not named in its tab title, add a label or note.
- Chrome groups are **window-scoped**. Tabs in different Chrome windows are shown together in search but are never moved across windows.
- Domain detection uses an **offline heuristic** for registrable domains (including common compound suffixes like `co.uk`), not the entire Public Suffix List. Add rules for exceptions.
- Existing manually grouped tabs are left alone. A manually named group with an exact matching title and matching site members can be adopted after browser restart.
- Labels are stored **per URL**, not per tab instance. Two tabs with the exact same canonical URL share the same label. Changing URLs may require relabeling.
- Data is stored in `chrome.storage.local`, not synced across machines. Labels remain until individually cleared or the extension is uninstalled.
- The extension uses the same extension-managed group where it can identify one. It does not merge or destroy manually created groups.
- Automatic grouping starts enabled and groups two or more eligible tabs on installation.

## Development

Run the offline, dependency-free unit tests:

```bash
npm test
npm run check
```

Project structure:

```text
manifest.json         Chrome Manifest V3 configuration
background.js         Native tab grouping service worker
lib/core.js           Domain matching and search/tag logic
lib/group-engine.js   Per-window grouping and manual-group protection
popup.*               Finder, tag editor, auto-group toggle
options.*             Custom domain aliases and preferences
tests/                Node.js tests with mocked Chrome APIs
icons/                Toolbar/store-ready artwork
PRIVACY.md            Data-handling policy
```

## Roadmap

- [ ] Full Public Suffix List-based domain matching (for unusual ccTLDs)
- [ ] Import/export labels as JSON with explicit user action
- [ ] Batch tagging and grouping exclusions
- [ ] Keyboard navigation through search results
- [ ] Optional tab deduplication (never silently close tabs)
- [ ] Integration tests using Chrome extension automation

## GitHub publication

See [PUBLISHING.md](PUBLISHING.md) for repository creation, initial commit, and push steps.

## Attribution and license

Independent project, built using Chrome's documented extension APIs. Licensed under [MIT](LICENSE). Not affiliated with Google, Amazon, or other websites shown in examples.
