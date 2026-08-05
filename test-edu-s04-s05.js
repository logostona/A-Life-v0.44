/* test-edu-s04-s05.js — EDU S04 (performance) + S05 (progression)
 *
 * The engine-touching phase, and the first one whose behaviour a player can
 * see. Section 9 pins the bug the whole subsystem exists to fix.
 *
 * Two rules this suite follows deliberately:
 *
 *   · Never assert on step counts. Gotcha #6 produced a green 33,600-step run
 *     in which nobody aged a day. Soaks here assert OBSERVABLE OUTCOMES —
 *     someone reached a stage, nobody is stranded, no dead ends.
 *   · Never assert an exact rate. Cohort shares are provisional and the auto-
 *     player's choices add noise on top. Assertions are orderings and generous
 *     bands, so a real inversion fails and a lucky seed does not.
 *
 * Run: node --max-old-space-size=4096 test-edu-s04-s05.js
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

/* ───────────────────────── 1 · performance components ───────────────────────── */
sec("1 · S04 performance components");

{
  const c = H.mkChar({ country: "Sweden", birthYear: 1990 });
  c.school = { skips: 0, trouble: 0 };
  c.stats.health = 80;
  ok("clean attendance is high", M.eduAttendance(c) > 90, M.eduAttendance(c));
  c.school.skips = 6;
  ok("skipping costs attendance", M.eduAttendance(c) < 70, M.eduAttendance(c));
  c.school.skips = 0;
  c.stats.health = 20;
  ok("poor health costs attendance too", M.eduAttendance(c) < 95, M.eduAttendance(c));

  c.school = { skips: 0, trouble: 0 };
  ok("clean conduct is high", M.eduConduct(c) > 90);
  c.school.trouble = 5;
  ok("trouble costs conduct", M.eduConduct(c) < 50, M.eduConduct(c));

  ok("attendance is always a percentage",
    M.eduAttendance({ school: { skips: 99 }, stats: { health: 0 } }) >= 0);
  ok("conduct is always a percentage",
    M.eduConduct({ school: { trouble: 99 } }) >= 0);
  ok("components tolerate a character with no school",
    M.eduAttendance(H.mkChar({ country: "Brazil", birthYear: 1990 })) >= 0 &&
    M.eduConduct(H.mkChar({ country: "Brazil", birthYear: 1990 })) >= 0);
}
{
  const c = H.mkChar({ country: "Brazil", birthYear: 1990 });
  c.family.mom.rel = 90; c.family.dad.rel = 90;
  const warm = M.eduFamilySupport(c);
  c.family.mom.rel = 10; c.family.dad.rel = 10;
  const cold = M.eduFamilySupport(c);
  ok("family support tracks the parents", warm > cold + 50, [warm, cold]);
  ok("support survives a missing family", M.eduFamilySupport({}) >= 0);
}
{
  const a = H.mkChar({ country: "Sweden", birthYear: 2000 });
  const b = H.mkChar({ country: "Nigeria", birthYear: 1930 });
  ok("institution quality falls back to what the era could provide",
    M.eduInstQuality(a) > M.eduInstQuality(b), [M.eduInstQuality(a), M.eduInstQuality(b)]);
  a.edu.inst = { quality: 99 };
  ok("...but a real institution overrides the fallback", M.eduInstQuality(a) === 99);
}

/* ───────────────────────── 2 · the grade model ───────────────────────── */
sec("2 · grades are a weighted blend, never one roll");

{
  const base = () => {
    const c = H.mkChar({ country: "Sweden", birthYear: 1990, stSmarts: 60, stHealth: 70 });
    c.school = { skips: 0, trouble: 0 };
    c.family.mom.rel = 60; c.family.dad.rel = 60;
    return c;
  };
  const g = (c) => M.eduPerf(c).gpa;

  ok("eduPerf is deterministic", (() => {
    const c = base();
    const first = JSON.stringify(M.eduPerf(c));
    for (let i = 0; i < 5; i++) if (JSON.stringify(M.eduPerf(c)) !== first) return false;
    return true;
  })());

  /* every input must move the output, or it is not in the blend */
  const c1 = base(); c1.stats.smarts = 95;
  ok("smarts raises the grade", g(c1) > g(base()), [g(base()), g(c1)]);
  const c2 = base(); c2.school.skips = 8;
  ok("skipping lowers the grade", g(c2) < g(base()), [g(base()), g(c2)]);
  const c3 = base(); c3.family.mom.rel = 5; c3.family.dad.rel = 5;
  ok("losing family support lowers the grade", g(c3) < g(base()));
  const c4 = base(); c4.stats.health = 15;
  ok("poor health lowers the grade", g(c4) < g(base()));
  const c5 = base(); c5.school.trouble = 6;
  ok("trouble lowers the grade", g(c5) < g(base()));
  const c6 = base(); c6.edu.inst = { quality: 98 };
  ok("a better institution raises the grade", g(c6) > g(base()));

  /* no single input may dominate — that is what "never a single roll" means */
  const only = base(); only.stats.smarts = 100;
  ok("smarts alone does not produce a perfect grade", g(only) < 92, g(only));
  const none = base(); none.stats.smarts = 0;
  ok("...and zero smarts does not produce a zero", g(none) > 18, g(none));

  ok("gpa is always a percentage",
    [0, 50, 100].every((sm) => { const c = base(); c.stats.smarts = sm; const v = g(c); return v >= 0 && v <= 100; }));
  ok("eduPerf returns all three measures", (() => {
    const p = M.eduPerf(base());
    return typeof p.gpa === "number" && typeof p.attendance === "number" && typeof p.conduct === "number";
  })());
}

/* ───────────────────────── 3 · the quantile calibration ───────────────────────── */
sec("3 · score quantiles");

{
  const q = M.EDU_SCORE_QUANTILES;
  ok("the quantile table spans 0 to 1", q[0][0] === 0 && q[q.length - 1][0] === 1);
  ok("the table is monotonic in probability", q.every((p, i) => i === 0 || p[0] > q[i - 1][0]));
  ok("the table is monotonic in score", q.every((p, i) => i === 0 || p[1] > q[i - 1][1]));
  ok("quantile(0) is the floor", M.eduScoreQuantile(0) === q[0][1]);
  ok("quantile(1) is the ceiling", M.eduScoreQuantile(1) === q[q.length - 1][1]);
  ok("quantile interpolates between points",
    M.eduScoreQuantile(0.5) > M.eduScoreQuantile(0.25) && M.eduScoreQuantile(0.5) < M.eduScoreQuantile(0.75));
  ok("quantile is monotonic across the range", (() => {
    let prev = -1;
    for (let f = 0; f <= 1.0001; f += 0.05) { const v = M.eduScoreQuantile(f); if (v < prev) return false; prev = v; }
    return true;
  })());
  ok("out-of-range input is clamped, not NaN",
    M.eduScoreQuantile(-5) === q[0][1] && M.eduScoreQuantile(9) === q[q.length - 1][1]);

  /* The bug this table fixes: a linear 0-108 map assumed a uniform score
     distribution and demanded ~102 for a 5% share, which almost nobody has —
     replacing "everyone goes" with "nobody goes". */
  ok("a 5% share does not demand a near-perfect score",
    M.eduScoreQuantile(0.95) < 104, M.eduScoreQuantile(0.95));
  ok("a 50% share sits near the middle of the real distribution",
    M.eduScoreQuantile(0.5) > 60 && M.eduScoreQuantile(0.5) < 85, M.eduScoreQuantile(0.5));
}

/* ───────────────────────── 4 · the tertiary gate ───────────────────────── */
sec("4 · the tertiary gate");

{
  const mk = (country, by, sex) => H.mkChar({ country, birthYear: by, sex: sex || "Male", gid: "Cisgender" });

  const gN35 = M.eduTertiaryGate(mk("Nigeria", 1935));
  const gS95 = M.eduTertiaryGate(mk("Sweden", 1995));
  ok("a scarce era demands far more than a plentiful one", gN35 > gS95 + 25, [gN35, gS95]);
  ok("the gate falls as access widens",
    M.eduTertiaryGate(mk("United Kingdom", 1935)) > M.eduTertiaryGate(mk("United Kingdom", 2015)));
  ok("the gate is always on the score scale",
    ["Nigeria", "Sweden", "India", "Japan"].every((c) => [1900, 1950, 2000, 2020].every((y) => {
      const g = M.eduTertiaryGate(mk(c, y));
      return g >= 0 && g <= 110;
    })));

  const v1 = M.eduTertiaryVerdict(mk("Nigeria", 1935));
  ok("a 1935 Nigerian verdict reports scarcity", v1.scarce === true, v1);
  ok("...and reports the share it used", v1.share < 0.02, v1.share);
  const v2 = M.eduTertiaryVerdict(mk("Sweden", 2015));
  ok("a 2015 Swedish verdict is not scarce", v2.scarce === false, v2);
  ok("verdicts always carry a score and a gate",
    typeof v1.score === "number" && typeof v1.gate === "number");

  /* femaleAccess must show up as a REASON, not just a smaller number —
     "you weren't good enough" and "the gates were shut to women" are
     different sentences and the player is owed the true one. */
  const barred = M.eduTertiaryVerdict(mk("Egypt", 1935, "Female"));
  const notBarred = M.eduTertiaryVerdict(mk("Egypt", 1935, "Male"));
  ok("a woman in 1935 Egypt is recorded as barred", barred.genderBarred === true, barred);
  ok("...and a man in the same year is not", notBarred.genderBarred === false);
  ok("the barrier lifts with era",
    M.eduTertiaryVerdict(mk("Egypt", 2015, "Female")).genderBarred === false);
  ok("a woman faces a higher gate than a man in the same barred era",
    M.eduTertiaryGate(mk("Egypt", 1935, "Female")) >= M.eduTertiaryGate(mk("Egypt", 1935, "Male")));
}

/* ───────────────────────── 5 · the engine wiring ───────────────────────── */
sec("5 · the scheduled step");

{
  /* POST-INVERSION (P8): the tick PROJECTS canonical → legacy. It used to sync
     legacy → canonical, which is the arrangement inversion reverses. */
  const c = H.mkChar({ country: "Sweden", birthYear: 1990 });
  M.eduSetStage(c, "upperSec");
  c.education.stage = "pre";                  // deliberately drifted
  M.eduOnTick(c);
  ok("the tick projects canonical onto legacy", c.education.stage === "high", c.education.stage);
  ok("...and the projection is consistent", M.eduProjectionIsConsistent(c));
  ok("...and canonical was not overwritten by legacy", c.edu.stage === "upperSec");

  c.school = { skips: 1, trouble: 0 };
  M.eduOnTick(c);
  ok("the tick refreshes the performance snapshot", typeof c.edu.perf.gpa === "number", c.edu.perf);

  c.education.debt = 3300;
  M.eduOnTick(c);
  ok("the tick mirrors legacy debt", c.edu.fin.debt === 3300);

  const before = JSON.stringify(c.pending || null);
  M.eduOnTick(c);
  ok("the tick never sets a popup", JSON.stringify(c.pending || null) === before);
  ok("the tick is safe on a character with no edu slice", (() => {
    const d = H.mkChar({ country: "Brazil", birthYear: 1990 });
    delete d.edu;
    try { M.eduOnTick(d); return true; } catch (e) { return false; }
  })());
}
{
  /* the scheduled block must run before anything that can set s.pending —
     otherwise progression depends on a popup being dismissed */
  const SRC = fs.readFileSync(H.SRC, "utf8");
  const adv = SRC.slice(SRC.indexOf("function advance(state, totalDays)"));
  const tick = adv.indexOf("eduOnTick(s)");
  const miles = adv.indexOf("for (const m of MILESTONES)");
  const pool = adv.indexOf("POOL.filter");
  const degree = adv.indexOf("degrees finish on schedule");
  ok("eduOnTick is inside advance()", tick > 0);
  /* AFTER milestones, because milestones are what write education.stage —
     running before them left the mirror a full step behind the truth. */
  ok("...after the MILESTONES scan", tick > miles, [miles, tick]);
  ok("...and before the POOL draw", tick < pool, [tick, pool]);
  /* the genuinely schedule-critical work stays early, where no popup can
     starve it */
  ok("degree completion still runs before milestones", degree < miles, [degree, miles]);
}

/* ───────────────────────── 6 · credentials ───────────────────────── */
sec("6 · credential award");

{
  const c = H.mkChar({ country: "United States", birthYear: 1990 });
  ok("awarding adds a credential", M.eduAwardCredential(c, "bachelor", { field: "History" }) === true);
  ok("...with the field recorded", c.edu.cred.find((x) => x.id === "bachelor").field === "History");
  ok("awarding twice does not duplicate", M.eduAwardCredential(c, "bachelor") === false);
  ok("...and the ledger still has one", c.edu.cred.filter((x) => x.id === "bachelor").length === 1);
  ok("awarding nothing is refused", M.eduAwardCredential(c, null) === false);
  ok("awarding on a character with no slice is safe", (() => {
    const d = H.mkChar({ country: "Brazil", birthYear: 1990 });
    delete d.edu;
    return M.eduAwardCredential(d, "bachelor") === false;
  })());
}
{
  /* graduating through the legacy path must reach the EDU ledger */
  H.seed(88);
  const c = H.mkChar({ country: "United States", cls: "Wealthy", birthYear: 1990, stSmarts: 90 });
  c.ageDays = Math.round(21 * 365.25);
  c.education.college = { major: "History", tier: "state", startDay: c.ageDays - 1500, gpa: 3.4 };
  c.education.stage = "college";
  const after = M.advance(c, 7);
  ok("legacy graduation still works", after.education.degree === "History");
  ok("...and mirrors into the credential ledger",
    after.edu.cred.some((x) => x.id === "bachelor" && x.field === "History"), after.edu.cred);
}

/* ───────────── 7 · full-life soak — observable outcomes only ───────────── */
sec("7 · soak (outcomes, never step counts — Gotcha #6)");

{
  const CELLS = [
    ["United Kingdom", 1935], ["United Kingdom", 2005], ["Nigeria", 1935],
    ["Sweden", 2005], ["Japan", 1975], ["Brazil", 1995],
  ];
  let crashes = 0, deadEnds = 0, aged = 0, lives = 0;
  let reachedSchool = 0, stranded = 0, disagreements = 0, lagRun = 0;
  const stagesSeen = {};

  for (let i = 0; i < CELLS.length; i++) {
    const [country, birthYear] = CELLS[i];
    H.seed(6100 + i);
    const r = H.runLife(H.mkChar({ country, birthYear, cls: H.CLASSES[i % 4] }), {
      maxSteps: 2400,
      onStep: (s) => {
        const st = M.eduStage(s);
        stagesSeen[st] = (stagesSeen[st] || 0) + 1;
        if (!M.EDU_STAGES[st]) stranded++;
        /* A POOL event can change education.stage after the tick has already
           run, so a single step of lag is expected and harmless — nothing
           reads the mirror to make a decision before inversion. What must
           never happen is lag that PERSISTS, which would mean the mirror had
           stopped tracking rather than merely trailing. */
        /* POST-INVERSION: the invariant is that legacy is a faithful
           projection of canonical. A POOL event can still write legacy
           directly for one step before the tick re-projects, so a single step
           of lag is tolerated and persistent lag is not. */
        if (!M.eduProjectionIsConsistent(s)) { lagRun++; if (lagRun > 1) disagreements++; }
        else lagRun = 0;
      },
    });
    lives++;
    crashes += r.crashes;
    deadEnds += r.deadEnds;
    if (M.ageYears(r.state) > 5) aged++;           // an OUTCOME, not a step count
    if ((r.state.education.stage) !== "pre") reachedSchool++;
  }

  ok("every life ran", lives === CELLS.length);
  ok("nobody aged zero days", aged === lives, [aged, lives]);
  ok("no crashes", crashes === 0, crashes);
  ok("no dead ends", deadEnds === 0, deadEnds);
  ok("everyone reached school", reachedSchool === lives, [reachedSchool, lives]);
  ok("nobody was stranded on an unknown stage", stranded === 0, stranded);
  ok("the legacy projection never falls persistently out of step", disagreements === 0, disagreements);
  ok("more than one stage was observed", Object.keys(stagesSeen).length >= 3, stagesSeen);
}

/* ───────────── 8 · invariants ───────────── */
sec("8 · invariants");

const SRC = fs.readFileSync(H.SRC, "utf8");
const stripComments = (x) => x.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
/* Bound the slice by the NEXT EDU section banner, not by a function name far
   below it. Ending at eduInstitutionOpts was correct when S04/S05 was the last
   EDU block in the file; S03/S06 and S12 have since been inserted between
   them, so the slice silently grew to include both and this section started
   linting code it does not own. */
const mark = SRC.indexOf("EDU · S04 + S05");
const nextSection = SRC.indexOf("EDU · S03 + S06");
const rawBlock = SRC.slice(SRC.lastIndexOf("/*", mark), nextSection);
const block = stripComments(rawBlock);
ok("the S04/S05 block was located", rawBlock.length > 3000, rawBlock.length);

for (const bad of ["Math.random", "Date.now", "new Date"]) {
  ok("invariant 1: no " + bad + " in S04/S05", !block.includes(bad));
}
ok("invariant 2: no country conditional in S04/S05", !/country\s*===\s*["']/.test(block));
/* invariant 10: progression is schedule-driven. A POOL entry that advanced a
   stage would be exactly the failure the roadmap warns about. */
ok("invariant 10: EDU adds no POOL entry", !/POOL\.push|POOL\.unshift/.test(block));
ok("...and none anywhere in EDU", !/POOL\.push\(EDU|POOL\.push\(edu/.test(SRC));
ok("invariant 4: no new applyFx key", !/applyFx/.test(block));
ok("the gate is calibrated from a table, not a magic constant",
  block.includes("EDU_SCORE_QUANTILES"));

/* ───────────── 9 · the regression this subsystem exists for ───────────── */
sec("9 · the 88% bug");

{
  /* Measured before EDU: a 1935 Nigerian reached university 88% of the time,
     more often than a 1995 Swede (63%) or a 1935 Briton (50%). Asserted here
     as the ORDERING of what the world offers, which is deterministic — the
     realised rate depends on the auto-player's choices and on n. */
  const mk = (c, y) => H.mkChar({ country: c, birthYear: y, cls: "Middle", sex: "Male", gid: "Cisgender" });
  const share = (c, y) => M.eduTertiaryOdds(mk(c, y));

  ok("1935 Nigeria is no longer the best place to be born for university",
    share("Nigeria", 1935) < share("Sweden", 1995), [share("Nigeria", 1935), share("Sweden", 1995)]);
  ok("...by a wide margin", share("Sweden", 1995) / Math.max(1e-9, share("Nigeria", 1935)) > 50);
  ok("1935 Britain beats 1935 Nigeria", share("United Kingdom", 1935) > share("Nigeria", 1935));
  ok("2015 Nigeria beats 1935 Nigeria", share("Nigeria", 2015) > share("Nigeria", 1935));

  /* and the gate actually closes the door for the scarce case */
  const poor = mk("Nigeria", 1935);
  poor.education.subjects = { a: 70 };
  ok("an ordinary 1935 Nigerian student is not offered university",
    M.eduTertiaryVerdict(poor).open === false, M.eduTertiaryVerdict(poor));
  const rich = H.mkChar({ country: "Sweden", birthYear: 1995, cls: "Wealthy", sex: "Male", gid: "Cisgender" });
  rich.education.subjects = { a: 95 };
  ok("a strong 1995 Swedish student is", M.eduTertiaryVerdict(rich).open === true,
    M.eduTertiaryVerdict(rich));

  /* the door must not be shut on EVERYONE — the opposite failure */
  let anyOpen = 0, n = 0;
  for (const c of ["Sweden", "United States", "Japan", "United Kingdom", "Germany"]) {
    for (const cls of ["Poor", "Working", "Middle", "Wealthy"]) {
      const ch = H.mkChar({ country: c, birthYear: 2005, cls, sex: "Male", gid: "Cisgender" });
      ch.education.subjects = { a: 78 };
      n++;
      if (M.eduTertiaryVerdict(ch).open) anyOpen++;
    }
  }
  ok("a decent modern student usually gets in somewhere", anyOpen > n * 0.5, [anyOpen, n]);
}

console.log("\n" + (fail === 0 ? "ALL PASS" : "FAILURES") + ": " + pass + " passed, " + fail + " failed");
process.exit(fail === 0 ? 0 : 1);
