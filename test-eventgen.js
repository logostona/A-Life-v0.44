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

console.log("\n" + (fail === 0 ? "ALL PASS" : "FAILURES") + ": " + pass + " passed, " + fail + " failed");
process.exit(fail === 0 ? 0 : 1);
