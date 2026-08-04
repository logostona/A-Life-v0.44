/* test-edu-s09.js — EDU S09: state, legacy shim, migration
 *
 * Section 5 is the reason this phase exists. Everything after P3 rests on one
 * claim: the canonical EDU vocabulary can be derived from the still-authoritative
 * legacy state without ever disagreeing with it. That is proven by driving real
 * lives across country × era × class × age and checking the two views at every
 * single step — not by unit-testing the mapping table, which would pass happily
 * while the derivation was wrong for anyone actually playing.
 *
 * Run: node --max-old-space-size=4096 test-edu-s09.js
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

const RUNGS = Object.keys(M.EDU_STAGES).filter((k) => M.EDU_STAGES[k].visionKind === "rung");

/* ───────────────────────── 1 · schema & creation ───────────────────────── */
sec("1 · schema and creation");

{
  const c = H.mkChar({ country: "Brazil", birthYear: 1990 });
  ok("a new character has s.edu", !!c.edu);
  ok("schema version is current", c.edu.v === 1);
  ok("seed is a uint32", typeof c.edu.seed === "number" && c.edu.seed >>> 0 === c.edu.seed);
  ok("starts at no stage", c.edu.stage === "none");
  ok("ledgers start empty", Array.isArray(c.edu.record) && c.edu.record.length === 0
    && Array.isArray(c.edu.cred) && c.edu.cred.length === 0);
  ok("perf starts null, not zero", c.edu.perf.gpa === null && c.edu.perf.attendance === null);
  ok("finance starts at zero", c.edu.fin.debt === 0 && c.edu.fin.aid === 0 && c.edu.fin.sponsor === null);
  ok("mem exists for the UI phase", !!c.edu.mem);
  ok("no institution yet", c.edu.inst === null);

  const d = H.mkChar({ country: "Brazil", birthYear: 1990, first: "Other", last: "Person" });
  ok("different characters get different seeds", c.edu.seed !== d.edu.seed, [c.edu.seed, d.edu.seed]);
}
ok("eduInit is pure-shaped", (() => {
  const a = M.eduInit(123), b = M.eduInit(123);
  return JSON.stringify(a) === JSON.stringify(b) && a.seed === 123;
})());
ok("eduSeedFrom is deterministic", M.eduSeedFrom("x") === M.eduSeedFrom("x"));
ok("eduSeedFrom separates inputs", M.eduSeedFrom("x") !== M.eduSeedFrom("y"));

/* ───────────────────────── 2 · eduSetStage is the sole writer ───────────────────────── */
sec("2 · sole writer");

{
  const c = H.mkChar({ country: "Sweden", birthYear: 1990 });
  c.ageDays = 2200;
  ok("setting a real rung succeeds", M.eduSetStage(c, "primary") === true);
  ok("...and takes effect", c.edu.stage === "primary");
  ok("...and stamps `since`", c.edu.since === 2200);

  ok("an unknown stage is refused", M.eduSetStage(c, "notARung") === false);
  ok("...and changes nothing", c.edu.stage === "primary");

  /* The single-canonical-stage contract: variants, modifiers, modes and
     overlays are not stages and must never be settable as one. This is the
     tripwire for someone flattening EDU_NON_RUNG back into EDU_STAGES. */
  ok("a mode is not settable as a stage", M.eduSetStage(c, "prep") === false);
  for (const k of Object.keys(M.EDU_NON_RUNG)) {
    ok("non-rung '" + k + "' is not settable", M.eduSetStage(c, k) === false);
  }

  c.ageDays = 4100;
  M.eduSetStage(c, "lowerSec");
  ok("advancing records the completed stage", c.edu.record.length === 1, c.edu.record);
  ok("the record row names the stage left", c.edu.record[0].stage === "primary");
  ok("the record row spans from/to", c.edu.record[0].from === 2200 && c.edu.record[0].to === 4100);
  ok("advancing is recorded as completion", c.edu.record[0].outcome === "completed");
  ok("the exit credential is awarded", c.edu.cred.some((x) => x.id === "primaryCert"));

  c.ageDays = 4300;
  M.eduSetStage(c, "primary");
  ok("going backwards is recorded as leaving",
    c.edu.record[c.edu.record.length - 1].outcome === "left", c.edu.record);

  const before = c.edu.record.length;
  M.eduSetStage(c, "primary");
  ok("re-setting the same stage adds no row", c.edu.record.length === before);
}
{
  /* record must stay bounded — it is one row per completed stage, never a
     per-term transcript. s.school already shows what unbounded costs. */
  const c = H.mkChar({ country: "Japan", birthYear: 1990 });
  for (let i = 0; i < 400; i++) {
    c.ageDays += 50;
    M.eduSetStage(c, RUNGS[i % RUNGS.length]);
  }
  ok("record grows only on real transitions", c.edu.record.length <= 400);
  ok("record rows are flat scalars",
    c.edu.record.every((r) => Object.values(r).every((v) => v === null || typeof v !== "object")));
}

/* ───────────────────────── 3 · the shim mapping ───────────────────────── */
sec("3 · legacy → canonical mapping");

{
  const mk = (eduStage, schoolStage) => {
    const c = H.mkChar({ country: "France", birthYear: 1990 });
    c.education.stage = eduStage;
    c.school = schoolStage ? { stage: schoolStage } : null;
    return c;
  };
  ok("pre → none", M.eduLegacyStage(mk("pre")) === "none");
  ok("primary → primary", M.eduLegacyStage(mk("primary")) === "primary");
  ok("middle → lowerSec", M.eduLegacyStage(mk("middle")) === "lowerSec");
  ok("high → upperSec", M.eduLegacyStage(mk("high")) === "upperSec");
  ok("college → university", M.eduLegacyStage(mk("college")) === "university");
  ok("done → done", M.eduLegacyStage(mk("done")) === "done");

  /* Totality. A shim that can return undefined turns one malformed save into a
     crash in every caller, so an unknown value must degrade, not explode. */
  ok("an unknown legacy stage degrades to none", M.eduLegacyStage(mk("wat")) === "none");
  ok("a missing education slice degrades to none", M.eduLegacyStage({}) === "none");
  ok("null degrades to none", M.eduLegacyStage(null) === "none");
  ok("the school record wins when the two differ",
    M.eduLegacyStage(mk("done", "high")) === "upperSec");

  ok("every legacy value maps to a real rung",
    Object.values(M.EDU_LEGACY_STAGE_MAP).every((v) => !!M.EDU_STAGES[v] && M.EDU_STAGES[v].visionKind === "rung"));
  ok("the map covers exactly the six legacy values",
    Object.keys(M.EDU_LEGACY_STAGE_MAP).length === 6);
}

/* The shim must not INVENT stages legacy never held. Nursery/preschool/
   vocational/postgraduate are unreachable until S04/S05 drive progression,
   and claiming otherwise would make section 5 pass by fabrication. */
ok("the shim never claims nursery or preschool",
  !Object.values(M.EDU_LEGACY_STAGE_MAP).some((v) => v === "nursery" || v === "preschool"));
ok("the shim never claims a postgraduate rung",
  !Object.values(M.EDU_LEGACY_STAGE_MAP).some((v) => M.EDU_STAGES[v].tier === "postgrad"));

/* ───────────────────────── 4 · migration ───────────────────────── */
sec("4 · migration");

{
  /* a genuine pre-EDU save: everything EDU touches simply absent */
  const c = H.mkChar({ country: "United Kingdom", birthYear: 1975 });
  c.education.stage = "high";
  c.education.debt = 4200;
  c.education.degree = null;
  delete c.edu;
  M.migrate(c);
  ok("migrate creates s.edu on a pre-EDU save", !!c.edu && c.edu.v === 1);
  ok("...with a usable seed", typeof c.edu.seed === "number");
  ok("...and backfills the canonical stage from legacy", c.edu.stage === "upperSec", c.edu.stage);
  ok("...and carries legacy debt across", c.edu.fin.debt === 4200, c.edu.fin.debt);
  ok("...and agrees with legacy immediately", M.eduStageAgreesWithLegacy(c));

  const snap = JSON.stringify(c.edu);
  M.migrate(c); M.migrate(c);
  ok("migrate is idempotent", JSON.stringify(c.edu) === snap);
}
{
  /* a graduate's credential must survive into the ledger, exactly once */
  const c = H.mkChar({ country: "United States", birthYear: 1970 });
  c.education.stage = "done";
  c.education.degree = "History";
  delete c.edu;
  M.migrate(c);
  ok("a legacy degree becomes a credential", c.edu.cred.some((x) => x.id === "bachelor"));
  ok("...recording the field", c.edu.cred.find((x) => x.id === "bachelor").field === "History");
  ok("...and marked as backfilled", c.edu.cred.find((x) => x.id === "bachelor").backfilled === true);
  M.migrate(c); M.migrate(c);
  ok("the credential is not duplicated by re-migration",
    c.edu.cred.filter((x) => x.id === "bachelor").length === 1);
}
{
  /* the version-independent repair pass: a save carrying a CURRENT v but
     missing fields. A ladder alone skips this entirely, because the version
     already looks right — which is exactly how hreMigrate survived a real
     truncated fixture. */
  const c = H.mkChar({ country: "India", birthYear: 1990 });
  c.edu = { v: 1 };
  M.migrate(c);
  ok("repair restores stage", M.EDU_STAGES[c.edu.stage] !== undefined);
  ok("repair restores the ledgers", Array.isArray(c.edu.record) && Array.isArray(c.edu.cred));
  ok("repair restores perf", !!c.edu.perf && c.edu.perf.gpa === null);
  ok("repair restores fin", !!c.edu.fin && c.edu.fin.debt === 0);
  ok("repair restores mem", !!c.edu.mem);
  ok("repair restores the seed", typeof c.edu.seed === "number");
}
{
  const c = H.mkChar({ country: "Kenya", birthYear: 1990 });
  c.edu = { v: 1, stage: "notAStage", record: "not an array", cred: 42,
            perf: null, fin: "nope", mem: 7, seed: "bad", since: "x", inst: undefined };
  M.migrate(c);
  ok("a corrupt stage is reset", M.EDU_STAGES[c.edu.stage] !== undefined, c.edu.stage);
  ok("a corrupt record array is reset", Array.isArray(c.edu.record));
  ok("a corrupt cred array is reset", Array.isArray(c.edu.cred));
  ok("a corrupt perf object is reset", !!c.edu.perf && c.edu.perf.gpa === null);
  ok("a corrupt fin object is reset", !!c.edu.fin && typeof c.edu.fin.debt === "number");
  ok("a corrupt mem object is reset", !!c.edu.mem);
  ok("a corrupt seed is replaced", typeof c.edu.seed === "number");
  ok("a corrupt since is replaced", typeof c.edu.since === "number");
  ok("inst is normalised to null", c.edu.inst === null);
}
{
  const c = H.mkChar({ country: "Spain", birthYear: 1990 });
  c.edu = "not an object";
  M.migrate(c);
  ok("a non-object s.edu is rebuilt", !!c.edu && c.edu.v === 1);
  const d = H.mkChar({ country: "Spain", birthYear: 1990 });
  d.edu = [];
  M.migrate(d);
  ok("an array s.edu is rebuilt", !Array.isArray(d.edu) && d.edu.v === 1);
  const e = H.mkChar({ country: "Spain", birthYear: 1990 });
  e.edu = M.eduInit(1); e.edu.v = 999;
  M.migrate(e);
  ok("a save from the future is clamped, not trusted", e.edu.v === 1);
}

/* ────────────── 5 · shim equivalence across country × era × class × age ────────────── */
sec("5 · THE GATE — shim equivalence across real lives");

{
  const CELLS = [
    ["United Kingdom", 1935, "Poor"], ["United Kingdom", 1995, "Wealthy"],
    ["Nigeria", 1955, "Working"], ["Nigeria", 2005, "Middle"],
    ["Japan", 1975, "Middle"], ["Brazil", 1985, "Poor"],
    ["Sweden", 1965, "Working"], ["India", 1995, "Middle"],
    ["United States", 1945, "Wealthy"], ["Russia", 1975, "Working"],
    ["Kenya", 2000, "Poor"], ["Mexico", 1955, "Middle"],
  ];
  let steps = 0, disagreements = [], invalid = [], undef = 0, seen = {}, agesSeen = new Set();

  for (let i = 0; i < CELLS.length; i++) {
    const [country, birthYear, cls] = CELLS[i];
    H.seed(7000 + i);
    const s0 = H.mkChar({ country, birthYear, cls });
    H.runLife(s0, {
      maxSteps: 2600,
      onStep: (s) => {
        steps++;
        const derived = M.eduLegacyStage(s);
        if (derived === undefined || derived === null) undef++;
        if (!M.EDU_STAGES[derived]) invalid.push([country, birthYear, derived]);
        seen[derived] = (seen[derived] || 0) + 1;
        agesSeen.add(M.ageYears(s));
        /* keep the mirror in step the way the pre-inversion game would, then
           demand the two views agree */
        M.eduSyncStage(s);
        if (!M.eduStageAgreesWithLegacy(s)) {
          disagreements.push({ country, birthYear, age: M.ageYears(s),
            legacy: s.education.stage, school: s.school && s.school.stage,
            derived, stored: s.edu.stage });
        }
      },
    });
  }

  ok("the sweep actually ran lives", steps > 4000, steps);
  ok("it covered a wide age range", agesSeen.size > 35, agesSeen.size);
  ok("the derivation is never undefined", undef === 0, undef);
  ok("the derivation is always a known stage", invalid.length === 0, invalid.slice(0, 3));
  ok("THE GATE: canonical and legacy never disagree, at any step of any life",
    disagreements.length === 0, disagreements.slice(0, 3));
  /* a sweep in which everyone stayed at `none` would pass the above and prove
     nothing — the stages have to actually move */
  ok("the sweep reached more than one stage", Object.keys(seen).length >= 3, seen);
  ok("...including school stages", (seen.primary || 0) + (seen.lowerSec || 0) + (seen.upperSec || 0) > 100, seen);
}

{
  /* the mirror must be repairable from any drift, not just from creation */
  const c = H.mkChar({ country: "Italy", birthYear: 1990 });
  c.education.stage = "high";
  c.edu.stage = "none";
  ok("a drifted mirror is detected", !M.eduStageAgreesWithLegacy(c));
  ok("sync reports that it changed something", M.eduSyncStage(c) === true);
  ok("...and repairs it", M.eduStageAgreesWithLegacy(c) && c.edu.stage === "upperSec");
  ok("syncing an already-correct mirror is a no-op", M.eduSyncStage(c) === false);
  ok("eduStage() reads through to legacy", M.eduStage(c) === "upperSec");
}

/* ───────────────────────── 6 · budget ───────────────────────── */
sec("6 · state budget");

{
  const c = H.mkChar({ country: "Brazil", birthYear: 1990 });
  ok("a fresh s.edu is tiny", Buffer.byteLength(JSON.stringify(c.edu)) < 400,
    Buffer.byteLength(JSON.stringify(c.edu)));

  /* a full ladder plus a crystallised institution — the realistic worst case */
  const seed = M.hreSeedFrom("budget");
  c.edu.inst = M.eduCrystallise(M.eduBlueprint(seed,
    M.eduIdMake("Brazil", 0, 3, "eliteResearchUniversity", 1), 2005));
  /* Architecture §6 bounds `record` by the number of stages a life can
     complete, "≤ ~12". Twelve is therefore the budgeted worst case, not the
     full 16-rung vocabulary — no character does nursery through professional
     doctorate, and several rungs are mutually exclusive. */
  for (const rung of RUNGS.slice(0, 12)) { c.ageDays += 800; M.eduSetStage(c, rung); }
  const size = Buffer.byteLength(JSON.stringify(c.edu));
  ok("s.edu stays inside its 2.5 KB budget after the budgeted ladder", size < 2560, size);
  ok("...and that was a real ladder", c.edu.record.length >= 10, c.edu.record.length);
  /* Recorded rather than hidden: walking every rung DOES exceed the budget.
     It is unreachable in play, but P5/P8 should know the headroom is finite. */
  const c2 = H.mkChar({ country: "Brazil", birthYear: 1990 });
  c2.edu.inst = c.edu.inst;
  for (const rung of RUNGS) { c2.ageDays += 800; M.eduSetStage(c2, rung); }
  ok("a pathological all-16-rung path is the known overflow case",
    Buffer.byteLength(JSON.stringify(c2.edu)) > 2560,
    Buffer.byteLength(JSON.stringify(c2.edu)));
  ok("no unbounded array crept in",
    Object.values(c.edu).filter(Array.isArray).length === 2);
}
{
  /* the measurement that matters: a real full life */
  H.seed(4242);
  const s = H.runLife(H.mkChar({ country: "United Kingdom", cls: "Middle", birthYear: 1960 }),
    { maxSteps: 2600 }).state;
  const size = Buffer.byteLength(JSON.stringify(s.edu));
  ok("s.edu after a full life is well inside budget", size < 2560, size);
}

/* ───────────────────────── 7 · still additive ───────────────────────── */
sec("7 · additivity");

{
  H.seed(99);
  const a = H.runLife(H.mkChar({ country: "Sweden", cls: "Middle", birthYear: 1980 }), { maxSteps: 1200 }).state;
  ok("no crash driving a life with s.edu present", !!a);
  ok("legacy education state still drives everything",
    a.education && typeof a.education.stage === "string");
  ok("s.edu never became authoritative", M.eduStage(a) === M.eduLegacyStage(a));
  ok("nothing wrote a stage through the sole writer during play",
    a.edu.record.length === 0, a.edu.record.length);
}

/* ───────────────────────── 8 · invariants ───────────────────────── */
sec("8 · invariants");

const SRC = fs.readFileSync(H.SRC, "utf8");
const stripComments = (x) => x.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
const mark = SRC.indexOf("EDU · S09");
const s09raw = SRC.slice(SRC.lastIndexOf("/*", mark), SRC.indexOf("function eduInstitutionOpts"));
const s09 = stripComments(s09raw);
ok("the S09 block was located", s09raw.length > 3000, s09raw.length);

for (const bad of ["Math.random", "Date.now", "new Date"]) {
  ok("invariant 1: no " + bad + " in S09", !s09.includes(bad));
}
ok("invariant 2: no country conditional in S09", !/country\s*===\s*["']/.test(s09));
ok("invariant 9: the initializer exists in newCharacter", /edu:\s*eduInit\(/.test(SRC));
ok("invariant 9: the backfill exists in migrate", /eduMigrate\(s\);/.test(SRC));
/* Four writers, all inside S09 and all deliberate: eduSetStage (the sole
   writer for progression), eduSyncStage (the pre-inversion mirror),
   eduMigrate's repair of an invalid value, and eduMigrate's creation backfill.
   `[^=]` excludes `===` comparisons, which an earlier version of this pin
   counted as writes. A fifth writer appearing anywhere is the thing this
   catches. */
ok("s.edu.stage has exactly four deliberate writers, all in S09",
  (stripComments(SRC).match(/\.edu\.stage\s*=[^=]/g) || []).length === 4,
  (stripComments(SRC).match(/\.edu\.stage\s*=[^=]/g) || []).length);
ok("...and all four are inside the S09 block",
  (stripComments(s09raw).match(/\.edu\.stage\s*=[^=]/g) || []).length === 4);

console.log("\n" + (fail === 0 ? "ALL PASS" : "FAILURES") + ": " + pass + " passed, " + fail + " failed");
process.exit(fail === 0 ? 0 : 1);
