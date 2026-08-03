/* HRE Phase 6 exit gate — S06 Marketplace, Channels & Listings, plus the
   minimal S12 wiring that ships alongside it (hreHome/hreMarket Act items).

   Gate (Part 1 §3.4 S06 + Part 2 §4.7 + Part 3 phasing): listings materialise
   deterministically from the lattice without being stored; search & filter
   respect era-appropriate channels with correct CE onset years; a browse is
   bounded (HRE_SCAN_CAP) regardless of market emptiness; disclosure at
   listing level shows only `open`-tier defects (Phase 7's viewings/surveys
   own the rest); the Act-sheet wiring produces zero-dead-end popups and does
   not fall into the discarded-clone trap (Gotcha #2) when writing s.hre.mem.

   This suite runs against the REAL spliced life-sim.jsx, not a stub — S06
   depends on S03/S04 (law, geography) and S05 (valuation), and the whole
   point is whether the marketplace agrees with the running game, not with an
   isolated copy of itself. */
const H = require(require("path").join(__dirname, "harness.js"));
const M = H.M;

let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) pass++; else { fail++; console.log("  FAIL:", n, e !== undefined ? JSON.stringify(e) : ""); } };
const sec = (n) => console.log("\n=== " + n + " ===");

const mkAt = (country, birthYear, ageYears, cls) => {
  const s = H.mkChar({ country, cls: cls || "Middle", birthYear });
  s.ageDays = Math.ceil(ageYears * 365.25) + 1;
  M.migrate(s);
  return s;
};

/* ───────────────────────────── 1 · schema ───────────────────────────── */
sec("1 · s.hre.mem schema");
{
  const s = H.mkChar({ country: "United Kingdom", cls: "Middle", birthYear: 1990 });
  ok("newCharacter seeds s.hre.mem", !!s.hre.mem && typeof s.hre.mem === "object", s.hre.mem);
  ok("mem starts with ch:null", s.hre.mem.ch === null);
  ok("mem starts with filt:'all'", s.hre.mem.filt === "all");

  let t = H.mkChar({}); delete t.hre; M.migrate(t);
  ok("a save missing hre entirely gets mem on migrate", !!t.hre.mem && t.hre.mem.filt === "all");

  t = H.mkChar({}); t.hre.mem = undefined; M.migrate(t);
  ok("a v2 save with mem stripped is repaired, not crashed", !!t.hre.mem && t.hre.mem.ch === null);

  t = H.mkChar({}); t.hre.mem = { ch: "portal" }; M.migrate(t);
  ok("a partial mem gains its missing filt field", t.hre.mem.ch === "portal" && t.hre.mem.filt === "all");
}

/* ─────────────────────────── 2 · channels ─────────────────────────── */
sec("2 · channel onset years and ordering");
{
  ok("HRE_CHANNELS has the 6 documented channels",
    M.HRE_CHANNELS.map((c) => c.id).sort().join() === "agent,app,notice,paper,portal,word",
    M.HRE_CHANNELS.map((c) => c.id));

  ok("word of mouth is available from year 0 in any development band",
    M.hreChannelAvailable(M.hreChannel("word"), "Nigeria", 1));

  ok("app channel is NOT available in a high-dev country before its onset (2010)",
    !M.hreChannelAvailable(M.hreChannel("app"), "United States", 2009));
  ok("app channel IS available in a high-dev country the year after onset",
    M.hreChannelAvailable(M.hreChannel("app"), "United States", 2012));

  ok("portal channel lags in a low-dev country vs a high-dev one",
    M.hreChannelFrom(M.hreChannel("portal"), "Nigeria") > M.hreChannelFrom(M.hreChannel("portal"), "United States"));

  const chansUS2020 = M.hreChannels("United States", 2020);
  ok("hreChannels returns newest-first",
    chansUS2020[0].id === "app", chansUS2020.map((c) => c.id));
  ok("word of mouth is still present in a 2020 list (never disappears)",
    chansUS2020.some((c) => c.id === "word"));

  const best1900 = M.hreBestChannel("United States", 1900);
  ok("in 1900 the best available channel is not app/portal/agent",
    !["app", "portal", "agent"].includes(best1900.id), best1900.id);

  const best2020 = M.hreBestChannel("United States", 2020);
  ok("in 2020 US the best channel is app", best2020.id === "app", best2020.id);
}

/* ───────────────────────── 3 · search determinism & bounds ───────────────────────── */
sec("3 · hreSearch determinism and bounds");
{
  const s = mkAt("United Kingdom", 1985, 30);
  const seed = s.hre.seed;
  const year = M.yearOf(s);
  const params = { country: "United Kingdom", city: 0, year, dayOfYear: M.hreDayOfYear(s), ctx: M.hreSearchCtx(s) };

  const a = M.hreSearch(seed, params);
  const b = M.hreSearch(seed, params);
  ok("identical params produce an identical result (deterministic)",
    JSON.stringify(a.listings.map((l) => l.id)) === JSON.stringify(b.listings.map((l) => l.id)));

  ok("scanned never exceeds HRE_SCAN_CAP", a.scanned <= M.HRE_SCAN_CAP, a.scanned);
  ok("listings.length never exceeds the requested/channel limit",
    a.listings.length <= (params.limit || a.channel.breadth));
  ok("built <= scanned (can't materialise more than was scanned)", a.built <= a.scanned);
  ok("listings.length <= built", a.listings.length <= a.built);

  const differentSeed = (seed ^ 0xdeadbeef) >>> 0;
  const c = M.hreSearch(differentSeed, params);
  ok("a different world seed produces a different listing set",
    JSON.stringify(a.listings.map((l) => l.id)) !== JSON.stringify(c.listings.map((l) => l.id)));
}

/* ─────────────────────── 4 · filters ─────────────────────── */
sec("4 · filters");
{
  const s = mkAt("United States", 1980, 35);
  const seed = s.hre.seed;
  const year = M.yearOf(s);
  const base = { country: "United States", city: 0, year, dayOfYear: 0, ctx: M.hreSearchCtx(s) };

  const rentOnly = M.hreSearch(seed, { ...base, filter: "rent" });
  ok("rent filter returns only rent listings",
    rentOnly.listings.every((l) => l.tenure === "rent"), rentOnly.listings.map((l) => l.tenure));

  const saleOnly = M.hreSearch(seed, { ...base, filter: "sale" });
  ok("sale filter returns only sale listings",
    saleOnly.listings.every((l) => l.tenure === "sale"), saleOnly.listings.map((l) => l.tenure));

  const family = M.hreSearch(seed, { ...base, filter: "family" });
  ok("family filter returns only 2+ bedroom listings",
    family.listings.every((l) => l.bp.dims.bedrooms >= 2));

  ok("HRE_FILTERS has the 5 documented filters",
    M.HRE_FILTERS.map((f) => f.id).sort().join() === "afford,all,family,rent,sale");
}

/* ───────────────────── 5 · listing shape & disclosure ───────────────────── */
sec("5 · listing shape and disclosure ladder");
{
  const s = mkAt("Japan", 1970, 40);
  const seed = s.hre.seed;
  const year = M.yearOf(s);
  const res = M.hreSearch(seed, { country: "Japan", city: 0, year, dayOfYear: 0, ctx: M.hreSearchCtx(s) });
  ok("at least one listing materialised for a sanity country/era", res.listings.length > 0, res);

  if (res.listings.length) {
    const l = res.listings[0];
    for (const field of ["id", "title", "blurb", "asking", "tenure", "address", "defects", "value", "bp"]) {
      ok("listing has field: " + field, l[field] !== undefined, l);
    }
    ok("asking price is a positive number", typeof l.asking === "number" && l.asking > 0, l.asking);
    ok("tenure is sale or rent", l.tenure === "sale" || l.tenure === "rent", l.tenure);

    /* Disclosure: a listing must show only 'open'-tier defects, never
       apparent/technical/latent — that's Phase 7's viewings/surveys job. */
    const allOpen = M.hreVisibleDefects(l.bp.defects, "listing");
    ok("listing defects match exactly the 'open' disclosure tier",
      l.defects.length === allOpen.length &&
      l.defects.every((d) => allOpen.some((o) => o.id === d.id)),
      { shown: l.defects.map((d) => d.id), open: allOpen.map((d) => d.id) });
    ok("no apparent/technical/latent defect ever leaks into a listing",
      l.bp.defects.filter((d) => d.disclosure !== "open").every((hidden) =>
        !l.defects.some((shown) => shown.id === hidden.id)));
  }
}

/* ───────────────────── 6 · CE consistency spot checks ───────────────────── */
sec("6 · country + era consistency");
{
  const early = mkAt("United Kingdom", 1900, 25);   // -> year 1925
  const resEarly = M.hreSearch(early.hre.seed, {
    country: "United Kingdom", city: 0, year: M.yearOf(early), dayOfYear: 0, ctx: M.hreSearchCtx(early) });
  ok("1925 UK market never offers the app channel",
    resEarly.channel.id !== "app");
  ok("1925 UK market never offers the portal channel",
    resEarly.channel.id !== "portal");

  const modern = mkAt("United Kingdom", 1995, 28);  // -> year 2023
  const resModern = M.hreSearch(modern.hre.seed, {
    country: "United Kingdom", city: 0, year: M.yearOf(modern), dayOfYear: 0, ctx: M.hreSearchCtx(modern) });
  ok("2023 UK best-channel search resolves to app or portal",
    ["app", "portal"].includes(resModern.channel.id), resModern.channel.id);

  if (resEarly.listings.length) {
    const amenIds = new Set(M.HRE_AMENITIES.map((a) => a.id));
    const bad = resEarly.listings.find((l) =>
      l.bp.amenities.internet && l.bp.amenities.internet.has && amenIds.has("internet"));
    ok("no 1925 listing's blueprint has internet", !bad, bad && bad.id);
  }
}

/* ───────────────── 7 · engine wiring: ACT_GROUPS + doActivity ───────────────── */
sec("7 · engine wiring");
{
  ok("HRE_GROUP is registered in ACT_GROUPS",
    M.ACT_GROUPS.some((g) => g.items && g.items.some((i) => i.special === "hreHome")));
  const group = M.ACT_GROUPS.find((g) => g.items && g.items.some((i) => i.special === "hreMarket"));
  ok("hreMarket item exists in some registered group", !!group);
  if (group) {
    const item = group.items.find((i) => i.special === "hreMarket");
    ok("hreMarket item has minAge gating", typeof item.minAge === "number", item.minAge);
  }

  const s = mkAt("United States", 1985, 20);
  const r1 = M.doActivity(s, { special: "hreHome", cost: 0 });
  ok("doActivity(hreHome) returns a valid pending popup", !!r1.pending && !!r1.pending.options);
  ok("hreHome popup has >=1 always-valid option (no dead end)",
    r1.pending.options.filter((o) => !o.cond || o.cond(r1)).length >= 1);

  const s2 = mkAt("United States", 1985, 20);
  const r2 = M.doActivity(s2, { special: "hreMarket", cost: 0 });
  ok("doActivity(hreMarket) returns a valid pending popup", !!r2.pending && !!r2.pending.options);
  ok("hreMarket popup has >=1 always-valid option (no dead end)",
    r2.pending.options.filter((o) => !o.cond || o.cond(r2)).length >= 1);

  /* Gotcha #2 — the discarded-clone trap. hreMarket's own branch writes
     s.hre.mem directly onto the engine's draft, specifically to avoid this.
     Prove it: mem must exist on the object doActivity actually returns. */
  ok("s.hre.mem survives the hreMarket dispatch (not lost to a discarded clone)",
    !!r2.hre && !!r2.hre.mem, r2.hre && r2.hre.mem);

  /* Selecting a channel option must persist mem.ch onto the SAME draft when
     the option's fx.run fires — simulate one full option select. */
  const chOpt = r2.pending.options.find((o) => o.label && o.label !== "Not today");
  ok("hreMarket menu offers at least one real channel option", !!chOpt);
  if (chOpt && chOpt.fx && chOpt.fx.run) {
    chOpt.fx.run(r2);
    ok("selecting a channel writes s.hre.mem.ch on the live draft",
      typeof r2.hre.mem.ch === "string", r2.hre.mem.ch);
    ok("selecting a channel opens a browse-level pending (not left on the market menu)",
      !!r2.pending && r2.pending.title !== "What's on the market");
  }
}

/* ───────────────────── 8 · zero-dead-end soak across eras ───────────────────── */
sec("8 · zero-dead-end soak");
{
  const cases = [
    ["United States", 1930, 22], ["United Kingdom", 1965, 30], ["Japan", 1990, 45],
    ["Nigeria", 1975, 28], ["Brazil", 2005, 33], ["Germany", 1948, 50],
  ];
  let dead = 0, crashes = 0, opened = 0;
  for (const [country, birthYear, age] of cases) {
    try {
      const s = mkAt(country, birthYear, age);
      for (const special of ["hreHome", "hreMarket"]) {
        let cur = M.doActivity(H.mkChar ? s : s, { special, cost: 0 });
        opened++;
        let depth = 0;
        while (cur.pending && depth < 6) {
          const valid = cur.pending.options.filter((o) => !o.cond || o.cond(cur));
          if (!valid.length) { dead++; break; }
          const choice = valid[Math.floor(Math.random() * valid.length)];
          if (choice.fx && choice.fx.run) { cur.pending = null; choice.fx.run(cur); }
          else { cur.pending = null; }
          depth++;
        }
      }
    } catch (e) { crashes++; console.log("  CRASH:", country, birthYear, age, e.message); }
  }
  ok("no crashes across 6 country/era combinations x 2 entry points", crashes === 0, crashes);
  ok("no dead-end popups encountered walking the menus", dead === 0, dead);
  ok("menus actually opened (sanity — not silently skipped)", opened === cases.length * 2, opened);
}

/* ───────────────────── 9 · coverage diagnostic ───────────────────── */
sec("9 · hreMarketCoverage diagnostic");
{
  const countries = Object.keys(M.COUNTRIES);
  const cov = M.hreMarketCoverage(countries);
  ok("coverage report covers all 41 countries", cov.rows.length === 41, cov.rows.length);
  ok("every row has a channel resolved for every sample year",
    cov.rows.every((r) => Object.keys(r.levels).length === cov.years.length));
  ok("tally sums to countries x years", Object.values(cov.tally).reduce((a, b) => a + b, 0) === 41 * cov.years.length);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
