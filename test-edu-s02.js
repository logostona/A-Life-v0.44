/* test-edu-s02.js — EDU S02: institution generator
 *
 * The generator is pure and deterministic, so most of this is exact. The
 * plausibility assertions are deliberately ORDERINGS and ENVELOPES rather than
 * values — the archetype biases are provisional and will move when module 22
 * sources them, and an assertion pinning `quality === 74` would have to be
 * rewritten by the very patch that makes it correct.
 *
 * Section 10 pins the three absurdities the sample review caught. All three
 * were green on every assertion in this file at the time they were found,
 * which is the entire argument for edu-sample-review.js existing.
 *
 * Run: node --max-old-space-size=4096 test-edu-s02.js
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

const SEED = M.hreSeedFrom("test:s02");
const SEED2 = M.hreSeedFrom("test:s02:other");
const ALL = Object.keys(M.COUNTRIES);
const NUM = ["quality", "facilities", "selectivity", "religiosity", "strictness",
             "extracurricular", "reputation", "tuitionBand", "funding", "size"];

/* ───────────────────────── 1 · ids ───────────────────────── */
sec("1 · identifiers");

{
  const id = M.eduIdMake("Brazil", 2, 3, "faithSecondary", 7);
  const p = M.eduIdParse(id);
  ok("make → parse round-trips", p && p.country === "Brazil" && p.city === 2 &&
    p.hood === 3 && p.archetype === "faithSecondary" && p.index === 7, p);
  ok("hood resolves to a class name", p.hoodClass === M.EDU_HOOD_CLASSES[3]);
  ok("ids are strings with six parts", id.split(":").length === 6);
  ok("eduIdValid agrees", M.eduIdValid(id));
}

/* The archetype travels as a string precisely so reordering the table cannot
   silently repoint a saved institution at a different kind of school. */
ok("the archetype is carried by name, not index",
  M.eduIdMake("Brazil", 0, 0, "seminary", 0).indexOf("seminary") !== -1);

for (const bad of ["", "nonsense", "1:Brazil:0:0:seminary", "1:Brazil:0:0:seminary:0:extra",
                   "9:Brazil:0:0:seminary:0", "1::0:0:seminary:0", "1:Brazil:x:0:seminary:0",
                   "1:Brazil:0:99:seminary:0", "1:Brazil:0:0:noSuchArchetype:0"]) {
  ok("rejects malformed id: " + JSON.stringify(bad), M.eduIdParse(bad) === null);
}
ok("rejects a non-string id", M.eduIdParse(undefined) === null && M.eduIdParse(42) === null);

/* ───────────────────────── 2 · archetype availability ───────────────────────── */
sec("2 · availability windows are hard constraints");

ok("every archetype declares an era window",
  M.EDU_ARCHETYPES.every((a) => Array.isArray(a.era) && a.era.length === 2 && a.era[0] < a.era[1]));
ok("every archetype serves at least one real rung",
  M.EDU_ARCHETYPES.every((a) => a.stages.length > 0 && a.stages.every((s) => !!M.EDU_STAGES[s])));
ok("every archetype has an enrolment envelope",
  M.EDU_ARCHETYPES.every((a) => Array.isArray(M.EDU_ENROL_ENVELOPE[a.id])));
ok("every archetype has an admin table",
  M.EDU_ARCHETYPES.every((a) => a.admin && Object.keys(a.admin).length > 0));
ok("every archetype has a hoodClass table covering the classes",
  M.EDU_ARCHETYPES.every((a) => M.EDU_HOOD_CLASSES.some((c) => (a.hoodClass[c] || 0) > 0)));
ok("every bias field is present and in range",
  M.EDU_ARCHETYPES.every((a) => ["quality", "selectivity", "religiosity", "strictness", "funding",
    "size", "facilities", "extracurricular", "tuition"].every((k) =>
      typeof a.bias[k] === "number" && a.bias[k] >= 0 && a.bias[k] <= 100)));

{
  let leaked = 0;
  for (const a of M.EDU_ARCHETYPES) {
    for (const c of ALL) {
      if (M.eduArchetypeAvailable(a, c, a.era[0] - 1)) leaked++;
      if (M.eduArchetypeAvailable(a, c, a.era[1] + 1)) leaked++;
    }
  }
  ok("no archetype is available outside its era window", leaked === 0, leaked);
}
ok("comprehensive schools do not exist before mass secondary",
  !M.eduArchetypesFor("United Kingdom", 1930).some((a) => a.id === "comprehensiveSecondary"));
ok("...but do after", M.eduArchetypesFor("United Kingdom", 1990).some((a) => a.id === "comprehensiveSecondary"));
ok("dev-restricted archetypes stay out of the wrong tier",
  !M.eduArchetypesFor("Nigeria", 2015).some((a) => a.id === "eliteResearchUniversity"));
ok("region-restricted archetypes stay out of the wrong region",
  !M.eduArchetypesFor("Nigeria", 2015).some((a) => a.id === "communityCollege"));
ok("stage filtering works",
  M.eduArchetypesFor("United Kingdom", 2000, "primary").every((a) => a.stages.indexOf("primary") !== -1));

{
  /* every country × era must be able to school a child, or the generator has
     a hole a character could fall into */
  let holes = [];
  for (const c of ALL) for (const y of [1900, 1935, 1970, 2000, 2020]) {
    if (!M.eduArchetypesFor(c, y, "primary").length) holes.push([c, y]);
  }
  ok("primary education is generable everywhere, in every era", holes.length === 0, holes.slice(0, 5));
}
{
  let none = 0;
  for (const c of ALL) if (!M.eduArchetypesFor(c, 2015, "university").length) none++;
  ok("universities are generable in every country by 2015", none === 0, none);
}
ok("candidates are weighted [arch, w] pairs",
  M.eduArchetypeCandidates("Brazil", 1990, "upperSec", "working")
    .every((p) => Array.isArray(p) && p.length === 2 && p[1] > 0));

/* ───────────────────────── 3 · determinism ───────────────────────── */
sec("3 · same id in, same institution out");

{
  const id = M.eduIdMake("Japan", 1, 2, "grammarSelective", 4);
  const a = M.eduBlueprint(SEED, id, 1975);
  let stable = true;
  for (let i = 0; i < 8; i++) {
    const b = M.eduBlueprint(SEED, id, 1975);
    if (JSON.stringify(M.eduCrystallise(a)) !== JSON.stringify(M.eduCrystallise(b))) stable = false;
  }
  ok("regenerating the same id gives the same institution", stable);
  ok("a different world seed gives a different institution",
    JSON.stringify(M.eduCrystallise(M.eduBlueprint(SEED2, id, 1975))) !== JSON.stringify(M.eduCrystallise(a)));
  ok("a different index gives a different institution",
    JSON.stringify(M.eduCrystallise(M.eduBlueprint(SEED, M.eduIdMake("Japan", 1, 2, "grammarSelective", 5), 1975)))
      !== JSON.stringify(M.eduCrystallise(a)));
}
{
  /* determinism has to hold broadly, not just for one lucky id */
  let unstable = 0, n = 0;
  for (const c of ["Brazil", "Kenya", "Sweden", "India", "United States"]) {
    for (const a of M.eduArchetypesFor(c, 1995)) {
      const id = M.eduIdMake(c, 0, 2, a.id, 1);
      const x = JSON.stringify(M.eduCrystallise(M.eduBlueprint(SEED, id, 1995)));
      const y = JSON.stringify(M.eduCrystallise(M.eduBlueprint(SEED, id, 1995)));
      if (x !== y) unstable++;
      n++;
    }
  }
  ok("deterministic across a broad sweep", unstable === 0, unstable);
  ok("that sweep was real", n > 30, n);
}

/* Namespaced sub-streams (arch §3): each attribute draws from its own stream,
   so adding a fourteenth attribute must not shift the thirteen already there.
   Demonstrated at the primitive rather than asserted about. */
{
  const id = M.eduIdMake("France", 0, 3, "regionalUniversity", 2);
  const q1 = M.hreRng(SEED, id, "edu:inst:faculty").int(0, 1e6);
  M.hreRng(SEED, id, "edu:inst:aBrandNewAttribute").int(0, 1e6);   // a future stage
  const q2 = M.hreRng(SEED, id, "edu:inst:faculty").int(0, 1e6);
  ok("a new sub-stream does not disturb an existing one", q1 === q2, [q1, q2]);
  ok("different namespaces genuinely differ",
    M.hreRng(SEED, id, "edu:inst:faculty").int(0, 1e6) !== M.hreRng(SEED, id, "edu:inst:funding").int(0, 1e6));
}

/* ───────────────────────── 4 · blueprint integrity ───────────────────────── */
sec("4 · blueprint integrity");

{
  let bad = [], n = 0, retried = 0, fell = 0;
  for (const c of ALL) {
    for (const y of [1900, 1935, 1975, 2005, 2020]) {
      for (const a of M.eduArchetypesFor(c, y)) {
        const id = M.eduIdMake(c, 0, (n % 5), a.id, n % 4);
        const bp = M.eduBlueprint(SEED, id, y);
        n++;
        if (!bp) { bad.push(["null", c, y, a.id]); continue; }
        const errs = M.eduValidateBlueprint(bp, y);
        if (errs.length) bad.push([c, y, a.id, errs]);
        if (bp._diag.retries) retried++;
        if (bp._diag.fellBack) fell++;
        for (const k of NUM) {
          if (!(typeof bp[k] === "number" && bp[k] >= 0 && bp[k] <= 100)) bad.push(["range", c, y, a.id, k, bp[k]]);
        }
        if (!(bp.enrolment > 0) || !(bp.classSize > 0)) bad.push(["empty", c, y, a.id]);
        if (bp.founded > y) bad.push(["future", c, y, a.id, bp.founded]);
      }
    }
  }
  ok("every generated institution validates", bad.length === 0, bad.slice(0, 3));
  ok("that was a real sweep", n > 900, n);
  ok("nothing ships still-invalid", fell === 0, fell);
  /* A generator that corrects often has a CONTENT problem, not a runtime one
     (HRE §4.8). This is the number that would say so. */
  ok("the retry rate is low", retried / n < 0.10, retried / n);
}

ok("an unavailable archetype yields no blueprint",
  M.eduBlueprint(SEED, M.eduIdMake("United Kingdom", 0, 0, "comprehensiveSecondary", 0), 1900) === null);
ok("a malformed id yields no blueprint", M.eduBlueprint(SEED, "garbage", 2000) === null);
ok("eduInstitution is the same call", (() => {
  const id = M.eduIdMake("Spain", 0, 1, "faithSecondary", 0);
  return JSON.stringify(M.eduCrystallise(M.eduInstitution(SEED, id, 1980)))
    === JSON.stringify(M.eduCrystallise(M.eduBlueprint(SEED, id, 1980)));
})());

/* the validator must actually reject things, or it is decoration */
{
  const id = M.eduIdMake("Italy", 0, 2, "urbanPrimary", 0);
  const good = M.eduBlueprint(SEED, id, 1990);
  ok("a good blueprint has no errors", M.eduValidateBlueprint(good, 1990).length === 0);
  const f1 = Object.assign({}, good, { founded: 2050 });
  ok("catches founding after the reference year",
    M.eduValidateBlueprint(f1, 1990).indexOf("foundedAfterReference") !== -1);
  const f2 = Object.assign({}, good, { quality: 140 });
  ok("catches an out-of-range attribute",
    M.eduValidateBlueprint(f2, 1990).indexOf("outOfBounds:quality") !== -1);
  const f3 = Object.assign({}, good, { enrolment: 0 });
  ok("catches an empty institution", M.eduValidateBlueprint(f3, 1990).indexOf("emptyInstitution") !== -1);
  const f4 = Object.assign({}, good, { stages: ["notARung"] });
  ok("catches an unknown stage", M.eduValidateBlueprint(f4, 1990).indexOf("unknownStage") !== -1);
  const f5 = Object.assign({}, good, { archetype: "nope" });
  ok("catches an unknown archetype", M.eduValidateBlueprint(f5, 1990).indexOf("unknownArchetype") !== -1);
}

/* ───────────────────────── 5 · plausibility by tier and era ───────────────────────── */
sec("5 · attributes track development and era");

const meanOf = (country, year, key, stage) => {
  const as = M.eduArchetypesFor(country, year, stage);
  if (!as.length) return null;
  let sum = 0, n = 0;
  for (const a of as) for (let i = 0; i < 6; i++) {
    const bp = M.eduBlueprint(SEED, M.eduIdMake(country, 0, i % 5, a.id, i), year);
    if (bp) { sum += bp[key]; n++; }
  }
  return n ? sum / n : null;
};

{
  const hi = meanOf("Sweden", 2010, "facilities", "primary");
  const lo = meanOf("Nigeria", 2010, "facilities", "primary");
  ok("a high-tier country out-resources a low-tier one", hi > lo, [hi, lo]);
  const early = meanOf("United Kingdom", 1900, "facilities", "primary");
  const late = meanOf("United Kingdom", 2010, "facilities", "primary");
  ok("facilities improve across the century", late > early, [early, late]);
  const q1 = meanOf("Kenya", 1950, "quality", "primary");
  const q2 = meanOf("Sweden", 1950, "quality", "primary");
  ok("teaching quality tracks development in the same era", q2 > q1, [q1, q2]);
}
ok("development scaling is monotonic in era",
  M.eduDevScale("Brazil", 1900) < M.eduDevScale("Brazil", 1960) &&
  M.eduDevScale("Brazil", 1960) < M.eduDevScale("Brazil", 2015));
ok("development scaling is ordered by tier",
  M.eduDevScale("Sweden", 2000) > M.eduDevScale("Brazil", 2000) &&
  M.eduDevScale("Brazil", 2000) > M.eduDevScale("Nigeria", 2000));

{
  /* archetype character must survive the pipeline — if a seminary and a
     business school come out alike, the biases are not doing anything */
  const rel = (arch) => {
    let s = 0, n = 0;
    for (let i = 0; i < 8; i++) {
      const bp = M.eduBlueprint(SEED, M.eduIdMake("United States", 0, 3, arch, i), 1990);
      if (bp) { s += bp.religiosity; n++; }
    }
    return n ? s / n : null;
  };
  ok("a seminary is more religious than a business school", rel("seminary") > rel("businessSchool") + 30,
    [rel("seminary"), rel("businessSchool")]);
  const strict = (arch) => {
    let s = 0, n = 0;
    for (let i = 0; i < 8; i++) {
      const bp = M.eduBlueprint(SEED, M.eduIdMake("United States", 0, 3, arch, i), 1990);
      if (bp) { s += bp.strictness; n++; }
    }
    return n ? s / n : null;
  };
  ok("a military academy is stricter than a night school", strict("militaryAcademy") > strict("nightSchool") + 25,
    [strict("militaryAcademy"), strict("nightSchool")]);
}
{
  /* public education must not be priced like private education */
  let pub = [], priv = [];
  for (const a of M.eduArchetypesFor("United States", 2000)) {
    for (let i = 0; i < 5; i++) {
      const bp = M.eduBlueprint(SEED, M.eduIdMake("United States", 0, 2, a.id, i), 2000);
      if (!bp) continue;
      (bp.administration === "public" ? pub : priv).push(bp.tuitionBand);
    }
  }
  const avg = (x) => x.reduce((a, b) => a + b, 0) / Math.max(1, x.length);
  ok("public institutions are cheaper than private ones", avg(pub) < avg(priv), [avg(pub), avg(priv)]);
  ok("both samples are non-trivial", pub.length > 5 && priv.length > 5, [pub.length, priv.length]);
}

/* ───────────────────────── 6 · crystallisation ───────────────────────── */
sec("6 · crystallisation and budget");

{
  const bp = M.eduBlueprint(SEED, M.eduIdMake("Germany", 0, 3, "eliteResearchUniversity", 1), 2005);
  const cr = M.eduCrystallise(bp);
  ok("crystallise drops the archetype pointer", cr.arch === undefined);
  ok("crystallise drops the runtime diagnostic", cr._diag === undefined);
  ok("crystallise keeps the id and gen version", cr.id === bp.id && cr.genV === bp.genV);
  ok("crystallise keeps what other modules read",
    ["quality", "selectivity", "religiosity", "strictness", "administration"].every((k) => cr[k] !== undefined));
  ok("crystallise contains no arrays (no population, ever)",
    Object.values(cr).every((v) => !Array.isArray(v)));
  ok("crystallise of null is null", M.eduCrystallise(null) === null);

  let worst = 0;
  for (const c of ALL) for (const a of M.eduArchetypesFor(c, 2010)) {
    const b = M.eduBlueprint(SEED, M.eduIdMake(c, 0, 4, a.id, 2), 2010);
    if (b) worst = Math.max(worst, Buffer.byteLength(JSON.stringify(M.eduCrystallise(b)), "utf8"));
  }
  /* s.edu's whole budget is 2.5 KB and holds one current institution plus the
     record and credential ledgers — a single institution must stay well under */
  ok("the largest crystallised institution is under 900 bytes", worst < 900, worst);
}

/* ───────────────────────── 7 · the handover contract ───────────────────────── */
sec("7 · attributes are inputs to other modules");

{
  const bp = M.eduBlueprint(SEED, M.eduIdMake("Ireland", 0, 2, "faithSecondary", 0), 1985);
  const opts = M.eduInstitutionOpts(M.eduCrystallise(bp));
  ok("opts carry what module 06 needs to make people",
    typeof opts.facultyQuality === "number" && typeof opts.size === "number" && typeof opts.classSize === "number");
  ok("opts carry what module 11 needs for schoolLegal",
    typeof opts.religiosity === "number" && typeof opts.strictness === "number" &&
    typeof opts.administration === "string");
  ok("opts of null is null", M.eduInstitutionOpts(null) === null);
  ok("S02 generates no people itself",
    Object.keys(bp).every((k) => !/classmate|faculty|student|teacher|pupil/i.test(k)));
}

/* ───────────────────────── 8 · additivity ───────────────────────── */
sec("8 · S02 is additive");

{
  const c = H.mkChar({ country: "Brazil", birthYear: 1990 });
  /* s.edu now exists — S09 (P3) introduced it. S02 is still generator-only:
     nothing attends anything, so no institution has been crystallised into it. */
  ok("S02 crystallises nothing into state",
    c.edu && c.edu.inst === null && c.edu.record.length === 0);
  ok("legacy school state is untouched", c.school === null || c.school === undefined);
  ok("legacy education state is untouched", c.education.stage === "pre");
}

/* ───────────────────────── 9 · invariants (lint) ───────────────────────── */
sec("9 · S02 invariants");

const SRC = fs.readFileSync(H.SRC, "utf8");
/* Comments are stripped first: this block's own header says "no Math.random
   anywhere below", and a lint that reads prose flags the sentence forbidding
   the thing as an instance of the thing. */
const stripComments = (x) => x.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
/* Slice from the "/*" that OPENS the S02 header, not from the banner text
   inside it — starting mid-comment leaves an unterminated block the stripper
   cannot match, which is how the header's own "No Math.random" sentence
   survived stripping and failed the lint it describes. */
const s02mark = SRC.indexOf("EDU · S02");
const s02raw = SRC.slice(SRC.lastIndexOf("/*", s02mark), SRC.indexOf("function eduInstitutionOpts"));
const s02 = stripComments(s02raw);
ok("the S02 block was located", s02raw.length > 6000, s02raw.length);
ok("stripping comments left real code behind", s02.includes("eduBlueprint") && s02.length > 2500, s02.length);

for (const bad of ["Math.random", "Date.now", "new Date"]) {
  ok("invariant 1: no " + bad + " in S02", !s02.includes(bad));
}
ok("invariant 1: no bare rnd( in S02", !/[^a-zA-Z]rnd\(/.test(s02));
ok("invariant 1: no bare pick( in S02", !/[^a-zA-Z.]pick\(/.test(s02));
ok("invariant 2: no country conditional in S02", !/country\s*===\s*["']/.test(s02));
ok("S02 reuses HRE's RNG rather than writing a second one",
  s02.includes("hreRngRetry") && !s02.includes("function eduHash") && !s02.includes("function eduMulberry"));
ok("tuition is a band, never a currency amount",
  !/curSym/.test(s02) && s02.includes("tuitionBand"));

/* ───────────────── 10 · absurdities the sample review caught ───────────────── */
sec("10 · sample-review regressions (all were green here when found)");

{
  /* (a) a 0-year-old university with 20,000 students. Founding skewed young,
         and enrolment ignored age entirely. */
  let newborns = 0, bigNewborns = 0;
  for (const c of ["United Kingdom", "United States", "Sweden", "Japan"]) {
    for (const y of [1935, 1975, 2015]) {
      for (const a of M.eduArchetypesFor(c, y, "university")) {
        for (let i = 0; i < 6; i++) {
          const bp = M.eduBlueprint(SEED, M.eduIdMake(c, 0, i % 5, a.id, i), y);
          if (!bp) continue;
          const age = y - bp.founded;
          if (age < 1) newborns++;
          if (age < 5 && bp.enrolment > 6000) bigNewborns++;
        }
      }
    }
  }
  ok("no university is founded in its own reference year", newborns === 0, newborns);
  ok("a brand-new institution is not already enormous", bigNewborns === 0, bigNewborns);

  /* (b) a 17,050-student single-sex university. */
  let bigSingleSex = 0, n = 0;
  for (const c of ALL) for (const a of M.eduArchetypesFor(c, 1935)) {
    for (let i = 0; i < 4; i++) {
      const bp = M.eduBlueprint(SEED, M.eduIdMake(c, 0, i % 5, a.id, i), 1935);
      if (!bp) continue;
      n++;
      if (bp.singleSex && bp.enrolment > 8000) bigSingleSex++;
    }
  }
  ok("no enormous institution is single-sex", bigSingleSex === 0, bigSingleSex);
  ok("that check saw a real sample", n > 100, n);

  /* (c) a Kenyan regional university founded in 1853. An archetype's era window
         is global and says nothing about whether it existed HERE. */
  ok("no tertiary institution in Kenya before the founding floor",
    !M.eduArchetypesFor("Kenya", 1900).some(M.eduArchIsTertiary));
  ok("...nor in Nigeria in 1890", !M.eduArchetypesFor("Nigeria", 1890).some(M.eduArchIsTertiary));
  ok("...but Britain in 1853 is fine", M.eduArchetypesFor("United Kingdom", 1853).some(M.eduArchIsTertiary));
  ok("the floor is higher for low-tier countries",
    M.eduFoundingFloor(M.EDU_ARCHETYPE_BY_ID.regionalUniversity, "Kenya") >
    M.eduFoundingFloor(M.EDU_ARCHETYPE_BY_ID.regionalUniversity, "Sweden"));
  {
    let early = 0, n2 = 0;
    for (const c of ALL) for (const a of M.eduArchetypesFor(c, 2010)) {
      const bp = M.eduBlueprint(SEED, M.eduIdMake(c, 0, 2, a.id, 0), 2010);
      if (!bp) continue;
      n2++;
      if (bp.founded < M.eduFoundingFloor(a, c)) early++;
    }
    ok("nothing is founded before it could have been founded here", early === 0, early);
    ok("that check saw a real sample", n2 > 200, n2);
  }
}

console.log("\n" + (fail === 0 ? "ALL PASS" : "FAILURES") + ": " + pass + " passed, " + fail + " failed");
process.exit(fail === 0 ? 0 : 1);
