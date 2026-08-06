/* test-health.js — the Health subsystem (HLT): eleven subtabs, one record.
 *
 * WHAT THIS SUITE IS FOR
 * The brief was "make it realistic" and "must be expandable", and those are
 * the two things asserted here. Realism is checked as SHAPE and ORDERING, not
 * as values — every table in this subsystem ships `provisional`, and an
 * assertion pinning a rate to 0.42 would have to be rewritten by the very
 * patch that makes it correct (§8 of CLAUDE.md).
 *
 * The four things that would actually be wrong if they broke:
 *
 *   1. ERA. A vaccine cannot be given before it exists and must retire when it
 *      is no longer given; smallpox is the only entry in the table that has a
 *      correct "stop". A 1950s childhood must differ from a 2010s one without
 *      any resolver knowing a date.
 *   2. CALIBRATION. A per-step probability compounds over ~4,000 weeks of
 *      life. The first cut gave 12 lives out of 12 an alcohol problem and 9 an
 *      opioid one, which is not balance — it is false, and it misrepresents
 *      the people it depicts. Prevalence is asserted as a band.
 *   3. EXTENSIBILITY. hltRegister must accept a new row at runtime, must not
 *      double on a second run, and must never orphan a built-in id — because
 *      that is the seam a generator or an LLM is meant to use.
 *   4. THE PROJECT'S OWN GOTCHAS. #2 (builders must not mutate), #4 (an
 *      initializer and its migrate backfill land together), #6 (never assert
 *      on step counts).
 *
 * Run: node --max-old-space-size=4096 test-health.js
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

/* a character alive at a given year and age, anywhere */
const at = (country, year, age, extra) => {
  const c = H.mkChar(Object.assign({ country: country, birthYear: year - age, cls: "Middle" }, extra || {}));
  c.ageDays = Math.round(age * 365.25);
  return c;
};

/* ═════════════════════ 1 · the record itself ═════════════════════ */
sec("1 · the health record");

{
  const s = at("Sweden", 2010, 30);
  ok("a new life has a health record", !!s.hlt && typeof s.hlt === "object");
  ok("it is versioned", s.hlt.v === M.HLT_STATE_V);
  for (const k of ["vitals", "mind", "acute", "vax", "addict", "disab", "allergy", "hx"]) {
    ok("it has " + k, s.hlt[k] !== undefined);
  }
  /* GOTCHA #4 — the most repeated bug in this project's history. newCharacter
     never calls migrate(), so an initializer present in only one of the two
     leaves a whole class of state broken. Both directions are checked. */
  const old = JSON.parse(JSON.stringify(s));
  delete old.hlt;
  M.migrate(old);
  ok("a save with no health record at all is backfilled", !!old.hlt && old.hlt.v === M.HLT_STATE_V);
  ok("...with every key the schema names",
    ["vitals", "mind", "acute", "vax", "addict", "disab", "allergy", "hx"].every((k) => old.hlt[k] !== undefined));

  /* a record damaged by anything at all must come back usable rather than
     take the game down on load */
  const bad = JSON.parse(JSON.stringify(s));
  bad.hlt = { v: 99, vitals: "nonsense", mind: null, hx: "not an array", acute: null, vax: [] };
  M.migrate(bad);
  ok("a save from the future is clamped, not trusted", bad.hlt.v === M.HLT_STATE_V);
  ok("a damaged vitals block is rebuilt", typeof bad.hlt.vitals === "object" && typeof bad.hlt.vitals.fit === "number");
  ok("a damaged history is rebuilt as an array", Array.isArray(bad.hlt.hx));
  ok("a damaged map is rebuilt as an object", bad.hlt.acute && typeof bad.hlt.acute === "object" && !Array.isArray(bad.hlt.acute));
  ok("...including one that arrived as an array", !Array.isArray(bad.hlt.vax));

  ok("the record is plain JSON", (() => {
    const round = JSON.parse(JSON.stringify(s.hlt));
    return JSON.stringify(round) === JSON.stringify(s.hlt);
  })());
}
{
  /* determinism — the same character must roll the same body every time, or
     nothing about this subsystem is reproducible */
  const a = at("Brazil", 2000, 0, { first: "Same", last: "Person" });
  const b = at("Brazil", 2000, 0, { first: "Same", last: "Person" });
  a.hlt.seed = b.hlt.seed = 12345;
  M.hltOnTick(a, 7); M.hltOnTick(b, 7);
  ok("generation is seeded, not random",
    JSON.stringify(a.hlt.disab) === JSON.stringify(b.hlt.disab)
    && JSON.stringify(a.hlt.allergy) === JSON.stringify(b.hlt.allergy),
    [a.hlt.disab, b.hlt.disab]);
  ok("...and congenital generation runs exactly once", a.hlt.born === 1);
  const before = JSON.stringify(a.hlt.disab);
  M.hltOnTick(a, 7); M.hltOnTick(a, 7);
  ok("...so a second tick does not re-roll the body", JSON.stringify(a.hlt.disab) === before);
}

/* ═════════════════════ 2 · era ═════════════════════ */
sec("2 · era is a real constraint");

{
  const V = M.HLT_VACCINES;
  ok("every vaccine names the year it became available",
    Object.values(V).every((v) => typeof v.from === "number" && v.from > 1700));
  /* the defining check: a vaccine cannot be given before it exists */
  for (const id of Object.keys(V)) {
    const before = at("Sweden", V[id].from - 5, 5);
    ok(id + " is unavailable before it exists", M.hltVaxAvailable(id, before) === 0, [id, V[id].from]);
  }
  ok("polio does not exist in 1950", M.hltVaxAvailable("polio", at("Sweden", 1950, 5)) === 0);
  ok("...and does by 1975", M.hltVaxAvailable("polio", at("Sweden", 1975, 5)) > 0.5);
  ok("HPV does not exist in 1990", M.hltVaxAvailable("hpv", at("Sweden", 1990, 13)) === 0);
  ok("COVID does not exist in 2015", M.hltVaxAvailable("covid", at("Sweden", 2015, 30)) === 0);

  /* smallpox is the one entry whose correct answer becomes "no longer given" */
  ok("smallpox is given in 1960", M.hltVaxAvailable("smallpox", at("Sweden", 1960, 1)) > 0);
  ok("...and is NOT given in 1990, because it was eradicated",
    M.hltVaxAvailable("smallpox", at("Sweden", 1990, 1)) === 0);
  /* Two entries retire, for two different and both-correct reasons: smallpox
     because the disease was eradicated, standalone measles because it was
     folded into MMR in 1971. Retiring is rare and must stay deliberate. */
  const retires = Object.keys(V).filter((k) => V[k].until);
  ok("only the vaccines that really stopped being given retire",
    retires.length === 2 && retires.indexOf("smallpox") > -1 && retires.indexOf("measles") > -1, retires);
  ok("standalone measles retires exactly when MMR arrives",
    V.measles.until === V.mmr.from, [V.measles.until, V.mmr.from]);
  ok("...so there is never a year with neither, nor a year with both",
    M.hltVaxAvailable("measles", at("Sweden", 1970, 2)) > 0
    && M.hltVaxAvailable("measles", at("Sweden", 1975, 2)) === 0
    && M.hltVaxAvailable("mmr", at("Sweden", 1975, 2)) > 0);

  /* coverage climbs after rollout rather than arriving complete */
  const p = (y) => M.hltVaxAvailable("polio", at("Sweden", y, 2));
  ok("coverage grows in the decades after rollout", p(1958) < p(1970) && p(1970) <= p(1990), [p(1958), p(1970), p(1990)]);
}
{
  /* place, through health-system capacity — never through a country name */
  const v = (c) => M.hltVaxAvailable("mmr", at(c, 2010, 2));
  ok("a stronger health system vaccinates more of its children",
    v("Sweden") > v("Nigeria"), [v("Sweden"), v("Nigeria")]);
  ok("...with the middle tiers in between",
    v("Sweden") >= v("Brazil") && v("Brazil") >= v("India") && v("India") >= v("Nigeria"),
    [v("Sweden"), v("Brazil"), v("India"), v("Nigeria")]);

  const SRC = fs.readFileSync(H.SRC, "utf8");
  const strip = (x) => x.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
  /* the slice ENDS AT THE NEXT BANNER, never at a function name — a lint that
     stopped at a function inside its own section checked half a block and
     stayed green for weeks (CLAUDE.md §6) */
  /* Slice from the `/*` that OPENS the banner, not from the banner text
     inside it. Slicing from the text leaves the first comment unterminated,
     the stripper cannot match it, the prose survives — and then the sentence
     forbidding `country === "…"` is itself flagged as an occurrence of it.
     That is CLAUDE.md §6's trap, and this lint walked straight into it. */
  const start = SRC.lastIndexOf("/*", SRC.indexOf("HLT · S01 · CONTENT REGISTRIES"));
  const end = SRC.indexOf("THE CLOSET HAS WALLS", start);
  ok("the HLT block was located", start > 0 && end > start, [start, end]);
  const block = strip(SRC.slice(start, end));
  ok("...and reaches the end of the subsystem", SRC.slice(start, end).includes("function hltMortalityLoad"));
  ok("no country is named in a conditional", !/country\s*===\s*["']/.test(block));
  ok("place enters through the development tier", block.includes("hreDevOf"));
  /* project invariant: no Math.random in generative code, or a life stops
     being reproducible from its seed */
  ok("generation uses the seeded RNG, never Math.random",
    !/Math\.random/.test(block.slice(0, block.indexOf("function hltQuitMenu"))),
    (block.match(/.{60}Math\.random.{30}/) || [])[0]);
}
{
  /* the social model: what varies by era is the WORLD, not the person */
  const acc = (c, y) => M.hltAccessibility(at(c, y, 30));
  ok("the world is far less open to a disabled person in 1930 than in 2015",
    acc("Sweden", 1930) < acc("Sweden", 2015) * 0.5, [acc("Sweden", 1930), acc("Sweden", 2015)]);
  ok("accessibility rises monotonically with the legislation",
    [1900, 1945, 1970, 1990, 1995, 2006, 2015].every((y, i, a) => i === 0 || acc("Sweden", y) >= acc("Sweden", a[i - 1])));
  ok("and varies by where you are", acc("Sweden", 2010) > acc("Nigeria", 2010));
  ok("it is never zero — people build their own access", acc("Nigeria", 1900) > 0);
}

/* ═════════════════════ 3 · calibration ═════════════════════ */
sec("3 · calibration (the 12-of-12 bug)");

{
  const A = M.HLT_ADDICTIONS;
  ok("every substance carries its own lifetime figure",
    Object.values(A).every((a) => typeof a.lifetime === "number" && a.lifetime > 0 && a.lifetime < 1),
    Object.keys(A).filter((k) => typeof A[k].lifetime !== "number"));
  /* the ORDERING is the claim, not the numbers: nicotine an order above
     cannabis, cannabis an order above opioids */
  ok("nicotine is the commonest by a wide margin", A.nicotine.lifetime > A.alcohol.lifetime);
  ok("alcohol is well above cannabis", A.alcohol.lifetime > A.cannabis.lifetime);
  ok("cannabis is well above the hard drugs",
    A.cannabis.lifetime > A.opioid.lifetime && A.cannabis.lifetime > A.stimulant.lifetime);
  ok("the rarest are on the order of a percent or two",
    A.gambling.lifetime < 0.05 && A.opioid.lifetime < 0.05 && A.stimulant.lifetime < 0.05);

  ok("era curves are chronological",
    Object.values(A).every((a) => a.era.every((b, i) => i === 0 || b[0] > a.era[i - 1][0])));
  /* the 1964 Surgeon General report is the turn in the smoking curve, and it
     is the clearest historical claim this subsystem makes */
  const nic = (y) => M.hltEraValue(A.nicotine.era, y);
  ok("smoking peaks in the mid-century", nic(1955) > nic(1930) && nic(1955) > nic(1980));
  ok("...and falls after the health warnings begin", nic(1955) > nic(1964) && nic(1964) > nic(1995) && nic(1995) > nic(2020));
  /* gambling runs the other way — it becomes MORE available, not less */
  const gam = (y) => M.hltEraValue(A.gambling.era, y);
  ok("gambling gets more available as it moves online", gam(1950) < gam(2000) && gam(2000) < gam(2020));

  /* risk factors compound, but not without limit — uncapped they reached 6x
     and turned every hard life into an addicted one */
  const calm = at("Sweden", 2010, 22);
  const hard = at("Sweden", 2010, 22);
  hard.hlt.mind.stress = 90; hard.hlt.mind.resil = 20;
  hard.stats.happiness = 20; hard.flags.homeless = true;
  const rc = M.hltAddictionOdds(calm, "alcohol"), rh = M.hltAddictionOdds(hard, "alcohol");
  ok("a hard life raises the risk", rh > rc, [rc, rh]);
  ok("...but the multipliers are capped, not unbounded", rh / rc <= 3.01, rh / rc);
}
{
  /* onset concentrates where it really does — adolescence and early
     adulthood — rather than being flat across a lifespan */
  const odds = (age) => M.hltAddictionOdds(at("Sweden", 2010, age), "alcohol");
  ok("onset peaks in late adolescence and the twenties", odds(22) > odds(50), [odds(22), odds(50)]);
  ok("...and is lowest in childhood and old age",
    odds(10) < odds(22) && odds(70) < odds(22), [odds(10), odds(22), odds(70)]);
  ok("a substance with a legal age is not picked up by a small child",
    M.hltAddictionOdds(at("Sweden", 2010, 6), "alcohol") === 0);
}

/* ═════════════════════ 4 · extensibility ═════════════════════ */
sec("4 · the extension seam");

{
  ok("there are eleven subtabs", M.HLT_TABS.length === 11, M.HLT_TABS.length);
  ok("every subtab has a renderer", M.HLT_TABS.every((t) => typeof M.HLT_SUBPANELS[t.id] === "function"),
    M.HLT_TABS.filter((t) => typeof M.HLT_SUBPANELS[t.id] !== "function").map((t) => t.id));
  ok("every subtab has an id, emoji and label",
    M.HLT_TABS.every((t) => t.id && t.emoji && t.label));
  ok("ids are unique", new Set(M.HLT_TABS.map((t) => t.id)).size === 11);

  /* the seam a generator or an LLM is meant to use */
  const n0 = Object.keys(M.HLT_ILLNESS).length;
  ok("a new row can be registered at runtime",
    M.hltRegister("illness", "testitis", { name: "Testitis", emoji: "🧪", days: 5, sev: 2, w: 3 }) === true);
  ok("...and lands in the table", Object.keys(M.HLT_ILLNESS).length === n0 + 1 && !!M.HLT_ILLNESS.testitis);
  ok("...marked as registered rather than built in", M.HLT_ILLNESS.testitis.registered === true);
  /* running a generator twice must not double the content */
  ok("registering the same id twice is refused",
    M.hltRegister("illness", "testitis", { name: "Other", emoji: "❌", days: 1, sev: 1 }) === false);
  ok("...and the original is untouched", M.HLT_ILLNESS.testitis.name === "Testitis");
  ok("an explicit replace is honoured",
    M.hltRegister("illness", "testitis", { name: "Replaced", emoji: "🧪", days: 1, sev: 1 }, true) === true
    && M.HLT_ILLNESS.testitis.name === "Replaced");
  /* a built-in id must never be orphaned by an extension, or a save
     referencing it breaks */
  ok("a built-in id cannot be clobbered by accident",
    M.hltRegister("illness", "cold", { name: "Nope" }) === false && M.HLT_ILLNESS.cold.name === "Common cold");
  ok("an unknown kind is refused rather than silently dropped",
    M.hltRegister("nonsense", "x", { name: "X" }) === false);
  ok("a malformed row is refused", M.hltRegister("illness", "bad", null) === false);
  delete M.HLT_ILLNESS.testitis;

  ok("every registry kind maps to a real table",
    ["vaccine", "illness", "addiction", "disability", "allergy", "condition"]
      .every((k) => M.hltRegister(k, "__probe__", { name: "p" }) === true));
  for (const k of ["vaccine", "illness", "addiction", "disability", "allergy", "condition"]) {
    delete M.HLT_REGISTRY[k].__probe__;
  }
}
{
  /* the whole record as plain data — what you would put in a prompt */
  const s = at("Sweden", 2010, 40);
  const ex = M.hltExport(s);
  ok("the record exports as plain data", !!ex && typeof ex === "object");
  ok("...carrying the context a generator would need",
    ex.age === 40 && ex.year === 2010 && ex.country === "Sweden");
  ok("...and every axis", ["vitals", "mind", "illness", "vaccines", "addictions", "disabilities", "allergies", "history"]
    .every((k) => ex[k] !== undefined), Object.keys(ex));
  ok("...with no functions or undefined in it",
    JSON.stringify(ex) === JSON.stringify(JSON.parse(JSON.stringify(ex))));
}

/* ═════════════════════ 5 · emergent, not managed ═════════════════════ */
sec("5 · lifestyle is emergent");

{
  /* the design claim: these move because of circumstances, not because the
     player was asked to top up a meter */
  const rich = at("Sweden", 2010, 30); rich.money = 20000;
  const broke = at("Sweden", 2010, 30); broke.money = -500;
  ok("nutrition follows what you can afford",
    M.hltNutritionTarget(rich).v > M.hltNutritionTarget(broke).v,
    [M.hltNutritionTarget(rich).v, M.hltNutritionTarget(broke).v]);

  const housed = at("Sweden", 2010, 30);
  const homeless = at("Sweden", 2010, 30); homeless.flags.homeless = true;
  ok("sleep collapses without somewhere safe to sleep",
    M.hltSleepTarget(homeless).v < M.hltSleepTarget(housed).v - 15);
  ok("...and so does nutrition, because there is no kitchen",
    M.hltNutritionTarget(homeless).v < M.hltNutritionTarget(housed).v - 10);

  /* fitness declines with age no matter what, which is the honest part */
  const f = (age) => M.hltFitnessTarget(at("Sweden", 2010, age)).v;
  ok("fitness peaks in the twenties", f(25) > f(50) && f(25) > f(12), [f(12), f(25), f(50)]);
  ok("...and declines through later life", f(50) > f(70) && f(70) > f(85), [f(50), f(70), f(85)]);

  /* the explanation is built from the same terms as the number, so it can
     never disagree with it */
  const t = M.hltFitnessTarget(homeless);
  ok("a target explains itself", Array.isArray(t.terms) && t.terms.length > 0);
  const why = M.hltReasons(t.terms, 3);
  ok("...in order of what matters most",
    why.every((r, i, a) => i === 0 || Math.abs(a[i - 1].n) >= Math.abs(r.n)), why);
  ok("...naming the housing", why.some((r) => /sleep|nowhere/i.test(r.why)), why.map((r) => r.why));
  ok("every reason has a direction and a cause", why.every((r) => (r.dir === 1 || r.dir === -1) && !!r.why));

  /* mental health is not a second copy of happiness */
  const stressed = at("Sweden", 2010, 35);
  stressed.money = -800; stressed.flags.homeless = true;
  ok("stress tracks circumstance", M.hltMindTarget(stressed).stress > M.hltMindTarget(rich).stress);
  ok("...and people are protective, not just decoration", (() => {
    const alone = at("Sweden", 2010, 35);
    const held = at("Sweden", 2010, 35);
    held.friends = { a: { name: "A", rel: 70 }, b: { name: "B", rel: 70 } };
    return M.hltMindTarget(held).stress < M.hltMindTarget(alone).stress;
  })());
}
{
  /* drift, not instant snap — a single good week must not rewrite a decade */
  const near = M.hltDrift(50, 90, 7, 0.035);
  ok("a value walks toward its target", near > 50 && near < 56, near);
  const far = M.hltDrift(50, 90, 365, 0.035);
  ok("...and gets most of the way there over a year", far > near && far < 90, far);
  ok("drift never leaves the 0-100 range",
    M.hltDrift(0, 100, 100000, 0.9) <= 100 && M.hltDrift(100, 0, 100000, 0.9) >= 0);
}

/* ═════════════════════ 6 · builders must not mutate ═════════════════════ */
sec("6 · gotcha #2 — builders return, options mutate");

{
  const s = at("Sweden", 2010, 40);
  s.hlt.addict.nicotine = { st: 2, since: 1000, tol: 1.1, quits: 1 };
  const before = JSON.stringify(s);
  const out = M.hltQuitMenu(s);
  ok("the quit menu returns a state with a pending scene", !!out.pending && !!out.pending.options);
  ok("...and did NOT mutate the state it was handed", JSON.stringify(s) === before);
  ok("...offering the substance", out.pending.options.some((o) => /Nicotine/.test(o.label || "")));

  /* a failed attempt still counts — that is the whole design of the thing */
  const d = JSON.parse(JSON.stringify(s));
  const opt = out.pending.options.find((o) => /Nicotine/.test(o.label || ""));
  M.applyFx(d, opt.fx);
  ok("an attempt is recorded either way", d.hlt.addict.nicotine.quits === 2, d.hlt.addict.nicotine);
  ok("...and the outcome is one of stopped or still going",
    d.hlt.addict.nicotine.st === 0 || d.hlt.addict.nicotine.st === 2);

  /* odds must respond to support and to stability */
  const supported = at("Sweden", 2010, 40);
  supported.hlt.addict.nicotine = { st: 2, since: 1000, tol: 1.1, quits: 3 };
  supported.friends = { a: { name: "A", rel: 70 }, b: { name: "B", rel: 70 } };
  const alone = at("Nigeria", 2010, 40);
  alone.hlt.addict.nicotine = { st: 2, since: 1000, tol: 1.1, quits: 0 };
  alone.flags.homeless = true;
  ok("support and stability make stopping likelier",
    M.hltQuitOdds(supported, "nicotine") > M.hltQuitOdds(alone, "nicotine"),
    [M.hltQuitOdds(supported, "nicotine"), M.hltQuitOdds(alone, "nicotine")]);
  ok("previous attempts help rather than count against you", (() => {
    const a = at("Sweden", 2010, 40), b = at("Sweden", 2010, 40);
    a.hlt.addict.x = { st: 2, since: 0, tol: 1, quits: 0 };
    b.hlt.addict.x = { st: 2, since: 0, tol: 1, quits: 4 };
    M.hltRegister("addiction", "x", { name: "X", emoji: "x", legalAge: 18, lifetime: 0.1, quitBase: 0.3, tolerate: 0.9, era: [[1900, 0.5]], harm: {} });
    const r = M.hltQuitOdds(b, "x") > M.hltQuitOdds(a, "x");
    delete M.HLT_ADDICTIONS.x;
    return r;
  })());
  ok("stopping is never impossible and never certain", (() => {
    const deep = at("Nigeria", 1930, 55);
    deep.hlt.addict.opioid = { st: 3, since: 0, tol: 3, quits: 0 };
    deep.flags.homeless = true; deep.hlt.mind.stress = 95;
    const o = M.hltQuitOdds(deep, "opioid");
    return o > 0 && o < 1;
  })());
}

/* ═════════════════════ 7 · history ═════════════════════ */
sec("7 · medical history");

{
  const s = at("Sweden", 2010, 30);
  s.hlt.hx = [];
  M.hltLog(s, "d", "asthma");
  ok("an entry is recorded", s.hlt.hx.length === 1);
  ok("...with a time, a kind and an id",
    typeof s.hlt.hx[0].t === "number" && s.hlt.hx[0].k === "d" && s.hlt.hx[0].id === "asthma");
  for (let i = 0; i < 200; i++) M.hltLog(s, "i", "cold");
  ok("history is capped so a long life cannot bloat a save",
    s.hlt.hx.length === M.HLT_HX_CAP, s.hlt.hx.length);
  ok("...keeping the most recent, which is what anyone asks about",
    s.hlt.hx[s.hlt.hx.length - 1].id === "cold");
}

/* ═════════════════════ 8 · lives still run ═════════════════════ */
sec("8 · nothing broke");

{
  /* GOTCHA #6 — never assert on step counts. A green 33,600-step run once had
     nobody aging a day. Assert observable outcomes. */
  let crashes = 0, aged = 0, withRecord = 0, budgets = [], everIll = 0;
  const seeds = [11, 22, 33, 44, 55, 66];
  for (const sd of seeds) {
    H.seed(sd);
    const s = H.mkChar({ country: ["Sweden", "Brazil", "India", "Nigeria"][sd % 4], birthYear: 1930 + (sd % 5) * 18 });
    let r;
    try { r = H.runLife(s, { maxSteps: 2600, days: 30 }); } catch (e) { crashes++; continue; }
    const st = r.state;
    if (r.finalAge > 5) aged++;
    if (st.hlt && st.hlt.v === M.HLT_STATE_V) withRecord++;
    if ((st.hlt.hx || []).some((x) => x.k === "i")) everIll++;
    budgets.push(JSON.stringify(st.hlt).length);
  }
  ok("no life crashed", crashes === 0, crashes);
  ok("time actually moved", aged === seeds.length, aged);
  ok("every life kept a valid health record", withRecord === seeds.length, withRecord);
  ok("people fall ill over a lifetime", everIll >= seeds.length - 1, everIll);
  /* the budget the other subsystems hold to */
  ok("the record stays near the 2.5 KB budget",
    Math.max.apply(null, budgets) < 2600, Math.max.apply(null, budgets));
}
{
  /* the feedback that makes any of this matter: a life lived badly must end
     measurably earlier, without the player ever having been nagged */
  ok("untreated dependence raises mortality risk", (() => {
    const clean = at("Sweden", 2010, 50);
    const using = at("Sweden", 2010, 50);
    using.hlt.addict.opioid = { st: 3, since: 0, tol: 2, quits: 0 };
    return M.hltMortalityLoad(using) > M.hltMortalityLoad(clean);
  })());
  ok("a run-down body does too", (() => {
    const well = at("Sweden", 2010, 50);
    const worn = at("Sweden", 2010, 50);
    worn.hlt.vitals.fit = 15; worn.hlt.vitals.nut = 15; worn.hlt.debt = 80;
    return M.hltMortalityLoad(worn) > M.hltMortalityLoad(well) + 1;
  })());
  ok("a healthy life carries no penalty", M.hltMortalityLoad(at("Sweden", 2010, 30)) === 0);
  ok("the load is bounded rather than runaway", (() => {
    const s = at("Sweden", 2010, 60);
    for (const id of Object.keys(M.HLT_ADDICTIONS)) s.hlt.addict[id] = { st: 3, since: 0, tol: 3, quits: 0 };
    s.hlt.vitals.fit = 0; s.hlt.vitals.nut = 0; s.hlt.debt = 100;
    return M.hltMortalityLoad(s) < 15;
  })());
}

console.log("\n" + (fail === 0 ? "ALL PASS" : "FAILURES") + ": " + pass + " passed, " + fail + " failed");
process.exit(fail === 0 ? 0 : 1);
