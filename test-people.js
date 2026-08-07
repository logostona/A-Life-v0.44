/* test-people.js — the People subsystem (PPL): eighteen categories, one taxonomy.
 *
 * THE CLAIM THIS SUITE DEFENDS
 * A person's category is DERIVED from what they are, never stored beside them.
 * That is the whole design, and it is worth asserting hard because the failure
 * mode is invisible: a stored category is a second authority on the same fact,
 * and this project has already paid for one — "Swallow it and go home" cleared
 * flags.homeless without telling hreSetTenure, the two housing authorities
 * disagreed for the rest of the character's life, and the integration suite
 * passed the whole time.
 *
 * So the tests below move people between states — dating to married to ex to
 * deceased, friend to acquaintance, colleague to rival — and check the category
 * follows without anything being migrated.
 *
 * Also asserted:
 *   · every person appears in exactly one category, and none vanishes;
 *   · favourites survive every one of those transitions, because a pin is
 *     addressed by store+key rather than by category;
 *   · generated people are seeded, so a life replays identically;
 *   · empty categories are honest — a tab is empty because the life has not
 *     produced anyone, not because the tab is broken.
 *
 * Run: node --max-old-space-size=4096 test-people.js
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

const mk = (opts) => H.mkChar(Object.assign({ country: "Sweden", birthYear: 1990, cls: "Middle" }, opts || {}));
const catOf = (s, addr) => {
  const found = M.pplAll(s).filter((x) => x.addr === addr)[0];
  return found ? found.cat : null;
};

/* ═══════════════ 1 · the taxonomy ═══════════════ */
sec("1 · eighteen categories");

{
  ok("there are eighteen", M.PPL_TABS.length === 18, M.PPL_TABS.length);
  ok("every tab has an id, emoji and label", M.PPL_TABS.every((t) => t.id && t.emoji && t.label));
  ok("ids are unique", new Set(M.PPL_TABS.map((t) => t.id)).size === 18);
  ok("every tab has an empty-state message", M.PPL_TABS.every((t) => typeof M.PPL_EMPTY[t.id] === "function"),
    M.PPL_TABS.filter((t) => typeof M.PPL_EMPTY[t.id] !== "function").map((t) => t.id));
  /* the request's own list, checked against the implementation */
  for (const id of ["favorites", "family", "partner", "children", "extended", "school", "work",
                    "friends", "acquaintances", "neighbors", "clubs", "government", "healthcare",
                    "business", "interests", "rivals", "pets", "deceased"]) {
    ok("the " + id + " category exists", M.PPL_TABS.some((t) => t.id === id));
  }
}
{
  const s = mk();
  const all = M.pplAll(s);
  ok("a new character already has people", all.length > 0, all.length);
  ok("everyone lands in exactly one category", all.every((x) => !!x.cat),
    all.filter((x) => !x.cat).map((x) => x.addr));
  /* nobody may appear twice — the panel renders pplAll, so a duplicate is a
     person the player sees in two places and can pin inconsistently */
  const seen = {};
  let dupes = 0;
  for (const x of all) { if (seen[x.addr]) dupes++; seen[x.addr] = 1; }
  ok("nobody appears twice", dupes === 0, dupes);
  /* and nobody is lost: the union of the tabs must be everyone */
  const inTabs = new Set();
  for (const t of M.PPL_TABS) for (const e of M.pplIn(s, t.id)) inTabs.add(e.addr);
  ok("every person is reachable from some tab", all.every((x) => inTabs.has(x.addr)),
    all.filter((x) => !inTabs.has(x.addr)).map((x) => x.addr + " / " + x.cat));
}

/* ═══════════════ 2 · category follows state ═══════════════ */
sec("2 · category is derived, not stored");

{
  const s = mk();
  s.romance = { r1: { name: "Sam", role: "Partner", rel: 70, status: "crush" } };
  const addr = M.pplAddr("romance", "r1");
  ok("a crush is a romantic interest", catOf(s, addr) === "interests", catOf(s, addr));
  s.romance.r1.status = "dating";
  ok("dating moves them to partner", catOf(s, addr) === "partner", catOf(s, addr));
  s.romance.r1.status = "married";
  ok("marriage keeps them there", catOf(s, addr) === "partner");
  s.romance.r1.status = "ex";
  ok("an ex stays in the partner history", catOf(s, addr) === "partner");
  s.romance.r1.deceased = true;
  ok("death outranks everything else", catOf(s, addr) === "deceased");
  /* NOTHING was migrated between any of those — that is the point */
  ok("no stored category exists to disagree with any of it",
    s.romance.r1.cat === undefined, s.romance.r1.cat);
}
{
  const s = mk();
  s.friends = {
    close: { name: "Robin", role: "Best friend", rel: 80 },
    faint: { name: "Kim", role: "Friend", rel: 20 },
    dog:   { name: "Bruno", role: "Dog 🐕", rel: 90, pet: true },
  };
  ok("a close friend is a friend", catOf(s, M.pplAddr("friends", "close")) === "friends");
  ok("a distant one is an acquaintance", catOf(s, M.pplAddr("friends", "faint")) === "acquaintances");
  ok("a dog is a pet, not a friend", catOf(s, M.pplAddr("friends", "dog")) === "pets");
  /* the engine stores pets in s.friends, so this is exactly the case where
     "which store holds them" is the wrong question to ask */
  s.friends.close.rel = 10;
  ok("a friendship that fades becomes an acquaintance",
    catOf(s, M.pplAddr("friends", "close")) === "acquaintances");
  s.friends.dog.deceased = true;
  ok("a pet that dies is remembered, like anyone else",
    catOf(s, M.pplAddr("friends", "dog")) === "deceased");
}
{
  const s = mk();
  s.family = {
    mom: { name: "A", role: "Mom", rel: 80 },
    sib1: { name: "B", role: "Older brother", rel: 70 },
    stepdad: { name: "C", role: "Stepdad", rel: 50 },
  };
  s.relatives = {
    gran: { name: "D", role: "Grandma", rel: 80 },
    aunt: { name: "E", role: "Aunt", rel: 60 },
    cous: { name: "F", role: "Cousin", rel: 60 },
    nib:  { name: "G", role: "Niece", rel: 60 },
    il:   { name: "H", role: "Mother-in-law", rel: 40 },
  };
  ok("a parent is family", catOf(s, M.pplAddr("family", "mom")) === "family");
  ok("a sibling is family", catOf(s, M.pplAddr("family", "sib1")) === "family");
  /* the user's own list puts these under Family, so that is where they go */
  for (const [k, what] of [["gran", "a grandparent"], ["aunt", "an aunt"], ["cous", "a cousin"], ["nib", "a niece"]]) {
    ok(what + " is family", catOf(s, M.pplAddr("relatives", k)) === "family", catOf(s, M.pplAddr("relatives", k)));
  }
  /* which leaves Extended to mean relations by marriage and by step — the
     only reading that makes the tab mean anything once Family holds cousins */
  ok("a step-parent is extended family", catOf(s, M.pplAddr("family", "stepdad")) === "extended");
  ok("an in-law is extended family", catOf(s, M.pplAddr("relatives", "il")) === "extended");
}
{
  /* the generated store carries an explicit kind, because nothing about a
     neighbour's shape distinguishes them from a colleague's */
  const s = mk();
  s.ppl = {
    a: { name: "N", role: "Neighbour", cat: "neighbors", rel: 50 },
    b: { name: "D", role: "GP", cat: "healthcare", rel: 60 },
    c: { name: "R", role: "Rival", cat: "rivals", rel: 12 },
  };
  ok("a neighbour is a neighbour", catOf(s, M.pplAddr("ppl", "a")) === "neighbors");
  ok("a GP is healthcare", catOf(s, M.pplAddr("ppl", "b")) === "healthcare");
  ok("a rival is a rival", catOf(s, M.pplAddr("ppl", "c")) === "rivals");
  s.ppl.b.deceased = true;
  ok("...and death still outranks the stored kind", catOf(s, M.pplAddr("ppl", "b")) === "deceased");
  /* a row with no kind must land somewhere rather than vanish */
  s.ppl.d = { name: "?", role: "Someone", rel: 40 };
  ok("a person with no category is still reachable", catOf(s, M.pplAddr("ppl", "d")) !== null,
    catOf(s, M.pplAddr("ppl", "d")));
}

/* ═══════════════ 3 · favourites ═══════════════ */
sec("3 · favourites survive every transition");

{
  const s = mk();
  s.romance = { r1: { name: "Sam", role: "Partner", rel: 70, status: "dating" } };
  const addr = M.pplAddr("romance", "r1");
  ok("nobody is pinned to begin with", M.pplIn(s, "favorites").length === 0);
  M.pplToggleFav(s, addr);
  ok("pinning works", M.pplIsFav(s, addr) === true);
  ok("...and the person shows in favourites", M.pplIn(s, "favorites").length === 1);
  /* the point of addressing by store+key: the pin outlives the category */
  s.romance.r1.status = "ex";
  ok("a pin survives becoming an ex", M.pplIsFav(s, addr) === true && M.pplIn(s, "favorites").length === 1);
  s.romance.r1.deceased = true;
  ok("...and survives death", M.pplIn(s, "favorites").length === 1);
  ok("...while still appearing under Remembered", M.pplIn(s, "deceased").length === 1);
  M.pplToggleFav(s, addr);
  ok("unpinning works", M.pplIsFav(s, addr) === false && M.pplIn(s, "favorites").length === 0);
}
{
  /* a pin whose person is gone must not linger as a ghost nobody can unpin */
  const s = mk();
  s.friends = { x: { name: "Gone", role: "Friend", rel: 60 } };
  M.pplToggleFav(s, M.pplAddr("friends", "x"));
  ok("the pin is set", Object.keys(s.pplFav).length === 1);
  delete s.friends.x;
  M.pplPruneFavs(s);
  ok("a pin to nobody is pruned", Object.keys(s.pplFav).length === 0);
  ok("...and favourites is empty rather than throwing", M.pplIn(s, "favorites").length === 0);
}

/* ═══════════════ 4 · state, seeding and migration ═══════════════ */
sec("4 · state");

{
  const s = mk();
  ok("a new life has the people stores", !!s.ppl && !!s.pplFav && typeof s.pplSeed === "number");
  /* GOTCHA #4 — newCharacter never calls migrate(), so an initializer in only
     one of the two leaves a whole class of state broken */
  const old = JSON.parse(JSON.stringify(s));
  delete old.ppl; delete old.pplFav; delete old.pplSeed;
  M.migrate(old);
  ok("an old save is backfilled", !!old.ppl && !!old.pplFav && typeof old.pplSeed === "number");
  const bad = JSON.parse(JSON.stringify(s));
  bad.ppl = "nonsense"; bad.pplFav = []; bad.pplSeed = "no";
  M.migrate(bad);
  ok("a damaged store is repaired",
    bad.ppl && typeof bad.ppl === "object" && !Array.isArray(bad.ppl)
    && bad.pplFav && !Array.isArray(bad.pplFav) && typeof bad.pplSeed === "number");
  ok("the stores are plain JSON",
    JSON.stringify(s.ppl) === JSON.stringify(JSON.parse(JSON.stringify(s.ppl))));
}
{
  /* determinism: the same life must produce the same people */
  const a = mk({ first: "Same", last: "Person" });
  const b = mk({ first: "Same", last: "Person" });
  a.pplSeed = b.pplSeed = 4242;
  a.career = { job: { industry: "tech", title: "Dev", tier: 2, salary: 300, perf: 55, since: 0 } };
  b.career = JSON.parse(JSON.stringify(a.career));
  a.ageDays = b.ageDays = 9000;
  for (let i = 0; i < 60; i++) { M.pplOnTick(a, 30); M.pplOnTick(b, 30); }
  ok("generation is seeded, not random",
    JSON.stringify(Object.keys(a.ppl).sort()) === JSON.stringify(Object.keys(b.ppl).sort()),
    [Object.keys(a.ppl).length, Object.keys(b.ppl).length]);
  ok("...down to the names", JSON.stringify(a.ppl) === JSON.stringify(b.ppl));

  const SRC = fs.readFileSync(H.SRC, "utf8");
  const strip = (x) => x.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
  /* slice from the `/*` that OPENS the banner, and end at the NEXT banner —
     both halves of CLAUDE.md §6's trap in one lint */
  const start = SRC.lastIndexOf("/*", SRC.indexOf("PPL · S01 · WHO PEOPLE ARE TO YOU"));
  const end = SRC.indexOf("/* ═══════════════ EXES", start);
  ok("the PPL block was located", start > 0 && end > start, [start, end]);
  const block = strip(SRC.slice(start, end));
  ok("...and reaches the end of the subsystem", SRC.slice(start, end).includes("function pplRivalTick"));
  ok("generation uses the seeded RNG, never Math.random", !/Math\.random/.test(block),
    (block.match(/.{50}Math\.random.{20}/) || [])[0]);
  ok("no country is named in a conditional", !/country\s*===\s*["']/.test(block));
}

/* ═══════════════ 5 · people arrive because life produced them ═══════════════ */
sec("5 · quotas follow the life");

{
  const jobless = mk(); jobless.ageDays = 9000; jobless.career = { job: null };
  const employed = mk(); employed.ageDays = 9000;
  employed.career = { job: { industry: "tech", title: "Dev", tier: 2, salary: 300, perf: 55, since: 0 } };
  ok("no job means no colleagues", M.pplQuotaFor(jobless, "work") === 0);
  ok("a job means colleagues", M.pplQuotaFor(employed, "work") > 0);

  const athome = mk(); athome.ageDays = 5000; athome.hre = Object.assign({}, athome.hre, { tenure: "withParents" });
  const moved = mk(); moved.ageDays = 9000; moved.hre = Object.assign({}, moved.hre, { tenure: "renting" });
  ok("living with parents means their neighbours are not yours", M.pplQuotaFor(athome, "neighbors") === 0);
  ok("an address of your own brings neighbours", M.pplQuotaFor(moved, "neighbors") > 0);
  const homeless = mk(); homeless.ageDays = 9000;
  homeless.hre = Object.assign({}, homeless.hre, { tenure: "renting" }); homeless.flags.homeless = true;
  ok("having nowhere to live means no neighbours", M.pplQuotaFor(homeless, "neighbors") === 0);

  ok("rivals are never quota'd — they are earned", M.pplQuotaFor(employed, "rivals") === 0);
}
{
  /* the tick fills toward the quota and never past it */
  const s = mk(); s.ageDays = 9000;
  s.career = { job: { industry: "tech", title: "Dev", tier: 2, salary: 300, perf: 55, since: 0 } };
  for (let i = 0; i < 200; i++) M.pplOnTick(s, 30);
  const work = M.pplIn(s, "work").length;
  ok("colleagues appear once there is a job", work > 0, work);
  ok("...and stop at what the life justifies", work <= M.pplQuotaFor(s, "work"),
    [work, M.pplQuotaFor(s, "work")]);
  ok("everyone generated carries their category", Object.values(s.ppl).every((p) => !!p.cat));
  ok("...and a name and a role", Object.values(s.ppl).every((p) => !!p.name && !!p.role));
  ok("generated people stay lean", (() => {
    const p = Object.values(s.ppl)[0];
    return p && p.warmth === undefined && p.known === undefined;
  })(), Object.keys(Object.values(s.ppl)[0] || {}));
}
{
  /* a rival is promoted from someone already in your life, never conjured */
  const s = mk(); s.ageDays = 9000;
  s.ppl = { c1: { name: "X", role: "Colleague", cat: "work", rel: 20, since: 0 } };
  let promoted = false;
  for (let i = 0; i < 4000 && !promoted; i++) {
    M.pplRivalTick(s, 30, M.hreRng(i, i, "test:rival"));
    if (s.ppl.c1.cat === "rivals") promoted = true;
  }
  ok("a rival is promoted from an existing relationship", promoted);
  ok("...and remembers what they were", s.ppl.c1.wasCat === "work", s.ppl.c1.wasCat);
  ok("...and nobody was invented to be an enemy", Object.keys(s.ppl).length === 1);

  /* somebody you get on with does not become a rival */
  const t = mk(); t.ageDays = 9000;
  t.ppl = { c1: { name: "Y", role: "Colleague", cat: "work", rel: 85, since: 0 } };
  for (let i = 0; i < 500; i++) M.pplRivalTick(t, 30, M.hreRng(i, i, "test:rival2"));
  ok("a good relationship never sours into rivalry", t.ppl.c1.cat === "work");

  /* CAPPED. Uncapped, a long life accumulated thirteen rivals — a person at
     war with their whole address book, which reads as characterisation and is
     actually a bug. */
  const many = mk(); many.ageDays = 9000; many.ppl = {};
  for (let i = 0; i < 30; i++) many.ppl["c" + i] = { name: "P" + i, role: "Colleague", cat: "work", rel: 20, since: 0 };
  for (let i = 0; i < 6000; i++) M.pplRivalTick(many, 30, M.hreRng(i, i, "test:cap"));
  ok("rivals are capped", M.pplIn(many, "rivals").length <= M.PPL_RIVAL_CAP,
    M.pplIn(many, "rivals").length);
  ok("...and the cap is a small number", M.PPL_RIVAL_CAP <= 4, M.PPL_RIVAL_CAP);
}
{
  /* Two people with the same first AND last name in one small life reads as a
     rendering fault; two landlords or two GPs at once reads as one too. Both
     happened before the generator checked. */
  const s = mk(); s.ageDays = 12000;
  s.career = { job: { industry: "tech", title: "Dev", tier: 2, salary: 300, perf: 55, since: 0 } };
  s.hre = Object.assign({}, s.hre, { tenure: "renting" });
  s.money = 9000;
  for (let i = 0; i < 400; i++) M.pplOnTick(s, 30);
  const people = Object.values(s.ppl);
  ok("generation produced people", people.length > 3, people.length);

  const names = {};
  let dupName = 0;
  for (const p of people) { if (names[p.name]) dupName++; names[p.name] = 1; }
  ok("no two generated people share a name", dupName === 0, dupName);

  /* and never against someone who already existed */
  const existing = {};
  for (const store of ["family", "friends", "relatives", "children", "romance"]) {
    for (const k in (s[store] || {})) if (s[store][k] && s[store][k].name) existing[s[store][k].name] = 1;
  }
  ok("...nor a name already in the character's life",
    people.every((p) => !existing[p.name]), people.filter((p) => existing[p.name]).map((p) => p.name));

  let dupSingular = 0;
  const seenRole = {};
  for (const p of people) {
    const k = p.cat + "|" + p.role;
    if (M.PPL_SINGULAR[p.role] && seenRole[k]) dupSingular++;
    seenRole[k] = 1;
  }
  ok("you never end up with two landlords, or two GPs", dupSingular === 0, dupSingular);
  ok("the singular list names the roles there is only one of",
    M.PPL_SINGULAR.Landlord === 1 && M.PPL_SINGULAR.GP === 1 && M.PPL_SINGULAR.Dentist === 1);
}

/* ═══════════════ 6 · lives still run ═══════════════ */
sec("6 · nothing broke");

{
  /* GOTCHA #6 — observable outcomes, never step counts */
  let crashes = 0, aged = 0, withStores = 0, sizes = [], uncat = 0, dupes = 0;
  for (const sd of [3, 14, 25, 36, 47]) {
    H.seed(sd);
    const s = H.mkChar({ country: ["Sweden", "Brazil", "India", "Nigeria"][sd % 4], birthYear: 1940 + (sd % 4) * 18 });
    let r;
    try { r = H.runLife(s, { maxSteps: 2600, days: 30 }); } catch (e) { crashes++; continue; }
    const st = r.state;
    if (r.finalAge > 5) aged++;
    if (st.ppl && st.pplFav && typeof st.pplSeed === "number") withStores++;
    sizes.push(JSON.stringify(st.ppl).length);
    const all = M.pplAll(st);
    uncat += all.filter((x) => !x.cat).length;
    const seen = {};
    for (const x of all) { if (seen[x.addr]) dupes++; seen[x.addr] = 1; }
  }
  ok("no life crashed", crashes === 0, crashes);
  ok("time actually moved", aged === 5, aged);
  ok("every life kept its people stores", withStores === 5, withStores);
  ok("nobody was ever uncategorised", uncat === 0, uncat);
  ok("nobody ever appeared twice", dupes === 0, dupes);
  ok("the store stays small", Math.max.apply(null, sizes) < 2600, Math.max.apply(null, sizes));
}
{
  /* the badge on the tab and the cards behind it must agree */
  H.seed(8);
  const s = H.mkChar({ country: "Sweden", birthYear: 1975 });
  const st = H.runLife(s, { maxSteps: 1600, days: 30 }).state;
  let sum = 0;
  for (const t of M.PPL_TABS) if (t.id !== "favorites") sum += M.pplIn(st, t.id).length;
  ok("the categories partition everyone exactly once", sum === M.pplAll(st).length,
    [sum, M.pplAll(st).length]);
}

console.log("\n" + (fail === 0 ? "ALL PASS" : "FAILURES") + ": " + pass + " passed, " + fail + " failed");
process.exit(fail === 0 ? 0 : 1);
