# DomainDock privacy policy

DomainDock is designed to work locally. It reads open Chrome tab URLs and titles to display them in its finder and organize related tabs, and stores the grouping rules and page labels/tags/notes you explicitly create in `chrome.storage.local`. Extension-managed group identifiers are stored in `chrome.storage.session`.

**No data is transmitted to any external service by the extension.** DomainDock has no backend, third-party analytics, remote JavaScript, advertising, or telemetry. It does not read webpage bodies, browsing history beyond currently open tabs, passwords, cookies, or form fields. There are no requested website host permissions and no content scripts.

The extension may temporarily handle URLs containing sensitive search terms or query strings because Chrome exposes them as part of open-tab metadata. For saved labels, DomainDock removes URL credentials, fragments, and commonly used authentication query parameters from the storage key, but other sensitive URL structures may still exist. These remain on your device; do not share screenshots of the popup if URLs are sensitive. Chrome's local extension storage is not end-to-end encrypted and should not be used for secrets.

Duplicate detection inspects currently open HTTP(S) tab URLs in memory. It does not store duplicate scan results or transmit them. Only after you select specific duplicates and confirm does it call Chrome’s tab-close API; it rechecks the tab state first. Closing a tab may discard unsaved website data. The extension does not record or upload which tabs you closed.

Delete labels in Settings with **Delete all saved labels and tags**. Uninstalling the extension removes its local extension storage.

**Backups.** A backup file is created only when you click **Export backup** in Settings, and it is saved by Chrome to your downloads like any other file. It contains your labels, notes and tags with the page addresses they belong to, your grouping rules, excluded sites, incident checklist and auto-group setting, in plain JSON. DomainDock does not upload it anywhere; keep it somewhere private. **Import backup** reads only the file you choose, and every value is validated before anything is saved. Grouping changes affect Chrome's current tab organization and are not undone by deleting annotations.

Data isn't synced between browsers or devices. No account is required.

Sites you choose never to auto-group are stored locally. Incident checklist names and user-entered addresses are stored locally. Focus restoration uses temporary browser-session storage for tab and window identifiers, positions, pinned state and original group details. When you take a tab out of a group, DomainDock remembers that tab's identifier and site in the same session-only storage so it doesn't regroup it; this is cleared when the tab closes, when you click **Group now**, or when the browser session ends.
