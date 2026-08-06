/* harness.js — the test harness every suite in this repo loads.
 *
 * WHY THIS EXISTS IN THIS FORM
 * `life-sim.jsx` is a browser script: it imports React and exports exactly one
 * symbol (`export default function App`). Tests need the ~640 top-level
 * functions and data tables inside it, so something has to turn the file into a
 * requireable CommonJS module without editing it. That is all this does:
 *
 *   1. scan life-sim.jsx for its column-0 top-level declarations,
 *   2. write a generated entry file = the source + an `export { ... }` list,
 *   3. replace the React import with inert local stubs (nothing here renders,
 *      and a real React dependency would make the harness need node_modules),
 *   4. bundle it to CJS with esbuild, cached on a hash of the source so the
 *      build runs once per file revision rather than once per suite.
 *
 * This replaces the old `build-slice.py`, which wrote to a hard-coded
 * /home/claude path from a different sandbox and is not in this repo. The
 * export list is GENERATED, never hand-maintained — a hand list silently goes
 * stale the moment a phase adds a function, and then a suite tests `undefined`
 * and passes.
 *
 * CONTRACT (see PROJECT_CONTEXT.md)
 *   H.M              — the whole module: every top-level symbol of life-sim.jsx
 *   H.mkChar(opts)   — a valid character; fills every field newCharacter needs
 *   H.runLife(s, o)  — drives a life to death or maxSteps
 *                      -> { steps, finalAge, deadEnds, crashes, popups, inSchool, state }
 *   H.CLASSES        — the four social classes newCharacter accepts
 *
 * THE ONE RULE THIS FILE MUST NEVER BREAK (Gotcha #6, the project's worst
 * false-positive class): `advance(state, totalDays)` takes TWO arguments.
 * `advance(s)` is a silent no-op that reports thousands of steps and simulates
 * nothing. Every call below passes days explicitly, and `runLife` asserts that
 * time actually moved before returning.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

const ROOT = __dirname;
const SRC = path.join(ROOT, "life-sim.jsx");
const CACHE = path.join(ROOT, ".harness-cache");

/* ─────────────────────────── slice generation ─────────────────────────── */

/* Column-0 declarations only. Anything indented is inside a function or an
   object literal and is not a module-level symbol. */
const DECL = [
  /^export default (?:async )?function\s+([A-Za-z_$][\w$]*)/,
  /^(?:async )?function\s+([A-Za-z_$][\w$]*)/,
  /^(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*[=;]/,
  /^class\s+([A-Za-z_$][\w$]*)/,
];

function topLevelSymbols(src) {
  const seen = Object.create(null);
  const out = [];
  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i++) {
    for (let d = 0; d < DECL.length; d++) {
      const m = DECL[d].exec(lines[i]);
      if (m) {
        if (!seen[m[1]]) { seen[m[1]] = 1; out.push(m[1]); }
        break;
      }
    }
  }
  return out;
}

/* React is never exercised — no suite in this repo renders through the harness
   (test-render.js builds its own jsdom bundle). Stubbing it keeps the harness
   dependency-free apart from esbuild itself. */
const STUB = [
  'const useState = (v) => [typeof v === "function" ? v() : v, function () {}];',
  "const useEffect = function () {};",
  "const useRef = (v) => ({ current: v === undefined ? null : v });",
  "const React = { createElement: function () { return { __el: arguments[0] }; }, Fragment: \"__Frag\" };",
].join("\n");

function buildSlice() {
  const src = fs.readFileSync(SRC, "utf8");
  const hash = crypto.createHash("md5").update(src).digest("hex").slice(0, 12);
  const out = path.join(CACHE, "slice." + hash + ".js");
  if (fs.existsSync(out)) return out;

  if (!fs.existsSync(CACHE)) fs.mkdirSync(CACHE, { recursive: true });
  /* drop stale builds — one per source revision is enough */
  for (const f of fs.readdirSync(CACHE)) {
    if (/^slice\./.test(f) || /^entry\./.test(f)) {
      try { fs.unlinkSync(path.join(CACHE, f)); } catch (e) { /* best effort */ }
    }
  }

  const body = src.replace(/^import\s*\{[^}]*\}\s*from\s*"react";\s*$/m, STUB);
  if (body === src) throw new Error("harness: could not find the react import line in life-sim.jsx");

  const syms = topLevelSymbols(body);
  if (syms.length < 400) throw new Error("harness: only found " + syms.length + " top-level symbols — the scan is wrong");

  const entry = path.join(CACHE, "entry." + hash + ".jsx");
  fs.writeFileSync(entry, body + "\n\nexport { " + syms.join(", ") + " };\n");

  execFileSync("npx", ["--yes", "esbuild", entry,
    "--loader:.jsx=jsx", "--bundle", "--format=cjs",
    "--jsx-factory=React.createElement", "--jsx-fragment=React.Fragment",
    "--outfile=" + out], { stdio: ["ignore", "ignore", "inherit"] });
  return out;
}

const M = require(buildSlice());

/* ──────────────────── deterministic randomness (test-only) ────────────────────
 * WHY THIS EXISTS
 * life-sim.jsx calls Math.random() in nine places — `rnd`/`pick`, the hidden
 * identity rolls, the family-composition rolls, and (deliberately) the HRE
 * world seed on a NEW character. That is correct for the game: two players
 * starting the same character should not get the same house or the same
 * siblings. It is poison for a test suite.
 *
 * Measured before this was added: test-hre-s09.js alternated between 78 and 79
 * passing across consecutive runs on an UNCHANGED file, because its shim
 * -equivalence soak and its "more than one tenure state was reached" assertion
 * both depend on which lives the RNG happens to produce. A suite that moves on
 * its own cannot answer the only question a suite exists to answer — did MY
 * change break this? — so a real regression and a coin flip were
 * indistinguishable.
 *
 * The fix belongs here rather than in the game. Math.random is replaced with a
 * seeded mulberry32 for the duration of a test process, so every suite is
 * reproducible and a failure can be re-run into the same failure. Production
 * code is untouched: this file is never bundled into the app.
 *
 * Escape hatches, because determinism can also HIDE a bug that only appears on
 * some seeds:
 *   H.seed(n)          — re-seed mid-suite, e.g. per soak iteration
 *   H.eachSeed(ns, fn) — run fn once per seed, the way to test across worlds
 *   H.realRandom()     — restore the genuine Math.random
 * Set A_LIFE_TEST_SEED=<n> to shift every suite onto a different world, which
 * is how you check that a green suite is green on purpose and not by luck.
 */
const REAL_RANDOM = Math.random;
let _rngState = 0;
function _mulberry32() {
  _rngState |= 0; _rngState = (_rngState + 0x6D2B79F5) | 0;
  let t = Math.imul(_rngState ^ (_rngState >>> 15), 1 | _rngState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function seed(n) {
  _rngState = (n >>> 0) || 1;
  Math.random = _mulberry32;
  return n;
}
function realRandom() { Math.random = REAL_RANDOM; }
function eachSeed(seeds, fn) {
  const out = [];
  for (const n of seeds) { seed(n); out.push(fn(n)); }
  return out;
}
seed(+(process.env.A_LIFE_TEST_SEED || 20240817));

/* ─────────────────────────────── mkChar ─────────────────────────────── */

const CLASSES = ["Poor", "Working", "Middle", "Wealthy"];

/* newCharacter spreads `form` onto s.profile and reads first/last/sex/orient/
   gid/cls/country/city/birthYear off it. A missing cls/city/country/birthYear
   does not throw here — it throws later, at the first milestone, which is a
   miserable way to find out. So every field is defaulted. */
function mkChar(opts) {
  const o = opts || {};
  const country = o.country || "United Kingdom";
  const countryData = M.COUNTRIES[country];
  if (!countryData) throw new Error("harness: unknown country " + country);
  const form = {
    first: o.first || "Alex",
    last: o.last || "Mercer",
    sex: o.sex || "Female",
    orient: o.orient || "Straight",
    gid: o.gid || "cis",
    cls: o.cls || "Middle",
    country: country,
    city: o.city || countryData.cities[0],
    birthYear: o.birthYear != null ? +o.birthYear : 1990,
  };
  for (const k of ["stHealth", "stHappiness", "stSmarts", "stLooks",
                   /* the three discovery ages — one per attraction axis */
                   "discOAt", "discGAt", "discRAt",
                   /* identity axes: romantic orientation, gender expression,
                      intersex variation, birth assignment, self-aware start */
                   "romantic", "expr", "dsd", "assigned", "knowsSelf"]) {
    if (o[k] != null) form[k] = o[k];
  }
  /* deliberately NOT setting profile.curSym: the Creation screen is the only
     thing that sets it in the real game, and every display path has to tolerate
     its absence. Setting it here would hide that. */
  return M.newCharacter(form);
}

/* ────────────────────────────── runLife ────────────────────────────── */

/* Drives a character to death or maxSteps, answering every popup with a valid
   option. Returns observable outcomes — assert on THOSE, never on `steps`
   (Gotcha #6: a broken harness reports plenty of steps and simulates nothing).
   `finalAge` and `popups` are the two that actually prove the sim ran.
   opts: { maxSteps, days, onStep, keepFeed, throwOnCrash } */
function runLife(state, opts) {
  const o = opts || {};
  const maxSteps = o.maxSteps != null ? o.maxSteps : 5200;
  const days = o.days != null ? o.days : 7;
  let s = state;
  let steps = 0, deadEnds = 0, crashes = 0, popups = 0, inSchool = 0;
  const startAge = M.ageYears(s);

  while (s.alive && steps < maxSteps) {
    try {
      if (s.pending) {
        popups++;
        const opts_ = (s.pending.options || []).filter((x) => !x.cond || x.cond(s));
        if (!opts_.length) { deadEnds++; s.pending = null; }
        else s = M.chooseOption(s, opts_[Math.floor(Math.random() * opts_.length)]);
      } else {
        if (M.inSchool(s)) inSchool++;
        s = M.advance(s, days);          /* TWO arguments. Always. */
      }
    } catch (e) {
      crashes++;
      if (o.throwOnCrash) throw e;
      s.pending = null;
      if (crashes > 25) break;
    }
    steps++;
    if (o.onStep) o.onStep(s, steps);
    /* pClone cost grows with the feed and s.feed is 91% of a full-life save
       (Gotcha #8) — a long soak that keeps all of it is quadratic. */
    if (!o.keepFeed && s.feed && s.feed.length > 600) s.feed = s.feed.slice(-300);
  }

  const finalAge = M.ageYears(s);
  if (steps > 200 && finalAge === startAge) {
    throw new Error("harness: " + steps + " steps and nobody aged — advance() is being " +
      "called with one argument somewhere, or the state is frozen (Gotcha #6)");
  }
  return { steps: steps, finalAge: finalAge, deadEnds: deadEnds, crashes: crashes,
    popups: popups, inSchool: inSchool, state: s };
}

module.exports = { M: M, mkChar: mkChar, runLife: runLife, CLASSES: CLASSES, SRC: SRC, ROOT: ROOT,
  seed: seed, eachSeed: eachSeed, realRandom: realRandom };
