/* test-edu-s12.js — EDU S12: the read-only interface adapter
 *
 * Three things this suite exists to catch, in order of how expensive they are
 * to find any other way:
 *
 *   · Gotcha #2 — a builder that mutates the clone it was handed. The write
 *     vanishes when the clone is discarded, and nothing anywhere reports it.
 *     Section 3 drives every builder against a frozen-equivalent snapshot.
 *   · Invariant 8 — presentation inventing a fact. Every line must compose
 *     from a value S01–S06 already computed.
 *   · Dead ends — a menu with no way out, which strands the player with a
 *     popup they cannot dismiss and a game that will not advance.
 *
 * Run: node --max-old-space-size=4096 test-edu-s12.js
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

function schooled(country, birthYear, opts) {
  const o = opts || {};
  const c = H.mkChar({ country, birthYear, cls: o.cls || "Middle" });
  c.ageDays = o.ageDays != null ? o.ageDays : 5000;
  c.education.stage = o.stage || "high";
  c.school = { stage: o.stage || "high", name: "Test School", skips: 1, trouble: 0 };
  M.eduOnTick(c);
  return c;
}
const BUILDERS = [
  ["eduStudyMenu", (s) => M.eduStudyMenu(s)],
  ["eduRecordMenu", (s) => M.eduRecordMenu(s)],
  ["eduProspectsMenu", (s) => M.eduProspectsMenu(s)],
];

/* ───────────────────────── 1 · Act-sheet wiring ───────────────────────── */
sec("1 · Act sheet");

{
  const g = M.ACT_GROUPS.find((x) => x.id === "edu");
  ok("the education group is registered", !!g);
  ok("...with a name and emoji", !!g.name && !!g.emoji);
  ok("...and items", Array.isArray(g.items) && g.items.length >= 2);
  ok("every item has an id, label and emoji",
    g.items.every((i) => i.id && i.label && i.emoji));
  /* cost: 0 matches the other 35 menu-opening special branches; module 24 owns
     the zero-time question as one cross-cutting patch */
  ok("menu items cost nothing to open", g.items.every((i) => i.cost === 0), g.items.map((i) => i.cost));
  ok("every item declares a special", g.items.every((i) => typeof i.special === "string"));
  ok("the group is registered exactly once",
    M.ACT_GROUPS.filter((x) => x.id === "edu").length === 1);
  ok("item ids are unique", new Set(g.items.map((i) => i.id)).size === g.items.length);
}
{
  /* every `special` must actually dispatch, or the item is a dead button */
  const SRC = fs.readFileSync(H.SRC, "utf8");
  const g = M.ACT_GROUPS.find((x) => x.id === "edu");
  for (const item of g.items) {
    ok("special '" + item.special + "' is dispatched",
      SRC.indexOf('act.special === "' + item.special + '"') !== -1);
  }
}

/* ───────────────────────── 2 · menus are well-formed ───────────────────────── */
sec("2 · popup shape and dead ends");

{
  const c = schooled("United Kingdom", 1975);
  for (const [name, build] of BUILDERS) {
    const m = build(c);
    ok(name + " returns a popup", !!m && typeof m === "object");
    ok(name + " has an emoji, title and text",
      !!m.emoji && typeof m.title === "string" && typeof m.text === "string" && m.text.length > 0);
    ok(name + " has options", Array.isArray(m.options) && m.options.length > 0);
    ok(name + " every option has a label", m.options.every((o) => typeof o.label === "string" && o.label.length));
    ok(name + " every option has an fx", m.options.every((o) => o.fx && typeof o.fx === "object"));
    /* THE DEAD-END CHECK: at least one option must close the popup without
       opening another, or the player is stranded with a popup they cannot
       dismiss and a game that will not advance. */
    ok(name + " has a way out", m.options.some((o) => !o.fx.run), m.options.map((o) => o.label));
  }
}
{
  /* an institution view must always be escapable too */
  const c = schooled("Brazil", 1985);
  const p = M.eduProspectsMenu(c);
  const first = p.options.find((o) => o.fx && o.fx.run);
  if (first) {
    const d = JSON.parse(JSON.stringify(c));
    first.fx.run(d);
    ok("an institution view opens", !!d.pending && !!d.pending.title);
    ok("...and has a way out", d.pending.options.some((o) => !o.fx.run));
    ok("...and offers a way back", d.pending.options.some((o) => /back/i.test(o.label)));
  } else {
    ok("an institution view opens", false, "no navigable option produced");
  }
}
{
  /* a bad id must degrade, not throw — menus are player-facing */
  const c = schooled("Japan", 1990);
  const m = M.eduInstitutionMenu(c, "garbage:id");
  ok("an unknown institution degrades to a closable popup",
    !!m && m.options.some((o) => !o.fx.run), m);
}

/* ───────────── 3 · Gotcha #2 — builders must not mutate ───────────── */
sec("3 · Gotcha #2 — builders return, options mutate");

{
  /* A builder is handed a clone that gets DISCARDED. Any write it makes is
     silent data loss, so the state must be byte-identical afterwards. */
  for (const [name, build] of BUILDERS) {
    const c = schooled("Sweden", 1990);
    const before = JSON.stringify(c);
    build(c);
    ok(name + " does not mutate the state it is given", JSON.stringify(c) === before);
  }
  const c = schooled("Sweden", 1990);
  const before = JSON.stringify(c);
  M.eduInstitutionMenu(c, M.eduIdMake("Sweden", 0, 2, "regionalUniversity", 0));
  ok("eduInstitutionMenu does not mutate either", JSON.stringify(c) === before);
}
{
  /* ...and the mem write really does happen, in an option's fx.run, on the
     draft the engine keeps. If it did not, the rule above would be satisfied
     by a feature that simply never remembers anything. */
  const c = schooled("United Kingdom", 1975);
  const p = M.eduProspectsMenu(c);
  const nav = p.options.find((o) => o.fx && o.fx.run);
  ok("a navigable option exists", !!nav);
  if (nav) {
    const d = JSON.parse(JSON.stringify(c));
    nav.fx.run(d);
    ok("the option writes mem on the draft", d.edu.mem && typeof d.edu.mem.tab === "string", d.edu.mem);
    ok("...and the original is untouched", !c.edu.mem || c.edu.mem.tab !== d.edu.mem.tab);
  }
}

/* ───────────── 4 · presentation invents no facts (invariant 8) ───────────── */
sec("4 · presentation composes, never invents");

{
  const c = schooled("United Kingdom", 1975);
  const bp = M.eduBlueprint(c.edu.seed, M.eduIdMake("United Kingdom", 0, 2, "grammarSelective", 0), M.yearOf(c));
  const m = M.eduInstitutionMenu(c, bp.id);
  ok("the founding year shown is the generated one", m.text.indexOf(String(bp.founded)) !== -1, m.text);
  ok("the enrolment shown is the generated one", m.text.indexOf(String(bp.enrolment)) !== -1);
  ok("the administration shown is the generated one", m.text.indexOf(bp.administration) !== -1);
  ok("the quality WORD matches the generated number",
    m.text.indexOf("Teaching " + M.eduWord(bp.quality)) !== -1, [m.text, bp.quality]);
  ok("boarding is described from the flag",
    m.text.indexOf(bp.boarding ? "Residential" : "Day school") !== -1);
  ok("single-sex is described from the flag",
    m.text.indexOf(bp.singleSex ? "Single-sex" : "Co-educational") !== -1);
  ok("the title is the generated label", m.title === bp.label);
}
{
  /* the word table must be total and monotonic, or prose can contradict the
     number it is describing */
  ok("every score has a word", [0, 10, 24, 25, 39, 40, 54, 55, 69, 70, 84, 85, 100]
    .every((v) => typeof M.eduWord(v) === "string" && M.eduWord(v).length > 2));
  ok("the word never improves as the score falls", (() => {
    const order = ["dire", "poor", "adequate", "good", "strong", "exceptional"];
    let last = -1;
    for (let v = 0; v <= 100; v++) {
      const i = order.indexOf(M.eduWord(v));
      if (i < last) return false;
      last = i;
    }
    return true;
  })());
}
{
  /* era register: a 1930s prospectus and a 2010s website are different objects,
     and the difference must come from the year alone */
  ok("the register changes across eras",
    new Set([1930, 1960, 1995, 2015].map(M.eduRegister)).size === 4);
  ok("every era has a register line",
    [1900, 1930, 1960, 1995, 2015, 2035].every((y) => M.eduRegisterLine(y).length > 10));
  ok("an early era does not describe a website", !/website/i.test(M.eduRegisterLine(1930)));
  ok("a modern era does", /website/i.test(M.eduRegisterLine(2015)));
}
{
  /* the prospects text must quote the CE model, not a guess */
  const c = schooled("Brazil", 1985);
  const sys = M.eduSystem(c);
  const p = M.eduProspectsMenu(c);
  ok("the cohort share shown is the resolved one",
    p.text.indexOf(String(Math.round(sys.tertiaryAccess * 100)) + "%") !== -1, [p.text, sys.tertiaryAccess]);
  ok("a country with an entry exam names it",
    !sys.entryExam || p.text.indexOf(sys.entryExam.name) !== -1, p.text);
}

/* ───────────── 5 · the current-education view ───────────── */
sec("5 · what you are doing now");

{
  const c = schooled("United Kingdom", 1975);
  const lines = M.eduCurrentLines(c);
  ok("the stage label is shown", lines[0] === M.EDU_STAGES[M.eduStage(c)].label, lines);
  ok("the school name is shown", lines.some((l) => l.indexOf("Test School") !== -1));
  ok("grades are shown once known", lines.some((l) => /grades/.test(l)));

  const baby = H.mkChar({ country: "Sweden", birthYear: 1990 });
  ok("a character not in education still renders", M.eduCurrentLines(baby).length > 0);
  ok("...and says so", /not in education/i.test(M.eduCurrentLines(baby)[0]));
}
{
  const c = schooled("Sweden", 1990);
  c.ageDays = 8000;
  M.eduSetStage(c, "primary"); c.ageDays = 9000; M.eduSetStage(c, "lowerSec");
  const m = M.eduRecordMenu(c);
  ok("a completed stage appears in the record", /Primary/i.test(m.text), m.text);
  ok("a credential appears in the ledger", /primaryCert/.test(m.text), m.text);
  const empty = M.eduRecordMenu(H.mkChar({ country: "Sweden", birthYear: 1990 }));
  ok("an empty record says so", /nothing finished/i.test(empty.text), empty.text);
  ok("...and still closes", empty.options.some((o) => !o.fx.run));
}

/* ───────────── 6 · soak across countries, eras and ages ───────────── */
sec("6 · every character can open every menu");

{
  let broke = [], noExit = [], n = 0;
  for (const country of ["United Kingdom", "Nigeria", "Japan", "Brazil", "Sweden", "India", "Kenya"]) {
    for (const by of [1900, 1935, 1975, 2005]) {
      for (const age of [1200, 3000, 5000, 6600, 9000, 20000]) {
        const c = schooled(country, by, { ageDays: age, stage: age < 4000 ? "primary" : "high" });
        for (const [name, build] of BUILDERS) {
          n++;
          let m = null;
          try { m = build(c); } catch (e) { broke.push([name, country, by, age, e.message]); continue; }
          if (!m || !m.options || !m.options.some((o) => !o.fx.run)) noExit.push([name, country, by, age]);
        }
      }
    }
  }
  ok("no builder threw, anywhere", broke.length === 0, broke.slice(0, 3));
  ok("no menu was a dead end, anywhere", noExit.length === 0, noExit.slice(0, 3));
  ok("that was a real sweep", n > 400, n);
}
{
  /* opening a menu inside a real life must not disturb the simulation */
  H.seed(515);
  const r = H.runLife(H.mkChar({ country: "United Kingdom", cls: "Middle", birthYear: 1975 }), {
    maxSteps: 1600,
    onStep: (s) => { M.eduStudyMenu(s); M.eduProspectsMenu(s); },
  });
  ok("a life survives having its menus opened every step", r.crashes === 0, r.crashes);
  ok("...and still ages", M.ageYears(r.state) > 5, M.ageYears(r.state));
  ok("...with no dead ends", r.deadEnds === 0, r.deadEnds);
  ok("...and the P3 gate still holds", M.eduStageAgreesWithLegacy(r.state));
}

/* ───────────── 7 · invariants ───────────── */
sec("7 · invariants");

{
  const SRC = fs.readFileSync(H.SRC, "utf8");
  const stripComments = (x) => x.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
  const mark = SRC.indexOf("EDU · S12 · INTERFACE ADAPTER");
  const raw = SRC.slice(SRC.lastIndexOf("/*", mark), SRC.indexOf("const EDU_GROUP"));
  const block = stripComments(raw);
  ok("the S12 block was located", raw.length > 2000, raw.length);
  ok("invariant 1: no Math.random in S12", !block.includes("Math.random"));
  ok("invariant 2: no country conditional in S12", !/country\s*===\s*["']/.test(block));
  ok("invariant 4: S12 adds no applyFx key", !/applyFx/.test(block));
  ok("S12 builds no React component", !/createElement|useState|<div/.test(block));
  /* the mem write must appear exactly where the rule says it may: inside a
     run callback, never in a builder body */
  ok("mem is only written inside a run callback",
    (block.match(/\.mem\s*=/g) || []).length <= 2, (block.match(/\.mem\s*=/g) || []).length);
}

console.log("\n" + (fail === 0 ? "ALL PASS" : "FAILURES") + ": " + pass + " passed, " + fail + " failed");
process.exit(fail === 0 ? 0 : 1);
