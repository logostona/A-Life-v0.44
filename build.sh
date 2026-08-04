#!/usr/bin/env sh
# build.sh — produce the deployable life-sim.bundle.js that GitHub Pages serves.
#
# GitHub Pages serves this repo's root directly: there is no CI build step, so
# the COMMITTED bundle *is* the live site. Rebuilding is a manual act and this
# script is the whole of it.
#
# Flags, and why each one is not optional:
#   --bundle            React must be INLINED. index.html loads no React from
#                       anywhere, and the app is required to work fully offline
#                       (README + sw.js cache the shell on that promise), so
#                       there is no CDN to fall back to. Marking react external
#                       here produces a bundle that dies on first import.
#   --format=iife       plain <script src>, no module loader in index.html.
#   --jsx=automatic     life-sim.jsx imports ONLY hooks, never React itself.
#                       The classic transform emits React.createElement, which
#                       would be undefined. This is what the shipped bundle uses.
#   --minify            744 KB -> served over mobile connections.
#   --target=es2019     Safari 13 / older Android WebView still parse this; the
#                       PWA is explicitly an add-to-home-screen phone app.
#
# Verify before shipping — `esbuild exited 0` is not the same as `it mounts`:
#   node test-deploy.js
set -e
cd "$(dirname "$0")"
npx --yes esbuild src-entry.jsx \
  --bundle \
  --format=iife \
  --jsx=automatic \
  --minify \
  --target=es2019 \
  --loader:.jsx=jsx \
  --outfile=life-sim.bundle.js
echo "built life-sim.bundle.js ($(wc -c < life-sim.bundle.js) bytes)"
