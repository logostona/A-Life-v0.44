/* HRE Phase 7 — FORMAL EXIT GATE.
 *
 * Part 3 §10.2 states the gate in prose: "A character can leave the family
 * home, rent somewhere, live there, and lose it. Full-life soak across multiple
 * countries and eras shows coherent tenure, no state contradictions."
 *
 * This suite asserts that sentence directly rather than testing the parts in
 * isolation — the parts already have suites (S06/S07/S07b/S08a/S08b/S09) and
 * all of them passed while the system as a whole still had an un-executed
 * eviction ladder and a stale tenure accessor. Integration is where those hid.
 */
const H = require(require("path").join(__dirname, "harness.js"));
const M = H.M;

let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) pass++; else { fail++; console.log("  FAIL:", n, e !== undefined ? JSON.stringify(e) : ""); } };
const sec = (n) => console.log("\n=== " + n + " ===");

/* ───────────── 1 · the loop, driven deliberately end to end ───────────── */
sec("1 · leave home → rent → live there → lose it");
{
  let completed = 0, attempts = 0;
  const cases = [["Netherlands", 1980], ["United States", 1975], ["Japan", 1985], ["Germany", 1990]];
  for (const [country, by] of cases) {
    attempts++;
    const s = H.mkChar({ country: country, cls: "Middle", birthYear: by });
    s.ageDays = Math.ceil(28 * 365.25) + 1;
    M.migrate(s);
    s.money = 300000;
    s.career.job = { title: "Clerk", salary: 14000, tier: 3, industry: "retail" };

    /* leave the family home by renting — the marketplace route */
    const seed = M.hreWorldSeedOf(s);
    const res = M.hreSearch(seed, { country: country, city: M.hreCityIdxOf(s), year: M.yearOf(s),
      dayOfYear: M.hreDayOfYear(s), filter: "rent", ctx: M.hreSearchCtx(s) });
    const listing = res.listings.find(function (l) { return l.tenure === "rent"; });
    if (!listing) continue;

    const eng = M.hrePinEngagement(s, listing, "interested", s.ageDays);
    const landlord = M.hreLandlordFor(seed, listing);
    landlord.acceptance = 95; landlord.politics = 95; landlord.formality = 5;
    landlord.warmth = 90; landlord.kindness = 90;
    const verdict = M.hreAssessApplication(s, listing, landlord);
    if (!verdict.accept) continue;
    M.hreResolveApplication(s, eng, listing);
    if (!M.hreTenancy(s)) continue;

    /* LIVES THERE — rent is charged, tenure holds */
    const paidAtStart = M.hreTenancy(s).paidThrough;
    let cur = s;
    for (let i = 0; i < 60 && cur.alive; i++) { cur = M.advance(cur, 7); if (cur.pending) cur.pending = null; }
    const housed = M.hreTenure(cur) === "renting" && !!M.hreTenancy(cur);
    /* "lives there" means rent periods were actually processed. Checking the
       money balance instead would fail for any employed tenant, whose balance
       grows while they pay — which is exactly what it did. */
    const paidSomething = housed && M.hreTenancy(cur).paidThrough > paidAtStart;

    /* LOSES IT — income stops, arrears accrue, eviction executes */
    /* LOSES IT — income stops and stays stopped. Money is zeroed every step on
       purpose: incidental windfalls otherwise keep a tenant solvent almost
       indefinitely, because rents land at 43-161 against a 1043 affordability
       ceiling. That is a real balance observation (logged for module 09/22),
       but the gate is here to prove the eviction MECHANISM terminates, not to
       measure how often destitution occurs. */
    cur.money = 0;
    cur.career.job = null;
    let lost = false;
    for (let i = 0; i < 400 && cur.alive; i++) {
      cur.money = 0;
      cur = M.advance(cur, 7);
      if (cur.pending) cur.pending = null;
      if (!M.hreTenancy(cur)) { lost = true; break; }
    }

    if (housed && paidSomething && lost) {
      completed++;
      ok(country + ": ends up homeless, not in limbo", M.hreTenure(cur) === "homeless", M.hreTenure(cur));
      ok(country + ": no tenancy record survives the eviction", M.hreTenancy(cur) === null);
      ok(country + ": the street content is reachable afterwards",
        (function () { const g = M.ACT_GROUPS.find(function (x) { return x.id === "street"; });
                       return !!g && (!g.cond || g.cond(cur) === true); })());
      ok(country + ": the home tab is correctly hidden",
        (function () { const g = M.ACT_GROUPS.find(function (x) { return x.id === "home"; });
                       return !!g && g.cond && g.cond(cur) === false; })());
    }
  }
  ok("the full rental loop completes in every country tried", completed === attempts,
    { completed: completed, attempts: attempts });
}

/* ───────────── 2 · full-life soak, coherence at every step ───────────── */
sec("2 · full-life soak — coherence and no contradictions");
{
  const CASES = [
    ["United Kingdom", 1930], ["United Kingdom", 1985], ["Japan", 1955], ["Japan", 1995],
    ["Nigeria", 1970], ["Brazil", 1945], ["United States", 1925], ["Germany", 2000],
    ["India", 1960], ["Sweden", 1990],
  ];
  let steps = 0, crashes = 0, contradictions = 0, invalidTenure = 0, deadEnds = 0;
  const tenures = {};
  const examples = [];

  for (const [country, by] of CASES) {
    try {
      let s = H.mkChar({ country: country, cls: "Middle", birthYear: by });
      for (let i = 0; i < 4200 && s.alive; i++) {
        s = M.advance(s, 7);
        if (s.pending) {
          const valid = s.pending.options.filter(function (o) { return !o.cond || o.cond(s); });
          if (!valid.length) deadEnds++;
          s.pending = null;
        }
        steps++;
        const tenure = M.hreTenure(s), ten = M.hreTenancy(s);
        tenures[tenure] = (tenures[tenure] || 0) + 1;
        if (M.HRE_TENURE_STATES.indexOf(tenure) < 0) invalidTenure++;

        /* the contradictions the gate forbids */
        let bad = null;
        if (s.hre.owned) {
          if (tenure === "renting" && !ten) bad = "renting without a tenancy";
          else if (ten && tenure !== "renting") bad = "tenancy without renting tenure";
          else if (M.hreIsHomeless(s) && ten) bad = "homeless with a tenancy";
        }
        /* these must hold for everyone, owned or not */
        if (!bad && M.hreIsHomeless(s) && M.hreAtParents(s)) bad = "homeless and at parents";
        if (!bad && M.hreIsHomeless(s) && tenure !== "homeless") bad = "isHomeless disagrees with tenure";
        if (bad) { contradictions++; if (examples.length < 4) examples.push({ country: country, age: Math.floor(M.ageYears(s)), bad: bad, tenure: tenure }); }
      }
    } catch (e) { crashes++; console.log("  CRASH:", country, by, e.message); }
  }

  console.log("  soak: " + steps + " steps across " + CASES.length + " lives");
  console.log("  tenure distribution: " + JSON.stringify(tenures));
  ok("no crashes across ten country/era lives", crashes === 0, crashes);
  ok("no residence contradictions at any step", contradictions === 0, examples);
  ok("every tenure value is a legal state", invalidTenure === 0, invalidTenure);
  ok("no dead-end popups", deadEnds === 0, deadEnds);
  ok("the soak covered a meaningful span", steps > 20000, steps);
  ok("more than one tenure state was reached", Object.keys(tenures).length > 1, tenures);
  ok("characters do leave the family home during a normal life",
    (tenures.withParents || 0) < steps, { withParents: tenures.withParents, steps: steps });
}

/* ───────────── 3 · saves survive the whole phase ───────────── */
sec("3 · persistence across the phase");
{
  const s = H.mkChar({ country: "United Kingdom", cls: "Middle", birthYear: 1985 });
  s.ageDays = Math.ceil(30 * 365.25) + 1;
  M.migrate(s);
  s.money = 100000;
  M.hreStartTenancy(s, 700, 2);
  const revived = JSON.parse(JSON.stringify(s));
  M.migrate(revived);
  ok("a tenancy survives save/load", !!M.hreTenancy(revived));
  ok("tenure survives save/load", M.hreTenure(revived) === "renting");
  ok("authority survives save/load", revived.hre.owned === true);
  ok("the rent amount survives save/load", M.hreTenancy(revived).rent === M.hreTenancy(s).rent);

  /* a pre-HRE save must still migrate cleanly at the end of the phase */
  const old = H.mkChar({ country: "Japan", cls: "Poor", birthYear: 1970 });
  delete old.hre;
  M.migrate(old);
  ok("a pre-HRE save still migrates", !!old.hre && old.hre.owned === false);
  ok("a migrated save defers to legacy", M.hreTenure(old) === M.hreLegacyTenure(old));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
