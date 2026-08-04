/* test-integration.js — do the systems agree with each other?
 *
 * The per-module suites each prove their own module. This one exists for the
 * failures that only appear where two modules meet, which is where this
 * project's real bugs have historically lived: a tenant evicted by a legacy
 * writer reading as `renting` and `homeless` at the same time, an arrears
 * ladder whose last rung executed nothing, a tenure snapshot that was correct
 * at birth and stale for the next sixty years.
 *
 * The method that caught all three was the same, and it is the method here:
 * drive real lives, and at every step compare two INDEPENDENT derivations of
 * the same fact. A unit test of either derivation alone passes happily while
 * they disagree.
 *
 * Everything asserted below is an invariant that must hold for ANY character in
 * ANY country in ANY era — never a specific outcome, which would just be
 * re-testing the RNG.
 *
 * Run: node --max-old-space-size=4096 test-integration.js
 */
"use strict";

const path = require("path");
const H = require(path.join(__dirname, "harness.js"));
const M = H.M;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log("  FAIL: " + name + (extra !== undefined ? "  " + JSON.stringify(extra).slice(0, 400) : "")); }
}
function sec(t) { console.log("\n=== " + t + " ==="); }

const COUNTRIES = ["United Kingdom", "United States", "Japan", "Brazil", "Nigeria",
                   "Sweden", "India", "Russia", "Mexico", "Thailand"];
const ERAS = [1935, 1955, 1975, 1995, 2005];

/* ───────────────────────────── deep state scan ───────────────────────────── */
/* NaN is the quietest corruption in this codebase: it survives clamp(), it
   survives JSON, it renders as "NaN" in the UI, and every arithmetic step after
   it is also NaN. Nothing else scans for it. */
function scanBad(node, pathStr, out, depth) {
  if (depth > 12 || out.length > 40) return out;
  if (typeof node === "number") {
    if (Number.isNaN(node)) out.push({ at: pathStr, why: "NaN" });
    else if (!Number.isFinite(node)) out.push({ at: pathStr, why: "Infinity" });
    return out;
  }
  if (node && typeof node === "object") {
    for (const k of Object.keys(node)) {
      if (k === "feed") continue;                    /* scanned separately */
      scanBad(node[k], pathStr + "." + k, out, depth + 1);
    }
  }
  return out;
}

/* ══════════════════════ 1 · long lives, many worlds ══════════════════════ */
sec("1 · full-life soak across countries and eras");
let totalCrashes = 0, totalDeadEnds = 0, lives = 0, aged = 0, popupsSeen = 0;
const badNumbers = [];
const contradictions = [];
const feedShape = [];

for (let i = 0; i < COUNTRIES.length; i++) {
  const country = COUNTRIES[i];
  const birthYear = ERAS[i % ERAS.length];
  H.seed(1000 + i);                                  /* reproducible per life */
  const s0 = H.mkChar({ country: country, cls: H.CLASSES[i % 4], birthYear: birthYear });

  const r = H.runLife(s0, {
    maxSteps: 4000,
    onStep: (s) => {
      /* ---- cross-system invariants, checked at EVERY step ---- */

      /* money is floored at 0 by applyFx; nothing may route around it */
      if (typeof s.money === "number" && s.money < 0) {
        contradictions.push({ what: "negative money", country: country, money: s.money, age: M.ageYears(s) });
      }
      /* stats are clamped 0-100 by contract */
      for (const k of ["health", "happiness", "smarts", "looks"]) {
        const v = s.stats[k];
        if (typeof v !== "number" || v < 0 || v > 100) {
          contradictions.push({ what: "stat out of range", stat: k, v: v, country: country });
        }
      }
      /* TENURE vs the dwelling: an owner or tenant must have somewhere to be,
         and someone with nowhere to be must not be holding a home object. */
      const ten = M.hreTenure(s);
      const home = M.hreHome(s);
      if ((ten === "owning" || ten === "renting") && !home) {
        contradictions.push({ what: ten + " with no dwelling", country: country, age: M.ageYears(s) });
      }
      if (ten === "homeless" && home) {
        contradictions.push({ what: "homeless but still holding a dwelling", country: country, age: M.ageYears(s) });
      }
      /* the legacy homelessness flag and HRE's tenure must not disagree —
         this exact pair is what produced the renting+homeless bug */
      if (ten === "homeless" && !s.flags.homeless) {
        contradictions.push({ what: "homeless tenure without the legacy flag", country: country, age: M.ageYears(s) });
      }
      /* S10: the upkeep tracker must never outlive the building it tracks */
      const upk = M.hreUpkeep(s);
      if (upk && !home) {
        contradictions.push({ what: "upkeep tracker with no dwelling", country: country, age: M.ageYears(s) });
      }
      /* S10: condition values stay inside the generator's own floor/ceiling */
      if (home && home.condition) {
        for (const c of M.HRE_COMPONENTS) {
          const v = home.condition[c.id];
          if (typeof v === "number" && (v < M.HRE_CONDITION_FLOOR - 0.001 || v > 100.001)) {
            contradictions.push({ what: "condition out of range", cmp: c.id, v: v, country: country });
          }
        }
      }
      /* a tenancy and a mortgage on the same character at the same time would
         mean paying rent on a place you are also buying */
      if (M.hreTenancy && M.hreTenancy(s) && s.hre && s.hre.mtg) {
        contradictions.push({ what: "tenancy and mortgage at once", country: country, age: M.ageYears(s) });
      }
      /* prison and a job are mutually exclusive in this sim's own terms */
      if (M.inPrison(s) && s.career.job && s.career.job.title && s.flags.prisonWorking !== true) {
        /* not asserted — recorded only if it turns out to be reachable */
      }
    },
  });

  lives++;
  totalCrashes += r.crashes;
  totalDeadEnds += r.deadEnds;
  popupsSeen += r.popups;
  if (r.finalAge > M.ageYears(s0) + 5) aged++;

  const bad = scanBad(r.state, country, [], 0);
  if (bad.length) badNumbers.push({ country: country, found: bad.slice(0, 6) });

  /* s.feed holds OBJECTS, not strings (PROJECT_CONTEXT.md) — anything that
     pushes a bare string breaks every reader downstream */
  for (const e of (r.state.feed || []).slice(-80)) {
    if (typeof e !== "object" || e === null || typeof e.text !== "string") {
      feedShape.push({ country: country, entry: String(e).slice(0, 60) });
      break;
    }
  }
}

ok("every life ran to a real age (the sim actually advanced)", aged === lives, { aged: aged, lives: lives });
ok("no crashes anywhere in the soak", totalCrashes === 0, { crashes: totalCrashes });
ok("no dead-end popups — every popup kept at least one valid option", totalDeadEnds === 0, { deadEnds: totalDeadEnds });
ok("popups actually fired (the soak exercised content, not just ticks)", popupsSeen > 50, { popups: popupsSeen });
ok("no NaN or Infinity anywhere in any final state", badNumbers.length === 0, badNumbers.slice(0, 4));
ok("s.feed holds objects with .text, everywhere", feedShape.length === 0, feedShape.slice(0, 3));
ok("no cross-system contradiction at any step of any life", contradictions.length === 0,
  contradictions.slice(0, 6));

/* ═════════════ 2 · tenure authority: two derivations, one answer ═════════════ */
sec("2 · tenure authority never splits");
{
  /* hreTenure() is the authority once hre.owned is set. The legacy flags are
     still dual-written for STREET_GROUP and the street POOL. The bug class is
     the two disagreeing, so compare them directly over a real life. */
  let splits = 0, checked = 0, ownedSeen = 0;
  for (let i = 0; i < 6; i++) {
    H.seed(2000 + i);
    const s0 = H.mkChar({ country: COUNTRIES[i], cls: "Working", birthYear: ERAS[i % ERAS.length] });
    H.runLife(s0, {
      maxSteps: 2600,
      onStep: (s) => {
        checked++;
        if (!(s.hre && s.hre.owned)) return;
        ownedSeen++;
        const ten = M.hreTenure(s);
        /* "at my parents" must mean the same thing to both readers */
        const atParents = M.hreAtParents(s);
        if (atParents !== (ten === "withParents")) {
          splits++;
        }
      },
    });
  }
  ok("the soak reached HRE authority (otherwise this proves nothing)", ownedSeen > 100, { ownedSeen: ownedSeen });
  ok("hreAtParents and hreTenure never disagree once HRE has authority",
    splits === 0, { splits: splits, checked: checked });
}

/* ══════ 3 · the couch-surf flag: a documented wart, is it a live bug? ══════ */
sec("3 · couch-surfing does not strand a character for life");
{
  /* MODULE_MAP.md module 24 item 3: flags.couchAt is set and never cleared.
     It is real. The question this asserts is whether it can still STRAND
     someone, which is what it would do if the legacy predicate were still the
     authority. It cannot, because the couch-surf path calls hreSetTenure first
     and that transfers authority to HRE on the same code path. This test is
     what keeps that true — if anyone ever sets couchAt without transferring
     authority, this fails rather than silently locking a player out of their
     own home for the rest of the life. */
  H.seed(31337);
  const s = H.mkChar({ country: "United Kingdom", cls: "Poor", birthYear: 1990 });
  s.ageDays = Math.ceil(20 * 365.25) + 1;
  s.flags.couchAt = "someFriend";
  M.hreSetTenure(s, "lodging", null);
  ok("a couch-surfer is not 'at my parents'", M.hreAtParents(s) === false);

  /* they go home again */
  M.hreSetTenure(s, "withParents", null);
  ok("the stale couchAt flag survives (the documented wart is real)", s.flags.couchAt === "someFriend");
  ok("...but it no longer strands them — moving home is visible again",
    M.hreAtParents(s) === true, { atParents: M.hreAtParents(s), tenure: M.hreTenure(s) });

  /* and the legacy shim still reports the stale answer, which is exactly why
     the shim must never be an authority for live code */
  ok("the legacy shim still reads the stale flag (so it stays test-only)",
    M.hreLegacyTenure(s) === "lodging", M.hreLegacyTenure(s));
}

/* ═══════════ 4 · S10 x the rest of the game (the newest seam) ═══════════ */
sec("4 · upkeep integrates with the systems around it");
{
  /* A building does not stop rotting because its owner is in prison — the tick
     is placed to keep running. Verify decay continues while inPrison. */
  H.seed(4242);
  let s = H.mkChar({ country: "United Kingdom", cls: "Middle", birthYear: 1960 });
  s.ageDays = Math.ceil(35 * 365.25) + 1;
  s.hre = M.hreInit(M.hreSeedFrom("integration:prison"), "United Kingdom", s.profile.city, "Middle", 1960);
  M.migrate(s);
  if (s.hre.home) {
    M.hreSetTenure(s, "owning", s.hre.home);
    M.hreEnsureUpkeep(s);
    const before = M.hreConditionScore(s.hre.home.condition);
    s.flags.prisonUntil = (s.ageDays || 0) + 4000;     /* however prison is flagged, decay must not care */
    for (let i = 0; i < 60; i++) {
      s.money = 0;
      s.ageDays += M.HRE_RENT_PERIOD_DAYS;
      M.hreUpkeepTick(s);
      if (!s.hre.home) break;
    }
    const after = s.hre.home ? M.hreConditionScore(s.hre.home.condition) : 0;
    ok("a neglected building keeps decaying regardless of the owner's situation",
      after < before, { before: before, after: after });
  } else {
    ok("a neglected building keeps decaying regardless of the owner's situation", true, "no dwelling generated; skipped");
  }

  /* Losing a home to condemnation must land the character in the SAME state
     the rest of the game understands homelessness to be — not a private S10
     state that STREET_GROUP has never heard of. */
  H.seed(555);
  let condemned = null;
  for (let n = 0; n < 12 && !condemned; n++) {
    const c = H.mkChar({ country: "United Kingdom", cls: "Poor", birthYear: 1950 + n });
    c.ageDays = Math.ceil(40 * 365.25) + 1;
    c.hre = M.hreInit(M.hreSeedFrom("integration:condemn:" + n), "United Kingdom", c.profile.city, "Poor", 1950 + n);
    M.migrate(c);
    if (!c.hre.home) continue;
    M.hreSetTenure(c, "owning", c.hre.home);
    for (const cmp of M.HRE_COMPONENTS) c.hre.home.condition[cmp.id] = 4;
    M.hreEnsureUpkeep(c);
    for (let i = 0; i < 90; i++) {
      c.money = 0;
      c.ageDays += M.HRE_RENT_PERIOD_DAYS;
      M.hreUpkeepTick(c);
      if (c.hre.lastEnd === "condemned") { condemned = c; break; }
    }
  }
  ok("a building can actually be condemned out from under an owner", !!condemned);
  if (condemned) {
    ok("condemnation produces the game's own homelessness, not a private state",
      M.hreTenure(condemned) === "homeless", M.hreTenure(condemned));
    ok("...the dwelling is released", condemned.hre.home === null);
    ok("...the legacy flag the street content reads is set",
      !!condemned.flags.homeless, condemned.flags.homeless);
    ok("...the upkeep tracker is torn down with the building",
      M.hreUpkeep(condemned) === null, M.hreUpkeep(condemned));
    ok("...and the player was told, in prose", condemned.feed.some((f) => /unfit for human habitation/.test(f.text)));
    /* the street content must now be reachable — this is the integration that
       a private S10 state would have silently broken */
    const street = M.ACT_GROUPS.find((g) => g.id === "street");
    ok("street content becomes available to a condemned character",
      !street || !street.cond || street.cond(condemned) === true,
      street && street.cond ? street.cond(condemned) : "no cond");
  }
}

/* ═════════════════ 5 · saves survive every system's state ═════════════════ */
sec("5 · persistence round-trip");
{
  /* Every field any system adds has to survive JSON and migrate(). A field
     that serialises but does not migrate is Gotcha #4, and it only ever bites
     real saves — never a fresh test character. */
  H.seed(909);
  const s = H.mkChar({ country: "Japan", cls: "Middle", birthYear: 1975 });
  const r = H.runLife(s, { maxSteps: 1500 });
  const live = r.state;

  const round = JSON.parse(JSON.stringify(live));
  ok("a lived save survives JSON without losing its shape",
    Object.keys(round).sort().join() === Object.keys(live).sort().join());
  ok("no NaN reached the save", scanBad(round, "save", [], 0).length === 0,
    scanBad(round, "save", [], 0).slice(0, 4));

  const before = JSON.stringify(round.hre);
  M.migrate(round);
  ok("migrating an already-current save changes nothing", JSON.stringify(round.hre) === before);
  M.migrate(round); M.migrate(round);
  ok("migration stays idempotent under repetition", JSON.stringify(round.hre) === before);

  /* the state version must be the one migrate() claims to produce */
  ok("the save carries the current top-level version", round.v === 4, round.v);

  /* a save from before S10 must gain the tracker without losing anything */
  const old = JSON.parse(JSON.stringify(live));
  old.hre.v = 3; delete old.hre.upk;
  const seedBefore = old.hre.seed, tenureBefore = old.hre.tenure;
  M.migrate(old);
  ok("a pre-Phase-9 save upgrades cleanly", old.hre.v === M.HRE_STATE_V && "upk" in old.hre);
  ok("...preserving the world seed and the tenure",
    old.hre.seed === seedBefore && old.hre.tenure === tenureBefore);
}

/* ═════════════════ 6 · the UI contract the engine relies on ═════════════════ */
sec("6 · popup contract");
{
  /* "Always guarantee at least one option is valid in every reachable state"
     (PROJECT_CONTEXT.md). Section 1 proves it over sampled lives; this proves
     the STRUCTURE of every popup the Act sheet can open directly. */
  H.seed(77);
  let checked = 0, broken = [];
  for (let i = 0; i < 4; i++) {
    const s = H.mkChar({ country: COUNTRIES[i], cls: H.CLASSES[i % 4], birthYear: ERAS[i % ERAS.length] });
    s.ageDays = Math.ceil(30 * 365.25) + 1;
    s.money = 5000;
    for (const g of M.ACT_GROUPS) {
      if (g.cond && !g.cond(s)) continue;
      for (const item of g.items) {
        const age = M.ageYears(s);
        if (age < (item.minAge || 0) || age > (item.maxAge || 200)) continue;
        if (item.cond && !item.cond(s)) continue;
        let next;
        try { next = M.doActivity(JSON.parse(JSON.stringify(s)), item); }
        catch (e) { broken.push({ item: item.id, why: "threw: " + String(e).slice(0, 90) }); continue; }
        checked++;
        if (next && next.pending) {
          const opts = (next.pending.options || []).filter((o) => !o.cond || o.cond(next));
          if (!opts.length) broken.push({ item: item.id, why: "opened a popup with no valid option" });
          if (!next.pending.title) broken.push({ item: item.id, why: "popup has no title" });
        }
      }
    }
  }
  ok("every reachable Act item was exercised", checked > 30, { checked: checked });
  ok("no Act item throws or opens a dead-end popup", broken.length === 0, broken.slice(0, 6));
}

/* ═════════════════ 7 · regressions found by this suite ═════════════════ */
sec("7 · regressions this suite found (keep them dead)");
{
  /* --- money can never go negative, however it is spent ---
     applyFx floors its own `money:` key, but `run:` mutates the draft directly
     and bypassed it. Three real offenders were found by the soak above. The
     floor now lives in applyFx after the run callback, so the invariant holds
     for all 43 direct money writes rather than the three that were caught. */
  H.seed(4001);
  const s = H.mkChar({ country: "United Kingdom", cls: "Poor", birthYear: 1990 });
  s.money = 0;
  M.applyFx(s, { run: (st) => { st.money -= 500; } });
  ok("a run: that overspends cannot take money below zero", s.money === 0, s.money);

  s.money = 60;
  M.applyFx(s, { money: -60, run: (st) => { st.money -= 25; } });
  ok("a second deduction inside the same fx is floored too", s.money === 0, s.money);

  s.money = 1000;
  M.applyFx(s, { money: -250 });
  ok("...but an affordable spend is still charged in full", s.money === 750, s.money);

  s.money = 40;
  M.applyFx(s, { run: (st) => { st.money -= 15; } });
  ok("...and a partial spend still leaves the remainder", s.money === 25, s.money);

  /* --- returning home from the street must tell HRE, not just the flag ---
     The soak found this only because an unrelated change shifted which lives
     the seeded RNG produced, and the route started firing. Of the three ways
     out of homelessness in "A way back in", two called hreSetTenure and the
     third only cleared s.flags.homeless — so hreLegacyTenure said "withParents"
     while s.hre.tenure stayed "homeless", and hreTenure prefers the HRE value.
     The disagreement then persisted for the rest of the life. Pinned directly
     here because reaching it in the soak depends on the dice. */
  {
    const st = H.mkChar({ country: "United Kingdom", cls: "Poor", birthYear: 1990 });
    st.ageDays = 6570;
    M.hreSetTenure(st, "homeless", null);
    st.flags.homeless = st.ageDays;
    ok("precondition: on the street by both authorities",
      M.hreTenure(st) === "homeless" && M.hreLegacyTenure(st) === "homeless");

    /* drive the REAL option out of the real event, not a hand-rolled copy */
    st.family.mom.rel = 60;
    const ev = (M.POOL.find((e) => e.id === "streetOut")).run(st).event;
    const opt = ev.options.find((o) => /go home/i.test(o.label));
    ok("the 'go home' option exists and is available", !!opt && (!opt.cond || opt.cond(st)));
    M.applyFx(st, opt.fx);
    ok("going home agrees across both authorities",
      M.hreTenure(st) === M.hreLegacyTenure(st), [M.hreTenure(st), M.hreLegacyTenure(st)]);
    ok("...and that agreed state is withParents", M.hreTenure(st) === "withParents", M.hreTenure(st));
    ok("...and the legacy flag is cleared too", !st.flags.homeless, st.flags.homeless);
  }

  /* --- every character has a currency symbol ---
     It was set in exactly one place (the Creation screen) while 72 sites render
     it directly, so any other path printed "undefined" in front of every
     price — including real saves written before the field existed. */
  for (const c of ["United Kingdom", "Japan", "Brazil", "Nigeria", "United States"]) {
    const ch = H.mkChar({ country: c, cls: "Middle", birthYear: 1990 });
    ok("a character in " + c + " has a currency symbol", typeof ch.profile.curSym === "string" && ch.profile.curSym.length > 0,
      ch.profile.curSym);
    ok("...and it is the country's own", ch.profile.curSym === M.COUNTRIES[c].cur, ch.profile.curSym);
  }
  const legacy = H.mkChar({ country: "Japan", cls: "Middle", birthYear: 1980 });
  delete legacy.profile.curSym;
  M.migrate(legacy);
  ok("a save written before curSym existed is repaired by migrate",
    legacy.profile.curSym === M.COUNTRIES["Japan"].cur, legacy.profile.curSym);
  /* the symptom itself: no rendered feed line may contain "undefined" */
  H.seed(4002);
  const r = H.runLife(H.mkChar({ country: "Sweden", cls: "Working", birthYear: 1965 }), { maxSteps: 2200 });
  const undef = (r.state.feed || []).filter((f) => /undefined/.test(String(f.text)));
  ok("no feed line renders the word 'undefined'", undef.length === 0,
    undef.slice(0, 3).map((f) => String(f.text).slice(0, 90)));

  /* --- the upkeep tracker never outlives its dwelling --- */
  H.seed(4003);
  const o = H.mkChar({ country: "United Kingdom", cls: "Middle", birthYear: 1970 });
  o.ageDays = Math.ceil(35 * 365.25) + 1;
  o.hre = M.hreInit(M.hreSeedFrom("regression:upk"), "United Kingdom", o.profile.city, "Middle", 1970);
  M.migrate(o);
  if (o.hre.home) {
    M.hreSetTenure(o, "owning", o.hre.home);
    M.hreEnsureUpkeep(o);
    ok("an owner has an upkeep tracker", M.hreUpkeep(o) !== null);
    /* lose the home by a route S10 knows nothing about */
    M.hreSetTenure(o, "homeless", null);
    ok("losing the home by ANY route drops the tracker", M.hreUpkeep(o) === null, M.hreUpkeep(o));
    M.hreUpkeepTick(o);
    ok("...and the tick clears the stored field so it never rides along in a save",
      o.hre.upk === null, o.hre.upk);
  }
}

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
