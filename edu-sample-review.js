/* edu-sample-review.js — 100 generated institutions, rendered as prose.
 *
 * THIS IS NOT A TEST. It asserts nothing and it cannot fail. It exists because
 * a generator can be green on every assertion in test-edu-s02.js and still
 * produce a 1890 Nigerian village primary school with a robotics lab. There is
 * no test for "this is absurd." Somebody reads it.
 *
 * This is the gate HRE's roadmap credits with catching its amenity-prerequisite
 * bug, and the EDU roadmap requires it for Phase 2 for the same reason. It
 * already earned its place here once: the first run showed a "research
 * university" with 2,800 students next to entirely plausible village schools,
 * because enrolment used one global curve for every archetype. Every assertion
 * passed at the time.
 *
 * Run: node edu-sample-review.js [count] [seed]
 *      node edu-sample-review.js 40 7 > /tmp/sample.txt
 */
"use strict";

const path = require("path");
const H = require(path.join(__dirname, "harness.js"));
const M = H.M;

const COUNT = Number(process.argv[2] || 100);
const SEEDN = Number(process.argv[3] || 1);

/* Deliberately spread across the hard cases: poor and rich, early and late.
   A sample drawn only from 2010 Sweden would look fine and prove nothing. */
const CELLS = [
  ["Nigeria", 1890], ["Nigeria", 1935], ["Nigeria", 1975], ["Nigeria", 2015],
  ["India", 1910], ["India", 1960], ["India", 2010],
  ["Brazil", 1930], ["Brazil", 1975], ["Brazil", 2015],
  ["United Kingdom", 1890], ["United Kingdom", 1935], ["United Kingdom", 1975], ["United Kingdom", 2015],
  ["Sweden", 1920], ["Sweden", 1970], ["Sweden", 2015],
  ["Japan", 1930], ["Japan", 1980], ["Japan", 2015],
  ["Kenya", 1950], ["Kenya", 2010], ["United States", 1900], ["United States", 2015],
  ["Egypt", 1940], ["Egypt", 2010], ["Russia", 1950], ["China", 1960], ["China", 2015],
];

const band = (v) => v >= 85 ? "exceptional" : v >= 70 ? "strong" : v >= 55 ? "good"
  : v >= 40 ? "adequate" : v >= 25 ? "poor" : "dire";
const money = (v) => v >= 85 ? "ruinously expensive" : v >= 65 ? "expensive"
  : v >= 45 ? "costly" : v >= 25 ? "affordable" : v >= 8 ? "nominal" : "free";

function describe(bp) {
  const a = [];
  a.push(`${bp.label} · ${bp.country} ${bp.refYear} · ${bp.hoodClass} district`);
  a.push(`  founded ${bp.founded} (${bp.refYear - bp.founded} years old), ${bp.administration}-run`
    + `${bp.boarding ? ", boarding" : ""}${bp.singleSex ? ", single-sex" : ""}`);
  a.push(`  ${bp.enrolment} students, classes of ~${bp.classSize}`);
  a.push(`  teaching ${band(bp.quality)} (${bp.quality}) · facilities ${band(bp.facilities)} (${bp.facilities})`
    + ` · funding ${band(bp.funding)} (${bp.funding})`);
  a.push(`  selectivity ${bp.selectivity} · reputation ${bp.reputation}`
    + ` · religiosity ${bp.religiosity} · strictness ${bp.strictness}`
    + ` · extracurricular ${bp.extracurricular}`);
  a.push(`  fees ${money(bp.tuitionBand)} (band ${bp.tuitionBand}) · serves ${bp.stages.join(", ")}`);
  if (bp._diag.retries) a.push(`  ⚠ regenerated ${bp._diag.retries}×${bp._diag.fellBack ? " AND STILL INVALID: " + bp._diag.errors.join(",") : ""}`);
  return a.join("\n");
}

console.log("EDU S02 — sample review of " + COUNT + " generated institutions (seed " + SEEDN + ")");
console.log("Nothing here is asserted. Read it and look for the absurd.\n");

const seed = M.hreSeedFrom("edu:sample:" + SEEDN);
let shown = 0, retried = 0, fellBack = 0, empty = 0;
const perArch = {};

for (let i = 0; shown < COUNT && i < COUNT * 40; i++) {
  const [country, year] = CELLS[i % CELLS.length];
  const cands = M.eduArchetypesFor(country, year);
  if (!cands.length) { empty++; continue; }
  const arch = cands[i % cands.length];
  const hood = i % 5;
  const id = M.eduIdMake(country, i % 3, hood, arch.id, i % 7);
  const bp = M.eduBlueprint(seed, id, year);
  if (!bp) { empty++; continue; }
  if (bp._diag.retries) retried++;
  if (bp._diag.fellBack) fellBack++;
  perArch[arch.id] = (perArch[arch.id] || 0) + 1;
  console.log(describe(bp) + "\n");
  shown++;
}

console.log("─".repeat(64));
console.log(`shown ${shown} · unavailable-in-era (correctly refused) ${empty}`);
console.log(`regenerated at least once: ${retried} (${Math.round(retried / Math.max(1, shown) * 100)}%)`);
console.log(`shipped still-invalid: ${fellBack}` + (fellBack ? "   <-- CONTENT PROBLEM, not a runtime one" : ""));
console.log("archetype spread:", JSON.stringify(perArch));
console.log("\nThings worth staring at:");
console.log("  · facilities/quality that outrun the country and era");
console.log("  · enrolment that does not match the kind of institution");
console.log("  · a religiosity or strictness that contradicts the administration");
console.log("  · anything founded suspiciously close to its archetype's era floor");
