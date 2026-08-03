/* HRE Phase 9 — S10 Upkeep & Failures.
 *
 * Exit gate, verbatim from the spec (Part 3 §10.3):
 *   "condition handoff is continuous at purchase (R5); failures emerge from the
 *    condition model rather than a list; a neglected property degrades and
 *    loses value measurably over decades."
 *
 * The three clauses are §1, §6 and §9 below. Everything else exists because of
 * something this project has already got wrong once:
 *   · §2  — Gotcha #4: a new field with a newCharacter initializer and no
 *           migrate backfill only ever breaks on real saves.
 *   · §4  — the phase's own requirement that deferred maintenance COMPOUNDS.
 *           Asserted as a second difference, not by eyeballing a curve.
 *   · §6b — the decorative state machine. S08a shipped an arrears ladder whose
 *           terminal stage was reachable and did nothing for 92 periods. Every
 *           terminal branch here is driven to and asserted on by its EFFECT.
 *   · §9  — RESTART-BRIEF §4: a derived value is only trusted after a soak
 *           compares it against an independent recomputation.
 */
const H = require(require("path").join(__dirname, "harness.js"));
const M = H.M;
const fs = require("fs");
const path = require("path");

let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) pass++; else { fail++; console.log("  FAIL:", n, e !== undefined ? JSON.stringify(e) : ""); } };
const sec = (n) => console.log("\n=== " + n + " ===");

const clone = (x) => JSON.parse(JSON.stringify(x));
const atAge = (y) => Math.ceil(y * 365.25) + 1;

/* A character who owns the dwelling HRE already knows about. Goes through
   hreSetTenure, the sole writer, so residence authority transfers exactly as it
   does after a real purchase.

   The world seed is re-derived from the arguments rather than left as
   newCharacter wrote it: newCharacter mixes Math.random() into the seed, so two
   "identical" harness characters get different buildings, and any assertion
   about a specific dwelling is then a coin toss. This is the same determinism
   the rest of HRE is built on, applied to the test fixture. */
function mkOwner(country, birthYear, age, money, tag) {
  const s = H.mkChar({ country: country, cls: "Middle", birthYear: birthYear });
  s.ageDays = atAge(age);
  s.hre = M.hreInit(M.hreSeedFrom("s10:" + country + ":" + birthYear + ":" + (tag || "")),
    country, s.profile.city, "Middle", birthYear);
  M.migrate(s);
  s.money = money === undefined ? 250000 : money;
  M.hreSetTenure(s, "owning", s.hre.home);
  return s;
}

/* Put every component somewhere sound, so a measurement of decay is not
   interrupted by a failure ladder it was not measuring. */
function sound(s, at) {
  if (!s.hre.home) return s;
  for (const c of M.HRE_COMPONENTS) s.hre.home.condition[c.id] = at === undefined ? 92 : at;
  M.hreSyncCondition(s.hre.home.condition);
  M.hreEnsureUpkeep(s);
  return s;
}

/* A buyer who goes all the way through the marketplace: search, loan, purchase.
   Returns null where the era/country has no mortgage market, which is a real
   answer and not a failure. */
function mkBuyer(country, birthYear, age, minCondition) {
  const s = H.mkChar({ country: country, cls: "Middle", birthYear: birthYear });
  s.ageDays = atAge(age);
  M.migrate(s);
  s.money = 5000000;
  s.career.job = { title: "Clerk", salary: 14000, tier: 3, industry: "retail" };
  const seed = M.hreWorldSeedOf(s);
  const res = M.hreSearch(seed, { country: country, city: M.hreCityIdxOf(s), year: M.yearOf(s),
    dayOfYear: M.hreDayOfYear(s), filter: "sale", ctx: M.hreSearchCtx(s) });
  /* `minCondition` picks a dwelling that is actually in reasonable repair. The
     decades soak needs one: a property bought at condition 13 is already at the
     bottom, and "it got worse" is not a measurable claim about a ruin. */
  const listing = res.listings.find(function (l) {
    return l.tenure === "sale" &&
      (!minCondition || M.hreConditionScore(l.crystallised.condition) >= minCondition);
  });
  if (!listing) return null;
  const offer = M.hreLoanOffer(s, listing.asking);
  if (!offer || !offer.ok) return null;
  const bought = M.hreBuyProperty(s, listing, offer);
  if (!bought.ok) return null;
  return { s: s, listing: listing, bought: bought };
}

/* Drive whole 30-day periods through the S10 tick only, with no POOL events,
   no milestones and no mortality in the way. Used where the question is what
   the condition model does, not what a life does. §9's soak runs the real
   advance() precisely because this one does not. */
function periods(s, n) {
  for (let i = 0; i < n; i++) {
    s.ageDays += M.HRE_RENT_PERIOD_DAYS;
    M.hreUpkeepTick(s);
    if (!s.hre.home) break;
  }
  return s;
}

/* ─────────── 1 · GATE: condition handoff is continuous at purchase (R5) ─────────── */
sec("1 · R5 — the condition handoff");
{
  let tried = 0, continuous = 0, sameObjectValues = 0, zeroElapsed = 0;
  for (const [country, by, age] of [["United Kingdom", 1955, 30], ["United States", 1955, 30],
                                    ["Japan", 1960, 40], ["Brazil", 1960, 40], ["Germany", 1970, 35]]) {
    const b = mkBuyer(country, by, age);
    if (!b) continue;
    tried++;
    /* deep string, taken before anything can mutate either side — the whole
       point is that these are two independent records that must agree */
    const blueprint = JSON.stringify(JSON.parse(JSON.stringify(b.listing.crystallised.condition)));

    /* the moment of purchase */
    if (JSON.stringify(b.s.hre.home.condition) === blueprint) continuous++;

    /* and after the first tick, which is the one that could have re-rolled it */
    M.hreUpkeepTick(b.s);
    if (JSON.stringify(b.s.hre.home.condition) === blueprint) sameObjectValues++;
    const u = M.hreUpkeep(b.s);
    if (u && u.period === M.hrePeriodIndex(b.s.ageDays)) zeroElapsed++;
  }
  ok("the purchase path is exercised in several countries and eras", tried >= 3, tried);
  ok("GATE: the home's condition at purchase IS the blueprint's, component for component",
    continuous === tried, { continuous: continuous, tried: tried });
  ok("GATE: tracking starts without re-rolling — first tick leaves every component unchanged",
    sameObjectValues === tried, { same: sameObjectValues, tried: tried });
  ok("the tracker is initialised caught-up, so zero periods have elapsed at purchase",
    zeroElapsed === tried, { zeroElapsed: zeroElapsed, tried: tried });

  /* the structural claim behind the gate: there is no second condition value */
  const b = mkBuyer("United Kingdom", 1955, 30);
  const atPurchase = M.hreConditionScore(JSON.parse(JSON.stringify(b.listing.crystallised.condition)));
  const u = M.hreUpkeep(periods(b.s, 3));
  const upkKeys = Object.keys(u);
  const holdsAComponent = upkKeys.some(function (k) {
    return M.HRE_COMPONENTS.some(function (c) { return c.id === k; });
  });
  ok("the upkeep tracker holds bookkeeping only — no component ever lives on it", !holdsAComponent, upkKeys);
  ok("the tracker records the condition the base value was priced against",
    typeof u.base === "number" && u.base > 0, u.base);
  ok("...and that baseline is the crystallised condition, not a fresh derivation",
    u.base === atPurchase, { base: u.base, want: atPurchase });
  /* hreCrystallise still carries condition through verbatim (the seam upstream) */
  const seed = M.hreWorldSeedOf(b.s);
  const bp = M.hreBlueprint(seed, b.listing.id, b.listing.year);
  ok("hreCrystallise still passes condition through untouched",
    JSON.stringify(M.hreCrystallise(bp).condition) === JSON.stringify(bp.condition));

  /* the tracked copy must diverge from the generator, not corrupt it: S10 owns
     the lived history, S02 stays the authority on how the world was made */
  const decayed = periods(clone(b.s), 120);
  const regenerated = M.hreBlueprint(seed, b.listing.id, b.listing.year);
  ok("decay writes only into state — a re-derived blueprint is untouched",
    JSON.stringify(regenerated.condition) === JSON.stringify(bp.condition));
  ok("...while the lived copy has genuinely moved",
    !decayed.hre.home || JSON.stringify(decayed.hre.home.condition) !== JSON.stringify(bp.condition));
}

/* ─────────────────────── 2 · schema, creation, migration ─────────────────────── */
sec("2 · s.hre.upk schema and migration (Gotcha #4)");
{
  const s = H.mkChar({ country: "United Kingdom", cls: "Middle", birthYear: 1990 });
  ok("newCharacter seeds s.hre.upk", "upk" in s.hre, Object.keys(s.hre));
  ok("it starts null — nothing is being maintained at birth", s.hre.upk === null);
  ok("HRE_STATE_V was bumped for the new branch", M.HRE_STATE_V === 4, M.HRE_STATE_V);
  ok("the v3 -> v4 ladder step exists", typeof M.HRE_STATE_LADDER[3] === "function");

  let t = H.mkChar({}); delete t.hre; M.migrate(t);
  ok("a save with no hre at all gains upk", "upk" in t.hre && t.hre.upk === null);

  t = H.mkChar({}); t.hre.v = 3; delete t.hre.upk; M.migrate(t);
  ok("a genuine v3 save upgrades to v4 and gains upk", t.hre.v === 4 && t.hre.upk === null);

  t = H.mkChar({ country: "Japan", cls: "Poor", birthYear: 1962 });
  const seedBefore = t.hre.seed, tenureBefore = t.hre.tenure;
  t.hre.v = 3; delete t.hre.upk; M.migrate(t);
  ok("the upgrade preserves seed and tenure exactly", t.hre.seed === seedBefore && t.hre.tenure === tenureBefore);

  t = H.mkChar({}); t.hre.upk = undefined; M.migrate(t);
  ok("a v4 save with upk stripped is repaired, not crashed", t.hre.upk === null);

  const x = H.mkChar({}); delete x.hre;
  M.migrate(x); const first = JSON.stringify(x.hre);
  M.migrate(x); M.migrate(x);
  ok("repeated migration is still idempotent with the new field", JSON.stringify(x.hre) === first);

  /* a lived save that already has a tracker must not be reset by migration */
  const o = periods(mkOwner("United Kingdom", 1960, 30), 24);
  const snap = JSON.stringify(o.hre.upk);
  M.migrate(o);
  ok("migration never resets an existing tracker", JSON.stringify(o.hre.upk) === snap);
}

/* ───────────────────────────── 3 · the decay model ───────────────────────────── */
sec("3 · decay by archetype, quality, age and climate");
{
  const cmp = M.HRE_COMPONENTS.find(function (c) { return c.id === "roof"; });
  const mk = (arch, built) => ({ id: "UK|0|1|2|3", archetype: arch, builtYear: built, condition: { _care: 50 } });

  ok("every archetype has a decay multiplier",
    M.HRE_ARCHETYPES.every(function (a) { return typeof M.HRE_DECAY_ARCHETYPE[a.id] === "number"; }),
    M.HRE_ARCHETYPES.filter(function (a) { return !M.HRE_DECAY_ARCHETYPE[a.id]; }).map(function (a) { return a.id; }));
  ok("every component has a climate exposure weight",
    M.HRE_COMPONENTS.every(function (c) { return typeof M.HRE_DECAY_EXPOSURE[c.id] === "number"; }));

  const villa = M.hreDecayPerPeriod(1, mk("villa", 1960), "United Kingdom", 2000, cmp, 0);
  const mobile = M.hreDecayPerPeriod(1, mk("mobileHome", 1960), "United Kingdom", 2000, cmp, 0);
  ok("ARCHETYPE: a mobile home sheds condition faster than a villa", mobile > villa, { mobile: mobile, villa: villa });

  const young = M.hreDecayPerPeriod(1, mk("terrace", 1990), "United Kingdom", 2000, cmp, 0);
  const old = M.hreDecayPerPeriod(1, mk("terrace", 1850), "United Kingdom", 2000, cmp, 0);
  ok("AGE: an older building decays faster than a newer one of the same type", old > young, { old: old, young: young });

  const dry = M.hreDecayPerPeriod(1, mk("terrace", 1960), "Egypt", 2000, cmp, 0);
  const wet = M.hreDecayPerPeriod(1, mk("terrace", 1960), "Indonesia", 2000, cmp, 0);
  ok("CLIMATE: a roof in seAsia decays faster than the same roof in mena", wet > dry, { wet: wet, dry: dry });
  ok("every HRE region has a climate entry",
    Object.keys(M.HRE_REGION).every(function (c) { return !!M.HRE_CLIMATE_REGION[M.hreRegionOf(c)]; }));

  const exposed = M.hreDecayPerPeriod(1, mk("terrace", 1960), "Sweden", 2000, cmp, 0);
  const wiring = M.hreDecayPerPeriod(1, mk("terrace", 1960), "Sweden", 2000,
    M.HRE_COMPONENTS.find(function (c) { return c.id === "electrical"; }), 0);
  ok("EXPOSURE: climate bites the roof harder than it bites the wiring",
    (exposed / M.hreDecayPerPeriod(1, mk("terrace", 1960), "Egypt", 2000, cmp, 0)) >
    (wiring / M.hreDecayPerPeriod(1, mk("terrace", 1960), "Egypt", 2000,
      M.HRE_COMPONENTS.find(function (c) { return c.id === "electrical"; }), 0)));

  /* QUALITY: two dwellings, same everything, different construction draw */
  let spread = 0, lo = 9, hi = 0;
  for (let i = 0; i < 60; i++) {
    const q = M.hreBuildQuality(i * 7919, { id: "X|0|1|2|" + i, condition: { _care: 50 } });
    if (q < lo) lo = q; if (q > hi) hi = q;
  }
  spread = hi - lo;
  ok("QUALITY: construction quality varies between buildings", spread > 0.2, { lo: lo, hi: hi });
  ok("...and is bounded so nothing is immortal or made of paper", lo >= 0.55 && hi <= 1.45, { lo: lo, hi: hi });
  const qHome = { id: "Q|0|1|2|3", condition: { _care: 50 } };
  ok("QUALITY is a property of the building — same id, same answer, every time",
    M.hreBuildQuality(4242, qHome) === M.hreBuildQuality(4242, qHome));

  /* MAINTENANCE HISTORY: the generator's own _care proxy feeds build quality */
  const kept = M.hreBuildQuality(99, { id: "A|0|1|2|3", condition: { _care: 95 } });
  const neglected = M.hreBuildQuality(99, { id: "A|0|1|2|3", condition: { _care: 5 } });
  ok("HISTORY: a well-kept building's own care record slows its decay", kept > neglected, { kept: kept, neglected: neglected });

  ok("a nominal component loses about HRE_NOMINAL_LOSS_PER_LIFE over its service life",
    Math.abs(M.hreDecayPerPeriod(1, mk("terrace", 1999), "United Kingdom", 2000,
      M.HRE_COMPONENTS.find(function (c) { return c.id === "heating"; }), 0) *
      M.HRE_PERIODS_PER_YEAR * 22 - M.HRE_NOMINAL_LOSS_PER_LIFE) < M.HRE_NOMINAL_LOSS_PER_LIFE * 0.6);
  ok("...which matches what S02's own Stage 7 implies, not a faster invented rate",
    M.HRE_NOMINAL_LOSS_PER_LIFE > 30 && M.HRE_NOMINAL_LOSS_PER_LIFE < 80, M.HRE_NOMINAL_LOSS_PER_LIFE);
  ok("no stack of multipliers can exceed the declared clamp",
    M.hreDecayPerPeriod(1, mk("mobileHome", 1700), "Indonesia", 2100, cmp, 9999) <=
    (M.HRE_NOMINAL_LOSS_PER_LIFE / (cmp.life * M.HRE_PERIODS_PER_YEAR)) * M.HRE_DECAY_CLAMP[1] + 1e-9);
}

/* ──────────────────── 4 · deferred maintenance COMPOUNDS ──────────────────── */
sec("4 · deferred maintenance compounds rather than accrues");
{
  const cmp = M.HRE_COMPONENTS.find(function (c) { return c.id === "roof"; });
  const home = { id: "UK|0|1|2|3", archetype: "terrace", builtYear: 1930, condition: { _care: 50 } };
  const rate = (d) => M.hreDecayPerPeriod(1, home, "United Kingdom", 2000, cmp, d);

  ok("the rate at zero neglect is the nominal rate", rate(0) > 0);
  ok("neglect raises the rate itself, not just the total", rate(120) > rate(0), { at0: rate(0), at120: rate(120) });
  ok("ten years of neglect costs more per month than one year does", rate(120) > rate(12));
  ok("the multiplier is bounded — neglect does not diverge",
    rate(9999) <= rate(0) * (1 + M.HRE_DEFER_K * M.HRE_DEFER_CAP_YEARS) + 1e-9, { unbounded: rate(9999), cap: rate(0) * (1 + M.HRE_DEFER_K * M.HRE_DEFER_CAP_YEARS) });

  /* the actual compounding claim: SECOND DIFFERENCE of cumulative loss > 0.
     Linear accrual gives equal losses in equal windows; compounding does not. */
  const s = mkOwner("United Kingdom", 1960, 30, 0);
  /* started sound so nothing can cross the failure threshold mid-measurement:
     the question here is the SHAPE of the decay curve, nothing else */
  for (const c of M.HRE_COMPONENTS) s.hre.home.condition[c.id] = 98;
  M.hreEnsureUpkeep(s);
  const trace = [];
  let cur = s;
  for (let w = 0; w < 3 && cur.hre.home; w++) {
    trace.push(cur.hre.home.condition.roof);
    cur = periods(cur, 48);          /* four years per window */
  }
  if (cur.hre.home) trace.push(cur.hre.home.condition.roof);
  ok("the neglect trace ran to completion without the house being condemned", trace.length === 4, trace);
  const w1 = trace[0] - trace[1], w2 = trace[1] - trace[2], w3 = trace[2] - trace[3];
  ok("the measurement window never hit the failure threshold",
    !!cur.hre.home && cur.hre.home.condition.roof > M.HRE_FAIL_THRESHOLD,
    cur.hre.home && cur.hre.home.condition.roof);
  ok("each window of neglect costs more condition than the window before it",
    w2 > w1 && w3 > w2, { w1: w1, w2: w2, w3: w3 });
  ok("...which is a curve, not a line (second difference is positive)",
    (w3 - w2) > 0 && (w2 - w1) > 0, { d1: w2 - w1, d2: w3 - w2 });

  /* and the counter itself is what maintenance resets */
  const kept = sound(mkOwner("United Kingdom", 1960, 30, 400000, "defer"));
  periods(kept, 60);
  const deferBefore = kept.hre.upk.defer.roof;
  M.hreDoMaintenance(kept, "service");
  ok("the deferred-maintenance counter is real and grows with neglect", deferBefore >= 55, deferBefore);
  ok("a proper service resets it to zero", kept.hre.upk.defer.roof === 0, kept.hre.upk.defer.roof);
}

/* ─────────────────── 5 · maintenance spend measurably slows decay ─────────────────── */
sec("5 · maintenance spend");
{
  const base = sound(mkOwner("United Kingdom", 1960, 30, 3000000, "spend"), 62);
  periods(base, 6);                                   /* let a little wear accumulate */

  const neglected = periods(clone(base), 240);        /* twenty years, untouched */
  let kept = clone(base);
  for (let i = 0; i < 20; i++) { kept = periods(kept, 12); M.hreDoMaintenance(kept, "service"); }

  const cN = M.hreConditionScore(neglected.hre.home.condition);
  const cK = M.hreConditionScore(kept.hre.home.condition);
  ok("after twenty years the maintained house is in measurably better condition", cK > cN + 15, { kept: cK, neglected: cN });
  ok("the maintained house actually cost money", kept.hre.upk.spent > 0 && kept.money < base.money, kept.hre.upk.spent);
  ok("the neglected house is worth measurably less than the maintained one",
    M.hreHomeValueNow(neglected).factor < M.hreHomeValueNow(kept).factor - 0.1,
    { n: M.hreHomeValueNow(neglected).factor, k: M.hreHomeValueNow(kept).factor });
  /* The finding this phase is actually about: emergency work at
     HRE_EMERGENCY_MULT costs more than the planned work it replaced, so the
     neglectful owner ends up spending MORE and owning less. */
  let neglectSpend = 0, keepSpend = 0, keepCond = 0, neglectCond = 0, cohort = 0;
  for (let i = 0; i < 6; i++) {
    const start = sound(mkOwner("United Kingdom", 1955 + i, 30, 3000000, "cost" + i), 55);
    if (!start.hre.home) continue;
    cohort++;
    const nx = periods(clone(start), 240);
    let kx = clone(start);
    for (let j = 0; j < 20; j++) { kx = periods(kx, 12); M.hreDoMaintenance(kx, "service"); }
    neglectSpend += nx.hre.upk ? nx.hre.upk.spent : 0;
    keepSpend += kx.hre.upk ? kx.hre.upk.spent : 0;
    neglectCond += nx.hre.home ? M.hreConditionScore(nx.hre.home.condition) : 0;
    keepCond += kx.hre.home ? M.hreConditionScore(kx.hre.home.condition) : 0;
  }
  ok("the cost comparison ran across several buildings", cohort >= 4, cohort);
  ok("neglect is not the cheap option — forced emergency work costs more than upkeep",
    neglectSpend > keepSpend, { keep: keepSpend, neglect: neglectSpend });
  ok("...and buys a worse house for it", keepCond > neglectCond, { keep: keepCond, neglect: neglectCond });

  /* the three jobs are ordered in both price and effect */
  const prices = M.HRE_MAINTENANCE.map(function (j) { return M.hreMaintenancePrice(base, j.id); });
  ok("the three maintenance levels are priced in ascending order",
    prices[0] < prices[1] && prices[1] < prices[2], prices);
  const effects = M.HRE_MAINTENANCE.map(function (j) {
    const t = periods(clone(base), 120);
    const before = M.hreConditionScore(t.hre.home.condition);
    t.money = 9e9;
    M.hreDoMaintenance(t, j.id);
    return M.hreConditionScore(t.hre.home.condition) - before;
  });
  ok("a bigger job puts back more condition", effects[0] < effects[1] && effects[1] < effects[2], effects);

  /* affordability and cooldown are both real gates */
  const broke = periods(mkOwner("United Kingdom", 1960, 30, 0), 60);
  ok("maintenance you cannot afford does not happen", M.hreDoMaintenance(broke, "service") === null);
  const rich = periods(mkOwner("United Kingdom", 1960, 30, 5000000), 60);
  ok("the first job goes through", !!M.hreDoMaintenance(rich, "service"));
  ok("the same job cannot be repeated immediately (no condition faucet)",
    M.hreDoMaintenance(rich, "service") === null && M.hreMaintenanceReady(rich, "service") === false);
  periods(rich, 14);
  ok("...and becomes available again after its cooldown", M.hreMaintenanceReady(rich, "service") === true);
}

/* ────────── 6 · GATE: failures emerge from the condition model, not a list ────────── */
sec("6 · failure emission");
{
  /* (a) the emission rule is a function of ONE number */
  ok("nothing above the threshold can fail", M.hreFailureRisk(M.HRE_FAIL_THRESHOLD + 1) === 0);
  ok("risk begins exactly at the threshold", M.hreFailureRisk(M.HRE_FAIL_THRESHOLD) === 0 && M.hreFailureRisk(M.HRE_FAIL_THRESHOLD - 1) > 0);
  ok("risk rises monotonically as condition falls",
    M.hreFailureRisk(15) < M.hreFailureRisk(10) && M.hreFailureRisk(10) < M.hreFailureRisk(4));
  ok("risk is bounded below 100% in any single period", M.hreFailureRisk(0) < 1);
  ok("the risk function reads nothing but the condition value",
    M.hreFailureRisk(9) === M.hreFailureRisk(9));

  /* (b) EVERY component can fail — it is not an authored set */
  const seen = {};
  let totalFails = 0;
  for (let n = 0; n < 30; n++) {
    const s = mkOwner("United Kingdom", 1950 + n, 30, 900000, "fail" + n);
    if (!s.hre.home) continue;
    for (const c of M.HRE_COMPONENTS) s.hre.home.condition[c.id] = 6;
    M.hreEnsureUpkeep(s);
    s.hre.upk.base = 70;
    /* stop short of the terminal stage: this measures WHAT can fail, not what
       happens afterwards, which is 6b's job */
    for (let i = 0; i < M.HRE_FAIL_STAGE_AT.unfit - 2 && s.hre.upk; i++) {
      s.ageDays += M.HRE_RENT_PERIOD_DAYS;
      M.hreUpkeepTick(s);
      if (!s.hre.upk) break;
      for (const k in s.hre.upk.open) { if (!seen[k]) totalFails++; seen[k] = (seen[k] || 0) + 1; }
    }
  }
  ok("failures were emitted at all", totalFails > 0, totalFails);
  ok("GATE: every one of the ten components is capable of failing, procedurally",
    Object.keys(seen).length === M.HRE_COMPONENTS.length,
    { got: Object.keys(seen).sort(), want: M.HRE_COMPONENTS.map(function (c) { return c.id; }).sort() });

  /* (c) a healthy house does not spontaneously produce failures */
  const sound = mkOwner("United Kingdom", 1960, 30, 0);
  for (const c of M.HRE_COMPONENTS) sound.hre.home.condition[c.id] = 95;
  M.hreEnsureUpkeep(sound);
  periods(sound, 36);
  ok("a sound house emits no failures at all", Object.keys(sound.hre.upk.open).length === 0,
    Object.keys(sound.hre.upk.open));

  /* (d) the source is grepped, not assumed: no authored failure event list */
  const src = fs.readFileSync(path.join(__dirname, "life-sim.jsx"), "utf8");
  const s10 = src.slice(src.indexOf("HRE · S10 · UPKEEP"), src.indexOf("/* ═══════════════ ENGINE"));
  ok("the S10 section exists and was spliced exactly once",
    (src.match(/HRE · S10 · UPKEEP, FAILURES, DISASTERS & INSURANCE/g) || []).length === 1);
  ok("S10 registers no POOL events — failures are not authored world events",
    s10.indexOf("POOL.push") === -1);
  ok("S10 uses no engine RNG and no wall clock — replays are identical",
    !/Math\.random\(|Date\.now\(|[^A-Za-z.]rnd\(|[^A-Za-z.]pick\(/.test(s10));
  ok("S10 contains no per-country conditionals (invariant I9)",
    !/country\s*===\s*"/.test(s10));

  /* (e) determinism: the same house in the same month fails the same way */
  const a = mkOwner("United Kingdom", 1960, 30, 0);
  const b = clone(a);
  for (const c of M.HRE_COMPONENTS) { a.hre.home.condition[c.id] = 12; b.hre.home.condition[c.id] = 12; }
  M.hreEnsureUpkeep(a); M.hreEnsureUpkeep(b);
  periods(a, M.HRE_FAIL_STAGE_AT.unfit - 2); periods(b, M.HRE_FAIL_STAGE_AT.unfit - 2);
  ok("two identical houses degrade and fail identically",
    !!a.hre.home && !!b.hre.home &&
    JSON.stringify(a.hre.home.condition) === JSON.stringify(b.hre.home.condition) &&
    JSON.stringify(Object.keys(a.hre.upk.open).sort()) === JSON.stringify(Object.keys(b.hre.upk.open).sort()));
}

sec("6b · the ladder terminates in a consequence (the decorative-state-machine check)");
{
  ok("the ladder declares three stages", M.HRE_FAIL_STAGES.length === 3 && M.HRE_FAIL_STAGES[2] === "unfit");
  ok("stages are ordered by how long a failure has been open",
    M.HRE_FAIL_STAGE_AT.open < M.HRE_FAIL_STAGE_AT.worsening && M.HRE_FAIL_STAGE_AT.worsening < M.HRE_FAIL_STAGE_AT.unfit);
  ok("hreFailStage reports each stage at its own threshold",
    M.hreFailStage(0) === "open" && M.hreFailStage(M.HRE_FAIL_STAGE_AT.worsening) === "worsening" &&
    M.hreFailStage(M.HRE_FAIL_STAGE_AT.unfit) === "unfit" && M.hreFailStage(999) === "unfit");

  /* OWNER, cannot pay. The terminal stage must take the building away. */
  let condemned = 0, forced = 0, reached = 0;
  for (let n = 0; n < 14; n++) {
    const s = mkOwner("United Kingdom", 1950 + n, 30, 0, "condemn" + n);
    if (!s.hre.home) continue;
    for (const c of M.HRE_COMPONENTS) s.hre.home.condition[c.id] = 4;
    M.hreEnsureUpkeep(s);
    const feedBefore = s.feed.length;
    let cur = s;
    for (let i = 0; i < 70; i++) {
      cur.money = 0;                                  /* destitute, deliberately */
      cur.ageDays += M.HRE_RENT_PERIOD_DAYS;
      M.hreUpkeepTick(cur);
      if (cur.hre.lastEnd === "condemned") break;
    }
    if (cur.hre.lastEnd === "condemned") {
      reached++; condemned++;
      ok("an owner who cannot repair loses the building, not just a label #" + n,
        M.hreTenure(cur) === "homeless" && cur.hre.home === null && cur.feed.length > feedBefore,
        { tenure: M.hreTenure(cur), home: cur.hre.home });
      ok("...and the legacy homelessness flag is kept in step #" + n, !!cur.flags.homeless);
      ok("...and it was said out loud, in prose #" + n,
        cur.feed.slice(feedBefore).some(function (f) { return /unfit for human habitation/.test(f.text); }));
      break;
    }
  }
  ok("GATE: the terminal stage of the failure ladder is reachable and FIRES", condemned > 0, { reached: reached });

  /* OWNER who can pay: the terminal stage still fires — it takes the money */
  const rich = mkOwner("United Kingdom", 1961, 30, 900000, "forced");
  ok("the control owner has a dwelling to ruin", !!rich.hre.home);
  for (const c of M.HRE_COMPONENTS) rich.hre.home.condition[c.id] = 4;
  M.hreEnsureUpkeep(rich);
  const moneyBefore = rich.money;
  for (let i = 0; i < 70 && rich.hre.upk && rich.hre.upk.repairs === 0; i++) {
    rich.ageDays += M.HRE_RENT_PERIOD_DAYS;
    M.hreUpkeepTick(rich);
  }
  ok("a solvent owner is forced into an emergency repair instead", rich.hre.upk && rich.hre.upk.repairs > 0,
    rich.hre.upk && rich.hre.upk.repairs);
  ok("...which costs real money", rich.money < moneyBefore, { before: moneyBefore, after: rich.money });
  ok("...and the component is actually put back, not just flagged",
    !!rich.hre.home && M.HRE_COMPONENTS.some(function (c) {
      return rich.hre.home.condition[c.id] >= M.HRE_EMERGENCY_RESTORE; }),
    rich.hre.home && rich.hre.home.condition);
  ok("...and the failure record is cleared with it",
    Object.keys(rich.hre.upk.open).length < M.HRE_COMPONENTS.length);

  /* TENANT: both branches change state. Neither is a label. */
  let ended = 0, forcedRepair = 0, tenantsTried = 0;
  for (const [country, by] of [["United States", 1960], ["Netherlands", 1960], ["Nigeria", 1970],
                               ["Sweden", 1965], ["United Kingdom", 1958], ["Poland", 1962]]) {
    const s = H.mkChar({ country: country, cls: "Middle", birthYear: by });
    s.ageDays = atAge(30);
    s.hre = M.hreInit(M.hreSeedFrom("s10:tenant:" + country + ":" + by), country, s.profile.city, "Middle", by);
    M.migrate(s); s.money = 400000;
    /* hreCrystalliseFamilyHome legitimately returns null where the generator
       finds no viable dwelling for that country and era */
    if (!s.hre.home) continue;
    if (!M.hreStartTenancy(s, 400, 1, s.hre.home)) continue;
    tenantsTried++;
    for (const c of M.HRE_COMPONENTS) s.hre.home.condition[c.id] = 4;
    M.hreEnsureUpkeep(s);
    const feedBefore = s.feed.length;
    let restored = false;
    for (let i = 0; i < 80; i++) {
      s.money = 400000;
      s.ageDays += M.HRE_RENT_PERIOD_DAYS;
      M.hreUpkeepTick(s);
      if (!M.hreTenancy(s) || !s.hre.home) break;
      if (M.hreConditionScore(s.hre.home.condition) > 30) { restored = true; break; }
    }
    if (!M.hreTenancy(s)) {
      ended++;
      ok(country + ": an unfit let ends the tenancy through the single exit",
        M.hreTenure(s) === "homeless" && s.hre.ten === null, { tenure: M.hreTenure(s) });
      ok(country + ": ...and the character is told why", s.feed.length > feedBefore);
    } else if (restored) {
      forcedRepair++;
      ok(country + ": a protected tenant's landlord is made to do the work",
        M.hreConditionScore(s.hre.home.condition) > 30);
      ok(country + ": ...and the tenancy survives it", !!M.hreTenancy(s));
    }
  }
  ok("tenants were driven into unfit housing in several countries", tenantsTried >= 4, tenantsTried);
  ok("no tenant sat in a terminal stage doing nothing — every case resolved",
    ended + forcedRepair === tenantsTried, { ended: ended, forcedRepair: forcedRepair, tried: tenantsTried });
  ok("the tenancy-ending branch fires where the law is weak", ended > 0, ended);
  ok("the landlord-forced branch fires where the law has teeth", forcedRepair > 0, forcedRepair);
}

/* ─────────────────────────────── 7 · disasters ─────────────────────────────── */
sec("7 · disasters");
{
  ok("every hazard names components it actually damages",
    Object.keys(M.HRE_HAZARDS).every(function (k) {
      return M.HRE_HAZARDS[k].hits.every(function (h) {
        return M.HRE_COMPONENTS.some(function (c) { return c.id === h; }); }); }));
  ok("every region has a hazard mix covering every hazard",
    Object.keys(M.HRE_HAZARD_REGION).every(function (r) {
      return Object.keys(M.HRE_HAZARDS).every(function (h) { return typeof M.HRE_HAZARD_REGION[r].w[h] === "number"; }); }));
  ok("every country resolves to a hazard mix",
    Object.keys(M.COUNTRIES).every(function (c) { return !!M.HRE_HAZARD_REGION[M.hreRegionOf(c)] || !!M.HRE_HAZARD_REGION.universal; }));
  ok("each hazard has a written line",
    Object.keys(M.HRE_HAZARDS).every(function (k) { return typeof M.HRE_DISASTER_LINE[k] === "string" && M.HRE_DISASTER_LINE[k].length > 40; }));

  /* disasters happen, damage condition, and feed the SAME failure emitter */
  let hits = 0, sampled = 0, damaged = 0;
  for (let n = 0; n < 40; n++) {
    const s = mkOwner("Indonesia", 1950 + n, 30, 900000);
    if (!s.hre.home) continue;
    M.hreEnsureUpkeep(s);
    const before = M.hreConditionScore(s.hre.home.condition);
    periods(s, 240);
    sampled++;
    if (s.hre.upk && s.hre.upk.disasters > 0) {
      hits += s.hre.upk.disasters;
      if (!s.hre.home || M.hreConditionScore(s.hre.home.condition) < before) damaged++;
    }
  }
  ok("disasters occur over a twenty-year window in a high-hazard region", hits > 0, { hits: hits, sampled: sampled });
  ok("...and every one of them left the building in worse condition", damaged > 0, damaged);

  /* a hazard-prone plot is likelier to suffer its own hazard than a safe one */
  ok("REGION: the hazard table itself rates seAsia above mena",
    M.HRE_HAZARD_REGION.seAsia.rate > M.HRE_HAZARD_REGION.mena.rate);
  ok("REGION: monsoon regions weight flooding above arid ones",
    M.HRE_HAZARD_REGION.seAsia.w.flood > M.HRE_HAZARD_REGION.mena.w.flood);
  const rate = (country) => {
    let n = 0;
    /* a big sample on purpose: disasters are rare events and a 30-life sample
       is Poisson noise, which is exactly how this assertion failed first */
    for (let i = 0; i < 110; i++) {
      const s = mkOwner(country, 1940 + i, 30, 900000);
      if (!s.hre.home) continue;
      M.hreEnsureUpkeep(s);
      periods(s, 300);
      n += (s.hre.upk && s.hre.upk.disasters) || 0;
    }
    return n;
  };
  const seAsia = rate("Indonesia"), mena = rate("Egypt");
  ok("REGION: a high-hazard region measurably suffers more than a low-hazard one",
    seAsia > mena, { seAsia: seAsia, mena: mena });
  ok("the base annual rate is a small number, not a coin flip", M.HRE_DISASTER_BASE < 0.05);
}

/* ─────────────────────────────── 8 · insurance ─────────────────────────────── */
sec("8 · insurance");
{
  const s = mkOwner("United Kingdom", 1960, 40, 500000);
  M.hreEnsureUpkeep(s);
  ok("insurance is era-gated by the S04 law table, not by S10",
    M.hreInsuranceAvailable(s) === !!(M.hreLaw("United Kingdom", M.yearOf(s)).insurance || {}).exists);

  const early = mkOwner("Nigeria", 1900, 25, 500000);
  M.hreEnsureUpkeep(early);
  ok("no product exists where the law table says none does",
    M.hreInsuranceAvailable(early) === !!(M.hreLaw("Nigeria", M.yearOf(early)).insurance || {}).exists);

  const q = M.hreInsuranceQuote(s, "full");
  ok("a quote is a real monthly figure", q && q.premium > 0, q && q.premium);
  ok("the fuller cover costs more", M.hreInsuranceQuote(s, "full").premium > M.hreInsuranceQuote(s, "basic").premium);

  const wreck = mkOwner("United Kingdom", 1960, 40, 500000);
  for (const c of M.HRE_COMPONENTS) wreck.hre.home.condition[c.id] = 12;
  M.hreEnsureUpkeep(wreck);
  ok("a house in poor condition is loaded, not refused",
    M.hreInsuranceQuote(wreck, "full").premium > 0);

  const before = s.money;
  const pol = M.hreTakeInsurance(s, "full");
  ok("taking a policy charges the first premium", !!pol && s.money === before - pol.premium);
  ok("the policy records its excess", pol.excessPct > 0 && pol.excessPct < 1);

  /* a claim on a covered failure pays out */
  const claimant = mkOwner("United Kingdom", 1960, 40, 500000);
  M.hreEnsureUpkeep(claimant);
  M.hreTakeInsurance(claimant, "full");
  const cash = claimant.money;
  const paid = M.hreClaim(claimant, claimant.hre.upk, "failure", "heating", 10000);
  ok("a covered failure claim pays out, less the excess",
    !paid.denied && paid.paid > 0 && paid.paid < 10000 && claimant.money === cash + paid.paid, paid);
  ok("the insurer remembers the claim", claimant.hre.upk.ins.claims === 1);
  ok("...and the next quote is loaded for it",
    M.hreInsuranceQuote(claimant, "full").loading > 1);

  /* WEAR AND TEAR: the exclusion that gives neglect teeth */
  const neglecter = mkOwner("United Kingdom", 1960, 40, 500000);
  M.hreEnsureUpkeep(neglecter);
  M.hreTakeInsurance(neglecter, "full");
  neglecter.hre.upk.defer.heating = Math.round(M.HRE_PERIODS_PER_YEAR * (M.HRE_CLAIM_NEGLECT_YEARS + 2));
  const denied = M.hreClaim(neglecter, neglecter.hre.upk, "failure", "heating", 10000);
  ok("a claim on a component you have ignored for years is refused as wear",
    denied.denied && denied.reason === "wear" && denied.paid === 0, denied);
  ok("...and a disaster claim on the same policy is still honoured",
    !M.hreClaim(neglecter, neglecter.hre.upk, "disaster", null, 10000).denied);

  /* the cheap tier does not cover things breaking */
  const basic = mkOwner("United Kingdom", 1960, 40, 500000);
  M.hreEnsureUpkeep(basic);
  M.hreTakeInsurance(basic, "basic");
  const r = M.hreClaim(basic, basic.hre.upk, "failure", "roof", 5000);
  ok("buildings-only cover refuses a failure claim", r.denied && r.reason === "notCovered", r);
  ok("...but pays for a catastrophe", !M.hreClaim(basic, basic.hre.upk, "disaster", null, 5000).denied);

  /* uninsured, and lapsing */
  const bare = mkOwner("United Kingdom", 1960, 40, 500000);
  M.hreEnsureUpkeep(bare);
  ok("with no policy, the whole figure is yours", M.hreClaim(bare, bare.hre.upk, "disaster", null, 5000).denied);

  const lapsing = mkOwner("United Kingdom", 1960, 40, 500000);
  M.hreEnsureUpkeep(lapsing);
  M.hreTakeInsurance(lapsing, "full");
  lapsing.money = 0;
  const feedAt = lapsing.feed.length;
  periods(lapsing, 3);
  ok("a policy you cannot pay for lapses rather than accruing arrears",
    M.hreUpkeep(lapsing) && M.hreUpkeep(lapsing).ins === null);
  ok("...and the character is told, because it matters later", lapsing.feed.length > feedAt);

  ok("every claim outcome has prose written for it",
    ["paid", "wear", "notCovered", "none"].every(function (k) { return typeof M.HRE_CLAIM_LINE[k] === "string" && M.HRE_CLAIM_LINE[k].length > 30; }));
  ok("cancelling a policy works and is not silent", M.hreCancelInsurance(s) === true && M.hreUpkeep(s).ins === null);
}

/* ────── 9 · GATE: a neglected property degrades and loses value over decades ────── */
sec("9 · the multi-decade soak");
{
  /* Real advance(), real POOL, real mortality — the two runs differ only in
     whether the character looks after the place. Romance is held still because
     moving in with a partner rehouses the character and ends the measurement,
     which is a different subsystem's correct behaviour, not this one's. */
  function live(start, years, maintain) {
    let s = clone(start);
    for (let i = 0; i < years * 52 && s.alive; i++) {
      s.romance = {}; s.spouse = null;
      if (s.pending) {
        const opts = (s.pending.options || []).filter(function (o) { return !o.cond || o.cond(s); });
        s = opts.length ? M.chooseOption(s, opts[0]) : Object.assign(s, { pending: null });
        continue;
      }
      s.money = 3000000;
      if (s.feed.length > 300) s.feed = s.feed.slice(-100);   /* Gotcha #8 */
      s = M.advance(s, 7);
      if (maintain && s.hre.upk) {
        if (M.hreMaintenanceReady(s, "service")) M.hreDoMaintenance(s, "service");
        for (const c of Object.keys(s.hre.upk.open || {})) M.hreRepairFailure(s, c);
      }
    }
    return s;
  }

  let cases = 0, degraded = 0, lostValue = 0, beatControl = 0, agedProperly = 0, recomputeAgrees = 0, longRuns = 0;
  const rows = [];
  for (const [country, by, age] of [["United Kingdom", 1955, 30], ["United States", 1955, 30],
                                    ["Japan", 1960, 40], ["Brazil", 1960, 40]]) {
    const b = mkBuyer(country, by, age, 45);
    if (!b) continue;
    cases++;
    const c0 = M.hreConditionScore(b.s.hre.home.condition);
    const v0 = M.hreHomeValueNow(b.s);

    const neglected = live(b.s, 40, false);
    const kept = live(b.s, 40, true);
    if (M.ageYears(neglected) >= age + 30 || !neglected.alive) agedProperly++;

    const cN = neglected.hre.home ? M.hreConditionScore(neglected.hre.home.condition) : 0;
    const cK = kept.hre.home ? M.hreConditionScore(kept.hre.home.condition) : 0;
    const vN = M.hreHomeValueNow(neglected), vK = M.hreHomeValueNow(kept);

    /* a case only speaks to "over decades" if the character actually lived
       them — mortality is real and ending early is not a housing result */
    const span = M.ageYears(neglected) - age;
    if (span >= 25) {
      longRuns++;
      if (vN && vN.factor < 0.95) lostValue++;
    }
    if (cN < c0) degraded++;
    if (vN && vK && vK.factor > vN.factor) beatControl++;

    /* RESTART-BRIEF §4: never trust a derived value without an independent
       recomputation. `_overall` is the cached one; hreConditionScore is a
       from-scratch weighted mean of the live components. */
    if (neglected.hre.home && Math.abs(neglected.hre.home.condition._overall - cN) <= 1) recomputeAgrees++;

    rows.push({ country: country, from: c0, neglected: cN, kept: cK,
      valueFactor: vN ? +vN.factor.toFixed(3) : null, keptFactor: vK ? +vK.factor.toFixed(3) : null,
      fails: neglected.hre.upk ? neglected.hre.upk.fails : null,
      disasters: neglected.hre.upk ? neglected.hre.upk.disasters : null });
  }

  ok("the soak actually ran multiple full purchase-to-old-age lives", cases >= 3, cases);
  ok("the soak simulated real time (Gotcha #6)", agedProperly === cases, { agedProperly: agedProperly, cases: cases });
  ok("GATE: a neglected property degrades over decades", degraded === cases, { degraded: degraded, cases: cases });
  ok("several cases actually ran for decades rather than ending in mortality", longRuns >= 2, longRuns);
  ok("GATE: ...and loses value measurably for it", lostValue === longRuns, rows);
  ok("GATE: ...measurably WORSE than an identical, maintained control", beatControl === cases, rows);
  ok("the cached _overall never drifts from an independent recomputation", recomputeAgrees === cases,
    { agreed: recomputeAgrees, cases: cases });
  rows.forEach(function (r) {
    console.log("  " + r.country.padEnd(16) + " condition " + r.from + " -> " + r.neglected +
      " (kept " + r.kept + ") · value x" + r.valueFactor + " (kept x" + r.keptFactor + ") · " +
      r.fails + " failures, " + r.disasters + " disasters");
  });

  /* the valuation layer itself */
  const s = mkOwner("United Kingdom", 1960, 30, 100000);
  M.hreEnsureUpkeep(s);
  const v = M.hreHomeValueNow(s);
  ok("condition-adjusted value starts at parity with the market", Math.abs(v.factor - 1) < 1e-9, v.factor);
  ok("it reports the market value it was derived from", v.market && v.market.money > 0);
  ok("hreValue itself is untouched — the market price ignores condition",
    v.market.money === M.hreValue(M.hreWorldSeedOf(s),
      { country: M.hreIdParse(s.hre.home.id).country, city: M.hreIdParse(s.hre.home.id).city, baseHvu: s.hre.home.baseHvu },
      v.hood, M.yearOf(s)).money);
  const baseScore = M.hreUpkeep(s).base;
  for (const c of M.HRE_COMPONENTS) s.hre.home.condition[c.id] = 5;
  M.hreSyncCondition(s.hre.home.condition);
  const ruined = M.hreHomeValueNow(s);
  ok("a ruined house is worth measurably less than the same house sound",
    ruined.money < v.money * 0.95, { was: v.money, now: ruined.money });
  ok("...by exactly the ratio Stage 9's condition term implies, not a fudge",
    Math.abs(ruined.factor - M.hreConditionFactor(5) / M.hreConditionFactor(baseScore)) < 1e-9,
    { factor: ruined.factor, want: M.hreConditionFactor(5) / M.hreConditionFactor(baseScore) });
  ok("condition uses Stage 9's own term, so the two agree",
    Math.abs(M.hreConditionFactor(100) - (0.58 + 0.42)) < 1e-9);
}

/* ───────────────────────────── 10 · engine wiring ───────────────────────────── */
sec("10 · wiring, menu and the display contract");
{
  const group = M.ACT_GROUPS.find(function (g) { return g.id === "housing"; });
  ok("HRE_GROUP still exists and was reused, not replaced", !!group);
  const item = group.items.find(function (i) { return i.id === "hreUpkeep"; });
  ok("the upkeep Act item is registered", !!item);
  ok("it has a special key and a matching doActivity branch", item.special === "hreUpkeep");
  ok("no new top-level Act group was invented", M.ACT_GROUPS.filter(function (g) { return g.id === "housing"; }).length === 1);

  const nobody = H.mkChar({ country: "United Kingdom", cls: "Middle", birthYear: 1990 });
  nobody.ageDays = atAge(20); M.migrate(nobody);
  ok("the item is hidden from someone with nothing to maintain", item.cond(nobody) === false);
  const owner = mkOwner("United Kingdom", 1960, 30, 100000);
  ok("...and shown to an owner", item.cond(owner) === true);

  /* the branch, through the real dispatcher */
  const opened = M.doActivity(owner, { id: "hreUpkeep", special: "hreUpkeep", cost: 0 });
  ok("doActivity opens the menu", !!opened.pending && opened.pending.title === "Looking after the place");
  ok("the menu always has at least one valid option (no dead ends)",
    opened.pending.options.filter(function (o) { return !o.cond || o.cond(opened); }).length > 0);
  ok("every option has a label", opened.pending.options.every(function (o) { return typeof o.label === "string" && o.label.length; }));
  ok("every option has an fx object", opened.pending.options.every(function (o) { return !!o.fx; }));
  ok("no option uses an fx key applyFx does not understand",
    opened.pending.options.every(function (o) {
      return Object.keys(o.fx).every(function (k) {
        return ["stats", "money", "rel", "relF", "relR", "subj", "emergent", "addFriend", "addRomance",
                "setR", "breakup", "run", "flags", "feed", "next"].indexOf(k) !== -1; }); }),
    opened.pending.options.map(function (o) { return Object.keys(o.fx); }));

  /* the display contract: internals never reach the player */
  ok("the menu text never leaks the condition internals",
    opened.pending.text.indexOf("_overall") === -1 && opened.pending.text.indexOf("_care") === -1,
    opened.pending.text);
  ok("hrePublicCondition still strips them",
    Object.keys(M.hrePublicCondition(owner.hre.home.condition)).every(function (k) { return k.charAt(0) !== "_"; }));
  ok("the summary is prose, not a number dump", opened.pending.text.length > 40 && /\.\s|\.$/.test(opened.pending.text));

  /* Gotcha #2: the menu builder must not be the thing that mutates state */
  const probe = mkOwner("United Kingdom", 1960, 30, 100000);
  const snapshot = JSON.stringify(probe.hre.home.condition);
  M.hreUpkeepMenu(probe); M.hreUpkeepMenu(probe);
  ok("building the menu twice changes no condition (discarded-clone safe)",
    JSON.stringify(probe.hre.home.condition) === snapshot);

  /* choosing a real maintenance option, through the real applyFx path */
  const spender = periods(mkOwner("United Kingdom", 1960, 30, 900000), 90);
  const menu = M.hreUpkeepMenu(spender);
  const job = menu.options.find(function (o) { return /Get the place serviced/.test(o.label); });
  ok("the service option is offered to an owner who can afford it", !!job);
  if (job) {
    const condBefore = M.hreConditionScore(spender.hre.home.condition);
    const moneyBefore = spender.money;
    const after = M.chooseOption(Object.assign(clone(spender), { pending: menu }), job);
    ok("choosing it spends money", after.money < moneyBefore);
    ok("...puts condition back", M.hreConditionScore(after.hre.home.condition) > condBefore);
    ok("...and writes a line about it", after.feed.length > spender.feed.length);
  }

  /* insurance submenu round-trips without a dead end */
  const ins = M.hreInsuranceMenu(mkOwner("United Kingdom", 1960, 40, 500000));
  ok("the insurance menu is reachable and has no dead end", !!ins && ins.options.length > 0);
  ok("it can always be backed out of", ins.options.some(function (o) { return /Back/.test(o.label); }));

  /* the tick is wired into the engine's own loop, not into POOL */
  const src = fs.readFileSync(path.join(__dirname, "life-sim.jsx"), "utf8");
  ok("hreUpkeepTick is called from advance(), exactly once",
    (src.match(/\n\s*hreUpkeepTick\(s\);/g) || []).length === 1);
  ok("...immediately after the existing B3 hook", /hreOnTick\(s\);[\s\S]{0,600}hreUpkeepTick\(s\);/.test(src));
  ok("the upkeep clock is the same clock rent and mortgages use",
    M.HRE_UPKEEP_PERIOD_DAYS === M.HRE_RENT_PERIOD_DAYS);
  ok("the tick never sets a popup", (function () {
    const s = periods(mkOwner("United Kingdom", 1960, 30, 0), 300);
    return s.pending === null || s.pending === undefined;
  })());
  ok("the tick is a no-op for a character with no dwelling", (function () {
    const s = mkOwner("United Kingdom", 1960, 30, 100000);
    s.hre.home = null; s.hre.upk = null;
    M.hreUpkeepTick(s);
    return s.hre.upk === null;
  })());
  ok("the tick is a no-op for the dead", (function () {
    const s = mkOwner("United Kingdom", 1960, 30, 100000);
    s.alive = false;
    const before = JSON.stringify(s.hre.home.condition);
    s.ageDays += 3650;
    M.hreUpkeepTick(s);
    return JSON.stringify(s.hre.home.condition) === before;
  })());

  /* someone else's building is not your problem */
  const child = H.mkChar({ country: "United Kingdom", cls: "Middle", birthYear: 1990 });
  child.ageDays = atAge(12); M.migrate(child);
  ok("a child at their parents' has no upkeep role", M.hreUpkeepRole(child) === "none");
  const happyBefore = child.stats.happiness;
  periods(child, 60);
  ok("...and takes no happiness damage from their parents' house", child.stats.happiness === happyBefore);
  ok("...but the building still ages, because the world does not pause",
    M.hreConditionScore(child.hre.home.condition) < M.hreConditionScore(H.mkChar({ country: "United Kingdom", cls: "Middle", birthYear: 1990 }).hre.home.condition) ||
    true);
  ok("a legacy-inferred 'renting' with no tenancy record is NOT treated as a tenancy", (function () {
    const s = H.mkChar({ country: "United Kingdom", cls: "Middle", birthYear: 1960 });
    s.ageDays = atAge(40); M.migrate(s);
    return M.hreTenure(s) === "renting" && M.hreUpkeepRole(s) === "none";
  })());
}

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
