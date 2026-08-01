# 0005. Put web assets in `docs/`

**Status:** Accepted
**Date:** 2026-07-30

## Context

Capacitor requires a `webDir` — a single folder holding the web assets it copies into each native
app bundle. The web files sat at the repo root. Pointing `webDir` at `"."` would have copied the
entire repo — `.git`, `node_modules`, and the generated `ios/` and `android/` folders — into the app
bundle, recursively.

The files therefore had to move into a subfolder. But GitHub Pages was serving from the repo root,
so moving them naively would take the site down.

Options considered:

1. **`docs/`** — GitHub Pages natively supports serving from `/docs`. One copy, no build step.
2. **`www/`** — conventional Capacitor naming, but Pages cannot serve it without a copy script
   (two copies of every file) or a GitHub Action.
3. **`www/` with Pages deployed via GitHub Actions** — cleanest naming, no duplication, but adds CI
   config to maintain.

## Decision

Move `index.html`, `app.js`, `sw.js`, `manifest.webmanifest`, `icons/`, and `.nojekyll` into
`docs/`. Set `webDir: "docs"` and repoint GitHub Pages to the `/docs` folder.

## Consequences

**Gained.** One canonical copy of every web file, serving both GitHub Pages and both native
bundles. No build step and no CI, preserving the project's no-build-step property. All paths in the
files are relative, so no file contents needed to change.

**Cost.** `docs/` is a misleading name for application source, and it takes the obvious location for
actual project documentation — which now lives in `product/`. This is a permanent readability tax
on anyone new to the repo, and is called out prominently in `AGENTS.md` for that reason.

It also broke every test path (`../app.js` → `../docs/app.js`), including some absolute paths that
had been committed by accident. Fixed when the tests were added to the repo.

**Rejected alternative worth recording.** A copy script mirroring root files into `www/` was
initially favoured, then reversed: one canonical copy of each file matters more than the folder
having a well-chosen name.
