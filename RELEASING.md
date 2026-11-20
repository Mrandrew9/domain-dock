# Releasing DomainDock

## 1. Prepare

- [ ] Update `version` in both `manifest.json` and `package.json` (they must match).
- [ ] Update the README (features, limitations, roadmap) for anything that changed.
- [ ] Run `npm run check`. CI runs the same command on every push and pull request.
- [ ] Run the in-browser [manual checklist](MANUAL_TESTING.md) with the unpacked extension. Check the service worker console for errors.
- [ ] Confirm no new permissions were added. If one was, update the README permissions table and [PRIVACY.md](PRIVACY.md).

## 2. Build the runtime package

Package only the files Chrome needs (no tests, scripts or docs):

```bash
VERSION=$(node -p "require('./manifest.json').version")
zip -r "domaindock-v$VERSION.zip" manifest.json background.js \
  popup.html popup.css popup.js options.html options.css options.js \
  focus.html focus.css focus.js lib icons
```

Load the unzipped package with **Load unpacked** once more to confirm it works on its own.

## 3. Publish on GitHub

- [ ] Merge the release pull request into `main`.
- [ ] Create a tag and GitHub Release named `v<version>` with short release notes, and attach the zip.

## 4. Chrome Web Store (optional)

- [ ] Upload the zip in the Chrome Web Store Developer Dashboard.
- [ ] Single purpose: organizing and finding open tabs.
- [ ] Permission justifications: copy the README permissions table.
- [ ] Privacy: link to `PRIVACY.md` and declare that no user data is collected or transmitted.
- [ ] Add screenshots of the finder, Duplicates view and Review & focus page, using non-sensitive tabs.
- [ ] Protect the developer account with a passkey or security key: a compromised account can publish a malicious update to every user.
