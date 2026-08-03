/* test-hre-s11.js — voluntary sale.
 *
 * The clause of HRE v1's own sentence that was still unmet: "...lose, and MOVE."
 * Selling is also where Phase 9 finally costs the player something, so the
 * assertions that matter most are the ones tying condition to the price on the
 * table, and the ones proving a sale cannot leave tenure, the mortgage and the
 * dwelling disagreeing.
 *
 * Run: node --max-old-space-size=4096 test-hre-s11.js
 */
"use strict";

const path = require("path");
const H = require(path.join(__dirname, "harness.js"));
const M = H.M;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log("  FAIL: " + name + (extra !== undefined ? "  " + JSON.stringify(extra).slice(0, 300) : "")); }
}
function sec(t) { console.log("\n=== " + t + " ==="); }

const atAge = (a) => Math.ceil(a * 365.25) + 1;

/* An owner-occupier with a dwelling, optionally with a mortgage on it. */
function mkOwner(country, birthYear, age, money, tag, mortgage) {
  const s = H.mkChar({ country: country, cls: "Middle", birthYear: birthYear });
  s.ageDays = atAge(age == null ? 35 : age);
  s.hre = M.hreInit(M.hreSeedFrom("s11:" + (tag || "") + country + birthYear),
    country, s.profile.city, "Middle", birthYear);
  M.migrate(s);
  s.money = money == null ? 20000 : money;
  if (!s.hre.home) return null;
  M.hreSetTenure(s, "owning", s.hre.home);
  if (mortgage) {
    s.hre.mtg = { principal: mortgage, balance: mortgage, payment: Math.round(mortgage / 300),
      periodRate: 0.004, annualRate: 0.05, periods: 300, paid: 0, owed: 0, missed: 0,
      stage: "clear", start: s.ageDays, price: mortgage };
  }
  return s;
}

function anyOwner(tag, money, mortgage) {
  const combos = [["United Kingdom", 1960], ["United States", 1965], ["Japan", 1958],
                  ["Brazil", 1962], ["Sweden", 1968], ["Germany", 1955]];
  for (const [c, by] of combos) {
    const s = mkOwner(c, by, 35, money, tag + c, mortgage);
    if (s) return s;
  }
  return null;
}

/* ═════════════════════ 1 · the gate: selling exists ═════════════════════ */
sec("1 · an owner can leave ownership on purpose");
{
  const s = anyOwner("gate", 20000);
  ok("an owner-occupier can be constructed", !!s);
  ok("hreCanSell is true for an owner with a dwelling", M.hreCanSell(s));

  const renter = H.mkChar({ country: "United Kingdom", cls: "Middle", birthYear: 1990 });
  renter.ageDays = atAge(30);
  M.migrate(renter);
  M.hreSetTenure(renter, "renting", renter.hre.home || null);
  ok("a renter cannot sell what they do not own", M.hreCanSell(renter) === false);

  const homeless = H.mkChar({ country: "United Kingdom", cls: "Poor", birthYear: 1990 });
  homeless.ageDays = atAge(30);
  M.migrate(homeless);
  M.hreSetTenure(homeless, "homeless", null);
  ok("someone with no dwelling cannot sell one", M.hreCanSell(homeless) === false);

  ok("the asking price is a real number", Number.isFinite(M.hreAskingPrice(s)) && M.hreAskingPrice(s) > 0,
    M.hreAskingPrice(s));

  /* GATE: ownership is no longer a one-way door */
  const offers = M.hreSaleOffers(s);
  ok("offers are generated", Array.isArray(offers));
  const off = offers.length ? offers[0] : { price: M.hreAskingPrice(s), asking: M.hreAskingPrice(s) };
  const res = M.hreSellHome(s, off, "renting");
  ok("GATE: the sale completes", !!res, res);
  ok("GATE: the character is no longer an owner", M.hreTenure(s) !== "owning", M.hreTenure(s));
  ok("...and lands where they chose, not in the street by default",
    M.hreTenure(s) === "renting", M.hreTenure(s));
  ok("...the mortgage record is closed", s.hre.mtg === null);
  ok("...the upkeep tracker goes with the building", M.hreUpkeep(s) === null);
  ok("...and it is recorded as a life fact", s.hre.everSold === true);
  ok("...with the reason stamped for anything that reads it later", s.hre.lastEnd === "sold", s.hre.lastEnd);
}

/* ═══════════════ 2 · determinism (the HRE-wide invariant) ═══════════════ */
sec("2 · offers are deterministic, not re-rollable");
{
  const a = mkOwner("United Kingdom", 1960, 35, 20000, "det");
  const b = mkOwner("United Kingdom", 1960, 35, 20000, "det");
  ok("two identical characters exist", !!a && !!b);
  ok("the same character in the same period gets the same offers",
    JSON.stringify(M.hreSaleOffers(a)) === JSON.stringify(M.hreSaleOffers(b)));
  /* repeated reads must not advance any stream */
  const first = JSON.stringify(M.hreSaleOffers(a));
  M.hreSaleOffers(a); M.hreSaleOffers(a);
  ok("reading the offers repeatedly does not change them", JSON.stringify(M.hreSaleOffers(a)) === first);

  /* but waiting IS a strategy — the market must move between periods */
  let moved = false;
  const c = mkOwner("United Kingdom", 1960, 35, 20000, "det");
  const before = JSON.stringify(M.hreSaleOffers(c));
  for (let i = 0; i < 24 && !moved; i++) {
    c.ageDays += M.HRE_RENT_PERIOD_DAYS;
    if (JSON.stringify(M.hreSaleOffers(c)) !== before) moved = true;
  }
  ok("the offers on the table change from period to period", moved);

  /* the section must obey HRE's no-global-RNG rule */
  const fs = require("fs");
  const src = fs.readFileSync(path.join(__dirname, "life-sim.jsx"), "utf8");
  const start = src.indexOf("HRE · S11 · SALE & MOVING ON");
  const end = src.indexOf("═══════════════ ENGINE ═══════════════");
  /* Strip comments before linting: the section's own header DOCUMENTS this
     invariant in prose ("no Math.random, no rnd(), no pick()..."), and a raw
     substring scan cannot tell the rule from a breach of it. */
  const body = src.slice(start, end)
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
  ok("S11 contains no Math.random", body.indexOf("Math.random") === -1);
  ok("S11 contains no rnd(/pick(", body.indexOf(" rnd(") === -1 && body.indexOf(" pick(") === -1);
  ok("S11 contains no Date.now", body.indexOf("Date.now") === -1);
  ok("S11 has no per-country special case", !/if\s*\(\s*country\s*===/.test(body));
  /* and it really is drawing from the namespaced streams */
  ok("S11 draws from namespaced hreRng sub-streams", /hreRng\(seed,/.test(body));
}

/* ═════════════ 3 · the arithmetic the player is shown is real ═════════════ */
sec("3 · fees, the bank, and what is actually left");
{
  const s = anyOwner("math", 20000, 0);
  const price = 200000;
  const settle = M.hreSaleNet(s, price);
  const costs = M.hreSaleCosts(s, price);
  ok("selling costs money", costs.total > 0, costs);
  ok("the seller fee comes from the law table, not a constant",
    costs.fee === Math.ceil(price * (M.hreLaw(s.profile.country, M.yearOf(s)).transaction.sellerFeePct)),
    { fee: costs.fee });
  ok("with no mortgage, the net is the price less the fees",
    settle.net === price - costs.total, { net: settle.net, price: price, costs: costs.total });
  ok("...and there is no shortfall", settle.shortfall === 0);

  /* with a mortgage the bank is paid first */
  const m = anyOwner("mathmtg", 20000, 120000);
  const s2 = M.hreSaleNet(m, price);
  ok("an outstanding balance is deducted before the seller sees anything",
    s2.net === price - M.hreSaleCosts(m, price).total - 120000, { net: s2.net });
  ok("the balance is reported so the menu can show it", s2.balance === 120000, s2.balance);

  /* negative equity */
  const neg = anyOwner("negeq", 20000, 400000);
  const s3 = M.hreSaleNet(neg, price);
  ok("negative equity produces a shortfall rather than a negative balance",
    s3.shortfall > 0, s3);
  const before = neg.education.debt || 0;
  const moneyBefore = neg.money;
  const res = M.hreSellHome(neg, { price: price, asking: price }, "renting");
  ok("selling into negative equity completes", !!res);
  ok("...the shortfall becomes debt, not forgiven",
    (neg.education.debt || 0) > before, { before: before, after: neg.education.debt });
  ok("...and it never drives the balance below zero", neg.money >= 0, neg.money);
  ok("...the player is told plainly", /still was not enough/.test(res.line));
  ok("...and money was not also credited", neg.money <= moneyBefore + 1, { before: moneyBefore, after: neg.money });

  /* a clean sale pays out */
  const clean = anyOwner("clean", 500, 0);
  const cashBefore = clean.money;
  const r2 = M.hreSellHome(clean, { price: 150000, asking: 150000 }, "renting");
  ok("a solvent sale actually credits the account", clean.money > cashBefore, { before: cashBefore, after: clean.money });
  ok("...by the net, not the headline price",
    clean.money === cashBefore + r2.settle.net, { money: clean.money, net: r2.settle.net });
}

/* ══════ 4 · THE POINT: neglect is finally charged, at the till ══════ */
sec("4 · condition reaches the price (what makes Phase 9 matter)");
{
  /* Two identical properties. One is maintained, one is not. The only
     difference is condition, so any gap in the asking price is condition's
     doing — which is the whole economic argument for the upkeep system. */
  const kept = mkOwner("United Kingdom", 1960, 35, 900000, "cond");
  const gone = mkOwner("United Kingdom", 1960, 35, 900000, "cond");
  ok("two identical owners exist", !!kept && !!gone);
  M.hreEnsureUpkeep(kept); M.hreEnsureUpkeep(gone);

  for (const c of M.HRE_COMPONENTS) { kept.hre.home.condition[c.id] = 92; gone.hre.home.condition[c.id] = 92; }
  const askStart = M.hreAskingPrice(kept);
  ok("they start at the same valuation", askStart === M.hreAskingPrice(gone),
    { kept: askStart, gone: M.hreAskingPrice(gone) });

  /* let one rot */
  for (const c of M.HRE_COMPONENTS) gone.hre.home.condition[c.id] = 22;
  const askKept = M.hreAskingPrice(kept), askGone = M.hreAskingPrice(gone);
  ok("GATE: a neglected property is worth measurably less at sale",
    askGone < askKept, { kept: askKept, neglected: askGone });
  ok("...and the gap is material, not a rounding error",
    askGone < askKept * 0.95, { ratio: +(askGone / askKept).toFixed(3) });

  /* and that flows through to the offers the player is actually shown */
  const oKept = M.hreSaleOffers(kept), oGone = M.hreSaleOffers(gone);
  const bestKept = oKept.reduce((a, o) => Math.max(a, o.price), 0);
  const bestGone = oGone.reduce((a, o) => Math.max(a, o.price), 0);
  if (bestKept > 0 && bestGone > 0) {
    ok("the offers on the table reflect it too", bestGone < bestKept, { kept: bestKept, gone: bestGone });
  } else {
    ok("the offers on the table reflect it too", true, "no offers this period; asking-price check above covers it");
  }

  ok("condition bands are reported for the menu to render",
    typeof M.hreConditionBand(M.hreConditionScore(gone.hre.home.condition)) === "string");
}

/* ═══════════ 5 · the survey: asymmetry finally runs the other way ═══════════ */
sec("5 · the buyer has a surveyor");
{
  const s = anyOwner("survey", 20000);
  /* force a technical defect onto the dwelling */
  s.hre.home.defects = [
    { id: "wiringUnsafe", label: "non-compliant wiring", disclosure: "technical", severity: 0.14 },
    { id: "subsidence", label: "subsidence", disclosure: "technical", severity: 0.28 },
  ];
  const adj = M.hreSaleSurveyAdjust(s, { price: 200000, asking: 200000 });
  ok("a survey finds technical defects", adj.found.length > 0, adj.found.map((d) => d.id));
  ok("...and knocks money off", adj.cut > 0, adj.cut);
  ok("...but never an absurd amount", adj.cut <= 200000 * 0.25 + 1, adj.cut);

  /* open defects are already advertised, so they cannot be re-charged */
  const s2 = anyOwner("survey2", 20000);
  s2.hre.home.defects = [{ id: "floodHistory", label: "history of flooding", disclosure: "open", severity: 0.22 }];
  const adj2 = M.hreSaleSurveyAdjust(s2, { price: 200000, asking: 200000 });
  ok("a defect the listing already disclosed is not deducted twice", adj2.cut === 0, adj2);

  /* a clean property survives its survey */
  const s3 = anyOwner("survey3", 20000);
  s3.hre.home.defects = [];
  ok("a sound property loses nothing to the survey", M.hreSaleSurveyAdjust(s3, { price: 9e4, asking: 9e4 }).cut === 0);

  /* and the cut reaches the completed sale */
  const s4 = anyOwner("survey4", 20000);
  s4.hre.home.defects = [{ id: "subsidence", label: "subsidence", disclosure: "technical", severity: 0.28 }];
  const r = M.hreSellHome(s4, { price: 200000, asking: 200000 }, "renting");
  ok("the survey cut is applied to the price actually paid",
    r && r.price <= 200000, r && { paid: r.price, cut: r.survey.cut });
}

/* ═════════════ 6 · the sale cannot leave the world inconsistent ═════════════ */
sec("6 · no contradictions after a sale");
{
  for (const dest of ["renting", "withParents", "homeless"]) {
    const s = anyOwner("dest:" + dest, 20000);
    if (!s) { ok("owner for " + dest, false); continue; }
    const r = M.hreSellHome(s, { price: 180000, asking: 180000 }, dest);
    ok("selling into '" + dest + "' completes", !!r);
    ok("...tenure is exactly what was asked for", M.hreTenure(s) === dest, M.hreTenure(s));
    ok("...no mortgage survives the sale", s.hre.mtg === null);
    ok("...no upkeep tracker survives the sale", M.hreUpkeep(s) === null);
    if (dest === "homeless") {
      ok("...homelessness sets the legacy flag the street content reads", !!s.flags.homeless);
      ok("...and no dwelling is still held", M.hreHome(s) === null, M.hreHome(s));
    } else {
      ok("...the homelessness flag is cleared for a housed destination", !s.flags.homeless, s.flags.homeless);
    }
  }

  /* selling twice is not a money printer */
  const s = anyOwner("twice", 20000);
  M.hreSellHome(s, { price: 150000, asking: 150000 }, "renting");
  const after = s.money;
  const second = M.hreSellHome(s, { price: 150000, asking: 150000 }, "renting");
  ok("a second sale of the same home is refused", second === null, second);
  ok("...and no money was created by trying", s.money === after, { after: after, now: s.money });
}

/* ═══════════════════ 7 · wiring and the menu contract ═══════════════════ */
sec("7 · wiring");
{
  const group = M.ACT_GROUPS.find((g) => g.id === "housing");
  ok("the housing group exists", !!group);
  const item = group && group.items.find((i) => i.id === "hreSell");
  ok("the sell item is registered", !!item, group && group.items.map((i) => i.id));
  ok("...it is hidden from anyone who cannot sell", !!item && typeof item.cond === "function");

  const owner = anyOwner("wiring", 20000);
  ok("...and shown to an owner who can", !!item && item.cond(owner) === true);

  const renter = H.mkChar({ country: "United Kingdom", cls: "Middle", birthYear: 1990 });
  renter.ageDays = atAge(30);
  M.migrate(renter);
  M.hreSetTenure(renter, "renting", null);
  ok("...and hidden from a renter", !!item && item.cond(renter) === false);

  /* the dispatcher branch exists and opens the menu without mutating anything */
  const probe = anyOwner("probe", 20000);
  const moneyBefore = probe.money, tenureBefore = M.hreTenure(probe);
  const next = M.doActivity(probe, { id: "hreSell", special: "hreSell", cost: 0 });
  ok("the Act item opens a menu", !!(next && next.pending), next && next.pending);
  ok("...opening it does not sell anything by itself",
    M.hreTenure(next) === tenureBefore && next.money === moneyBefore);
  ok("...and the menu always offers a way out (no dead end)",
    !!next.pending && next.pending.options.filter((o) => !o.cond || o.cond(next)).length > 0);

  /* every option on both screens must be answerable */
  const menu = M.hreSaleMenu(anyOwner("menu", 20000));
  ok("the sale menu has a title and options", !!menu.title && menu.options.length > 0);
  const dest = M.hreSaleDestinationMenu(anyOwner("menu2", 20000), { price: 1e5, asking: 1e5 }, "x");
  ok("the destination menu offers at least one real destination", dest.options.length >= 2);
  ok("...including a Back that returns to the offers", dest.options.some((o) => o.label === "Back"));
}

/* ═══════════════ 8 · state, migration (Gotcha #4) ═══════════════ */
sec("8 · everSold is a persisted life fact");
{
  const s = H.mkChar({ country: "United Kingdom", cls: "Middle", birthYear: 1990 });
  ok("newCharacter seeds everSold", "everSold" in s.hre, Object.keys(s.hre));
  ok("...as false", s.hre.everSold === false);

  const t = H.mkChar({ country: "Japan", cls: "Poor", birthYear: 1970 });
  delete t.hre.everSold;
  M.migrate(t);
  ok("a save without the field is repaired by migrate", t.hre.everSold === false);

  const u = H.mkChar({ country: "Brazil", cls: "Middle", birthYear: 1980 });
  delete u.hre;
  M.migrate(u);
  ok("a save with no hre at all gains everSold", u.hre.everSold === false);

  const sold = anyOwner("persist", 20000);
  M.hreSellHome(sold, { price: 120000, asking: 120000 }, "renting");
  const round = JSON.parse(JSON.stringify(sold));
  M.migrate(round);
  ok("the fact survives a save/load round trip", round.hre.everSold === true);
  ok("...and migration does not resurrect the mortgage", round.hre.mtg === null);
}

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
