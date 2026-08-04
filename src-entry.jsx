/* src-entry.jsx — the PWA build's entry point.
 *
 * WHY THIS FILE NOW EXISTS
 * It didn't, and that was a real gap. `life-sim.jsx` exports `App` and nothing
 * else; something has to mount it. The deployed `life-sim.bundle.js` clearly had
 * a mount call compiled into it, but the entry that produced it was never in the
 * repo, so the bundle could not be reproduced from source — and the rebuild
 * command recorded in PROJECT_CONTEXT.md / RESTART-BRIEF.md was WRONG for this
 * deployment in two ways that would each have broken the live site:
 *
 *   - it passed `--external:react --external:react-dom`, but index.html loads no
 *     React from anywhere, so the externals would have resolved to nothing at
 *     runtime and the page would have died on the first import;
 *   - it passed `--global-name=LifeSimBundle`, which only exposes a global and
 *     never mounts anything, so the page would have rendered an empty <div>.
 *
 * Both docs flagged that command as never re-derived. This file plus build.sh
 * replaces it with something that can actually be run again.
 *
 * Reconstructed from the shipped bundle rather than guessed: the minified tail
 * of the live build ends in
 *     document.getElementById("root"); createRoot(...); .render(jsx(App,{}))
 * with React 18.3.1 inlined and the automatic JSX runtime in use — which is
 * forced, since life-sim.jsx imports only hooks and never React itself, so the
 * classic transform would leave React.createElement undefined.
 */
import { createRoot } from "react-dom/client";
import App from "./life-sim.jsx";

const el = document.getElementById("root");
if (el) createRoot(el).render(<App />);
