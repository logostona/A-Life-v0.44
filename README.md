# A Life — GitHub Pages deployment

This folder is a ready-to-host static build of the game. No build step needed —
GitHub just needs to serve these files as-is.

## Steps

1. **Create a new repository** on GitHub (public repos get free Pages hosting;
   private works too on paid plans). Any name is fine, e.g. `a-life`.
2. **Upload every file in this folder**, keeping the `icons/` subfolder intact:
   - `index.html`
   - `manifest.json`
   - `sw.js`
   - `storage-polyfill.js`
   - `life-sim.bundle.js`
   - `icons/` (5 files)

   Easiest way: on the repo's GitHub page, click **Add file → Upload files**,
   drag in the whole folder, and commit.
3. **Turn on Pages**: repo → **Settings → Pages** → under "Build and deployment",
   set **Source: Deploy from a branch**, branch **main**, folder **/ (root)** →
   **Save**.
4. GitHub will give you a URL after a minute or two, in the form:
   `https://<your-username>.github.io/<repo-name>/`
5. Open that link on your phone → your browser's share/menu button →
   **"Add to Home Screen"** (iOS Safari) or **"Install app"** (Android Chrome).
   It'll behave like a native app icon, launching full-screen with no browser
   chrome.

## Notes on what's inside

- **`life-sim.bundle.js`** — the whole game (React + your `life-sim.jsx`)
  bundled into one self-contained file. Nothing is fetched from a CDN, so it
  works fully offline once installed.
- **`storage-polyfill.js`** — the game's save system was written to call
  `window.storage`, an API that only exists inside Claude's own artifact
  runtime. A plain browser (and therefore GitHub Pages) doesn't have it, so
  this file provides the same API backed by the browser's `localStorage`,
  meaning saves now genuinely persist between visits/sessions on your device.
- **`sw.js`** — a service worker that caches the app shell so it loads
  instantly and works with no signal/wifi after the first visit.
- Saves live in your browser's local storage, per-device — they won't sync
  between your phone and a laptop, and clearing site data / browser storage
  will wipe them, same as any local-only save.

## If it installs as a plain shortcut instead of a full app

This happens when the browser doesn't recognize the site as a real installable
PWA yet, so it falls back to a basic bookmark (address bar visible, listed
under "shortcuts" instead of as an app). Two fixes are already baked into this
package:

- **`.nojekyll`** — an empty file at the repo root. Without it, GitHub Pages
  runs its default Jekyll build step over your files, which is meant for
  blogs, not a static app like this one. Its absence was the likely cause.
- **Earlier service worker registration** — `index.html` now registers `sw.js`
  immediately instead of waiting for the page's `load` event, so Chrome's
  install check (which requires an active service worker) can pass on the
  very first visit instead of needing a second one.

After redeploying with these files:
- **Android Chrome** — delete the old shortcut from your home screen first.
  Reopen the site, give it a couple of seconds, then use the **⋮ menu**. It
  should now say **"Install app"** (not "Add to Home screen"). If it still
  says the latter, force-close Chrome, reopen the site fresh, and check again.
- **iPhone/iPad** — you must use **Safari** itself, not Chrome or Firefox for
  iOS (they don't support standalone launch the same way). Delete any icon
  you already added — iOS bakes in the page's settings at the moment you add
  it, so an old icon won't pick up this fix. Reopen the site in Safari, tap
  **Share → Add to Home Screen**, then launch from the new icon.

## Updating later

If you get a new `life-sim.jsx`, ask for the bundle to be rebuilt and just
replace `life-sim.bundle.js` in the repo (upload the new file over the old
one, same name). Everything else stays the same.
