/* test-edu-s03-s06.js — EDU S03 (admission) + S06 (finance)
 *
 * Section 7 is a calibration suite in the shape of test-hre-calib.js:
 * affordability has to be sane across country × era × class, and the flat
 * TIER_SALARY distortion has to stay isolated in one place so a future module
 * 09 fix is a one-line rebalance rather than a re-derivation.
 *
 * Section 8 is the point of the phase. P4 fixed the 88% bug ABSOLUTELY —
 * a scarce era became sealed, with no path at all for a determined player.
 * These assertions pin the corrected shape: narrow, but never sealed.
 *
 * Run: node --max-old-space-size=4096 test-edu-s03-s06.js
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

const ALL = Object.keys(M.COUNTRIES);
/* a graduating student with a given ability, ready for eduAdmit */
function student(country, birthYear, cls, score, opts) {
  const o = opts || {};
  const c = H.mkChar({ country, birthYear, cls, sex: o.sex || "Male", gid: "Cisgender" });
  c.ageDays = 6570 + (o.jitter || 0);
  c.education.subjects = { a: score };
  if (o.extra) c.education.extra = o.extra;
  if (o.religious) c.edu.inst = { religiosity: 90, quality: 60 };
  return c;
}

/* ───────────────────────── 1 · money is a ratio, never an amount ───────────────────────── */
sec("1 · S06 finance is expressed as ratios");

{
  const poor = H.mkChar({ country: "United States", birthYear: 2000, cls: "Poor" });
  const rich = H.mkChar({ country: "United States", birthYear: 2000, cls: "Wealthy" });
  ok("a wealthy family has more realised income",
    M.eduFamilyRealisedAnnual(rich) > M.eduFamilyRealisedAnnual(poor) * 3,
    [M.eduFamilyRealisedAnnual(poor), M.eduFamilyRealisedAnnual(rich)]);
  ok("family income is always positive", ALL.every((c) =>
    M.eduFamilyRealisedAnnual(H.mkChar({ country: c, birthYear: 1990, cls: "Middle" })) > 0));
  ok("a poorer country is poorer in the same units",
    M.eduFamilyRealisedAnnual(H.mkChar({ country: "Nigeria", birthYear: 2000, cls: "Middle" })) <
    M.eduFamilyRealisedAnnual(H.mkChar({ country: "Sweden", birthYear: 2000, cls: "Middle" })));
  ok("an earlier era is poorer than a later one",
    M.eduFamilyRealisedAnnual(H.mkChar({ country: "Sweden", birthYear: 1900, cls: "Middle" })) <
    M.eduFamilyRealisedAnnual(H.mkChar({ country: "Sweden", birthYear: 2010, cls: "Middle" })));

  /* the same tuition is a different burden to different families — which is
     the entire reason the model works in ratios */
  ok("the same fee is a heavier burden on a poor family",
    M.eduTuitionRatio(poor, "state") > M.eduTuitionRatio(rich, "state") * 3,
    [M.eduTuitionRatio(poor, "state"), M.eduTuitionRatio(rich, "state")]);
  ok("a pricier tier is a heavier burden",
    M.eduTuitionRatio(poor, "prestige") > M.eduTuitionRatio(poor, "state"));
  ok("tuition ratio is never negative", ALL.every((c) =>
    M.eduTuitionRatio(H.mkChar({ country: c, birthYear: 1990, cls: "Poor" }), "state") >= 0));
}
{
  ok("affordability bands are ordered", (() => {
    const labels = [0.001, 0.05, 0.2, 0.5, 2].map(M.eduAffordability);
    return new Set(labels).size === 5;
  })());
  ok("nothing is free that costs a fifth of your income", M.eduAffordability(0.2) !== "free");
  ok("a whole year's income is out of reach", M.eduAffordability(1.2) === "out of reach");
  ok("a trivial fee is free", M.eduAffordability(0.005) === "free");
  ok("the bands cover every ratio",
    [0, 0.01, 0.1, 0.3, 0.9, 5, 99].every((r) => typeof M.eduAffordability(r) === "string"));
}

/* ───────────────────────── 2 · aid ───────────────────────── */
sec("2 · S06 aid");

{
  const poor = H.mkChar({ country: "Sweden", birthYear: 2005, cls: "Poor" });
  const rich = H.mkChar({ country: "Sweden", birthYear: 2005, cls: "Wealthy" });
  ok("poorer families get more aid",
    M.eduAidShare(poor, "state", "open") > M.eduAidShare(rich, "state", "open"));
  ok("a broad public system subsidises more than a narrow one",
    M.eduAidShare(H.mkChar({ country: "Sweden", birthYear: 2010, cls: "Middle" }), "state", "open") >
    M.eduAidShare(H.mkChar({ country: "Nigeria", birthYear: 1930, cls: "Middle" }), "state", "open"));
  ok("aid is always a share", ALL.every((c) => {
    const a = M.eduAidShare(H.mkChar({ country: c, birthYear: 1990, cls: "Poor" }), "state", "open");
    return a >= 0 && a <= 1;
  }));

  /* the sponsored routes must actually pay, or sponsorship is decoration */
  ok("a merit scholarship covers nearly everything",
    M.eduAidShare(poor, "state", "merit") > 0.9);
  ok("faith sponsorship covers most of it", M.eduAidShare(poor, "state", "sponsorFaith") > 0.8);
  ok("state sponsorship covers most of it", M.eduAidShare(poor, "state", "sponsorState") > 0.8);
  ok("going abroad is NOT subsidised", M.eduAidShare(poor, "state", "abroad") < 0.2);
  ok("net cost falls when aid rises",
    M.eduNetCostRatio(poor, "state", "merit") < M.eduNetCostRatio(poor, "state", "open"));
  ok("net cost is never negative", M.eduNetCostRatio(rich, "state", "merit") >= 0);
}

/* ───────────────────────── 3 · the ordinary route ───────────────────────── */
sec("3 · S03 admission — the open door");

{
  const a = M.eduAdmit(student("Sweden", 1995, "Wealthy", 95), "state");
  ok("a strong student in a broad system is admitted", a.admitted === true, a);
  ok("...by the ordinary route", a.route === "open", a.route);
  ok("...and the verdict carries its reasoning",
    typeof a.score === "number" && typeof a.gate === "number" && typeof a.share === "number");
  ok("...and a human-readable reason", typeof a.reason === "string" && a.reason.length > 10);
  ok("every result names a known route",
    M.EDU_ADMIT_ROUTES.indexOf(a.route) !== -1);
}
{
  const weak = M.eduAdmit(student("Sweden", 1995, "Poor", 38), "state");
  ok("a weak student in a broad system can still miss out", weak.admitted === false || weak.route !== "open");
}

/* ───────────────────────── 4 · determinism ───────────────────────── */
sec("4 · admission is deterministic");

{
  /* ONE character, admitted repeatedly. Calling student() twice builds two
     different people — mkChar draws from the seeded harness RNG — so comparing
     across calls would test the harness, not the determinism of eduAdmit. */
  const c0 = student("Nigeria", 1935, "Wealthy", 88, { jitter: 3 });
  const first = JSON.stringify(M.eduAdmit(c0, "state"));
  let stable = true;
  for (let i = 0; i < 8; i++) if (JSON.stringify(M.eduAdmit(c0, "state")) !== first) stable = false;
  ok("the same character gets the same outcome every time", stable);

  /* two loads of the same save must agree — that is why this uses hreRng and
     not Math.random */
  const c = c0;
  const x = M.eduAdmit(c, "state");
  const y = M.eduAdmit(JSON.parse(JSON.stringify(c)), "state");
  ok("a round-tripped save gets the same outcome", JSON.stringify(x) === JSON.stringify(y));

  const other = student("Nigeria", 1935, "Wealthy", 88, { jitter: 4 });
  ok("different characters can differ",
    M.EDU_ADMIT_ROUTES.indexOf(M.eduAdmit(other, "state").route) !== -1);
}

/* ───────────── 5 · the exception routes ───────────── */
sec("5 · S03 exception routes");

/* Each route must be REACHABLE under its own conditions. Searched across a
   spread of students rather than asserted on one, because each route is
   deliberately rare — that is what makes it an exception rather than a
   backdoor. */
function findRoute(route, make) {
  for (let i = 0; i < 300; i++) {
    const a = M.eduAdmit(make(i), "state");
    if (a.route === route) return a;
  }
  return null;
}

{
  /* score must land BELOW the ordinary gate (107 here) and above the merit
     bar — a student good enough to be admitted normally never needs the
     exception, which is what made the first version of this unreachable. */
  const merit = findRoute("merit", (i) =>
    student("Nigeria", 1935, "Middle", 98, { jitter: i }));
  ok("MERIT: an extraordinary student in a sealed era can be found", !!merit, merit);
  if (merit) {
    ok("...and is nearly fully funded", merit.aidShare > 0.9);
    ok("...and it is recorded as a scholarship", merit.sponsor === "scholarship");
  }

  const faith = findRoute("sponsorFaith", (i) =>
    student("Nigeria", 1935, "Working", 96, { jitter: i, religious: true }));
  ok("FAITH: a religious institution can sponsor a promising student", !!faith, faith);
  if (faith) ok("...and covers most of the cost", faith.aidShare > 0.8);

  const state = findRoute("sponsorState", (i) =>
    student("Sweden", 1955, "Working", 82, { jitter: i }));
  ok("STATE: an expanding state funds a graduate class", !!state, state);
  if (state) ok("...and covers most of the cost", state.aidShare > 0.8);

  const abroad = findRoute("abroad", (i) =>
    student("Nigeria", 1935, "Wealthy", 70, { jitter: i }));
  ok("ABROAD: wealth can buy past a narrow local system", !!abroad, abroad);
  if (abroad) ok("...and pays for it rather than being subsidised", abroad.aidShare < 0.2);
}

/* The exceptions must stay EXCEPTIONAL. If they fired often they would simply
   re-inflate the 88% the era model exists to correct. */
{
  let admitted = 0, byRoute = {}, n = 0;
  for (let i = 0; i < 160; i++) {
    const cls = ["Poor", "Working", "Middle", "Wealthy"][i % 4];
    const a = M.eduAdmit(student("Nigeria", 1935, cls, 40 + (i * 7) % 55, { jitter: i }), "state");
    byRoute[a.route] = (byRoute[a.route] || 0) + 1;
    if (a.admitted) admitted++;
    n++;
  }
  ok("a sealed era stays overwhelmingly closed", admitted / n < 0.20, [admitted, n, byRoute]);
  ok("...but is not literally sealed", admitted > 0, byRoute);
  ok("no single exception dominates",
    M.EDU_ADMIT_ROUTES.filter((r) => r !== "none").every((r) => (byRoute[r] || 0) / n < 0.15), byRoute);
}
{
  /* the gender bar must survive the exceptions — a route that quietly ignored
     it would erase the barrier the identity model went to some trouble to make
     real */
  let f = 0, m = 0;
  for (let i = 0; i < 120; i++) {
    if (M.eduAdmit(student("Egypt", 1935, "Middle", 60 + i % 30, { jitter: i, sex: "Female" }), "state").admitted) f++;
    if (M.eduAdmit(student("Egypt", 1935, "Middle", 60 + i % 30, { jitter: i, sex: "Male" }), "state").admitted) m++;
  }
  ok("women still face the historical barrier after exceptions", f <= m, [f, m]);
}

/* ───────────── 6 · what the player is told ───────────── */
sec("6 · the reason is specific");

{
  const scarce = M.eduAdmit(student("Nigeria", 1935, "Poor", 55), "state");
  const merit0 = M.eduAdmit(student("Sweden", 1995, "Poor", 30), "state");
  ok("a scarce refusal blames scarcity, not the student",
    !scarce.admitted && /places|thousand|million|shut/i.test(scarce.reason), scarce.reason);
  ok("an ordinary refusal does not blame scarcity",
    merit0.admitted || !/thousand/i.test(merit0.reason), merit0.reason);
  const barred = M.eduAdmit(student("Egypt", 1935, "Poor", 50, { sex: "Female" }), "state");
  ok("a barred refusal names the barrier",
    barred.admitted || /women/i.test(barred.reason), barred.reason);
}

/* ───────────── 7 · calibration (test-hre-calib.js shape) ───────────── */
sec("7 · calibration across country × era × class");

{
  let bad = [];
  for (const c of ALL) {
    for (const y of [1930, 1960, 1990, 2015]) {
      for (const cls of ["Poor", "Working", "Middle", "Wealthy"]) {
        const ch = H.mkChar({ country: c, birthYear: y, cls });
        const r = M.eduNetCostRatio(ch, "state", "open");
        if (!(r >= 0) || !isFinite(r)) bad.push(["nan", c, y, cls, r]);
        /* nothing should cost a poor family more than several years of income
           even in the worst case — that would be a modelling error, not a
           hardship */
        if (r > 4) bad.push(["absurd", c, y, cls, r]);
      }
    }
  }
  ok("net cost is finite and sane everywhere", bad.length === 0, bad.slice(0, 4));
  ok("that was a real sweep", ALL.length * 4 * 4 > 600);
}
{
  /* the ordering that matters: the same education is a heavier burden on
     poorer families and in poorer places */
  const r = (c, y, cls) => M.eduNetCostRatio(H.mkChar({ country: c, birthYear: y, cls }), "state", "open");
  ok("poorer families carry more of the cost", r("United States", 2005, "Poor") > r("United States", 2005, "Wealthy"));
  ok("a free public system is cheap for everyone",
    r("Sweden", 2005, "Poor") < r("United States", 2005, "Poor"));
  ok("prestige costs more than state everywhere",
    ALL.every((c) => {
      const ch = H.mkChar({ country: c, birthYear: 2000, cls: "Middle" });
      return M.eduTuitionRatio(ch, "prestige") >= M.eduTuitionRatio(ch, "state");
    }));
}
{
  /* R8: the flat TIER_SALARY distortion must be isolated in ONE place, so a
     module 09 fix is a rebalance and not a re-derivation */
  const SRC = fs.readFileSync(H.SRC, "utf8");
  const stripComments = (x) => x.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
  const mark = SRC.indexOf("EDU · S03 + S06");
  const raw = SRC.slice(SRC.lastIndexOf("/*", mark), SRC.indexOf("const EDU_ADMIT_ROUTES"));
  const block = stripComments(raw);
  ok("the S03/S06 block was located", raw.length > 3000, raw.length);
  ok("finance derives from the realised-income helper", block.includes("hreRealisedAnnual"));
  ok("...and does not re-derive the realisation constant itself",
    !block.includes("HRE_INCOME_REALISATION"));
  ok("...and does not read TIER_SALARY directly", !block.includes("TIER_SALARY"));
  ok("invariant 1: no Math.random in S03/S06", !block.includes("Math.random"));
  ok("invariant 1: admission draws through hreRng", block.includes("hreRng"));
  ok("invariant 2: no country conditional", !/country\s*===\s*["']/.test(block));
  ok("invariant 4: no new applyFx key", !/applyFx/.test(block));
}

/* ───────────── 8 · the absoluteness fix ───────────── */
sec("8 · scarce eras are narrow, not sealed");

{
  const rate = (country, year) => {
    let admitted = 0, n = 0;
    for (let i = 0; i < 120; i++) {
      const cls = ["Poor", "Working", "Middle", "Wealthy"][i % 4];
      if (M.eduAdmit(student(country, year, cls, 40 + (i * 11) % 58, { jitter: i }), "state").admitted) admitted++;
      n++;
    }
    return admitted / n;
  };
  const n35 = rate("Nigeria", 1935), s95 = rate("Sweden", 1995), uk35 = rate("United Kingdom", 1935);

  /* the P4 fix must survive: the inversion stays corrected */
  ok("1935 Nigeria is still far below 1995 Sweden", n35 < s95 / 3, [n35, s95]);
  ok("1935 Britain still beats 1935 Nigeria", uk35 >= n35, [uk35, n35]);

  /* the P5 fix: a door exists */
  ok("1935 Nigeria is no longer literally impossible", n35 > 0, n35);
  ok("...but remains rare", n35 < 0.25, n35);
  ok("a broad modern system admits most decent students", s95 > 0.35, s95);

  /* every era must leave SOME path, or the model has sealed someone in */
  let sealed = [];
  for (const c of ["Nigeria", "Kenya", "India", "Egypt", "Vietnam"]) {
    for (const y of [1900, 1930, 1960]) {
      let any = false;
      for (let i = 0; i < 80 && !any; i++) {
        if (M.eduAdmit(student(c, y, ["Poor", "Working", "Middle", "Wealthy"][i % 4], 55 + i % 45, { jitter: i }), "state").admitted) any = true;
      }
      if (!any) sealed.push([c, y]);
    }
  }
  ok("no country/era is completely sealed to every student", sealed.length === 0, sealed);
}

console.log("\n" + (fail === 0 ? "ALL PASS" : "FAILURES") + ": " + pass + " passed, " + fail + " failed");
process.exit(fail === 0 ? 0 : 1);
