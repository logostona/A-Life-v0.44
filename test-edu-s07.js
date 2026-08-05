/* test-edu-s07.js — EDU S07: school life
 *
 * Three things worth the suite's weight:
 *
 *   · makeReactionEvent finally has production callers (section 2). It has had
 *     zero since module 14 shipped, and a factory nobody calls is a hypothesis
 *     rather than a tool.
 *   · Events are TEXTURE, never progression (section 4). POOL loses ~70% of
 *     what it is given — fine for a school play, fatal for a graduation.
 *   · Boarding must not put HRE's two authorities out of step (section 6).
 *     That defect class has already cost this project once.
 *
 * Run: node --max-old-space-size=4096 test-edu-s07.js
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

function enrolled(country, birthYear, opts) {
  const o = opts || {};
  const c = H.mkChar({ country, birthYear, cls: o.cls || "Middle" });
  c.ageDays = o.ageDays != null ? o.ageDays : 4200;
  /* POST-INVERSION: setting education.stage directly no longer drives EDU —
     that is what inversion means. Every real writer goes through eduSetStage,
     so the helper must too, or it builds a character the engine could not. */
  M.eduSetStage(c, o.rung || "lowerSec");
  c.school = { stage: o.stage || "middle", name: o.name || "Test School",
               skips: 0, trouble: 0, classmates: {}, faculty: {} };
  M.eduOnTick(c);
  return c;
}

/* ───────────────────────── 1 · crystallisation ───────────────────────── */
sec("1 · the institution finally reaches a player");

{
  const c = enrolled("United Kingdom", 1975);
  const inst = M.eduInst(c);
  ok("enrolling crystallises an institution", !!inst, inst);
  ok("...with the attributes other systems read",
    inst && ["quality", "strictness", "religiosity", "extracurricular", "boarding"]
      .every((k) => inst[k] !== undefined));
  ok("...and an id", !!inst.id && M.eduIdValid(inst.id));
  ok("...of an archetype that serves this stage",
    M.EDU_ARCHETYPE_BY_ID[inst.archetype].stages.indexOf(M.eduStage(c)) !== -1,
    [inst.archetype, M.eduStage(c)]);
  ok("...that could exist in this country and era",
    M.eduArchetypeAvailable(M.EDU_ARCHETYPE_BY_ID[inst.archetype], c.profile.country, M.yearOf(c)));
}
{
  /* deterministic: the same character must not attend a different school on
     reload, which is the entire point of crystallising */
  const a = enrolled("Brazil", 1985);
  const b = JSON.parse(JSON.stringify(a));
  b.edu.inst = null; b.edu.instFor = null;
  M.eduEnsureInstitution(b);
  ok("the same character gets the same school again",
    JSON.stringify(a.edu.inst) === JSON.stringify(b.edu.inst));
  const again = M.eduEnsureInstitution(a);
  ok("re-ensuring is a no-op", JSON.stringify(again) === JSON.stringify(a.edu.inst));
}
{
  const c = enrolled("Sweden", 1990);
  ok("an institution is held in state", !!c.edu.inst);
  const size = Buffer.byteLength(JSON.stringify(c.edu));
  ok("s.edu with an institution is inside budget", size < 2560, size);

  /* leaving school must release it, or the character carries a school they no
     longer attend for the rest of their life */
  c.school = null;
  c.education.stage = "done";
  M.eduOnTick(c);
  ok("leaving school releases the institution", c.edu.inst === null);
  ok("...and the tracking key too", !c.edu.instFor);
}
{
  /* poorer families should not systematically attend elite institutions */
  let rich = 0, poor = 0;
  for (let i = 0; i < 24; i++) {
    H.seed(3300 + i);
    const p = enrolled("United Kingdom", 1990, { cls: "Poor", ageDays: 4200 + i });
    const w = enrolled("United Kingdom", 1990, { cls: "Wealthy", ageDays: 4200 + i });
    if (M.eduInst(p)) poor += M.eduInst(p).quality;
    if (M.eduInst(w)) rich += M.eduInst(w).quality;
  }
  ok("wealthier families reach better schools on average", rich > poor, [poor, rich]);
}

/* ───────────── 2 · makeReactionEvent has production callers ───────────── */
sec("2 · makeReactionEvent — first production callers");

{
  const SRC = fs.readFileSync(H.SRC, "utf8");
  const calls = (SRC.match(/makeReactionEvent\(\{/g) || []).length;
  ok("makeReactionEvent is actually called", calls >= 2, calls);
  ok("...and its factory is still defined once",
    (SRC.match(/function makeReactionEvent/g) || []).length === 1);

  const reactionIds = ["eduReportCard", "eduPeerRegard"];
  for (const id of reactionIds) {
    const e = M.EDU_POOL.find((x) => x.id === id);
    ok(id + " is a POOL entry", !!e);
    ok(id + " has a cond and a run", !!e && typeof e.cond === "function" && typeof e.run === "function");
  }
}
{
  /* every disposition tier must have a fragment, or a character with an
     unusual parent silently gets nothing at all */
  const c = enrolled("United Kingdom", 1975);
  c.edu.perf = { gpa: 70, attendance: 90, conduct: 90 };
  const e = M.EDU_POOL.find((x) => x.id === "eduReportCard");
  ok("the report card is eligible for a schooled character", e.cond(c));

  const tiers = ["hostile", "cold", "neutral", "warm", "ally"];
  const seen = {};
  for (const tier of tiers) {
    /* drive the parent's traits to each end of the disposition range */
    const d = JSON.parse(JSON.stringify(c));
    const v = { hostile: 2, cold: 25, neutral: 50, warm: 72, ally: 96 }[tier];
    for (const k of ["warmth", "kindness", "loyalty", "acceptance", "rel", "politics"]) d.family.mom[k] = v;
    const out = e.run(d);
    if (out && out.auto && out.auto.length) seen[tier] = out.auto[0];
  }
  ok("a fragment is produced across the disposition range",
    Object.keys(seen).length >= 3, Object.keys(seen));
  ok("different dispositions produce different text",
    new Set(Object.values(seen)).size === Object.values(seen).length, seen);
  ok("a warm parent's line differs from a hostile one",
    !seen.ally || !seen.hostile || seen.ally !== seen.hostile);
}
{
  /* the relDelta must actually reach the right person through relKey */
  const c = enrolled("United Kingdom", 1975);
  c.edu.perf = { gpa: 70, attendance: 90, conduct: 90 };
  const e = M.EDU_POOL.find((x) => x.id === "eduReportCard");
  for (const k of ["warmth", "kindness", "loyalty", "acceptance", "rel", "politics"]) c.family.mom[k] = 96;
  const out = e.run(c);
  ok("an ally parent's fx targets family rel", !out.fx || !out.fx.rel || typeof out.fx.rel.mom === "number", out.fx);
}
{
  /* pickNpc must degrade rather than throw when there is nobody to react */
  const bare = H.mkChar({ country: "Sweden", birthYear: 1990 });
  for (const e of M.EDU_POOL) {
    let threw = false;
    try { e.cond(bare); } catch (err) { threw = true; }
    ok(e.id + " cond survives a character with no school", !threw);
  }
}

/* ───────────── 3 · event budget (invariant 6) ───────────── */
sec("3 · event budget");

{
  ok("EDU adds a bounded number of POOL entries", M.EDU_POOL.length <= 25, M.EDU_POOL.length);
  ok("POOL stays under the subsystem ceiling", M.POOL.length <= 238, M.POOL.length);
  ok("every EDU entry has a unique id",
    new Set(M.EDU_POOL.map((e) => e.id)).size === M.EDU_POOL.length);
  ok("every EDU entry is registered in POOL",
    M.EDU_POOL.every((e) => M.POOL.indexOf(e) !== -1));
  ok("no EDU entry is registered twice",
    M.EDU_POOL.every((e) => M.POOL.filter((x) => x.id === e.id).length === 1));
  ok("every EDU entry declares an age band",
    M.EDU_POOL.every((e) => typeof e.minAge === "number" && typeof e.maxAge === "number" && e.maxAge > e.minAge));
  ok("every EDU entry declares a cooldown", M.EDU_POOL.every((e) => typeof e.cd === "number" && e.cd > 0));
}

/* ───────────── 4 · texture, never progression (invariant 10) ───────────── */
sec("4 · events are texture");

{
  const c = enrolled("United Kingdom", 1975);
  c.edu.perf = { gpa: 70, attendance: 90, conduct: 90 };
  for (const e of M.EDU_POOL) {
    if (!e.cond(c)) continue;
    const before = { stage: c.education.stage, edu: c.edu.stage,
                     cred: c.edu.cred.length, rec: c.edu.record.length,
                     college: c.education.college };
    const d = JSON.parse(JSON.stringify(c));
    const out = e.run(d);
    /* apply whatever the event returns, including an option if it offers one */
    if (out && out.fx) M.applyFx(d, out.fx);
    if (out && out.event) {
      for (const opt of out.event.options) {
        const dd = JSON.parse(JSON.stringify(d));
        if (opt.fx) M.applyFx(dd, opt.fx);
        ok(e.id + " option '" + opt.label.slice(0, 22) + "' does not advance a stage",
          dd.education.stage === before.stage && dd.edu.stage === before.edu);
        ok(e.id + " option does not award a credential", dd.edu.cred.length === before.cred);
      }
    }
    ok(e.id + " does not advance a stage",
      d.education.stage === before.stage && d.edu.stage === before.edu, [e.id, d.education.stage]);
    ok(e.id + " does not award a credential", d.edu.cred.length === before.cred);
    ok(e.id + " does not write the record ledger", d.edu.record.length === before.rec);
    ok(e.id + " does not enrol anyone in college", d.education.college === before.college);
  }
}

/* ───────────── 5 · events reflect the institution ───────────── */
sec("5 · the institution is what varies the events");

{
  const c = enrolled("United Kingdom", 1975);
  const strict = M.EDU_POOL.find((e) => e.id === "eduDiscipline");
  const extra = M.EDU_POOL.find((e) => e.id === "eduExtracurricular");
  const comp = M.EDU_POOL.find((e) => e.id === "eduCompetition");

  c.edu.inst.strictness = 90;
  ok("a strict school makes discipline eligible", strict.cond(c));
  c.edu.inst.strictness = 20;
  ok("a relaxed school does not", !strict.cond(c));

  c.edu.inst.extracurricular = 80; c.edu.inst.quality = 70;
  ok("a well-resourced school offers extracurriculars", extra.cond(c));
  ok("...and competitions", comp.cond(c));
  c.edu.inst.extracurricular = 20;
  ok("a bare school offers neither", !extra.cond(c) && !comp.cond(c));

  /* invariant 8: the prose must quote the generated institution */
  c.edu.inst.extracurricular = 80;
  const out = extra.run(c);
  ok("the extracurricular text names the real institution",
    out.event.text.indexOf(c.edu.inst.label) !== -1, out.event.text);
  c.edu.inst.strictness = 90;
  ok("the discipline text names it too",
    strict.run(c).event.text.indexOf(c.edu.inst.label) !== -1);
}
{
  /* era must reach the prose — a 1950s punishment is not a 2010s one */
  const early = enrolled("United Kingdom", 1945);
  const late = enrolled("United Kingdom", 1995);
  const strict = M.EDU_POOL.find((e) => e.id === "eduDiscipline");
  if (early.edu.inst && late.edu.inst) {
    early.edu.inst.strictness = 90; late.edu.inst.strictness = 90;
    ok("the punishment described changes with era",
      strict.run(early).event.text !== strict.run(late).event.text);
  } else { ok("the punishment described changes with era", false, "no institution"); }
}

/* ───────────── 6 · boarding does not break HRE (OQ-7) ───────────── */
sec("6 · boarding and the housing authorities");

{
  const c = enrolled("United Kingdom", 1975, { cls: "Wealthy" });
  c.edu.inst.boarding = true;
  ok("precondition: the two housing authorities agree", M.hreTenureAgreesWithLegacy(c));

  ok("moving in is recorded", M.eduBoardingMoveIn(c) === true);
  ok("...and the character reads as boarding", M.eduIsBoarding(c));
  /* THE ASSERTION THIS SECTION EXISTS FOR. Writing hreSetTenure(institutional)
     here put HRE's two authorities permanently out of step, because
     hreLegacyTenure has no representation for boarding — the same defect class
     as the "Swallow it and go home" bug. EDU records the fact and does not
     touch tenure until OQ-7 is answered. */
  ok("boarding does NOT put the housing authorities out of step",
    M.hreTenureAgreesWithLegacy(c), [M.hreTenure(c), M.hreLegacyTenure(c)]);
  ok("...and does not silently rehouse anyone", M.hreTenure(c) === "withParents", M.hreTenure(c));

  ok("moving in twice is a no-op", M.eduBoardingMoveIn(c) === false);
  ok("moving out is recorded", M.eduBoardingMoveOut(c) === true);
  ok("...and clears the flag", !M.eduIsBoarding(c));
  ok("moving out twice is a no-op", M.eduBoardingMoveOut(c) === false);
  ok("the authorities still agree afterwards", M.hreTenureAgreesWithLegacy(c));
}
{
  const c = enrolled("Sweden", 1990);
  c.edu.inst.boarding = false;
  ok("a day school never boards anyone", M.eduBoardingMoveIn(c) === false);
}
{
  /* leaving school must release the boarding place */
  const c = enrolled("United Kingdom", 1975, { cls: "Wealthy" });
  c.edu.inst.boarding = true;
  M.eduBoardingMoveIn(c);
  c.school = null; c.education.stage = "done";
  M.eduOnTick(c);
  ok("leaving school ends the boarding record", !M.eduIsBoarding(c));
}

/* ───────────── 7 · soak ───────────── */
sec("7 · soak — outcomes, never step counts");

{
  let crashes = 0, deadEnds = 0, aged = 0, lives = 0, disagree = 0, lag = 0;
  const eligible = {};
  for (let i = 0; i < 8; i++) {
    const country = ["United Kingdom", "Brazil", "Japan", "Sweden", "Nigeria", "India", "Kenya", "Mexico"][i];
    H.seed(4400 + i);
    const r = H.runLife(H.mkChar({ country, birthYear: 1955 + i * 7, cls: H.CLASSES[i % 4] }), {
      maxSteps: 2000,
      onStep: (s) => {
        for (const e of M.EDU_POOL) {
          try { if (!e.cond || e.cond(s)) eligible[e.id] = (eligible[e.id] || 0) + 1; }
          catch (err) { disagree++; }
        }
        if (!M.hreTenureAgreesWithLegacy(s)) { lag++; }
      },
    });
    lives++; crashes += r.crashes; deadEnds += r.deadEnds;
    if (M.ageYears(r.state) > 5) aged++;
  }
  ok("every life ran", lives === 8);
  ok("nobody aged zero days", aged === lives, [aged, lives]);
  ok("no crashes", crashes === 0, crashes);
  ok("no dead ends", deadEnds === 0, deadEnds);
  ok("no cond threw", disagree === 0, disagree);
  ok("housing authorities never disagreed during schooling", lag === 0, lag);
  /* an event nobody can ever reach is dead content, which is what the budget
     is meant to prevent being spent on */
  ok("every EDU event was reachable at least once",
    M.EDU_POOL.every((e) => (eligible[e.id] || 0) > 0), eligible);
}

/* ───────────── 8 · invariants ───────────── */
sec("8 · invariants");

{
  const SRC = fs.readFileSync(H.SRC, "utf8");
  const stripComments = (x) => x.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
  /* S07 sits AFTER the S12 banner in the file (it was appended just before
     EDU_GROUP), so its slice ends at EDU_GROUP, not at S12 — slicing to a
     marker that precedes the section runs backwards and yields nothing. */
  const mark = SRC.indexOf("EDU · S07");
  const raw = SRC.slice(SRC.lastIndexOf("/*", mark), SRC.indexOf("const EDU_GROUP"));
  const block = stripComments(raw);
  ok("the S07 block was located", raw.length > 3000, raw.length);
  ok("invariant 2: no country conditional in S07", !/country\s*===\s*["']/.test(block));
  ok("invariant 4: S07 adds no applyFx key", !/fx\.[a-z]+ =/.test(block));
  ok("S07 builds no React component", !/createElement|useState|<div/.test(block));
  /* S07 is the ONLY section allowed to add POOL entries */
  /* The file has several POOL.push calls that predate EDU. What matters is
     that EDU has exactly one, in S07 — the only section allowed to add events. */
  ok("S07 is the only EDU section that pushes to POOL",
    (block.match(/POOL\.push/g) || []).length === 1, (block.match(/POOL\.push/g) || []).length);
  ok("...and no other EDU section pushes at all", (() => {
    const eduStart = SRC.indexOf("EDU · S01");
    const eduAll = stripComments(SRC.slice(eduStart, SRC.indexOf("const EDU_GROUP")));
    return (eduAll.match(/POOL\.push/g) || []).length === 1;
  })());
  /* OQ-7: no tenure write until module 13 answers */
  ok("S07 does not write housing tenure", !block.includes("hreSetTenure"));
}

console.log("\n" + (fail === 0 ? "ALL PASS" : "FAILURES") + ": " + pass + " passed, " + fail + " failed");
process.exit(fail === 0 ? 0 : 1);
