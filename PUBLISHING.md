# Publish DomainDock to your GitHub profile

The bundled source is a normal Git repository project. The assistant could prepare the code, but the available GitHub integration does not expose a repository-creation action, so these steps must be done with your GitHub account.

1. In GitHub, open https://github.com/new.
2. Repository name: `domain-dock`. Description: `Local-first Chrome extension to group tabs by domain and find pages using searchable labels, tags, and notes.`
3. Visibility: **Public** (if you want it on your public profile). Leave *Add README* and *Add .gitignore* unchecked; this source already includes them.
4. Unzip `DomainDock-GitHub-Source-v0.1.0.zip` to a local folder. Open Terminal in that folder.
5. Run (replace `YOUR_USERNAME` with your account name):

```bash
git init -b main
git add .
git commit -m "feat: initial DomainDock MV3 tab grouper and tagged finder"
git remote add origin https://github.com/YOUR_USERNAME/domain-dock.git
git push -u origin main
```

6. In GitHub **About**, set topics: `chrome-extension`, `manifest-v3`, `tab-manager`, `javascript`, `browser-extension`, `productivity`.
7. Run `npm run check`, and manually install/verify the extension using [MANUAL_TESTING.md](MANUAL_TESTING.md) before publishing the first GitHub Release or submitting to the Chrome Web Store.
8. Optionally use GitHub **Pin repositories** on your profile to showcase DomainDock.

### Important distinction

- The **GitHub source ZIP** contains tests, the README, CI, and development documentation.
- The **Chrome install ZIP** contains only runtime extension files. Extract it before selecting **Load unpacked** in Chrome. Chrome Web Store uploads may use the ZIP directly once runtime acceptance testing and listing preparation are complete.
