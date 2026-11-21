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

## Tabs removed from a group (v0.4.1)

1. Open three `github.com` tabs in one window so DomainDock groups them.
2. Drag one tab out of the group. Reload any tab in the window. The dragged tab stays ungrouped.
3. In the dragged tab, navigate to another site with at least one other tab open, then back. It can be grouped again by site rules.
4. Drag a tab out again, then click **Group now** in the popup. The tab rejoins the group.
5. Right-click a DomainDock group and choose **Ungroup**. The tabs stay ungrouped after reloading.

## Review & focus

1. Open tabs mentioning the same term (for example `INC-4821`) in two windows, one of them pinned and one in a named group.
2. In the popup, search the term and choose **Review & focus**. Matches from both windows are listed; pinned and already-grouped tabs are unchecked by default.
3. Select tabs and click **Start focus session**. A new window opens with the selection in a purple group named after the topic.
4. Click **Return session tabs**. Each tab returns to its original window and position, and the grouped tab rejoins a group with its original title and color. A pinned tab is pinned again.
5. Start a session, close one of the original windows, then return the tabs. A replacement window is created for that window's tabs.
6. Change a selected tab's URL before starting. The action is refused with "A selected tab changed".
7. Enable **Include incident checklist**, save `Vendor status | https://status.example.com/`, and confirm it shows **Missing** with an **Open page** button when that page isn't open.

## Never auto-group (v0.5.0)

Automated in `npm run test:browser`; check by hand in the real toolbar popup and tab strip.

1. In Settings, add `mail.google.com` under **Never auto-group**. Open two Gmail tabs and two Google Calendar tabs. Calendar is grouped; Gmail is not.
2. Remove `mail.google.com`. The Gmail tabs are grouped.
3. In the toolbar popup, click **Don't auto-group** on a grouped site. The button changes to **Not auto-grouped**, the existing group stays, and new tabs on that site stay ungrouped.

## Backup (v0.5.0)

1. Add a label with tags and a note, a custom rule, an excluded site and an incident checklist.
2. In Settings, click **Export backup**. A `domaindock-backup-YYYY-MM-DD.json` file downloads, and the status line counts what was exported.
3. Remove DomainDock, load it again unpacked, and import the file with **Replace**. Everything from step 1 is back.
4. Import a file that isn't a backup. It's refused with a message, and nothing changes.
