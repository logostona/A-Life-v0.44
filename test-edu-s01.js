/* test-edu-s01.js — EDU S01: ladder & country/era system model
 *
 * S01 is pure data plus a pure resolver, so almost everything here is
 * checkable exactly rather than statistically. The exceptions are the
 * plausibility bands on the provisional tables, and those are asserted as
 * ORDERINGS ("a 1995 Swede reaches tertiary more often than a 1935 Nigerian")
 * rather than as values — the values are unsourced and will move when module
 * 22 supplies real ones. An assertion that pinned them would have to be
 * rewritten by the very patch that makes them correct.
 *
 * Run: node --max-old-space-size=4096 test-edu-s01.js
 */
"use strict";

const path = require("path");
const fs = require("fs");
const H = require(path.join(__dirname, "harness.js"));
const M = H.M;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log("  FAIL: " + name + (extra !== undefined ? "  " + JSON.stringify(extra).slice(0, 300) : "")); }
}
function sec(t) { console.log("\n=== " + t + " ==="); }

const ALL = Object.keys(M.COUNTRIES);
const YEARS = [1900, 1912, 1935, 1948, 1955, 1969, 1975, 1988, 1995, 2004, 2012, 2025, 2035];

/* ───────────────────────── 1 · the stage vocabulary ───────────────────────── */
sec("1 · stage vocabulary");

ok("EDU_STAGES exists and is non-trivial", Object.keys(M.EDU_STAGES).length >= 15);
ok("every stage has an ord", Object.values(M.EDU_STAGES).every((v) => typeof v.ord === "number"));
ok("every stage has a label", Object.values(M.EDU_STAGES).every((v) => typeof v.label === "string" && v.label.length > 2));
ok("every stage declares a tier", Object.values(M.EDU_STAGES).every((v) => typeof v.tier === "string"));

{
  const ords = Object.values(M.EDU_STAGES).map((v) => v.ord);
  ok("ords are unique", new Set(ords).size === ords.length);
  ok("none sorts first", M.EDU_STAGES.none.ord === Math.min(...ords));
  ok("done sorts last", M.EDU_STAGES.done.ord === Math.max(...ords));
}

/* The design claim being pinned: the vision document's 23 items are NOT 23
   rungs. If someone later flattens variants/modifiers/overlays back into
   EDU_STAGES, eduSetStage's single-canonical-stage contract breaks — a
   religious boarding secondary school would need three simultaneous values.
   These assertions are the tripwire for that. */
ok("EDU_NON_RUNG exists", !!M.EDU_NON_RUNG && Object.keys(M.EDU_NON_RUNG).length >= 8);
ok("secondary variants are not rungs",
  ["technicalSecondary", "militarySecondary", "religiousSecondary"].every(
    (k) => M.EDU_NON_RUNG[k] && M.EDU_NON_RUNG[k].kind === "variant" && !M.EDU_STAGES[k]));
ok("boarding is a modifier, not a rung",
  M.EDU_NON_RUNG.boarding.kind === "modifier" && !M.EDU_STAGES.boarding);
ok("residency/postdoc/academic are overlays, not rungs",
  ["medicalResidency", "postdoc", "academicResearch"].every(
    (k) => M.EDU_NON_RUNG[k].kind === "overlay" && !M.EDU_STAGES[k]));
ok("adult education is a mode, not a rung",
  M.EDU_NON_RUNG.adultEducation.kind === "mode" && !M.EDU_STAGES.adultEducation);
ok("every non-rung names an owner",
  Object.values(M.EDU_NON_RUNG).every((v) => typeof v.owner === "string" && v.owner.length > 4));
ok("every non-rung kind is a known kind",
  Object.values(M.EDU_NON_RUNG).every((v) => M.EDU_STAGE_KINDS.includes(v.kind)));
ok("variants point at a real rung",
  Object.values(M.EDU_NON_RUNG).filter((v) => v.kind === "variant")
    .every((v) => !!M.EDU_STAGES[v.rung]));

/* The whole vision list must be accounted for somewhere — rung or non-rung.
   This is what stops an item being silently dropped. */
{
  const visionItems = ["nursery", "preschool", "primary", "lowerSec", "upperSec",
    "technicalSecondary", "militarySecondary", "religiousSecondary", "boarding",
    "adultEducation", "prep", "vocational", "community", "university", "gradCert",
    "mba", "masters", "profMasters", "doctorate", "profDoctorate",
    "medicalResidency", "postdoc", "academicResearch"];
  ok("the vision list is 23 items", visionItems.length === 23);
  const missing = visionItems.filter((k) => !M.EDU_STAGES[k] && !M.EDU_NON_RUNG[k]);
  ok("every vision item is accounted for as a rung or a non-rung", missing.length === 0, missing);
}

/* ───────────────────────── 2 · era banding ───────────────────────── */
sec("2 · era banding");

/* A layer whose earliest band starts after the year has nothing to say, and
   says nothing — the UNIVERSAL layer is what guarantees a resolvable result,
   which is why it alone starts at -Infinity. */
ok("a layer with no band that early returns null", M.eduSystemBandAt(M.EDU_SYSTEM_DEV.high, 1850) === null);
ok("the universal layer always has something to say", !!M.eduSystemBandAt(M.EDU_SYSTEM_UNIVERSAL, 1850));
ok("so a pre-table year still resolves fully", (() => {
  const sys = M.eduSystemFor("Germany", 1850);
  return typeof sys.tertiaryAccess === "number" && Array.isArray(sys.stages) && sys.stages.length > 0;
})());
ok("empty band list resolves to null", M.eduSystemBandAt([], 1990) === null);
ok("non-array resolves to null", M.eduSystemBandAt(undefined, 1990) === null);
ok("the LAST matching band wins",
  M.eduSystemBandAt([{ from: 1900, v: 1 }, { from: 1950, v: 2 }, { from: 2000, v: 3 }], 1975).v === 2);
ok("a year on a boundary takes that band",
  M.eduSystemBandAt([{ from: 1900, v: 1 }, { from: 1950, v: 2 }], 1950).v === 2);
ok("a year above every band takes the last",
  M.eduSystemBandAt([{ from: 1900, v: 1 }, { from: 1950, v: 2 }], 2500).v === 2);

/* ───────────────────────── 3 · merge order ───────────────────────── */
sec("3 · merge order (universal → dev → region → country)");

ok("later layers override earlier ones",
  M.eduSystemMerge([{ a: 1, b: 1 }, { b: 2 }, { b: 3 }]).b === 3);
ok("a key only an early layer names survives",
  M.eduSystemMerge([{ a: 1 }, { b: 2 }]).a === 1);
ok("null layers are skipped", M.eduSystemMerge([{ a: 1 }, null, undefined, { b: 2 }]).a === 1);
ok("`from` is band bookkeeping and never resolves",
  M.eduSystemMerge([{ from: 1900, a: 1 }]).from === undefined);
ok("merge always marks itself provisional", M.eduSystemMerge([]).provisional === true);

/* the country layer must actually beat the region/dev layers */
{
  const jp = M.eduSystemFor("Japan", 1975);
  ok("a country-level entryExam wins", jp.entryExam && jp.entryExam.name === "entrance exam", jp.entryExam);
  const de = M.eduSystemFor("Germany", 2015);
  ok("a country-level tracking wins", de.tracking === "hard", de.tracking);
  const br = M.eduSystemFor("Brazil", 2015);
  ok("a country band changes with era", br.entryExam && br.entryExam.name === "ENEM", br.entryExam);
  ok("...and the earlier band is the earlier exam",
    M.eduSystemFor("Brazil", 1985).entryExam.name === "vestibular");
}

/* ───────────────────────── 4 · total coverage ───────────────────────── */
sec("4 · every country × era resolves");

{
  let bad = [];
  for (const c of ALL) {
    for (const y of YEARS) {
      const sys = M.eduSystemFor(c, y);
      if (!sys || typeof sys.tertiaryAccess !== "number" || typeof sys.femaleAccess !== "number"
          || typeof sys.compulsoryTo !== "number" || !Array.isArray(sys.stages)) {
        bad.push([c, y]);
      }
    }
  }
  ok("all 41 countries resolve non-empty across 13 eras", bad.length === 0, bad.slice(0, 4));
  ok("that is a real sweep", ALL.length === 41 && YEARS.length === 13);
}

{
  let bad = [];
  for (const c of ALL) for (const y of YEARS) {
    const s = M.eduSystemFor(c, y);
    if (s.tertiaryAccess < 0 || s.tertiaryAccess > 1) bad.push(["tertiary", c, y, s.tertiaryAccess]);
    if (s.femaleAccess < 0 || s.femaleAccess > 1) bad.push(["female", c, y, s.femaleAccess]);
    if (s.compulsoryTo < 0 || s.compulsoryTo > 22) bad.push(["compulsory", c, y, s.compulsoryTo]);
  }
  ok("every resolved rate is in range", bad.length === 0, bad.slice(0, 4));
}

ok("every resolved system is marked provisional",
  ALL.every((c) => M.eduSystemFor(c, 1990).provisional === true));
ok("tracking is always a known value",
  ALL.every((c) => YEARS.every((y) => ["none", "soft", "hard"].includes(M.eduSystemFor(c, y).tracking))));

/* ───────────────────────── 5 · the ladder ───────────────────────── */
sec("5 · the resolved ladder");

{
  const sys = M.eduSystemFor("United Kingdom", 1995);
  ok("the ladder is non-empty", sys.stages.length >= 10);
  ok("every ladder entry names a real rung", sys.stages.every((r) => !!M.EDU_STAGES[r.id]));
  ok("every ladder entry has an age band",
    sys.stages.every((r) => typeof r.minAge === "number" && typeof r.maxAge === "number" && r.maxAge > r.minAge));
  ok("compulsory follows the resolved compulsoryTo",
    sys.stages.filter((r) => r.compulsory).every((r) => r.minAge < sys.compulsoryTo));
  ok("primary is compulsory in 1995 Britain", sys.stages.find((r) => r.id === "primary").compulsory);
  ok("university is never compulsory", !sys.stages.find((r) => r.id === "university").compulsory);
}
{
  /* the era axis has to move the ladder, or compulsoryTo is decorative */
  const early = M.eduSystemFor("Nigeria", 1930).stages.filter((r) => r.compulsory).length;
  const late = M.eduSystemFor("Nigeria", 2015).stages.filter((r) => r.compulsory).length;
  ok("compulsory schooling expands over time", late > early, [early, late]);
}
ok("exit credentials come from the stage table",
  M.eduSystemFor("France", 2000).stages.find((r) => r.id === "upperSec").exitCredential === "secondaryDiploma");

/* ───────────────── 6 · the measurement that motivated S01 ───────────────── */
sec("6 · tertiary access is gated by country and era");

/* Measured before S01 existed: the live game reaches college at 88% for a
   1935 Nigerian and 50% for a 1935 Briton, because nothing gated it. These
   assertions pin the ORDERING the model must produce, not its values. */
{
  const t = (c, y) => M.eduSystemFor(c, y).tertiaryAccess;
  ok("1935 Nigeria is far below 1995 Sweden", t("Nigeria", 1935) < t("Sweden", 1995) / 10,
    [t("Nigeria", 1935), t("Sweden", 1995)]);
  ok("access rises with era everywhere",
    ALL.every((c) => t(c, 1935) <= t(c, 1975) && t(c, 1975) <= t(c, 2015)));
  ok("a high-tier country beats a low-tier one in the same era",
    t("Sweden", 1975) > t("Nigeria", 1975));
  ok("nobody in 1900 has mass tertiary access", ALL.every((c) => t(c, 1900) < 0.10));
  ok("some 2015 systems do", ALL.some((c) => t(c, 2015) > 0.55));
}

/* femaleAccess must actually bite, and must key off birth ASSIGNMENT rather
   than chromosomes — it models a barrier applied to how a person was read. */
{
  const mk = (sex, country, by) => H.mkChar({ sex, country, birthYear: by, gid: "Cisgender" });
  const f = M.eduTertiaryOdds(mk("Female", "Egypt", 1950));
  const m = M.eduTertiaryOdds(mk("Male", "Egypt", 1950));
  ok("a woman in 1950 Egypt faces worse odds than a man", f < m, [f, m]);
  const f2 = M.eduTertiaryOdds(mk("Female", "Sweden", 2005));
  const m2 = M.eduTertiaryOdds(mk("Male", "Sweden", 2005));
  ok("...and by 2005 Sweden the gap has closed", Math.abs(f2 - m2) < 1e-9, [f2, m2]);
  ok("the historical gap is larger than the modern one", (m - f) > (m2 - f2));
  ok("odds are always a probability",
    ALL.every((c) => { const p = M.eduTertiaryOdds(mk("Female", c, 1970)); return p >= 0 && p <= 1; }));

  /* an intersex character raised female must inherit the same barrier as any
     other girl — the identity work made `assigned` the field that carries it */
  const ix = H.mkChar({ sex: "Intersex", dsd: "cais", assigned: "Female", country: "Egypt", birthYear: 1950 });
  ok("birth assignment carries the barrier, not chromosomes",
    Math.abs(M.eduTertiaryOdds(ix) - f) < 1e-9, [M.eduTertiaryOdds(ix), f]);
}

/* ───────────────────────── 7 · coverage diagnostic ───────────────────────── */
sec("7 · coverage diagnostic is honest");

{
  const cov = M.eduSystemCoverage();
  ok("counts every country", cov.countries === ALL.length);
  ok("country-level count matches the table",
    cov.countryLevel === ALL.filter((c) => !!M.EDU_SYSTEM_COUNTRY[c]).length);
  ok("it does not overstate itself", cov.countryLevel < cov.countries);
  ok("pct is consistent", cov.pct === Math.round((cov.countryLevel / cov.countries) * 100));
  ok("it admits it is provisional", cov.provisional === true && /provisional/i.test(cov.note));
  ok("it breaks down by region", cov.byRegion && Object.keys(cov.byRegion).length >= 8);
  ok("region totals sum to the country count",
    Object.values(cov.byRegion).reduce((a, b) => a + b.total, 0) === cov.countries);
  ok("no region claims more named than it has",
    Object.values(cov.byRegion).every((r) => r.named <= r.total));
}

/* ───────────────────────── 8 · invariants (lint) ───────────────────────── */
sec("8 · S01 invariants");

const SRC = fs.readFileSync(H.SRC, "utf8");
const s01 = SRC.slice(SRC.indexOf("EDU · S01"), SRC.indexOf("function eduTertiaryOdds"));
ok("the S01 block was located", s01.length > 3000, s01.length);

/* invariant 1 — determinism: no RNG anywhere in generative code */
for (const bad of ["Math.random", "Date.now", "new Date"]) {
  ok("invariant 1: no " + bad + " in S01", !s01.includes(bad));
}
ok("invariant 1: no rnd( in S01", !/[^a-zA-Z]rnd\(/.test(s01));
ok("invariant 1: no pick( in S01", !/[^a-zA-Z]pick\(/.test(s01));

/* invariant 2 — country differences are table rows, never conditionals */
ok("invariant 2: no country equality test in S01", !/country\s*===\s*["']/.test(s01));
/* Scoped to EDU deliberately. Legacy code has one cosmetic instance (a GDPR
   aside in a POOL event at ~12119) which predates this work and is presentation
   flavour, not a CE rule. Recorded in EDU-PHASE0-EXIT.md rather than failed on
   here — this suite tests S01, not the file's history. */
/* Baseline is 3 known pre-existing matches, none of them a CE rule and none
   of them EDU's: one inside a comment at ~2066 that literally warns against
   the pattern, and two in a single cosmetic GDPR aside in a POOL event at
   ~12119. Pinned exactly so that adding a FOURTH — the thing invariant 2 is
   actually about — fails this suite. */
ok("invariant 2: EDU adds no new country conditional",
  (SRC.match(/country\s*===\s*["']/g) || []).length === 3,
  (SRC.match(/country\s*===\s*["']/g) || []).length);

/* determinism, demonstrated rather than asserted about */
{
  let stable = true;
  for (const c of ALL) {
    const a = JSON.stringify(M.eduSystemFor(c, 1985));
    for (let i = 0; i < 3; i++) if (JSON.stringify(M.eduSystemFor(c, 1985)) !== a) stable = false;
  }
  ok("the resolver is deterministic across repeat calls", stable);
}
{
  /* and it must not mutate its own tables — a merge that wrote through would
     corrupt every later lookup in the process */
  const before = JSON.stringify(M.EDU_SYSTEM_DEV.high);
  M.eduSystemFor("Germany", 1990); M.eduSystemFor("Kenya", 2020);
  ok("resolving does not mutate the source tables", JSON.stringify(M.EDU_SYSTEM_DEV.high) === before);
}

/* S01 is additive: it must not have touched legacy education state */
{
  const c = H.mkChar({ country: "Brazil", birthYear: 1990 });
  ok("legacy education state is untouched", c.education && c.education.stage === "pre");
  ok("S01 adds no state slice", c.edu === undefined);
  ok("eduSystem() works off a real character", !!M.eduSystem(c).tertiaryAccess);
}

/* ───────────────── 9 · the dead POOL entry stays dead ───────────────── */
sec("9 · collegeGrad removal");

ok("the unreachable collegeGrad POOL entry is gone",
  !M.POOL.some((e) => e.id === "collegeGrad"));
ok("graduation still has exactly one delivery path (the scheduled one)",
  SRC.split("gainDegree(s)").length - 1 >= 1 && !/id:\s*"collegeGrad"/.test(SRC));

{
  /* prove graduation still happens, so the deletion removed dead code and not
     the mechanism — this is the assertion that would have caught a bad delete */
  H.seed(31);
  const c = H.mkChar({ country: "United States", cls: "Wealthy", birthYear: 1990, stSmarts: 90 });
  c.ageDays = Math.round(21 * 365.25);
  /* backdate the start so the schedule is already due: advance() stops the
     moment any event sets s.pending, so a 1500-day call proves nothing */
  c.education.college = { major: "History", tier: "state", startDay: c.ageDays - 1500, gpa: 3.4 };
  c.education.stage = "college";
  const after = M.advance(c, 7);
  ok("a started degree still completes on schedule",
    after.education.degree === "History" && after.education.college === null,
    [after.education.degree, after.education.stage]);
}

console.log("\n" + (fail === 0 ? "ALL PASS" : "FAILURES") + ": " + pass + " passed, " + fail + " failed");
process.exit(fail === 0 ? 0 : 1);
