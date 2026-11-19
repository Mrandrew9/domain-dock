# Chrome manual acceptance checklist (before store publication)

The project has offline Node.js tests, including mocked Chrome tab-group and duplicate-closure API calls. A full manual acceptance test in Google Chrome is still required.

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

## Duplicate-tab review (v0.2)

- [ ] Open two identical URLs in the same window. **Duplicates** shows a single set with both tabs, and an extra-tab count of 1.
- [ ] Select an eligible duplicate but cancel the confirmation. Neither tab closes.
- [ ] Select an eligible duplicate, accept the confirmation, and verify exactly one URL copy remains.
- [ ] Add a third duplicate and select **Select same-window extras**. Verify one tab per window remains unselected.
- [ ] With one matching URL in two different windows, bulk selection does not select a cross-window-only copy; individual selection is still possible.
- [ ] Repeat with active, pinned, audible and highlighted tabs. Verify those entries cannot be selected for closure.
- [ ] Start navigation on a selected tab before clicking Close. The action should refuse stale selections (test manually where possible).
- [ ] Compare Amazon product URLs that differ only in `ref` query parameter. They remain distinct in the **Duplicates** view.
- [ ] Confirm `chrome://extensions/` and incognito pages are not scanned or closed.
- [ ] Verify that saved labels survive closing a duplicate tab and reopening the same page.
- [ ] Verify no new Chrome permission requests are introduced.

## Edge cases

- [ ] Try 100+ open tabs and observe responsive UI.
- [ ] Restart Chrome with groups already present; verify no unexpected duplicate groups are created.
- [ ] Try `chrome://`, `file://`, `about:blank` and an invalid URL; confirm they are ignored for grouping.
- [ ] Test a title that contains `<script>` text; confirm it is rendered literally (no HTML execution).
- [ ] Verify no unexpected outgoing requests appear in extension DevTools Network view.
- [ ] Verify no errors appear in the extension service worker console.

## Keyboard search and cross-window review

1. Open two Chrome windows and give each at least one tab whose title contains the same search term.
2. Open DomainDock using its shortcut. Type that term, press Down to highlight the first result, and use Down and Up to move through results. Verify the search input keeps focus and the highlighted result scrolls into view.
3. Press Enter on a result in the other window. Verify Chrome focuses that window and activates the chosen tab.
4. Open the same exact page URL in both windows. Open **Duplicates** and verify the current window appears first, copies are ordered by their tab position in each window, and **Go to** switches to the chosen copy. Verify protection badges still appear on a protected keeper.
5. Search for a term with no matches and press Enter. Verify the popup stays open. Edit a label and verify Enter still submits the editor.
