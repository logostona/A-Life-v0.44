# A Life

### ▶︎ [**Play / install it here**](https://logostona.github.io/A-Life-v0.44/)

A life simulation game. It is a **progressive web app**, not a download in the
app-store sense — there is no `.apk` or `.exe`, and nothing to sideload.

Open the link above and the page offers an **Install** button:

| | what happens |
|---|---|
| **Android / Chrome / Edge** | Tap **Install**. It installs as a real app with its own icon and launcher entry. |
| **Desktop Chrome / Edge** | Click **Install**, or use the ⊕ icon in the address bar. Opens in its own window. |
| **iPhone / iPad (any browser)** | Tap **Install** for instructions: Share → **Add to Home Screen**. Apple provides no install API, so this step is manual. |
| **Desktop Firefox** | No install support. The game still runs normally in the tab. |

Once installed it **works fully offline** — the service worker caches the whole
app on first visit, and saves live in your browser's own storage. Nothing is
uploaded anywhere and there is no account.

---

## Optional: a local model for generated events

The game can have a language model **on your own computer** rewrite its generated
events. It is off by default and the game is complete without it. Nothing is sent
anywhere else — the model runs on your machine.

**What works.** A desktop or laptop running the model and the game in the **same
browser on the same computer**, in Chrome or Edge. This was measured, not assumed:
in Chromium 153, a page served from this site can reach a model server on
`localhost` once you allow it.

**What does not.** A phone using a model running on your desktop. The game is served
over HTTPS, and browsers will not let an HTTPS page talk to a plain-`http` server on
another machine at all. Safari and Firefox are untested.

**Setup with [Ollama](https://ollama.com):**

1. Install Ollama and pull a small model: `ollama pull llama3.2`
2. **Allow this site.** Ollama only accepts browser requests from `localhost`-type
   addresses by default, so it refuses this site until you add it. Set
   `OLLAMA_ORIGINS` to `https://logostona.github.io` (it *adds* to the defaults):
   - **Mac app:** `launchctl setenv OLLAMA_ORIGINS "https://logostona.github.io"`,
     then quit and reopen Ollama.
   - **Linux (systemd):** `systemctl edit ollama.service`, add under `[Service]`:
     `Environment="OLLAMA_ORIGINS=https://logostona.github.io"`, then
     `systemctl daemon-reload && systemctl restart ollama`.
   - **Windows:** quit Ollama, open *Edit environment variables for your account*,
     add `OLLAMA_ORIGINS` = `https://logostona.github.io`, start Ollama again.
   - **From a terminal:** `OLLAMA_ORIGINS=https://logostona.github.io ollama serve`
3. In the game: **🎯 Act → AI Narration → AI Narration Settings → Turn on**, then
   choose **Local server**.
4. Tap **🔌 Test the connection**. The browser will ask whether this site may access
   apps on your device — **allow it**. The test walks every step and tells you
   exactly which one fails and what to do; if your installed model has a different
   name it lists what you have and sets it in one tap.

LM Studio, llama.cpp's server and vLLM speak the same API and should work the same
way, with their own setting for allowed origins.

---

## Hosting your own copy

The repository root is a ready-to-host static build. No build step needed —
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
