/* test-deploy.js — is the BUILT bundle actually shippable?
 *
 * Every other suite tests life-sim.jsx. This one tests life-sim.bundle.js, the
 * artifact GitHub Pages actually serves, because the gap between them is where
 * a deploy breaks: a bundle can compile perfectly and still mount nothing, or
 * reach for a React that isn't there, or call a storage API in the wrong shape.
 * GitHub Pages serves this repo's root with no CI step, so the committed bundle
 * IS the live site and nothing downstream will catch a bad one.
 *
 * It loads the real files in the real order index.html uses — storage-polyfill
 * first, then the bundle — inside jsdom against a real localStorage, which is
 * the environment the installed PWA runs in and the one no other suite covers.
 *
 * Run: node test-deploy.js     (needs jsdom, react, react-dom installed)
 */
"use strict";

const fs = require("fs");
const path = require("path");

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log("  FAIL: " + name + (extra !== undefined ? "  " + JSON.stringify(extra).slice(0, 300) : "")); }
}
function sec(t) { console.log("\n=== " + t + " ==="); }

const ROOT = __dirname;
const bundlePath = path.join(ROOT, "life-sim.bundle.js");
const polyPath = path.join(ROOT, "storage-polyfill.js");
const indexPath = path.join(ROOT, "index.html");

/* esbuild's default charset is ASCII, so every emoji and dash in the source is
   written as \u{1F3AF} / → in the shipped file — the ORIGINAL deployed
   bundle does the same. Decoding here lets the content probes below be written
   in plain readable text instead of escape soup. */
function decodeEscapes(src) {
  return src
    .replace(/\\u\{([0-9a-fA-F]+)\}/g, (_, h) => {
      try { return String.fromCodePoint(parseInt(h, 16)); } catch (e) { return _; }
    })
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

async function main() {
  /* ═══════════════ 1 · the artifact exists and is sane ═══════════════ */
  sec("1 · the built artifact");
  ok("life-sim.bundle.js exists", fs.existsSync(bundlePath));
  const raw = fs.existsSync(bundlePath) ? fs.readFileSync(bundlePath, "utf8") : "";
  const bundle = decodeEscapes(raw);
  ok("it is not empty", raw.length > 100000, raw.length);
  ok("React is INLINED, not expected from a CDN",
    /react\.production\.min\.js|Objects are not valid as a React child/.test(bundle));
  ok("it mounts itself into #root", raw.indexOf('getElementById("root")') > -1);
  ok("it uses createRoot (the React 18 API)", raw.indexOf("createRoot") > -1);
  /* "minified" means the CODE is dense; esbuild appends a multi-line license
     banner, so a line count is the wrong probe. Longest line is the honest one. */
  const longest = raw.split("\n").reduce((a, l) => Math.max(a, l.length), 0);
  ok("the code is minified", longest > 50000, { longestLine: longest });
  ok("no bare require() survived into a browser bundle",
    !/[^.\w]require\(["']/.test(raw.replace(/\/\*[\s\S]*?\*\//g, "")));
  ok("no ESM syntax in an IIFE build", raw.indexOf("import.meta") === -1);
  ok("it is wrapped as an IIFE", /^\(\(\)=>\{|^\(function/.test(raw.trim()));

  const html = fs.readFileSync(indexPath, "utf8");
  ok("index.html provides the #root the bundle looks for", /id="root"/.test(html));
  ok("index.html loads the polyfill BEFORE the bundle",
    html.indexOf("storage-polyfill.js") < html.indexOf("life-sim.bundle.js"));
  ok("index.html loads no React of its own (so the bundle must carry it)",
    !/react/i.test(html.replace(/<!--[\s\S]*?-->/g, "")));

  /* ═════════════ 2 · it boots in a browser-shaped world ═════════════ */
  sec("2 · boot in jsdom, the way the installed PWA does");
  const { JSDOM } = require("jsdom");
  const errors = [];
  const dom = new JSDOM(html, {
    runScripts: "outside-only",
    url: "https://logostona.github.io/A-Life-v0.44/",
    pretendToBeVisual: true,
  });
  const w = dom.window;
  w.addEventListener("error", (e) => errors.push(String(e.message || e)));
  const origErr = console.error;
  console.error = (...a) => errors.push(a.map(String).join(" ").slice(0, 200));
  if (!w.matchMedia) {
    w.matchMedia = () => ({ matches: false, media: "", onchange: null,
      addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; } });
  }

  w.eval(fs.readFileSync(polyPath, "utf8"));
  ok("storage-polyfill defines window.storage", typeof w.storage === "object" && w.storage !== null);
  /* the artifact runtime's API is get/set/delete/list returning promises —
     NOT localStorage's getItem/setItem, which is the shape the game calls */
  ok("...with the exact API saveGame/loadGame/wipeGame call",
    w.storage && ["get", "set", "delete", "list"].every((k) => typeof w.storage[k] === "function"),
    w.storage && Object.keys(w.storage));

  try { w.eval(raw); } catch (e) { errors.push(String(e && e.stack ? e.stack : e).slice(0, 600)); }

  /* React 18's createRoot renders CONCURRENTLY — #root is legitimately empty
     for a tick after eval, and the app's first paint waits on loadGame()'s
     promise besides. Flush both before asserting. */
  await new Promise((r) => setTimeout(r, 120));
  const mounted = w.document.getElementById("root").innerHTML;
  console.error = origErr;

  ok("the bundle evaluates with no uncaught error", errors.length === 0, errors.slice(0, 2));
  ok("it rendered into #root", mounted.length > 50, { chars: mounted.length });
  ok("...and it is the real UI, not an empty shell", /<div|<button/.test(mounted), mounted.slice(0, 160));
  /* a fresh visitor with no save must land on Creation, not a blank page or a
     stuck loading state */
  ok("a first-time visitor gets the character-creation screen",
    /A Life|Begin life/.test(mounted), mounted.slice(0, 200));

  /* ═══════ 3 · the deployed artifact really carries this work ═══════ */
  sec("3 · the shipped bundle carries this session's work");
  {
    /* Minification renames every symbol, so grepping for function names proves
       nothing. String literals are the only reliable probe of a minified
       build — the method RESTART-BRIEF.md §4 records for exactly this. */
    const has = (n) => bundle.indexOf(n) > -1;

    ok("dark theme: the Dusk Ink base colour shipped", has("#12131A"));
    ok("dark theme: Compass Blue shipped", has("#5BCEFA"));
    ok("dark theme: a dark-tuned decade accent shipped", has("#6BA6DE"));
    ok("no pre-redesign paper background survives", !has("#F6F5F1"));
    ok("the ledger typeface shipped", has("ui-monospace"));

    ok("the Compass Advance shipped", has("How far to go"));
    ok("...with its screen-reader label", has("Live on "));
    ok("the old Live-on button text is gone", !has("Live on ⏳"));
    ok("the Act control shipped", has("Act"));
    ok("the stats disclosure is gone (they are always visible now)", !has("stats ▾"));

    ok("Phase 9 upkeep shipped", has("unfit for human habitation"));
    ok("Phase 9 insurance shipped", has("gradually operating cause"));
    ok("S11 voluntary sale shipped", has("Selling up"));
    ok("...its destination screen", has("And then where?"));
    ok("...and its negative-equity outcome", has("still was not enough"));

    /* the bug fixes are behavioural, not textual — assert the one that left a
       visible artifact: no "undefined" currency string can be built any more */
    ok("no literal 'undefined' currency concatenation shipped", !has("undefined£"));
  }

  /* ═══════════ 4 · saves persist through the real polyfill ═══════════ */
  sec("4 · persistence through real localStorage");
  {
    const payload = JSON.stringify({ v: 4, hello: "world", nested: { n: 1 } });
    await w.storage.set("a_life_deploy_probe", payload);
    const got = await w.storage.get("a_life_deploy_probe");
    ok("a save round-trips through window.storage", got && got.value === payload,
      got && String(got.value).slice(0, 60));
    ok("...and is really backed by localStorage",
      String(w.localStorage.getItem("lifesim_storage:local:a_life_deploy_probe") || "") === payload);
    await w.storage.delete("a_life_deploy_probe");
    const gone = await w.storage.get("a_life_deploy_probe");
    ok("...and wiping actually removes it", gone === null, gone);
  }

  console.log("\n" + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.log("\nFATAL: " + String(e && e.stack ? e.stack : e).slice(0, 800));
  console.log("\n" + pass + " passed, " + (fail + 1) + " failed");
  process.exit(1);
});
