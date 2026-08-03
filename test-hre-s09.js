/* HRE Phase 5 exit gate — S09 state, tenure & residence migration.
   Gate (Part 3 §10.2): "pre-HRE saves migrate into a coherent tenure; shim
   answers equal legacy answers across a full-life soak; save-size assertion
   passes; no call site inverted yet."

   This suite runs against the REAL spliced life-sim.jsx, not a stub, because
   the whole point is whether HRE agrees with the running game. */
const fs = require("fs");
const H = require(require("path").join(__dirname, "harness.js"));
const M = H.M;

let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) pass++; else { fail++; console.log("  FAIL:", n, e !== undefined ? JSON.stringify(e) : ""); } };
const sec = (n) => console.log("\n=== " + n + " ===");

/* The legacy expressions, transcribed here INDEPENDENTLY from the source at
   §4519 / §7896 / §2868. Deliberately not calling the shim — a test that reused
   the implementation would prove nothing. */
const legacyAtParents = (s) =>
  M.ageYears(s) < 26 && !s.flags.movedOut && !s.flags.homeless && !s.flags.cohabiting &&
  !s.spouse && !s.flags.couchAt && (!s.family.mom.deceased || !s.family.dad.deceased);
const legacyHasOwnPlace = (s) => !!s.flags.movedOut || M.ageYears(s) >= 26;
const legacyIsHomeless = (s) => !!s.flags.homeless;

/* ───────────────────────── 1 · schema and creation ───────────────────────── */
sec("1 · schema and creation");
{
  const s = H.mkChar({ country: "United Kingdom", cls: "Middle", birthYear: 1985 });
  ok("newCharacter creates s.hre", !!s.hre);
  ok("schema version is set to the current HRE_STATE_V", s.hre.v === M.HRE_STATE_V, { got: s.hre.v, want: M.HRE_STATE_V });
  ok("world seed is a uint32", Number.isInteger(s.hre.seed) && s.hre.seed >= 0 && s.hre.seed <= 0xffffffff, s.hre.seed);
  ok("tenure starts withParents", s.hre.tenure === "withParents", s.hre.tenure);
  ok("tenure is a legal state", M.HRE_TENURE_STATES.includes(s.hre.tenure));
  ok("a new character is not marked reconstructed", s.hre.recon === false);
  ok("since starts at 0", s.hre.since === 0);
  ok("mem is seeded (S06, added at v2)", !!s.hre.mem && s.hre.mem.ch === null && s.hre.mem.filt === "all", s.hre.mem);
  ok("no unexpected top-level fields (schema stays minimal)",
    Object.keys(s.hre).sort().join() === "home,mem,recon,seed,since,tenure,v", Object.keys(s.hre).sort());
}
{
  /* Phase 6 exit-gate addition: the v1 -> v2 ladder itself, exercised on a
     save shaped exactly like a genuine pre-S06 (Phase 5) save — no `mem`,
     v:1. This is the case the three schema assertions above would silently
     stop testing if they were just relaxed to match v2 instead of proving
     the upgrade path. Constructed independently of hreMigrate's own code. */
  const s = H.mkChar({ country: "United Kingdom", cls: "Middle", birthYear: 1985 });
  const v1Shape = { v: 1, seed: s.hre.seed, tenure: "renting", since: 4321, home: null, recon: false };
  ok("v1 fixture has no mem field (sanity on the fixture itself)", !("mem" in v1Shape));
  s.hre = JSON.parse(JSON.stringify(v1Shape));
  M.migrate(s);
  ok("a genuine v1 save is upgraded to the current schema version", s.hre.v === M.HRE_STATE_V, s.hre.v);
  ok("v1 -> v2 upgrade preserves seed", s.hre.seed === v1Shape.seed);
  ok("v1 -> v2 upgrade preserves tenure", s.hre.tenure === v1Shape.tenure);
  ok("v1 -> v2 upgrade preserves since", s.hre.since === v1Shape.since);
  ok("v1 -> v2 upgrade backfills mem", !!s.hre.mem && s.hre.mem.ch === null && s.hre.mem.filt === "all", s.hre.mem);

  const once = JSON.stringify(s.hre);
  M.migrate(s);
  ok("migrating an already-current save is idempotent", JSON.stringify(s.hre) === once);
}
{
  /* the world seed must be stable across a save/load round trip */
  const s = H.mkChar({ country: "Japan", cls: "Wealthy", birthYear: 1970 });
  const seed = s.hre.seed;
  const reloaded = JSON.parse(JSON.stringify(s));
  M.migrate(reloaded);
  ok("world seed survives save/load unchanged", reloaded.hre.seed === seed, { before: seed, after: reloaded.hre.seed });
  ok("migrate does not overwrite an existing tenure", reloaded.hre.tenure === s.hre.tenure);
  ok("migrate does not flip recon on a lived save", reloaded.hre.recon === false);
}
{
  /* family home crystallisation */
  let made = 0, missing = 0, sizes = [];
  for (const country of ["United Kingdom", "Nigeria", "Japan", "Poland", "Brazil", "Sweden"]) {
    for (const cls of ["Poor", "Working", "Middle", "Wealthy"]) {
      for (const birthYear of [1935, 1975, 2005]) {
        const s = H.mkChar({ country, cls, birthYear });
        if (s.hre.home) { made++; sizes.push(JSON.stringify(s.hre.home).length); } else missing++;
      }
    }
  }
  ok("most characters get a crystallised family home", made > (made + missing) * 0.8, { made, missing });
  ok("family homes are not oversized", Math.max(...sizes) < 4000, Math.max(...sizes));
  console.log("  family homes:", made, "made ·", missing, "unbuilt at birth year · median size",
    sizes.sort((a, b) => a - b)[Math.floor(sizes.length / 2)], "B");
}
{
  /* class must actually steer where you grow up */
  const band = (cls) => {
    const counts = {};
    for (let i = 0; i < 40; i++) {
      const s = H.mkChar({ country: "United States", cls, birthYear: 1980 + (i % 20) });
      if (!s.hre.home) continue;
      const p = M.hreIdParse(s.hre.home.id);
      const hood = M.hreNeighbourhood(s.hre.seed, "United States", p.city, p.hood, 1980);
      if (hood) counts[hood.baseClass] = (counts[hood.baseClass] || 0) + 1;
    }
    return counts;
  };
  const poor = band("Poor"), rich = band("Wealthy");
  const share = (c, keys) => keys.reduce((a, k) => a + (c[k] || 0), 0) / Object.values(c).reduce((a, b) => a + b, 0);
  ok("Poor characters grow up in poorer neighbourhoods",
    share(poor, ["informal", "working"]) > share(rich, ["informal", "working"]),
    { poor: +share(poor, ["informal", "working"]).toFixed(2), rich: +share(rich, ["informal", "working"]).toFixed(2) });
  ok("Wealthy characters grow up in richer neighbourhoods",
    share(rich, ["affluent", "elite"]) > share(poor, ["affluent", "elite"]));
  /* class band is SUPPOSED to be consistent — that is the mechanism. What must
     vary is which hood inside that band, or every Wealthy family in a city would
     be neighbours. */
  const hoods = new Set();
  for (let i = 0; i < 40; i++) {
    const s2 = H.mkChar({ country: "United States", cls: "Wealthy", birthYear: 1980 });
    if (s2.hre.home) hoods.add(M.hreIdParse(s2.hre.home.id).hood);
  }
  ok("families of the same class land in different hoods within the band",
    hoods.size >= 3, [...hoods]);
}

/* ──────────────── 2 · GATE: shim equals legacy across a soak ──────────────── */
sec("2 · shim/legacy equivalence soak");
{
  let steps = 0, lives = 0, mismatchAtParents = 0, mismatchOwnPlace = 0, mismatchHomeless = 0;
  let tenureInvalid = 0, tenureUnreachable = 0, disagree = 0;
  const tenureSeen = {};
  const examples = [];
  const CASES = [
    { country: "United Kingdom", cls: "Working", birthYear: 1950 },
    { country: "United States", cls: "Poor", birthYear: 1975 },
    { country: "Nigeria", cls: "Middle", birthYear: 1990 },
    { country: "Poland", cls: "Wealthy", birthYear: 1965 },
    { country: "Japan", cls: "Working", birthYear: 1940 },
    { country: "Brazil", cls: "Poor", birthYear: 2000 },
    { country: "Sweden", cls: "Middle", birthYear: 1958 },
    { country: "India", cls: "Poor", birthYear: 1985 },
  ];
  for (const c of CASES) {
    const s0 = H.mkChar(c);
    lives++;
    H.runLife(s0, {
      maxSteps: 4200,
      onStep: (s) => {
        steps++;
        if (M.hreAtParents(s) !== legacyAtParents(s)) {
          mismatchAtParents++;
          if (examples.length < 5) examples.push({ what: "atParents", age: M.ageYears(s), flags: { movedOut: !!s.flags.movedOut, homeless: !!s.flags.homeless, cohabiting: !!s.flags.cohabiting, couchAt: !!s.flags.couchAt, spouse: !!s.spouse } });
        }
        if (M.hreHasOwnPlace(s) !== legacyHasOwnPlace(s)) mismatchOwnPlace++;
        if (M.hreIsHomeless(s) !== legacyIsHomeless(s)) mismatchHomeless++;
        const t = M.hreLegacyTenure(s);
        tenureSeen[t] = (tenureSeen[t] || 0) + 1;
        if (!M.HRE_TENURE_STATES.includes(t)) tenureInvalid++;
        if (!M.HRE_TENURE_FROM_LEGACY.includes(t)) tenureUnreachable++;
        if (t === undefined || t === null) disagree++;
        return null;
      },
    });
  }
  ok("hreAtParents equals the legacy predicate at every step", mismatchAtParents === 0, examples);
  ok("hreHasOwnPlace equals the legacy predicate at every step", mismatchOwnPlace === 0, mismatchOwnPlace);
  ok("hreIsHomeless equals the legacy predicate at every step", mismatchHomeless === 0, mismatchHomeless);
  ok("legacy tenure always returns a legal state", tenureInvalid === 0, tenureInvalid);
  ok("migration never emits a tenure unreachable from legacy state", tenureUnreachable === 0, tenureUnreachable);
  ok("tenure is never null or undefined", disagree === 0, disagree);
  ok("the soak actually simulated (Gotcha #6)", steps > 3000 && lives === CASES.length, { steps, lives });
  ok("more than one tenure state was actually reached", Object.keys(tenureSeen).length >= 3, tenureSeen);
  console.log("  " + lives + " lives · " + steps + " steps · tenure distribution:", JSON.stringify(tenureSeen));
}
{
  /* the couchAt decision: it must not strand anyone in lodging for life */
  const s = H.mkChar({ country: "United States", cls: "Poor", birthYear: 1980 });
  s.ageDays = Math.ceil(19 * 365.25) + 1;            /* Gotcha #5 */
  s.flags.couchAt = "bff";
  ok("a 19-year-old couch-surfer reads as lodging", M.hreLegacyTenure(s) === "lodging", M.hreLegacyTenure(s));
  s.ageDays = Math.ceil(40 * 365.25) + 1;
  ok("the same character at 40 is NOT still lodging (the latch does not strand)",
    M.hreLegacyTenure(s) === "renting", M.hreLegacyTenure(s));
  ok("...and the legacy flag is left untouched, since nothing inverts this phase",
    s.flags.couchAt === "bff");
  s.spouse = { name: "Sam" };
  ok("partnership outranks a stale couch flag", M.hreLegacyTenure(s) === "withPartner");
}
{
  /* precedence order */
  const base = () => { const s = H.mkChar({ country: "France", cls: "Middle", birthYear: 1980 }); s.ageDays = Math.ceil(30 * 365.25) + 1; return s; };
  let s = base(); s.flags.prisonUntil = 99999; s.flags.homeless = 1; s.spouse = { name: "X" };
  ok("prison outranks everything", M.hreLegacyTenure(s) === "institutional");
  s = base(); s.flags.homeless = 1; s.spouse = { name: "X" };
  ok("homelessness outranks partnership", M.hreLegacyTenure(s) === "homeless");
  s = base(); s.flags.cohabiting = true;
  ok("cohabiting reads as withPartner", M.hreLegacyTenure(s) === "withPartner");
  s = base(); s.ageDays = Math.ceil(20 * 365.25) + 1;
  ok("a 20-year-old with no flags is withParents", M.hreLegacyTenure(s) === "withParents");
  ok("a 26-year-old with no flags is renting (the unwritten age rule)",
    M.hreLegacyTenure(base()) === "renting");
}

/* ────────────── 3 · GATE: pre-HRE saves migrate coherently ────────────── */
sec("3 · migration of pre-HRE saves");
{
  let n = 0, noHre = 0, badTenure = 0, unreachable = 0, seedUnstable = 0, wrongHome = 0;
  const seen = {};
  for (const c of [{ country: "United Kingdom", cls: "Working", birthYear: 1950 },
                   { country: "Nigeria", cls: "Poor", birthYear: 1985 },
                   { country: "Japan", cls: "Wealthy", birthYear: 1962 },
                   { country: "Poland", cls: "Middle", birthYear: 1970 }]) {
    const s0 = H.mkChar(c);
    const r = H.runLife(s0, { maxSteps: 3000 });
    const lived = r.state;
    /* strip HRE entirely — this is what a pre-HRE save looks like */
    const legacy = JSON.parse(JSON.stringify(lived));
    delete legacy.hre;
    const a = JSON.parse(JSON.stringify(legacy)); M.migrate(a);
    const b = JSON.parse(JSON.stringify(legacy)); M.migrate(b);
    n++;
    if (!a.hre) { noHre++; continue; }
    if (!M.HRE_TENURE_STATES.includes(a.hre.tenure)) badTenure++;
    if (!M.HRE_TENURE_FROM_LEGACY.includes(a.hre.tenure)) unreachable++;
    if (a.hre.seed !== b.hre.seed) seedUnstable++;
    if (a.hre.home !== null) wrongHome++;
    seen[a.hre.tenure] = (seen[a.hre.tenure] || 0) + 1;
    if (a.hre.tenure !== M.hreLegacyTenure(legacy)) badTenure++;
  }
  ok("every pre-HRE save gains an s.hre", noHre === 0, noHre);
  ok("every migrated tenure is legal and matches the legacy flags", badTenure === 0, badTenure);
  ok("migration never emits an unreachable tenure (owning/social/ownOutright)", unreachable === 0, unreachable);
  ok("migrating the same save twice gives the SAME world seed", seedUnstable === 0, seedUnstable);
  ok("migrated saves leave home null rather than inventing one", wrongHome === 0, wrongHome);
  console.log("  migrated", n, "lived saves ·", JSON.stringify(seen));
}
{
  /* hostile inputs migrate must survive */
  const mk = (extra) => Object.assign(H.mkChar({ country: "Spain", cls: "Middle", birthYear: 1980 }), extra);
  let s = mk({}); delete s.hre; M.migrate(s);
  ok("a save with no hre at all migrates", !!s.hre && !!s.hre.tenure);
  s = mk({}); s.hre = {}; M.migrate(s);
  ok("an empty hre object is repaired", s.hre.v === M.HRE_STATE_V && typeof s.hre.seed === "number" && !!s.hre.tenure);
  ok("an empty hre object also gets mem repaired", !!s.hre.mem && s.hre.mem.ch === null && s.hre.mem.filt === "all", s.hre.mem);
  s = mk({}); s.hre = { v: 1, seed: 5, tenure: "nonsense", since: 0, home: null, recon: false }; M.migrate(s);
  ok("an invalid tenure is repaired from the legacy flags", M.HRE_TENURE_STATES.includes(s.hre.tenure), s.hre.tenure);
  s = mk({}); s.hre = { tenure: "renting" }; M.migrate(s);
  ok("a partial hre gains its missing fields", typeof s.hre.seed === "number" && s.hre.since !== undefined && s.hre.home === null);
  s = mk({}); s.hre = { v: 1, seed: "bad", tenure: "renting" }; M.migrate(s);
  ok("a non-numeric seed is repaired", typeof s.hre.seed === "number" && s.hre.seed >= 0);
  ok("repeated migration is idempotent", (() => {
    const x = mk({}); delete x.hre;
    M.migrate(x); const first = JSON.stringify(x.hre);
    M.migrate(x); M.migrate(x);
    return JSON.stringify(x.hre) === first;
  })());
}
{
  /* hreSetTenure is the sole writer */
  const s = H.mkChar({ country: "Italy", cls: "Middle", birthYear: 1990 });
  s.ageDays = Math.ceil(30 * 365.25) + 1;
  ok("setTenure accepts a legal state", M.hreSetTenure(s, "renting") === true && s.hre.tenure === "renting");
  ok("setTenure records when it happened", s.hre.since === s.ageDays);
  ok("setTenure rejects an illegal state", M.hreSetTenure(s, "castle") === false && s.hre.tenure === "renting");
  ok("setTenure can carry a dwelling", M.hreSetTenure(s, "owning", { id: "x" }) && s.hre.home.id === "x");
  ok("setTenure leaves home alone when not supplied", M.hreSetTenure(s, "renting") && s.hre.home.id === "x");
}

/* ─────────────────── 4 · GATE: save-size assertion ─────────────────── */
sec("4 · save size");
{
  const rows = [];
  for (const c of [{ country: "United States", cls: "Middle", birthYear: 1995 },
                   { country: "Nigeria", cls: "Poor", birthYear: 1935 },
                   { country: "Poland", cls: "Wealthy", birthYear: 1965 }]) {
    const r = H.runLife(H.mkChar(c), { maxSteps: 4200 });
    const s = r.state;
    const total = JSON.stringify(s).length;
    const hre = JSON.stringify(s.hre).length;
    rows.push({ total, hre, pct: 100 * hre / total, age: r.finalAge });
  }
  const maxHre = Math.max(...rows.map((r) => r.hre));
  const maxPct = Math.max(...rows.map((r) => r.pct));
  ok("HRE state stays under the 8 KB typical budget (§8.2)", maxHre < 8192, maxHre);
  ok("HRE is a small fraction of the save", maxPct < 5, +maxPct.toFixed(2));
  ok("total save size has not ballooned", Math.max(...rows.map((r) => r.total)) < 320000,
    Math.max(...rows.map((r) => r.total)));
  rows.forEach((r) => console.log("  age " + r.age + " · save " + r.total + " B · hre " + r.hre + " B (" + r.pct.toFixed(2) + "%)"));
}

/* ───────────── 5 · GATE: no call site inverted yet ───────────── */
sec("5 · nothing inverted");
{
  const src = fs.readFileSync(require("path").join(__dirname, "life-sim.jsx"), "utf8");
  /* the legacy predicates must still be present, verbatim, at their call sites */
  const parentsRoomPred = 'ageYears(s) < 26 && !s.flags.movedOut && !s.flags.homeless && !s.flags.cohabiting && !s.spouse && !s.flags.couchAt';
  ok("the parentsroom Act-item predicate is untouched", src.includes(parentsRoomPred), null);
  /* count OUTSIDE the HRE block — the shim transcribes the same expression, so
     counting the whole file would include it and mask an inversion. */
  const legacyOnly = src.slice(src.indexOf("/* \u2550".repeat(1) + "\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 ENGINE"));
  ok("both duplicate copies of the parentsroom rule still exist",
    (legacyOnly.match(/!s\.flags\.couchAt && \(!s\.family\.mom\.deceased/g) || []).length === 2,
    (legacyOnly.match(/!s\.flags\.couchAt && \(!s\.family\.mom\.deceased/g) || []).length);
  ok("the home-tab header rule is untouched", src.includes('s.flags.movedOut || age >= 26 ? "Your place"'));
  ok("STREET_GROUP still gates on the raw flag", src.includes('cond: (s) => !!s.flags.homeless'));
  ok("HOME_GROUP still gates on the raw flag", src.includes('!inPrison(s) && !s.flags.homeless'));
  /* and no legacy call site has started calling the shim */
  const shimCalls = (src.match(/hreAtParents\(|hreHasOwnPlace\(|hreIsHomeless\(/g) || []).length;
  ok("the shim is defined but not yet called by any call site", shimCalls === 3, shimCalls);
  /* only two engine functions were touched */
  ok("hreInit is wired into exactly one place", (src.match(/hreInit\(/g) || []).length === 2);
  ok("hreMigrate is called from migrate() and hreSetTenure only",
    (src.match(/hreMigrate\(s\);/g) || []).length === 2);
}

/* ─── 6 · the two §B2.4 decisions, pinned to explicit legacy states ───
   Phase 0 catalogued two defects in the legacy residence model and Phase 5 had
   to decide what to do about each. These assertions are the decisions: if
   someone later reorders hreLegacyTenure, they fail loudly rather than quietly
   stranding characters. */
sec("6 · B2.4 decisions");
{
  const at = (age) => Math.ceil(age * 365.25) + 1;      /* Gotcha #5 */
  const scenarios = [
    ["child at home",            (s) => { s.ageDays = at(9); },                                    "withParents"],
    ["teen couch-surfing",       (s) => { s.ageDays = at(17); s.flags.couchAt = "bff"; },           "lodging"],
    ["homeless teen",            (s) => { s.ageDays = at(16); s.flags.homeless = 4000; },           "homeless"],
    ["moved out at 20",          (s) => { s.ageDays = at(20); s.flags.movedOut = true; },           "renting"],
    ["cohabiting at 22",         (s) => { s.ageDays = at(22); s.flags.cohabiting = true; },         "withPartner"],
    ["married at 30",            (s) => { s.ageDays = at(30); s.spouse = { name: "Sam" }; },        "withPartner"],
    ["40 with no flags at all",  (s) => { s.ageDays = at(40); },                                    "renting"],
    ["in prison",                (s) => { s.ageDays = at(35); s.flags.prisonUntil = 9e8; },         "institutional"],
    ["homeless AND imprisoned",  (s) => { s.ageDays = at(35); s.flags.homeless = 1; s.flags.prisonUntil = 9e8; }, "institutional"],
    ["stale couchAt at 45",      (s) => { s.ageDays = at(45); s.flags.couchAt = "bff"; },           "renting"],
    ["couchAt AND married",      (s) => { s.ageDays = at(30); s.flags.couchAt = "bff"; s.spouse = { name: "Kit" }; }, "withPartner"],
  ];
  for (const [label, mutate, expected] of scenarios) {
    const s = H.mkChar({ country: "Poland", cls: "Working", birthYear: 1970 });
    delete s.hre;
    mutate(s);
    M.migrate(s);
    ok("'" + label + "' migrates to " + expected, s.hre.tenure === expected, { got: s.hre.tenure });
  }

  /* DECISION 1: couchAt is evaluated LOW, so a never-cleared flag cannot strand
     a character in `lodging` for the rest of their life. */
  ok("decision 1 — a stale couchAt no longer strands anyone in lodging", (() => {
    const s = H.mkChar({ country: "Poland", cls: "Working", birthYear: 1970 });
    delete s.hre; s.ageDays = at(45); s.flags.couchAt = "bff"; M.migrate(s);
    return s.hre.tenure !== "lodging";
  })());
  ok("decision 1 — but couchAt still means lodging when nothing else applies", (() => {
    const s = H.mkChar({ country: "Poland", cls: "Working", birthYear: 1970 });
    delete s.hre; s.ageDays = at(19); s.flags.couchAt = "bff"; M.migrate(s);
    return s.hre.tenure === "lodging";
  })());
  ok("decision 1 — the legacy flag itself is NOT cleared (that is Phase 7)", (() => {
    const s = H.mkChar({ country: "Poland", cls: "Working", birthYear: 1970 });
    delete s.hre; s.ageDays = at(45); s.flags.couchAt = "bff"; M.migrate(s);
    return s.flags.couchAt === "bff";
  })());

  /* DECISION 2: the unwritten age-26 rule is reproduced, then superseded by an
     explicit tenure. Renting, never owning — a migrated save must never be
     silently handed an asset it did not earn. */
  ok("decision 2 — the age-26 rule is reproduced exactly at the boundary", (() => {
    const mk = (age) => { const s = H.mkChar({ country: "Italy", cls: "Middle", birthYear: 1970 }); delete s.hre; s.ageDays = at(age); M.migrate(s); return s.hre.tenure; };
    return mk(25) === "withParents" && mk(26) === "renting";
  })());
  ok("decision 2 — a migrated adult rents, never owns", (() => {
    for (const age of [26, 35, 50, 70]) {
      const s = H.mkChar({ country: "Italy", cls: "Wealthy", birthYear: 1930 });
      delete s.hre; s.ageDays = at(age); M.migrate(s);
      if (s.hre.tenure !== "renting") return false;
    }
    return true;
  })());
  ok("prison outranks every other signal", (() => {
    const s = H.mkChar({ country: "Italy", cls: "Middle", birthYear: 1970 });
    delete s.hre; s.ageDays = at(30);
    s.flags.homeless = 1; s.flags.cohabiting = true; s.flags.couchAt = "x"; s.spouse = { name: "Q" };
    s.flags.prisonUntil = 9e8; M.migrate(s);
    return s.hre.tenure === "institutional";
  })());
  ok("homelessness outranks partnership", (() => {
    const s = H.mkChar({ country: "Italy", cls: "Middle", birthYear: 1970 });
    delete s.hre; s.ageDays = at(30); s.flags.homeless = 1; s.spouse = { name: "Q" }; M.migrate(s);
    return s.hre.tenure === "homeless";
  })());
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
