# Update the existing DomainDock GitHub repository

The public repository already exists at https://github.com/Mrandrew9/domain-dock .
Do **not** create a new repository or run `git init` in your home directory.

## Safely apply v0.2 to your existing clone

1. Open Terminal from your existing local `domain-dock` Git repository folder and run `git status`.
2. Make sure your working tree is clean. If you have local changes, commit/stash them first.
3. Create a branch: `git switch -c feat/duplicate-tab-review`.
4. Copy the new and updated files from the v0.2 source ZIP into that existing Git repository folder, keeping the directory structure. Do **not** overwrite `.git` (not included in this ZIP).
5. Run `npm run check` (Node.js 18+). Verify no unexpected file changes with `git diff --stat`.
6. Test via `chrome://extensions` → DomainDock → **Reload**, then manually perform the duplicate-review acceptance tests in `MANUAL_TESTING.md`.
7. Commit and push:

```bash
git add README.md PRIVACY.md MANUAL_TESTING.md PUBLISHING.md LICENSE manifest.json package.json popup.html popup.css popup.js lib/duplicates.js tests/duplicates.test.js
git commit -m "feat: add reviewed duplicate-tab detection"
git push -u origin feat/duplicate-tab-review
```

8. Open a pull request from the feature branch into `main`, review the diff and CI checks, and merge when you're satisfied with the manual Chrome tests.
9. After merging, optionally tag a release as v0.2.0. The Chrome Web Store package should contain runtime files only, with `manifest.json` at the ZIP root.

**Safety:** Chrome tab closure requires explicit selection and confirmation. This feature does not automatically remove tabs and does not request new permissions.
