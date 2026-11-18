# Chrome manual acceptance checklist (before store publication)

This project has 12 passing offline Node.js tests, including mocked Chrome tab-group API calls. A full manual acceptance test in Google Chrome is still required.

## Installation

- [ ] `chrome://extensions` → Developer mode → Load unpacked → select project root.
- [ ] No extension or service worker errors in `chrome://extensions` → DomainDock → Inspect views/service worker.
- [ ] Confirm permission prompt allows open-tab URL/title access, native tab groups, local storage.

## Core behaviors

- [ ] Open two Amazon tabs (`amazon.com` and `amazon.co.uk`) in one window; both appear under **AMZ** (orange).
- [ ] Open one `github.com` tab only; no single-tab GitHub group is created.
- [ ] Open two `github.com` tabs; a GitHub group is created.
- [ ] Open two Amazon tabs in two different windows; search finds both but they remain in separate windows/groups.
- [ ] Pin an Amazon tab; confirm the pinned tab is not grouped.
- [ ] Put one tab in a manually named group; confirm DomainDock does not move it.
- [ ] Disable auto grouping, open more tabs, and verify they remain ungrouped until **Group now** is clicked.

## Search and notes

- [ ] Find a tab by site, title, and URL.
- [ ] Add label `Gift idea`, tags `shopping, gift`, and note `Compare prices` to an Amazon product tab.
- [ ] Search `gift`, `#shopping`, and `prices` to confirm one matching tab.
- [ ] Click a result and confirm it activates the right tab and focuses the right window.
- [ ] Close/reopen the same Amazon product URL with tracking parameters changed; confirm the stored label reappears.
- [ ] Open Settings, add rule `WORK` for `example.com`, and verify it applies to multiple eligible tabs.
- [ ] Clear all labels after confirmation and verify search no longer finds removed tag text.

## Edge cases

- [ ] Try 100+ open tabs and observe responsive UI.
- [ ] Restart Chrome with groups already present; verify no unexpected duplicate groups are created.
- [ ] Try `chrome://`, `file://`, `about:blank` and an invalid URL; confirm they are ignored for grouping.
- [ ] Test a title that contains `<script>` text; confirm it is rendered literally (no HTML execution).
- [ ] Verify no unexpected outgoing requests appear in extension DevTools Network view.
- [ ] Verify no errors appear in the extension service worker console.
