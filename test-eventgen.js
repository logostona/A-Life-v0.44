/* test-eventgen.js — EVT P1: proposer, kind registry, validator.
 *
 * WHAT THIS SUITE IS DEFENDING
 *
 * The whole design rests on one invariant: a realiser never widens what is
 * possible, it only picks a point inside a space the proposer already declared
 * legal. The validator is what makes that true rather than merely intended, so
 * most of this file is adversarial — it hands the validator the output of a
 * realiser that is broken, confused, or hostile, and checks that the game is
 * unharmed either way.
 *
 * The single most important assertion in the file is that `fx.run` can never
 * survive validation. `run` is an arbitrary function; 95 of the 220 hand-written
 * POOL events use it, which is fine because a human wrote them. A generated
 * event that could emit it would be arbitrary code execution driven by model
 * output. It is not discouraged in a prompt — it is dropped by a validator that
 * only ever copies known keys, so the value is never inspected, never logged,
 * and never reaches a code path that reasons about it.
 *
 * P1 ships fallback-only: there is no model, no network, nothing async. All of
 * the below is deterministic and runs on a plane.
 *
 * Run: node --max-old-space-size=4096 test-eventgen.js
 */
"use strict";

const path = require("path");
const fs = require("fs");
const H = require(path.join(__dirname, "harness.js"));
const M = H.M;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log("  FAIL: " + name + (extra !== undefined ? "  " + JSON.stringify(extra).slice(0, 320) : "")); }
}
function sec(t) { console.log("\n=== " + t + " ==="); }

const at = (age, o) => {
  /* seeded per call: mkChar draws from Math.random for family, names and
     stats, so two "identical" characters are not identical unless the stream
     is pinned first — which the determinism assertion below depends on */
  H.seed((o && o.seed) || 20240817);
  const c = H.mkChar(Object.assign({ country: "Sweden", birthYear: 1990, cls: "Middle" }, o || {}));
  c.ageDays = Math.round(age * 365.25);
  return c;
};
/* force a specific kind by cooling every other one down */
const only = (s, id) => { for (const k of M.EVT_KINDS) if (k.id !== id) s.flags["evt_" + k.id] = s.ageDays; return s; };
const proposeFor = (s) => M.evtPropose(s, M.hreRng(1, 2, "test"));

/* ═══════════════ 1 · the registry ═══════════════ */
sec("1 · the kind registry");

{
  ok("there are kinds", M.EVT_KINDS.length > 0, M.EVT_KINDS.length);
  ok("ids are unique", new Set(M.EVT_KINDS.map((k) => k.id)).size === M.EVT_KINDS.length);
  ok("every kind declares an age band and a weight",
    M.EVT_KINDS.every((k) => typeof k.minAge === "number" && typeof k.maxAge === "number" && k.maxAge > k.minAge && k.w > 0));
  ok("every kind declares a cooldown", M.EVT_KINDS.every((k) => typeof k.cd === "number" && k.cd > 0));
  ok("every kind declares bands", M.EVT_KINDS.every((k) => k.bands && Object.keys(k.bands).length > 0));
  ok("every kind declares a builder", M.EVT_KINDS.every((k) => typeof k.build === "function"));
  ok("every kind declares which flags it may set (even if none)",
    M.EVT_KINDS.every((k) => Array.isArray(k.flags)));

  /* bands must be ordered and finite, or clamping is meaningless */
  let badBand = [];
  for (const k of M.EVT_KINDS) {
    for (const b in k.bands) {
      const v = k.bands[b];
      if (!Array.isArray(v) || v.length !== 2 || !isFinite(v[0]) || !isFinite(v[1]) || v[0] > v[1]) badBand.push(k.id + "." + b);
    }
  }
  ok("every band is a finite ordered pair", badBand.length === 0, badBand);

  /* THE AUTHORING TRAP. applyFx has exactly three relationship writers, onto
     family/friends/romance. A band naming a cast slot from any other store is
     a silent no-op — everything renders and nothing happens. This caught a
     real one during the build: olderRelative cast from `relatives`, which no
     fx key can address. */
  let unaddressable = [];
  for (const k of M.EVT_KINDS) {
    const bad = M.evtBandsAddressable(k);
    if (bad.length) unaddressable.push(k.id + ": " + bad.join("; "));
  }
  ok("no band silently addresses a store that applyFx cannot write",
    unaddressable.length === 0, unaddressable);

  /* the fallback must be a complete playable event, not a placeholder */
  const s = at(40);
  let badFallback = [];
  for (const k of M.EVT_KINDS) {
    const cast = M.evtResolveCast(s, k, M.hreRng(7, 7, "cast"));
    if (cast === null) continue;                 // uncastable for this fixture is fine
    let ev = null;
    try { ev = k.build(s, cast, M.hreRng(7, 7, "b")); } catch (e) { badFallback.push(k.id + ": threw " + e.message); continue; }
    if (!ev || !ev.text || !ev.title || !ev.emoji) badFallback.push(k.id + ": incomplete");
    else if (!Array.isArray(ev.options) || ev.options.length < 2) badFallback.push(k.id + ": needs at least two choices");
    else if (/undefined|\[object/.test(ev.text + ev.options.map((o) => o.label).join(""))) badFallback.push(k.id + ": undefined in text");
  }
  ok("every fallback is a complete, playable event", badFallback.length === 0, badFallback);

  /* a fallback must never use fx.run either — the fallback and a realisation
     have to be interchangeable, or the feature behaves differently with the
     model on than off */
  let usesRun = [];
  for (const k of M.EVT_KINDS) {
    const cast = M.evtResolveCast(s, k, M.hreRng(7, 7, "cast"));
    if (cast === null) continue;
    const ev = k.build(s, cast, M.hreRng(7, 7, "b"));
    for (const o of ev.options) if (o.fx && typeof o.fx.run === "function") usesRun.push(k.id);
  }
  ok("no fallback reaches for fx.run", usesRun.length === 0, usesRun);
}

/* ═══════════════ 2 · the proposer ═══════════════ */
sec("2 · the proposer");

{
  const s = at(34);
  const p = proposeFor(s);
  ok("a proposal is produced", !!p);
  ok("...naming a real kind", !!M.EVT_BY_ID[p.kind], p.kind);
  ok("...with a stable id", typeof p.id === "string" && p.id.indexOf(p.kind) > -1);
  ok("...and bands", p.bands && Object.keys(p.bands).length > 0);
  ok("...and an option count range", Array.isArray(p.optionCount) && p.optionCount.length === 2);
  ok("...and a complete fallback", !!p.fallback && !!p.fallback.text && p.fallback.options.length >= 2);

  /* CONTEXT DISCIPLINE — only what the player can already see. This is not
     only privacy: the game is careful that orientation is the character's to
     disclose, and a narrator that knows it will leak it into prose. */
  ok("the situation carries only visible facts",
    JSON.stringify(Object.keys(p.situation).sort()) === JSON.stringify(["age", "country", "recentFeed", "year"]));
  const blob = JSON.stringify(p);
  ok("no hidden identity reaches the proposal",
    blob.indexOf(String(s.hidden.orientation)) === -1 || s.discovered.orientation === true,
    s.hidden.orientation);
  ok("the whole save is not shipped", blob.length < 4000, blob.length);
  ok("a proposal is plain JSON",
    JSON.stringify(JSON.parse(JSON.stringify(p))) === JSON.stringify(p));
}
{
  /* determinism — the same life must propose the same event */
  const a = at(34, { first: "Same", last: "Person" });
  const b = at(34, { first: "Same", last: "Person" });
  const pa = M.evtPropose(a, M.hreRng(99, 5, "d"));
  const pb = M.evtPropose(b, M.hreRng(99, 5, "d"));
  ok("proposing is deterministic", JSON.stringify(pa) === JSON.stringify(pb));

  const SRC = fs.readFileSync(H.SRC, "utf8");
  const strip = (x) => x.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
  const start = SRC.lastIndexOf("/*", SRC.indexOf("EVT · P1 · PROPOSER"));
  const end = SRC.indexOf("/* ═══════════════ KB · KEYBINDINGS", start);
  ok("the EVT block was located", start > 0 && end > start);
  const block = strip(SRC.slice(start, end));
  ok("...and reaches the end of the subsystem", SRC.slice(start, end).includes("function evtMaybeFire"));
  ok("generation never uses Math.random", !/Math\.random/.test(block),
    (block.match(/.{40}Math\.random.{20}/) || [])[0]);
  ok("no country is named in a conditional", !/country\s*===\s*["']/.test(block));
}
{
  /* casting comes from real people, and never from the dead */
  /* a fresh character has NO friends — they are made during play — so the
     fixture has to supply them, and that is exactly why castability gates
     eligibility rather than being discovered later */
  const s = only(at(34), "friendDrift");
  s.friends = { f1: { name: "Kim", role: "Friend", rel: 30 }, f2: { name: "Robin", role: "Friend", rel: 44 } };
  const p = proposeFor(s);
  ok("a cast slot resolves to somebody real", !!p && !!p.cast.friend && !!s.friends[p.cast.friend.key],
    p && p.cast);
  ok("...recording which store they live in", p && p.cast.friend.store === "friends");

  /* the dead, and pets, must not be cast into a scene about a friend */
  const d = only(at(34), "friendDrift");
  d.friends = { f1: { name: "Kim", role: "Friend", rel: 30, deceased: true },
                dog: { name: "Bruno", role: "Dog 🐕", rel: 20, pet: true } };
  const dp = M.evtPropose(d, M.hreRng(3, 3, "dead"));
  ok("a kind that cannot be cast does not fire it",
    !dp || dp.kind !== "friendDrift", dp && dp.kind);
}
{
  /* eligibility: age bands, conditions and cooldowns all gate */
  ok("a toddler is eligible for nothing", M.evtEligible(at(2)).length === 0);
  /* A job is necessary but NOT sufficient: the scene is about a specific
     colleague, and colleagues materialise over time through pplOnTick. So the
     kind stays out of the pool until there is somebody to cast — which is
     castability doing exactly its job. */
  const employed = at(40);
  employed.career.job = { industry: "tech", title: "Dev", tier: 2, salary: 300, perf: 55, since: 0 };
  ok("no job locks the work kind", !M.evtEligible(at(40)).some((k) => k.id === "workFriction"));
  ok("...and a job alone is not enough, with no colleagues yet",
    !M.evtEligible(employed).some((k) => k.id === "workFriction"));
  employed.ppl = { "work:1": { name: "Ada", role: "Colleague", cat: "work", rel: 50, since: 0 } };
  ok("...but a job and a colleague unlocks it",
    M.evtEligible(employed).some((k) => k.id === "workFriction"));

  const cooled = at(40);
  const n0 = M.evtEligible(cooled).length;
  for (const k of M.EVT_KINDS) cooled.flags["evt_" + k.id] = cooled.ageDays;
  ok("cooldowns gate", M.evtEligible(cooled).length === 0, [n0, M.evtEligible(cooled).length]);
  ok("...and expire", (() => { cooled.ageDays += 5000; return M.evtEligible(cooled).length > 0; })());
}

/* ═══════════════ 3 · the validator, adversarially ═══════════════ */
sec("3 · the validator trusts nothing");

{
  const s = only(at(34), "olderRelative");
  const p = proposeFor(s);
  ok("a proposal to validate against", !!p && p.kind === "olderRelative", p && p.kind);
  const key = p.cast.elder.key;
  const good = (fx) => ({ text: "A real line of prose.", options: [
    { label: "One", fx: fx }, { label: "Two", fx: { stats: { happiness: -1 } } }] });

  /* THE ONE THAT MATTERS MOST */
  let fired = false;
  const withRun = M.evtValidate(p, good({ run: () => { fired = true; }, stats: { happiness: 1 } }));
  ok("fx.run never survives validation",
    withRun && withRun.options.every((o) => typeof o.fx.run === "undefined"), withRun && withRun.options);
  ok("...and is not merely nulled — the key is absent",
    JSON.stringify(withRun).indexOf("run") === -1);
  ok("...and was never invoked", fired === false);
  /* applying the validated result must also be inert with respect to it */
  const d = JSON.parse(JSON.stringify(s));
  M.applyFx(d, withRun.options[0].fx);
  ok("...and applying the result does not execute it", fired === false);

  /* clamping, not rejecting: an overreaching realiser still produces a scene */
  const over = M.evtValidate(p, good({ stats: { happiness: 400 } }));
  ok("an out-of-band value is clamped to the band",
    over && over.options[0].fx.stats.happiness === p.bands["stats.happiness"][1],
    over && over.options[0].fx);
  const under = M.evtValidate(p, good({ stats: { happiness: -999 } }));
  ok("...at both ends", under.options[0].fx.stats.happiness === p.bands["stats.happiness"][0]);

  /* everything unauthorised is dropped */
  ok("a person not in the cast is dropped",
    !M.evtValidate(p, good({ rel: { mom: 50 }, stats: { happiness: 1 } })).options[0].fx.rel);
  ok("an invented stat is dropped",
    !M.evtValidate(p, good({ stats: { luck: 99, happiness: 1 } })).options[0].fx.stats.luck);
  ok("an unbanded key is dropped",
    M.evtValidate(p, good({ money: 9999, stats: { happiness: 1 } })).options[0].fx.money === undefined);
  ok("an ungranted flag is dropped",
    !M.evtValidate(p, good({ flags: { retired: true }, stats: { happiness: 1 } })).options[0].fx.flags);
  ok("creating a person is dropped",
    !M.evtValidate(p, good({ addFriend: { key: "z", name: "Ghost", rel: 99 }, stats: { happiness: 1 } })).options[0].fx.addFriend);
  ok("a breakup is dropped",
    !M.evtValidate(p, good({ breakup: { key: "r1" }, stats: { happiness: 1 } })).options[0].fx.breakup);
  ok("chaining another popup is dropped",
    !M.evtValidate(p, good({ next: { title: "x", options: [] }, stats: { happiness: 1 } })).options[0].fx.next);

  /* what IS authorised passes through intact */
  const legal = M.evtValidate(p, good({ stats: { happiness: 3 }, rel: { [key]: 8 }, emergent: { kindness: 4 }, feed: "a line" }));
  ok("a legal effect passes through", legal && legal.options[0].fx.stats.happiness === 3);
  ok("...including the cast relationship", legal.options[0].fx.rel[key] === 8);
  ok("...and the feed line", legal.options[0].fx.feed === "a line");
  /* and it must actually move the game */
  const e = JSON.parse(JSON.stringify(s));
  const relBefore = e.family[key].rel;
  M.applyFx(e, legal.options[0].fx);
  ok("...and applying it moves the state", e.family[key].rel > relBefore, [relBefore, e.family[key].rel]);
}
{
  /* structural nonsense is rejected outright rather than patched up */
  const s = only(at(34), "olderRelative");
  const p = proposeFor(s);
  const bad = (r) => M.evtValidate(p, r) === null;
  ok("no text", bad({ text: "", options: [{ label: "a", fx: { stats: { happiness: 1 } } }, { label: "b", fx: {} }] }));
  ok("text over the cap", bad({ text: "x".repeat(700), options: [{ label: "a", fx: { stats: { happiness: 1 } } }, { label: "b", fx: {} }] }));
  ok("no options", bad({ text: "ok", options: [] }));
  ok("options not an array", bad({ text: "ok", options: "nope" }));
  ok("too many options", bad({ text: "ok", options: [1, 2, 3, 4, 5].map((i) => ({ label: "o" + i, fx: { stats: { happiness: 1 } } })) }));
  ok("duplicate labels", bad({ text: "ok", options: [{ label: "same", fx: { stats: { happiness: 1 } } }, { label: "same", fx: { stats: { happiness: -1 } } }] }));
  ok("a label over the cap", bad({ text: "ok", options: [{ label: "x".repeat(70), fx: { stats: { happiness: 1 } } }, { label: "b", fx: { stats: { happiness: -1 } } }] }));
  ok("every option inert", bad({ text: "ok", options: [{ label: "a", fx: {} }, { label: "b", fx: {} }] }));
  ok("a malformed option", bad({ text: "ok", options: [null, { label: "b", fx: {} }] }));
  ok("nothing at all", bad(null) && M.evtValidate(null, { text: "x", options: [] }) === null);
  ok("a string instead of an object", bad("hello"));
  ok("NaN and Infinity are not numbers", (() => {
    const r = M.evtValidate(p, { text: "ok", options: [
      { label: "a", fx: { stats: { happiness: NaN } } },
      { label: "b", fx: { stats: { happiness: Infinity } } },
      { label: "c", fx: { stats: { happiness: 1 } } }] });
    return r === null || r.options.every((o) => !o.fx.stats || isFinite(o.fx.stats.happiness || 0));
  })());
  ok("the validator never throws", (() => {
    const junk = [undefined, 0, [], { text: 1 }, { text: "x", options: [{}] }, { text: "x", options: [{ label: "a", fx: 5 }] }];
    for (const j of junk) { try { M.evtValidate(p, j); } catch (e) { return false; } }
    return true;
  })());
}
{
  /* the emoji and title come from the proposal, so generated content cannot
     restyle the game or impersonate another system's beats */
  const s = only(at(34), "olderRelative");
  const p = proposeFor(s);
  const r = M.evtValidate(p, { text: "ok", emoji: "💀", title: "SYSTEM ALERT",
    options: [{ label: "a", fx: { stats: { happiness: 1 } } }, { label: "b", fx: { stats: { happiness: -1 } } }] });
  ok("a realisation cannot choose its own emoji", r.emoji === p.fallback.emoji, r.emoji);
  ok("...nor its own title", r.title === p.fallback.title, r.title);
  ok("...and is marked as generated", r.generated === 1);
}

/* ═══════════════ 4 · end to end ═══════════════ */
sec("4 · it reaches the player");

{
  /* STRICTLY ADDITIVE. Generated events are NOT registered in POOL, and that is
     the correction the soak forced: winning a POOL draw means a hand-written
     event did not fire, and a few percent of that starved housing progression
     badly enough that test-edu-s07 reported 279 disagreements between the two
     housing authorities. Making the POOL entry produce nothing did not help —
     occupying the slot was the whole problem. */
  ok("generated events are not registered in POOL",
    M.POOL.filter((e) => e.id === "generated").length === 0);
  const SRC = fs.readFileSync(H.SRC, "utf8");
  ok("...and fire only when the hand-written pool fired nothing",
    /if \(!poolFired && !s\.pending\) \{/.test(SRC));
  ok("...behind a global cooldown as well as the per-kind ones", M.EVT_GLOBAL_CD > 0);

  const s = at(34);
  const out = M.evtMaybeFire(JSON.parse(JSON.stringify(s)));
  ok("firing produces an event", !!out && !!out.text, out);
  ok("...with choices", out.options.length >= 2);
  ok("...marked generated so it can be told apart", out.generated === 1);
  ok("...and no option carries fx.run", out.options.every((o) => typeof o.fx.run === "undefined"));

  /* both cooldowns must be written, or events repeat */
  const probe = JSON.parse(JSON.stringify(s));
  const o2 = M.evtMaybeFire(probe);
  ok("firing records the global cooldown", probe.flags.evt_last === probe.ageDays);
  ok("...and the kind's own", probe.flags["evt_" + o2.id.split(":")[1]] === probe.ageDays);
  ok("...so an immediate second call declines", M.evtMaybeFire(probe) === null);

  ok("a toddler never gets one", M.evtMaybeFire(at(3)) === null);
}
{
  /* GOTCHA #6 — observable outcomes, never step counts */
  let crashes = 0, aged = 0, sawGenerated = 0, runLeaks = 0;
  for (const sd of [4, 12, 21, 30, 41]) {
    H.seed(sd);
    const s = H.mkChar({ country: ["Sweden", "Brazil", "India"][sd % 3], birthYear: 1960 + (sd % 3) * 15 });
    let r;
    try { r = H.runLife(s, { maxSteps: 2200, days: 30 }); } catch (e) { crashes++; continue; }
    if (r.finalAge > 5) aged++;
    const st = r.state;
    for (const k of Object.keys(st.flags)) if (k.indexOf("evt_") === 0) { sawGenerated++; break; }
    if (JSON.stringify(st).indexOf('"run"') > -1) runLeaks++;
  }
  ok("no life crashed", crashes === 0, crashes);
  ok("time actually moved", aged === 5, aged);
  ok("generated events fired across a life", sawGenerated >= 4, sawGenerated);
  ok("nothing named run was ever persisted into a save", runLeaks === 0, runLeaks);
}

/* ══════════════════════════════════════════════════════════════════════════
   EVT P2 · THE PROVIDER SEAM

   P2 is where a model can answer at all, so this half of the suite is about
   the two properties that make that safe rather than merely working:

     1. a realisation can change the WORDS and nothing else, and that is true
        by SHAPE — evtRealiseProse takes a string, so there is no parameter
        through which options or effects could arrive;
     2. no test ever touches the network. Everything below runs against a
        registered fixture, which swaps the transport and leaves prompt
        building, sanitising and realisation running exactly as they do in the
        browser. A test that makes a network call is a test that fails on a
        plane (architecture §7).
   ═══════════════════════════════════════════════════════════════════════ */
sec("P2 · the provider seam");
{
  const SRC = fs.readFileSync(H.SRC, "utf8");
  const clean = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  /* THE structural claim. "The model is never on the hot path" is worth
     nothing if a later helper quietly opens its own socket. */
  const fetches = (clean.match(/[^.\w]fetch\s*\(/g) || []).length;
  ok("there is exactly one fetch in the whole program", fetches === 1, fetches);
  ok("...and it is inside llmComplete", (() => {
    const i = clean.indexOf("async function llmComplete");
    const j = clean.indexOf("\nfunction ", i + 10);
    const body = clean.slice(i, j > i ? j : undefined);
    return /[^.\w]fetch\s*\(/.test(body);
  })());
  /* The hot path itself. advance() and evtMaybeFire must be synchronous —
     the popup is on screen with its written text before a model is asked
     anything, which is the property the whole design rests on. */
  const bodyOf = (name) => {
    const i = clean.indexOf("function " + name + "(");
    if (i < 0) return "";
    const j = clean.indexOf("\nfunction ", i + 10);
    return clean.slice(i, j > i ? j : i + 8000);
  };
  for (const fn of ["advance", "evtMaybeFire", "evtPropose", "evtBuildProposal"]) {
    const b = bodyOf(fn);
    ok(fn + " exists", b.length > 0);
    ok(fn + " is not async", !new RegExp("async\\s+function\\s+" + fn + "\\b").test(clean));
    ok(fn + " awaits nothing", !/\bawait\b/.test(b));
    ok(fn + " never calls the model", !/llmComplete|evtEnhance|requestAINarration/.test(b));
  }
  ok("the realiser is the only async thing in EVT", /function evtEnhance/.test(clean));

  /* every provider is a complete row, or it is a trap for whoever adds one */
  ok("there are at least three providers", M.LLM_PROVIDERS.length >= 3);
  for (const p of M.LLM_PROVIDERS) {
    ok(p.id + ": has a label", typeof p.label === "string" && p.label.length > 0);
    ok(p.id + ": has a note explaining its cost", typeof p.note === "string" && p.note.length > 20);
    ok(p.id + ": builds and extracts", typeof p.build === "function" && typeof p.extract === "function");
    if (p.id !== "off") {
      ok(p.id + ": ships a working default endpoint", /^https?:\/\//.test(p.endpoint), p.endpoint);
      ok(p.id + ": ships a default model", typeof p.model === "string" && p.model.length > 0);
    }
  }
  ok("off is the default a new life gets", M.aiInit().provider === "off");
  ok("...and a new life has it disabled entirely", M.aiInit().enabled === false);
}
{
  /* 2 · NOTHING RUNS WITHOUT BEING ASKED FOR, which is what keeps every other
     suite in this repo offline. Each reason is reported distinctly, because
     the settings screen shows the string. */
  const s = at(30);
  ok("off by default", M.llmAvailable(s) === false);
  ok("...and says why", M.llmUnavailableReason(s) === "turned off");
  s.ai.enabled = true;
  ok("enabling alone is not enough", M.llmAvailable(s) === false);
  ok("...because no provider is chosen", M.llmUnavailableReason(s) === "no provider chosen");
  s.ai.provider = "openai";
  ok("a chosen provider brings its own endpoint and model", M.llmUnavailableReason(s) === null);
  ok("...and that endpoint is local", M.llmConfigFor(s).endpoint.indexOf("localhost") > -1);
  s.ai.provider = "anthropic";
  ok("a remote provider still wants a key", M.llmUnavailableReason(s) === "no API key");
  /* the key is memory-only, never in the save — a static PWA has nowhere safe
     to keep a secret, and localStorage is not it */
  M.llmSetKey("test-key-not-a-real-one");
  ok("...which lives in memory, not in the save", M.llmUnavailableReason(s) === null);
  ok("...and never reaches the serialised state", JSON.stringify(s).indexOf("test-key-not-a-real-one") === -1);
  M.llmSetKey("");
  /* an unknown provider id in a hand-edited save must not become reachable */
  s.ai.provider = "definitely-not-a-provider";
  M.aiMigrate(s);
  ok("an unknown provider migrates back to off", s.ai.provider === "off");
}
{
  /* 3 · MIGRATION — Gotcha #4, both halves in the same patch */
  const old = { enabled: true, level: "rich" };            /* a pre-P2 save */
  const s = at(30); s.ai = JSON.parse(JSON.stringify(old));
  M.aiMigrate(s);
  ok("a pre-P2 save keeps what it had", s.ai.enabled === true && s.ai.level === "rich");
  ok("...and gains the provider field", s.ai.provider === "off");
  ok("...so it behaves exactly as it did before", M.llmAvailable(s) === false);
  const withKey = at(30); withKey.ai = { enabled: true, level: "flavor", provider: "anthropic", key: "leaked" };
  M.aiMigrate(withKey);
  ok("a key stored by an older build is removed from the save", withKey.ai.key === undefined);
  const broken = at(30); broken.ai = "nonsense";
  M.aiMigrate(broken);
  ok("a corrupt ai blob is replaced wholesale", broken.ai.provider === "off" && broken.ai.enabled === false);
}
{
  /* 4 · THE PROMPT CARRIES WHAT THE PROSE HAS TO STAY COMPATIBLE WITH */
  const s = only(at(34), "friendDrift");
  s.friends = { f2: { name: "Kim", role: "Friend", rel: 41, g: "F" } };
  const prop = proposeFor(s);
  ok("a proposal exists to realise", !!prop, prop);
  if (prop) {
    const prompt = M.evtProsePrompt(prop);
    ok("the prompt exists", typeof prompt === "string" && prompt.length > 100);
    ok("...and states the register", /unsentimental/i.test(prompt) && /saccharine/i.test(prompt));
    ok("...and carries the option labels", prop.fallback.options.every((o) => prompt.indexOf(o.label) > -1));
    ok("...and says the choices must stay open", /still open/i.test(prompt));
    ok("...and forbids inventing a person", /not introduce a new person/i.test(prompt));
    ok("...and asks for prose, not JSON", /no JSON/i.test(prompt) && /ONLY the finished prose/i.test(prompt));

    /* §5 — the model learns nothing the player does not already know */
    s.hidden.gender = "Trans man"; s.discovered.gender = false;
    s.hidden.orientation = "Gay";  s.discovered.orientation = false;
    const p2 = M.evtProsePrompt(proposeFor(s));
    ok("an undiscovered identity never reaches the prompt",
      p2.indexOf("Trans man") === -1 && p2.indexOf("Gay") === -1);
  }
}
{
  /* 5 · THE SANITISER, adversarially. Each of these is a real thing models do. */
  const names = { cast: new Set(["Kim"]), others: new Set(["Marguerite", "Bo"]) };
  const good = "Kim's name comes up in a message you do not answer for two days. " +
               "You draft three replies on the bus and send none of them.";
  ok("clean prose survives", M.evtSanitiseProse(good, names) === good);
  ok("a code fence is stripped", M.evtSanitiseProse("```\n" + good + "\n```", names) === good);
  ok("a preamble is stripped", M.evtSanitiseProse("Sure, here is the scene: " + good, names) === good);
  ok("whole-response quoting is stripped", M.evtSanitiseProse('"' + good + '"', names) === good);
  ok("JSON is rejected outright", M.evtSanitiseProse('{"text":"' + good + '"}', names) === null);
  ok("a refusal is rejected", M.evtSanitiseProse("As an AI language model I cannot write that.", names) === null);
  ok("empty is rejected", M.evtSanitiseProse("   ", names) === null);
  ok("a non-string is rejected", M.evtSanitiseProse(null, names) === null && M.evtSanitiseProse(42, names) === null);
  ok("too short is not an upgrade", M.evtSanitiseProse("Kim called.", names) === null);
  /* rejected rather than truncated: a sentence cut mid-clause reads worse
     than the hand-written text it was meant to improve */
  ok("over-length is rejected, not truncated", M.evtSanitiseProse("x".repeat(M.EVT_PROSE_MAX + 1), names) === null);
  /* the failure the architecture names: the model reaches for somebody who is
     not in this scene — the mother, the one who died in 1974 */
  ok("naming somebody not in the cast is rejected",
    M.evtSanitiseProse(good + " Marguerite would have had something to say about that.", names) === null);
  ok("...but the cast themselves are fine", M.evtSanitiseProse(good, names) === good);
  ok("...and a substring of a known name is not a false positive",
    typeof M.evtSanitiseProse("Kim's message sat there unanswered while the bomb of it went off quietly.", names) === "string");

  /* the name set is built from every store the save has */
  const s = at(40);
  s.friends = { f2: { name: "Kim", role: "Friend", rel: 41 } };
  s.family = { mom: { name: "Marguerite", role: "Mom", rel: 60 } };
  const kn = M.evtKnownNames(s, { cast: [{ slot: "friend", name: "Kim" }] });
  ok("the cast is known", kn.cast.has("Kim"));
  ok("the player is never a stranger in their own scene", kn.cast.has(s.profile.first));
  ok("everybody else is a stranger to this scene", kn.others.has("Marguerite"));
  ok("...and the cast is not also in the stranger set", !kn.others.has("Kim"));
}
{
  /* 6 · THE SAFETY PROPERTY OF P2, WHICH IS ITS SIGNATURE.
     evtRealiseProse takes a STRING. A hostile realisation cannot smuggle
     options or fx through it because there is no parameter for them. */
  const s = only(at(34), "friendDrift");
  s.friends = { f2: { name: "Kim", role: "Friend", rel: 41, g: "F" } };
  const prop = proposeFor(s);
  const before = JSON.stringify(prop.fallback.options);
  const prose = "Kim's name comes up and you realise it has been eleven months. " +
                "You look at the message for a while and then put the phone face down.";
  const ev = M.evtRealiseProse(prop, prose);
  ok("the words change", ev.text === prose && ev.text !== prop.fallback.text);
  ok("the options do not", JSON.stringify(ev.options) === before);
  ok("...they are the proposer's own objects", ev.options === prop.fallback.options);
  ok("the title and emoji are the proposer's", ev.emoji === prop.fallback.emoji && ev.title === prop.fallback.title);
  ok("it is still marked generated", ev.generated === 1 && ev.realised === "prose");
  ok("arity is the guarantee: it takes a string, not an object", M.evtRealiseProse.length === 2);
  ok("an object where prose belongs realises nothing",
    M.evtRealiseProse(prop, { text: prose, options: [{ label: "x", fx: { run: () => {} } }] }) === null);
  ok("empty prose realises nothing", M.evtRealiseProse(prop, "  ") === null);
  ok("no proposal, no realisation", M.evtRealiseProse(null, prose) === null);
  /* and the fx that came out the other side is still declarative */
  ok("no option gained a run", ev.options.every((o) => !o.fx || o.fx.run === undefined));
}
/* ══════════════════════════════════════════════════════════════════════════
   EVT P3 · THE MODEL CHOOSES EFFECTS

   This is where the validator stops being precautionary. Everything below
   assumes the realiser is hostile, confused, or simply bad at arithmetic, and
   checks that the game is unharmed in each case.
   ═══════════════════════════════════════════════════════════════════════ */
sec("P3 · the model chooses effects");
{
  M.evtCacheReset();
  const s = only(at(34), "friendDrift");
  s.friends = { f2: { name: "Kim", role: "Friend", rel: 41, g: "F" } };
  const prop = proposeFor(s);
  ok("a proposal to realise fully", !!prop);

  const prompt = M.evtEffectsPrompt(prop);
  ok("the effects prompt exists", typeof prompt === "string" && prompt.length > 200);
  ok("...and states every band with its range", (() => {
    const b = M.EVT_BY_ID.friendDrift.bands;
    return Object.keys(b).every((k) => prompt.indexOf(k) > -1 && prompt.indexOf(String(b[k][1])) > -1);
  })(), prompt.slice(0, 200));
  ok("...and asks for slot names", prompt.indexOf("$friend") > -1);
  /* the model is never handed an internal identifier, so it cannot learn to
     guess one — and a realisation that names one is not reusable anyway */
  ok("...and never leaks the real store key", prompt.indexOf('"f2"') === -1 && !/\bf2\b/.test(prompt), prompt);
  ok("...and states the option count", /between 2 and 3 choices/.test(prompt));
  ok("...and forbids inventing a person", /never invent a person/i.test(prompt));
  ok("...and asks the choices to differ", /different things/i.test(prompt));
  ok("...and does not ask it to copy the fallback", /Do not reuse its sentences/i.test(prompt));
  ok("...and drops an empty recentFeed rather than shipping noise", prompt.indexOf("recentFeed") === -1, prompt);

  /* Both of these were found by READING the six prompts, not by any assertion.
     A prompt is content, and it goes through the same gate the prose does. */
  const promptFor = (id) => {
    for (const age of [12, 17, 24, 34, 45, 58, 70]) {
      const c = at(age);
      c.friends = { f2: { name: "Kim", role: "Friend", rel: 41, g: "F" } };
      c.romance = { r1: { name: "Ana", role: "Partner", status: "married", rel: 70, g: "F" } };
      for (const k of M.EVT_KINDS) if (k.id !== id) c.flags["evt_" + k.id] = c.ageDays;
      const p = proposeFor(c);
      if (p && p.kind === id) return M.evtEffectsPrompt(p);
    }
    return null;
  };
  /* 1 · never ask for a trade-off the bands cannot express. smallKindness
     pins every band at or above zero, so "different choices should cost
     different things" is an instruction it cannot satisfy — and a model
     handed an impossible constraint invents something to satisfy it with. */
  const kind1 = promptFor("smallKindness");
  if (kind1) {
    ok("a kind with no downside is not asked for a trade-off",
      !/cost different things/i.test(kind1), kind1);
    ok("...it is told plainly that nothing goes badly", /Nothing here goes badly/i.test(kind1));
  }
  const kind2 = promptFor("moneyPinch");
  if (kind2) {
    /* 2 · an empty PEOPLE PRESENT list reads as an invitation to fill it,
       one sentence before being told not to */
    ok("a scene with no cast does not advertise an empty list",
      kind2.indexOf("PEOPLE PRESENT") === -1, kind2);
    ok("...it says so outright", /NOBODY ELSE IS IN THIS SCENE/.test(kind2));
    ok("...and a kind WITH a downside still gets the trade-off line",
      /cost different things/i.test(kind2));
  }
  /* every kind's prompt must be well-formed, not just the two above */
  for (const k of M.EVT_KINDS) {
    const pr = promptFor(k.id);
    if (!pr) continue;
    ok(k.id + ": prompt names every band", Object.keys(k.bands).every((b) => pr.indexOf(b) > -1));
    ok(k.id + ": prompt has no undefined in it", !/undefined|\[object/.test(pr), pr.slice(0, 160));
    ok(k.id + ": prompt asks for JSON only", /no prose, no markdown fence/.test(pr));
  }
}
{
  /* 2 · PARSING WHAT MODELS ACTUALLY SEND */
  const body = '{"text":"ok","options":[]}';
  ok("bare JSON parses", M.evtParseJSON(body).text === "ok");
  ok("a fenced block parses", M.evtParseJSON("```json\n" + body + "\n```").text === "ok");
  ok("a preamble is skipped", M.evtParseJSON("Sure! Here you go:\n" + body).text === "ok");
  ok("trailing chatter is ignored", M.evtParseJSON(body + "\n\nLet me know if you'd like changes.").text === "ok");
  ok("nested objects survive", M.evtParseJSON('{"a":{"b":{"c":1}},"text":"ok"}').text === "ok");
  ok("a brace inside a string does not end the object",
    M.evtParseJSON('{"text":"a { brace }","options":[]}').text === "a { brace }");
  ok("an escaped quote does not end the string",
    M.evtParseJSON('{"text":"she said \\"no\\"","options":[]}').text === 'she said "no"');
  ok("truncated JSON is null, not a throw", M.evtParseJSON('{"text":"ok","opt') === null);
  ok("prose with no JSON is null", M.evtParseJSON("I'd rather not.") === null);
  ok("a non-string is null", M.evtParseJSON(null) === null && M.evtParseJSON(42) === null);
  ok("an array at top level is null", M.evtParseJSON("[1,2,3]") === null);
}
{
  /* 3 · SLOT ADDRESSING BINDS PER PROPOSAL — the property that makes a
     realisation reusable, and the one that would be catastrophic if wrong:
     a realisation cached from one life must never carry that life's
     relationship keys into another. */
  M.evtCacheReset();
  const mk = (fkey, fname) => {
    const c = only(at(34), "friendDrift");
    c.friends = {}; c.friends[fkey] = { name: fname, role: "Friend", rel: 41, g: "F" };
    return c;
  };
  const a = mk("f2", "Kim"), b = mk("f7", "Ros");
  const pa = proposeFor(a), pb = proposeFor(b);
  ok("two lives, two different store keys", pa.cast.friend.key !== pb.cast.friend.key,
    [pa.cast.friend.key, pb.cast.friend.key]);

  const realisation = { text: "A long enough sentence to clear the floor, about somebody you have not called.",
    options: [{ label: "Call", fx: { relF: { $friend: 5 }, stats: { happiness: 2 } } },
              { label: "Don't", fx: { relF: { $friend: -6 } } }] };
  const ea = M.evtValidate(pa, realisation), eb = M.evtValidate(pb, realisation);
  ok("the same realisation binds to life A's key", ea.options[0].fx.relF[pa.cast.friend.key] === 5, ea.options[0].fx);
  ok("...and to life B's", eb.options[0].fx.relF[pb.cast.friend.key] === 5, eb.options[0].fx);
  ok("...and never carries the other life's key across",
    eb.options[0].fx.relF[pa.cast.friend.key] === undefined, eb.options[0].fx);
  /* the option count is part of the contract, so every probe below carries a
     second, deliberately boring choice */
  const pad = { label: "Leave it", fx: { stats: { happiness: -1 } } };
  ok("a slot that was not cast is dropped", (() => {
    const bad = M.evtValidate(pa, { text: realisation.text,
      options: [{ label: "x", fx: { relF: { $nobody: 5 }, stats: { happiness: 2 } } }, pad] });
    return bad && bad.options[0].fx.relF === undefined && bad.options[0].fx.stats.happiness === 2;
  })());
  /* a raw store key still works, but only for somebody actually in the scene */
  ok("addressing a real cast key directly still works", (() => {
    const o = {}; o[pa.cast.friend.key] = 4;
    const v = M.evtValidate(pa, { text: realisation.text, options: [{ label: "x", fx: { relF: o } }, pad] });
    return v && v.options[0].fx.relF[pa.cast.friend.key] === 4;
  })());
  ok("...but somebody else's key is not in the scene", (() => {
    const v = M.evtValidate(pa, { text: realisation.text,
      options: [{ label: "x", fx: { relF: { mom: -20 }, stats: { happiness: 1 } } }, pad] });
    return v && v.options[0].fx.relF === undefined;
  })());
}
{
  /* 4 · THE CACHE IS LOAD-BEARING, NOT AN OPTIMISATION.
     Effects reach a popup by being applied at FIRE time, synchronously —
     never swapped in under a player already reading the options. */
  M.evtCacheReset();
  const s = only(at(34), "friendDrift");
  s.friends = { f2: { name: "Kim", role: "Friend", rel: 41, g: "F" } };
  const prop = proposeFor(s);
  ok("a cold cache realises nothing", M.evtCachedFor(prop) === null);

  const realisation = { text: "Kim's name surfaces in a thread about somebody else entirely, and you put the phone face down.",
    options: [{ label: "Call, finally", fx: { relF: { $friend: 6 }, stats: { happiness: 2 } } },
              { label: "Leave it another year", fx: { relF: { $friend: -9 }, stats: { happiness: -3 } } }] };
  M.evtRememberRealisation(prop, realisation);
  const hit = M.evtCachedFor(prop);
  ok("a warm cache realises", !!hit);
  ok("...with the model's words", hit.text === realisation.text);
  ok("...and the model's options", hit.options.length === 2 && hit.options[0].label === "Call, finally");
  ok("...bound to this life's key", hit.options[0].fx.relF.f2 === 6, hit.options[0].fx);
  /* emoji and title still come from the fallback: generated content does not
     get to restyle the game */
  ok("...but not the model's emoji or title",
    hit.emoji === prop.fallback.emoji && hit.title === prop.fallback.title);

  /* the situation key is coarse on purpose, so the reuse actually happens */
  const older = only(at(37), "friendDrift");
  older.friends = { f9: { name: "Ros", role: "Friend", rel: 44, g: "F" } };
  const p2 = proposeFor(older);
  ok("the same decade and shape reuses it", M.evtSituationKey(p2) === M.evtSituationKey(prop),
    [M.evtSituationKey(p2), M.evtSituationKey(prop)]);
  const reused = M.evtCachedFor(p2);
  ok("...and binds to the other life's key", reused && reused.options[0].fx.relF.f9 === 6, reused && reused.options[0].fx);
  ok("...carrying nothing of the first life", reused && reused.options[0].fx.relF.f2 === undefined);

  const younger = only(at(19), "friendDrift");
  younger.friends = { f2: { name: "Kim", role: "Friend", rel: 41, g: "F" } };
  ok("a different decade does not reuse it",
    M.evtSituationKey(proposeFor(younger)) !== M.evtSituationKey(prop));

  /* and it reaches the player through evtMaybeFire, synchronously */
  M.evtCacheReset();
  M.evtRememberRealisation(prop, realisation);
  const fired = (() => {
    for (let d = 0; d < 400; d++) {
      const c = only(at(34), "friendDrift");
      c.friends = { f2: { name: "Kim", role: "Friend", rel: 41, g: "F" } };
      c.ageDays += d;
      const ev = M.evtMaybeFire(c);
      if (ev) return ev;
    }
    return null;
  })();
  ok("a generated event fires at all", !!fired);
  if (fired) ok("...and it is the realised one, not the fallback",
    fired.text === realisation.text, fired.text);

  /* the cap keeps the cache from growing without bound */
  M.evtCacheReset();
  for (let i = 0; i < M.EVT_FULL_CAP + 6; i++) {
    const c = only(at(20 + i * 11), "friendDrift");
    c.friends = { f2: { name: "Kim", role: "Friend", rel: 41, g: "F" } };
    const p = proposeFor(c);
    if (p) M.evtRememberRealisation(p, realisation);
  }
  ok("the realisation cache is capped", (() => {
    let n = 0;
    for (let i = 0; i < 90; i++) {
      const c = only(at(20 + i), "friendDrift");
      c.friends = { f2: { name: "Kim", role: "Friend", rel: 41, g: "F" } };
      const p = proposeFor(c);
      if (p && M.evtCachedFor(p)) n++;
    }
    return n <= M.EVT_FULL_CAP * 12;      /* many ages share a decade key */
  })());
  M.evtCacheReset();
}
{
  /* 5 · A HOSTILE REALISATION, END TO END THROUGH THE CACHE.
     P1 asserted the validator in isolation. This asserts that nothing gets
     past it on the path that now reaches the save file. */
  M.evtCacheReset();
  const s = only(at(34), "friendDrift");
  s.friends = { f2: { name: "Kim", role: "Friend", rel: 41, g: "F" } };
  const prop = proposeFor(s);
  const text = "A perfectly ordinary sentence, long enough to clear the floor without any trouble at all.";

  const hostile = { text: text, options: [
    { label: "Run this", fx: { run: "() => { while(1); }", stats: { happiness: 2 } } },
    { label: "Take everything", fx: { money: 999999999, stats: { happiness: 6, health: 40, looks: 90 } } },
  ] };
  M.evtRememberRealisation(prop, hostile);
  const ev = M.evtCachedFor(prop);
  ok("a hostile realisation still produces a playable event", !!ev);
  ok("run never survives", JSON.stringify(ev).indexOf("run") === -1, JSON.stringify(ev).slice(0, 200));
  ok("...and is not merely stringified away", ev.options.every((o) => o.fx.run === undefined));
  ok("money outside any band is dropped", ev.options[1].fx.money === undefined, ev.options[1].fx);
  ok("a stat inside its band survives, clamped", ev.options[1].fx.stats.happiness === 3, ev.options[1].fx.stats);
  ok("unbanded stats are dropped", ev.options[1].fx.stats.health === undefined && ev.options[1].fx.stats.looks === undefined,
    ev.options[1].fx.stats);
  /* and applying it to a real life keeps every invariant the engine has */
  const d = JSON.parse(JSON.stringify(s));
  H.seed(5);
  for (const o of ev.options) { const c2 = JSON.parse(JSON.stringify(d)); M.applyFx(c2, o.fx);
    ok("applying '" + o.label + "' keeps stats in range",
      ["health", "happiness", "smarts", "looks"].every((k) => c2.stats[k] >= 0 && c2.stats[k] <= 100), c2.stats);
    ok("applying '" + o.label + "' never makes money negative", c2.money >= 0, c2.money);
  }

  /* every shape of nonsense falls back rather than throwing */
  for (const [why, bad] of [
    ["no text", { options: [{ label: "x", fx: { stats: { happiness: 1 } } }] }],
    ["no options", { text: text }],
    ["options is not an array", { text: text, options: "two" }],
    ["too many options", { text: text, options: [1, 2, 3, 4, 5].map((i) => ({ label: "opt " + i, fx: { stats: { happiness: 1 } } })) }],
    ["duplicate labels", { text: text, options: [{ label: "Same", fx: { stats: { happiness: 1 } } }, { label: "Same", fx: { stats: { happiness: -1 } } }] }],
    ["a novel for a label", { text: text, options: [{ label: "x".repeat(61), fx: { stats: { happiness: 1 } } }, { label: "y", fx: {} }] }],
    ["every option inert", { text: text, options: [{ label: "a", fx: {} }, { label: "b", fx: { nope: 1 } }] }],
    ["text over the cap", { text: "x".repeat(601), options: [{ label: "a", fx: { stats: { happiness: 1 } } }] }],
  ]) ok("rejected: " + why, M.evtValidate(prop, bad) === null, why);
  M.evtCacheReset();
}
{
  /* 6 · THE PROPERTY THE WHOLE PHASE TURNS ON.
     A full realisation must never be applied to a popup already on screen.
     evtEnhance is the only thing that touches a live popup, and it is
     prose-only — asserted against the source text, because this is exactly
     the kind of thing a later "improvement" would quietly break. */
  const SRC = fs.readFileSync(H.SRC, "utf8");
  const clean = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const body = (name) => {
    const i = clean.indexOf("function " + name + "(");
    if (i < 0) return "";
    const j = clean.indexOf("\nfunction ", i + 10);
    return clean.slice(i, j > i ? j : i + 6000);
  };
  ok("evtEnhance still resolves with prose only", /onResolve\(prose\)/.test(body("evtEnhance")));
  ok("...and never validates a full realisation", !/evtValidate/.test(body("evtEnhance")));
  ok("...and never touches the effects cache", !/_evtFullCache|evtRememberRealisation/.test(body("evtEnhance")));
  ok("the popup callback only ever assigns aiText",
    /pending: \{ \.\.\.prev\.pending, aiText: text \}/.test(clean));
  ok("evtRealiseAhead writes only to the cache",
    /evtRememberRealisation/.test(body("evtRealiseAhead")) && !/onResolve|pending/.test(body("evtRealiseAhead")));
  /* and the fire path is still synchronous */
  ok("evtMaybeFire reads the cache synchronously",
    /evtCachedFor/.test(body("evtMaybeFire")) && !/\bawait\b|\.then\(/.test(body("evtMaybeFire")));
}

/* 7 · END TO END, AGAINST A FIXTURE. No socket is opened at any point: the
   fixture replaces the transport and everything above it — prompt, sanitiser,
   realisation, cache — runs exactly as it does in the browser. */
async function p2EndToEnd() {
  const s = only(at(34), "friendDrift");
  s.friends = { f2: { name: "Kim", role: "Friend", rel: 41, g: "F" } };
  const prop = proposeFor(s);
  if (!prop) { ok("a proposal exists to realise end to end", false); return; }
  M.evtRemember(prop);
  const popup = { id: prop.id, generated: 1, text: prop.fallback.text };

  const run = (reply) => new Promise((resolve) => {
    M.llmSetFixture(async () => reply);
    let got = null;
    M.evtEnhance(s, popup, (t) => { got = t; });
    setTimeout(() => { M.llmSetFixture(null); resolve(got); }, 15);
  });

  const first = await run(
    "Kim's name comes up in a group message you scroll past twice before answering. " +
    "It has been eleven months and neither of you has said so out loud.");
  ok("a good realisation reaches the popup", typeof first === "string" && first.indexOf("eleven months") > -1, first);

  /* the same situation must not spend a second call (architecture §6.3) */
  const second = await run("A COMPLETELY DIFFERENT ANSWER, LONG ENOUGH TO CLEAR THE LENGTH FLOOR WITHOUT TROUBLE.");
  ok("the situation cache answers the second time", second === first, second);

  /* and every way a realisation can be bad leaves the written text standing */
  const other = only(at(52), "friendDrift");
  other.friends = { f9: { name: "Ros", role: "Friend", rel: 38, g: "F" } };
  const p2 = proposeFor(other);
  if (p2) {
    M.evtRemember(p2);
    const pop2 = { id: p2.id, generated: 1, text: p2.fallback.text };
    const bad = (reply) => new Promise((resolve) => {
      M.llmSetFixture(async () => reply);
      let got = null;
      M.evtEnhance(other, pop2, (t) => { got = t; });
      setTimeout(() => { M.llmSetFixture(null); resolve(got); }, 15);
    });
    ok("a refusal leaves the written text standing", (await bad("I'm unable to help with that.")) === null);
    ok("JSON leaves the written text standing", (await bad('{"text":"nope"}')) === null);
    ok("a provider returning nothing leaves it standing", (await bad("")) === null);
    ok("a novel-length answer leaves it standing", (await bad("x".repeat(2000))) === null);
  }

  /* with no fixture AND no provider, nothing happens at all — this is the
     state every other suite in the repo runs in */
  let fired = false;
  M.evtEnhance(s, { id: prop.id, generated: 1, text: "x" }, () => { fired = true; });
  await new Promise((r) => setTimeout(r, 15));
  ok("with no model configured, the realiser does nothing", fired === false);
}

p2EndToEnd().then(() => {
  console.log("\n" + (fail === 0 ? "ALL PASS" : "FAILURES") + ": " + pass + " passed, " + fail + " failed");
  process.exit(fail === 0 ? 0 : 1);
});
