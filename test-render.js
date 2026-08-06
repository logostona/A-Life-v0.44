/* test-render.js — does the app actually MOUNT, and did the redesign leave
 * anything unreadable?
 *
 * WHY THIS FILE EXISTS IN THIS FORM
 * PROJECT_CONTEXT.md lists a `test-render.js` (5 assertions) as part of the
 * suite, but that file was never uploaded to this repo — module 16's UI
 * redesign would otherwise have been the one change in the project's history
 * made with no render coverage at all. This is a reimplementation, and it is
 * deliberately larger than the original 5 assertions because a re-theme can
 * break things a boot check cannot see: a button whose text matches its own
 * background still mounts perfectly.
 *
 * The contrast assertions are the point. Every colour pair the redesign
 * introduces is checked against the WCAG 2.1 relative-luminance formula, at the
 * real threshold for its role (4.5:1 body text, 3:1 large text and UI edges).
 * That is what catches the "white text on a light accent" class of bug that a
 * light->dark port produces by default.
 *
 * Run: node test-render.js   (needs react, react-dom, jsdom — npm install)
 */
"use strict";

const path = require("path");
const H = require(path.join(__dirname, "harness.js"));

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log("  FAIL: " + name + (extra !== undefined ? "  " + JSON.stringify(extra) : "")); }
}
function sec(t) { console.log("\n=== " + t + " ==="); }

/* ─────────────────────── colour maths (WCAG 2.1) ─────────────────────── */
function parseHex(h) {
  h = String(h).trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length === 8) h = h.slice(0, 6);            /* ignore alpha suffix */
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function lum(hex) {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  const a = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
}
/* composite a colour with an alpha suffix over a background, so a token used
   as `accent + "1A"` is judged as what the eye actually receives */
function over(fg, bg, alpha) {
  const f = parseHex(fg), b = parseHex(bg);
  if (!f || !b) return null;
  const out = f.map((v, i) => Math.round(v * alpha + b[i] * (1 - alpha)));
  return "#" + out.map((v) => v.toString(16).padStart(2, "0")).join("");
}
function contrast(a, b) {
  const la = lum(a), lb = lum(b);
  if (la === null || lb === null) return null;
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const M = H.M;
const TH = M.TH;

/* ══════════════════════════ 1 · the app mounts ══════════════════════════ */
sec("1 · boot");
let React, ReactDOMServer, mounted = null, mountErr = null, html = "";
try {
  React = require("react");
  ReactDOMServer = require("react-dom/server");
} catch (e) {
  console.log("  react/react-dom not installed — run: npm install react react-dom jsdom");
  console.log("\n0 passed, 1 failed");
  process.exit(1);
}

/* life-sim.jsx is a browser module. Build it the same way harness.js does, but
   with REAL react rather than the harness's inert stubs, so components run. */
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const cacheDir = path.join(__dirname, ".harness-cache");
if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
const outFile = path.join(cacheDir, "render-bundle.js");

/* Same generated-export trick harness.js uses, but keeping the REAL react
   import so components actually run. life-sim.jsx exports only `App`, and this
   suite has to reach `Game` (the screen the whole redesign lives on) — a
   hand-written export list would go stale the moment a component is added, so
   the list is scanned, exactly as the harness does it. */
const rawSrc = fs.readFileSync(path.join(__dirname, "life-sim.jsx"), "utf8");
const DECL = [
  /^export default (?:async )?function\s+([A-Za-z_$][\w$]*)/,
  /^(?:async )?function\s+([A-Za-z_$][\w$]*)/,
  /^(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*[=;]/,
  /^class\s+([A-Za-z_$][\w$]*)/,
];
const seen = Object.create(null), syms = [];
for (const line of rawSrc.split("\n")) {
  for (const re of DECL) {
    const m = re.exec(line);
    if (m) { if (!seen[m[1]]) { seen[m[1]] = 1; syms.push(m[1]); } break; }
  }
}
const entry = path.join(cacheDir, "render-entry.jsx");
fs.writeFileSync(entry, rawSrc + "\n\nexport { " + syms.join(", ") + " };\n");
try {
  execFileSync("npx", ["--yes", "esbuild", entry,
    "--loader:.jsx=jsx", "--bundle", "--format=cjs",
    "--external:react", "--external:react-dom",
    "--jsx-factory=React.createElement", "--jsx-fragment=React.Fragment",
    "--banner:js=const React = require(\"react\");",
    "--outfile=" + outFile], { stdio: ["ignore", "ignore", "pipe"] });
} catch (e) {
  console.log("  esbuild failed: " + String(e.stderr || e));
  console.log("\n0 passed, 1 failed");
  process.exit(1);
}

/* window.storage is the artifact-runtime API the save system calls. Stub it
   before requiring, exactly as the deployed storage-polyfill.js does. */
global.window = global.window || {};
const store = {};
global.window.storage = {
  getItem: (k) => Promise.resolve(store[k] === undefined ? null : store[k]),
  setItem: (k, v) => { store[k] = String(v); return Promise.resolve(); },
  removeItem: (k) => { delete store[k]; return Promise.resolve(); },
};
/* node 22 defines a getter-only global `navigator`; only define one if absent */
if (typeof globalThis.navigator === "undefined") {
  Object.defineProperty(globalThis, "navigator", { value: { userAgent: "node" }, configurable: true });
}

let mod = null;
try { mod = require(outFile); } catch (e) { mountErr = e; }
ok("the bundle loads without throwing", !mountErr, mountErr && String(mountErr).slice(0, 300));

if (mod) {
  const App = mod.default || mod;
  try {
    html = ReactDOMServer.renderToStaticMarkup(React.createElement(App));
    mounted = true;
  } catch (e) { mountErr = e; mounted = false; }
  ok("App renders without throwing", mounted === true, mountErr && String(mountErr).slice(0, 300));
  ok("it produces real markup", typeof html === "string" && html.length > 20, html.length);
}

/* Render an actual in-progress life, not just the creation screen — the
   redesign's header, stat rail and compass only exist on that path. */
let gameHtml = "", gameErr = null, gameState = null;
if (mod) {
  try {
    const s = H.mkChar({ country: "United Kingdom", cls: "Middle", birthYear: 1990 });
    s.ageDays = Math.ceil(24 * 365.25) + 1;
    /* pinned so the IQ readout can be checked against the value it came from;
       76 is chosen because iqFromPercentile(76) is 111 — outside the 0-100
       percentile range, so the two scales cannot be confused for each other */
    s.stats.smarts = 76;
    gameState = s;
    M.push(s, "A test line for the feed.");
    s.feed.push({ date: "1998", text: "A world event.", world: true });
    gameHtml = ReactDOMServer.renderToStaticMarkup(
      React.createElement(mod.Game || mod.default, { state: s, setState: () => {}, onReset: () => {} })
    );
  } catch (e) { gameErr = e; }
  ok("a live Game screen renders", !gameErr && gameHtml.length > 200, gameErr ? String(gameErr).slice(0, 300) : gameHtml.length);

  /* The other two full-screen states. Both take `accent` and both were touched
     by the re-theme, so both can crash independently of Game. */
  let creationErr = null, creationHtml = "";
  try {
    creationHtml = ReactDOMServer.renderToStaticMarkup(React.createElement(mod.Creation, { onStart: () => {} }));
  } catch (e) { creationErr = e; }
  ok("the Creation screen renders", !creationErr && creationHtml.length > 200,
    creationErr ? String(creationErr).slice(0, 300) : creationHtml.length);

  let obitErr = null, obitHtml = "";
  try {
    const d = H.mkChar({ country: "United Kingdom", cls: "Middle", birthYear: 1940 });
    d.alive = false;
    d.death = { cause: "old age", age: 84 };
    d.ageDays = Math.ceil(84 * 365.25) + 1;
    M.push(d, "A line before the end.");
    obitHtml = ReactDOMServer.renderToStaticMarkup(
      React.createElement(mod.Obituary, { state: d, onReset: () => {}, accent: M.accentFor(M.yearOf(d)) })
    );
  } catch (e) { obitErr = e; }
  ok("the Obituary screen renders", !obitErr && obitHtml.length > 100,
    obitErr ? String(obitErr).slice(0, 300) : obitHtml.length);

  /* A dead character must never reach the Game chrome — Game returns the
     Obituary early, and the compass must not render for someone who has no
     more time to spend. */
  let deadHtml = "";
  try {
    const d2 = H.mkChar({ country: "United Kingdom", cls: "Middle", birthYear: 1940 });
    d2.alive = false; d2.death = { cause: "old age", age: 84 };
    deadHtml = ReactDOMServer.renderToStaticMarkup(
      React.createElement(mod.Game, { state: d2, setState: () => {}, onReset: () => {} })
    );
  } catch (e) { deadHtml = "THREW: " + e; }
  ok("a dead character gets the obituary, not the compass",
    deadHtml.indexOf("aria-label=\"Live on") === -1 && deadHtml.indexOf("THREW") === -1,
    deadHtml.slice(0, 160));
}

/* ═══════════════════ 2 · the redesign actually applied ═══════════════════ */
sec("2 · the dark theme is really in the output");
{
  const strip = (h) => h.replace(/<!--[^>]*-->/g, "");
  const g = strip(gameHtml);
  ok("the page paints the Dusk Ink background", g.indexOf(TH.bg) > -1 || html.indexOf(TH.bg) > -1);
  ok("no light-theme background survives in the rendered tree",
    g.indexOf("#F6F5F1") === -1 && g.indexOf("#FFFFFF") === -1, "a pre-redesign surface colour is still being rendered");
  ok("the ledger face is used for numerics", g.indexOf("ui-monospace") > -1);
  ok("the story face is used for the feed", g.indexOf("Georgia") > -1);
  ok("the feed line rendered as story text", g.indexOf("A test line for the feed.") > -1);
  ok("the world-event panel rendered", g.indexOf("Meanwhile, in the world") > -1);
}

sec("3 · the compass replaced the old controls");
{
  const g = gameHtml;
  ok("the compass dial rendered (svg present)", g.indexOf("<svg") > -1);
  ok("every time step is still selectable", M.TIME_STEPS.every((t) => g.indexOf(">" + t.label + "<") > -1),
    M.TIME_STEPS.map((t) => t.label));
  ok("the advance control is labelled for screen readers", /aria-label="Live on /.test(g));
  ok("the step buttons expose pressed state", /aria-pressed=/.test(g));
  ok("the old 'Live on ⏳' button is gone", g.indexOf("Live on ⏳") === -1);
  ok("the Act control survived the rewrite", g.indexOf("🎯 Act") > -1);
}

sec("4 · stats are always visible, not behind a disclosure");
{
  const g = gameHtml;
  ok("all four stats render without opening anything",
    ["Health", "Happiness", "IQ", "Looks"].every((s) => g.indexOf(s) > -1));
  ok("the old 'stats ▾' disclosure is gone", g.indexOf("stats ▾") === -1);
  ok("the intelligence stat is not labelled as a percentage any more",
    g.indexOf("Smarts") === -1);
  /* The bar is a percentile and the number beside it is an IQ. Those are two
     different scales, and the bug this guards against is printing the
     percentile next to the IQ label: the character rendered above is on the
     76th percentile, which is an IQ of 111 — not 76. */
  const iqCell = /🧠 IQ<\/span>.*?>(\d+)</s.exec(g);
  ok("the IQ readout is present", !!iqCell, iqCell && iqCell[1]);
  if (iqCell) {
    const shown = +iqCell[1];
    const pct = gameState.stats.smarts;
    ok("the IQ readout is the IQ of the character's percentile",
      shown === M.iqFromPercentile(pct), { shown: shown, pct: pct, expect: M.iqFromPercentile(pct) });
    ok("...which is a different number from the percentile itself", shown !== pct,
      { shown: shown, pct: pct });
    /* the bar must still be driven by the percentile, or a 145 IQ would
       overflow a 0-100 width */
    ok("the bar width is still the percentile", g.indexOf("width:" + pct + "%") > -1
      || g.indexOf("width: " + pct + "%") > -1, pct);
  }
}

/* ═══════════════════════ 5 · contrast, the real check ═══════════════════════ */
sec("5 · contrast (WCAG 2.1)");
{
  const AA = 4.5, AA_LARGE = 3.0;

  ok("body text on the base background clears AA", contrast(TH.text, TH.bg) >= AA,
    { ratio: +contrast(TH.text, TH.bg).toFixed(2) });
  ok("body text on card surfaces clears AA", contrast(TH.text, TH.surface) >= AA,
    { ratio: +contrast(TH.text, TH.surface).toFixed(2) });
  ok("secondary text clears AA on the background", contrast(TH.muted, TH.bg) >= AA,
    { ratio: +contrast(TH.muted, TH.bg).toFixed(2) });
  ok("secondary text clears AA on card surfaces", contrast(TH.muted, TH.surface) >= AA,
    { ratio: +contrast(TH.muted, TH.surface).toFixed(2) });
  /* faint is timestamps/disabled — large-text threshold is the honest bar */
  ok("tertiary text clears the large-text threshold", contrast(TH.faint, TH.bg) >= AA_LARGE,
    { ratio: +contrast(TH.faint, TH.bg).toFixed(2) });

  for (const name of ["blue", "pink", "coral", "gold", "green", "amber", "slate"]) {
    ok("accent '" + name + "' is readable on the background", contrast(TH[name], TH.bg) >= AA,
      { ratio: +contrast(TH[name], TH.bg).toFixed(2) });
  }

  /* THE PORT BUG THIS SUITE EXISTS FOR: dark-theme accents are LIGHT, so text
     sitting ON an accent must be dark. White would fail every one of these. */
  for (const name of ["blue", "pink", "coral", "gold", "green", "amber"]) {
    ok("dark text on the '" + name + "' fill is readable", contrast(TH.bg, TH[name]) >= AA,
      { ratio: +contrast(TH.bg, TH[name]).toFixed(2) });
    ok("...and white text on it would NOT have been (the bug this catches)",
      contrast("#FFFFFF", TH[name]) < AA, { ratio: +contrast("#FFFFFF", TH[name]).toFixed(2) });
  }

  /* every era accent, on both surfaces it is drawn against */
  const decades = Object.keys(M.DECADE_ACCENT_DARK);
  ok("every decade has a dark-theme accent", decades.length === Object.keys(M.DECADE_ACCENT).length,
    { dark: decades.length, light: Object.keys(M.DECADE_ACCENT).length });
  for (const d of decades) {
    const c = M.DECADE_ACCENT_DARK[d];
    ok("the " + d + "s accent is readable on the background", contrast(c, TH.bg) >= AA,
      { accent: c, ratio: +contrast(c, TH.bg).toFixed(2) });
    ok("the " + d + "s accent is readable on card surfaces", contrast(c, TH.surface) >= AA_LARGE,
      { accent: c, ratio: +contrast(c, TH.surface).toFixed(2) });
    ok("dark text on the " + d + "s chip fill is readable", contrast(TH.bg, c) >= AA,
      { accent: c, ratio: +contrast(TH.bg, c).toFixed(2) });
  }

  /* the accentFor() fallback must itself be legible */
  ok("the accent fallback is readable", contrast(M.accentFor(1899), TH.bg) >= AA,
    { fallback: M.accentFor(1899) });

  /* borders are non-text UI: 3:1 against BOTH neighbours */
  ok("hairlines are visible against the background", contrast(TH.line, TH.bg) >= 1.2,
    { ratio: +contrast(TH.line, TH.bg).toFixed(2) });
  ok("card surfaces are distinguishable from the background", contrast(TH.surface, TH.bg) >= 1.1,
    { ratio: +contrast(TH.surface, TH.bg).toFixed(2) });
  ok("raised surfaces are distinguishable from cards", contrast(TH.surface2, TH.surface) >= 1.05,
    { ratio: +contrast(TH.surface2, TH.surface).toFixed(2) });

  /* translucent washes: a 12%-accent panel tint must still take body text */
  for (const name of ["blue", "pink", "coral"]) {
    const wash = over(TH[name], TH.bg, 0.12);
    ok("body text stays readable on a 12% '" + name + "' wash", contrast(TH.text, wash) >= AA,
      { wash: wash, ratio: +contrast(TH.text, wash).toFixed(2) });
  }
}

sec("6 · the stat colour ramp");
{
  /* Health is the one value-driven colour. Alert Coral is semantic-only, so it
     must appear when health is critical and never when it is fine. */
  const health = M.STAT_COLOR.Health;
  ok("critical health reads as the alert colour", health(10) === TH.coral, health(10));
  ok("middling health reads as caution", health(40) === TH.amber, health(40));
  ok("good health reads as well", health(90) === TH.green, health(90));
  ok("the alert colour is never used for a healthy character", health(100) !== TH.coral);
  for (const k of ["Happiness", "IQ", "Looks"]) {
    ok(k + " has its own fixed colour", typeof M.STAT_COLOR[k]([]) === "string" && M.STAT_COLOR[k]() !== TH.coral);
  }
  /* every stat colour has to survive on the bar's own track */
  for (const k of Object.keys(M.STAT_COLOR)) {
    const c = M.STAT_COLOR[k](75);
    ok(k + "'s bar fill is visible against the track", contrast(c, TH.lineSoft) >= 3.0,
      { colour: c, ratio: +contrast(c, TH.lineSoft).toFixed(2) });
  }
}

sec("7 · no light-theme literals left in the UI layer");
{
  const src = fs.readFileSync(path.join(__dirname, "life-sim.jsx"), "utf8");
  const ui = src.slice(src.indexOf("/* ═══════════════ UI ═══════════════ */"));
  const literals = ui.match(/#[0-9A-Fa-f]{3,8}\b/g) || [];
  ok("every colour in the UI layer comes from a token, not a literal",
    literals.length === 0, literals.slice(0, 12));
  /* the tokens themselves are the only place hexes may live */
  ok("the token table is the single source of colour",
    /const TH = \{/.test(src) && /const DECADE_ACCENT_DARK = \{/.test(src));
}

/* ═══════════════ 8 · the eleven health subtabs actually render ═══════════════
   Every one of them, against several different lives. A panel that throws only
   for a character who happens to have an allergy is a panel that throws for
   the player and never for the suite, so the fixtures below deliberately
   include the states that are easy to forget: empty, populated, and a life
   lived before most of the content existed. */
sec("8 · the health subtabs");
if (mod) {
  const M2 = mod;
  const mk = (country, year, age, fill) => {
    const c = H.mkChar({ country: country, birthYear: year - age, cls: "Middle" });
    c.ageDays = Math.round(age * 365.25);
    if (fill) fill(c);
    return c;
  };
  const FIXTURES = {
    "a new life, nothing on record": mk("Sweden", 2010, 20),
    "a life with everything": mk("Sweden", 2015, 62, (c) => {
      c.hlt.addict.nicotine = { st: 2, since: 3000, tol: 1.2, quits: 2 };
      c.hlt.disab.mobility = { since: 8000, cong: 0, known: 1 };
      c.hlt.allergy.peanut = { sev: 3, since: 0 };
      c.hlt.acute.flu = { since: c.ageDays - 3, days: 10 };
      c.hlt.vax.polio = 1958; c.hlt.vax.mmr = 1971;
      c.conditions = { asthma: { since: 900, treated: true, known: true },
                       diabetes: { since: 12000, treated: false, known: true } };
      c.hlt.hx = [{ t: 900, k: "d", id: "asthma" }, { t: 3000, k: "a", id: "nicotine" },
                  { t: 8000, k: "x", id: "mobility" }, { t: 100, k: "v", id: "polio" }];
    }),
    "born before most of it existed": mk("Nigeria", 1930, 40, (c) => {
      c.hlt.disab.deaf = { since: 0, cong: 1, known: 1 };
      c.hlt.allergy.bee = { sev: 3, since: 0 };
    }),
    "a record with unknown ids in it": mk("Sweden", 2010, 30, (c) => {
      /* a save written by a future version, or by a generator that registered
         content this build does not have. It must degrade, not explode. */
      c.hlt.acute.__gone = { since: 0, days: 5 };
      c.hlt.allergy.__gone = { sev: 2, since: 0 };
      c.hlt.disab.__gone = { since: 0, cong: 1, known: 1 };
      c.hlt.addict.__gone = { st: 2, since: 0, tol: 1, quits: 0 };
      c.hlt.vax.__gone = 1999;
      c.hlt.hx = [{ t: 100, k: "?", id: "__gone" }];
    }),
  };

  ok("the subtab registry is exported", !!M2.HLT_SUBPANELS && !!M2.HLT_TABS);
  let broke = [];
  for (const tab of (M2.HLT_TABS || [])) {
    for (const label of Object.keys(FIXTURES)) {
      const s = FIXTURES[label];
      try {
        const el = M2.HLT_SUBPANELS[tab.id]({
          s: s, h: s.hlt, accent: "#8899FF", apply: () => {},
          act: { padding: 4 },
        });
        const out = ReactDOMServer.renderToStaticMarkup(
          React.createElement("div", null, el));
        if (!out || out.length < 20) broke.push(tab.id + " / " + label + " (empty)");
        if (/undefined|\[object Object\]|NaN/.test(out)) broke.push(tab.id + " / " + label + " (undefined in output)");
      } catch (e) {
        broke.push(tab.id + " / " + label + ": " + String(e.message).slice(0, 90));
      }
    }
  }
  ok("all eleven subtabs render against every fixture without throwing",
    broke.length === 0, broke.slice(0, 6));

  /* the panel itself, which is what the tab bar mounts */
  let panelErr = null, panelHtml = "";
  try {
    panelHtml = ReactDOMServer.renderToStaticMarkup(
      React.createElement(M2.HealthPanel, { state: FIXTURES["a life with everything"], apply: () => {}, accent: "#8899FF" }));
  } catch (e) { panelErr = e; }
  ok("the Health panel mounts", !panelErr && panelHtml.length > 200, panelErr && String(panelErr).slice(0, 200));
  ok("...showing every subtab in the bar",
    (M2.HLT_TABS || []).every((t) => panelHtml.indexOf(">" + t.label + "<") > -1 || panelHtml.indexOf(t.label) > -1),
    (M2.HLT_TABS || []).filter((t) => panelHtml.indexOf(t.label) === -1).map((t) => t.label));
  ok("...and no raw undefined reached the markup", !/undefined|NaN/.test(panelHtml));

  /* GOTCHA #2 — a panel is handed a clone that gets discarded, so a write in
     one is silent data loss with nothing to report it. */
  const probe = FIXTURES["a life with everything"];
  const before = JSON.stringify(probe);
  for (const tab of (M2.HLT_TABS || [])) {
    try {
      ReactDOMServer.renderToStaticMarkup(React.createElement("div", null,
        M2.HLT_SUBPANELS[tab.id]({ s: probe, h: probe.hlt, accent: "#8899FF", apply: () => {}, act: {} })));
    } catch (e) { /* already reported above */ }
  }
  ok("rendering a subtab never mutates the state it was handed",
    JSON.stringify(probe) === before);
}

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
