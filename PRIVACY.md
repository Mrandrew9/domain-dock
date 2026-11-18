# DomainDock privacy policy

DomainDock is designed to work locally. It reads open Chrome tab URLs and titles to display them in its finder and organize related tabs, and stores the grouping rules and page labels/tags/notes you explicitly create in `chrome.storage.local`. Extension-managed group identifiers are stored in `chrome.storage.session`.

**No data is transmitted to any external service by the extension.** DomainDock has no backend, third-party analytics, remote JavaScript, advertising, or telemetry. It does not read webpage bodies, browsing history beyond currently open tabs, passwords, cookies, or form fields. There are no requested website host permissions and no content scripts.

The extension may temporarily handle URLs containing sensitive search terms or query strings because Chrome exposes them as part of open-tab metadata. For saved labels, DomainDock removes URL credentials, fragments, and commonly used authentication query parameters from the storage key, but other sensitive URL structures may still exist. These remain on your device; do not share screenshots of the popup if URLs are sensitive. Chrome's local extension storage is not end-to-end encrypted and should not be used for secrets.

Delete labels in Settings with **Delete all saved labels and tags**. Uninstalling the extension removes its local extension storage. Grouping changes affect Chrome's current tab organization and are not undone by deleting annotations.

Data isn't synced between browsers or devices. No account is required.
