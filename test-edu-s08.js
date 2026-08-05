/* test-edu-s08.js — EDU S08 + S10 + S11, and THE INVERSION
 *
 * The last phase, and the only non-additive one. Section 5 is the gate: after
 * inversion s.edu.stage is the truth and legacy is its projection, which is
 * the reverse of the arrangement every phase from P3 to P7 ran under.
 *
 * The projection is deliberately LOSSY. EDU has 16 rungs and legacy has 6, so
 * a character reading for a master's is "college" to legacy and cannot be
 * recovered from it. Asking otherwise would be asking a narrower vocabulary to
 * remember a word it never had.
 *
 * Run: node --max-old-space-size=4096 test-edu-s08.js
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

function graduate(country, birthYear, opts) {
  const o = opts || {};
  const c = H.mkChar({ country, birthYear, cls: o.cls || "Middle" });
  c.ageDays = o.ageDays != null ? o.ageDays : Math.round(23 * 365.25);
  M.eduSetStage(c, "done");
  if (o.creds) for (const id of o.creds) M.eduAwardCredential(c, id, {});
  return c;
}

/* ───────────────────────── 1 · postgraduate tracks (S08) ───────────────────────── */
sec("1 · S08 post-secondary");

{
  ok("the track table is non-trivial", Object.keys(M.EDU_PG_TRACKS).length >= 6);
  ok("every track names a credential and a duration",
    Object.values(M.EDU_PG_TRACKS).every((t) => !!t.cred && t.days > 0 && !!t.label));
  ok("every track's rung exists in the ladder",
    Object.keys(M.EDU_PG_TRACKS).every((k) => !!M.EDU_STAGES[k]));
  ok("a doctorate takes longer than a certificate",
    M.EDU_PG_TRACKS.doctorate.days > M.EDU_PG_TRACKS.gradCert.days);
  ok("prerequisites name real credentials",
    Object.values(M.EDU_PG_TRACKS).every((t) => !t.needs ||
      Object.values(M.EDU_PG_TRACKS).some((u) => u.cred === t.needs) || t.needs === "bachelor"));
}
{
  const bare = graduate("Sweden", 1990);
  const grad = graduate("Sweden", 1990, { creds: ["bachelor"] });
  const master = graduate("Sweden", 1990, { creds: ["bachelor", "masters"] });

  ok("a master's needs a bachelor's", M.eduPgAvailable(bare).indexOf("masters") === -1);
  ok("...and is available with one", M.eduPgAvailable(grad).indexOf("masters") !== -1, M.eduPgAvailable(grad));
  ok("a doctorate needs a master's", M.eduPgAvailable(grad).indexOf("doctorate") === -1);
  ok("...and is available with one", M.eduPgAvailable(master).indexOf("doctorate") !== -1);
  ok("vocational needs nothing", M.eduPgAvailable(bare).indexOf("vocational") !== -1);
  ok("a credential you already hold is not offered again",
    M.eduPgAvailable(master).indexOf("masters") === -1);
}
{
  /* the rung must exist in this country and era, not merely in the table */
  const early = graduate("Nigeria", 1900, { creds: ["bachelor"] });
  const modern = graduate("Sweden", 2000, { creds: ["bachelor"] });
  ok("a scarce system offers fewer postgraduate tracks",
    M.eduPgAvailable(early).length < M.eduPgAvailable(modern).length,
    [M.eduPgAvailable(early), M.eduPgAvailable(modern)]);
}
{
  /* enrolment, and completion ON SCHEDULE — never a dice roll */
  const c = graduate("Sweden", 1990, { creds: ["bachelor"] });
  ok("enrolling succeeds", M.eduPgStart(c, "masters") === true);
  ok("...and records the enrolment", !!c.edu.pg && c.edu.pg.track === "masters");
  ok("...and moves the canonical stage", c.edu.stage === "masters", c.edu.stage);
  ok("...and reads as studying", M.eduIsStudying(c));
  ok("enrolling twice is refused", M.eduPgStart(c, "mba") === false);
  ok("enrolling without the prerequisite is refused",
    M.eduPgStart(graduate("Sweden", 1990), "doctorate") === false);

  ok("it does not finish early", M.eduPgTick(c) === null);
  c.ageDays += M.EDU_PG_TRACKS.masters.days;
  const line = M.eduPgTick(c);
  ok("it finishes on schedule", typeof line === "string" && line.length > 10, line);
  ok("...awarding the credential", c.edu.cred.some((x) => x.id === "masters"));
  ok("...clearing the enrolment", c.edu.pg === null);
  ok("...and returning the character to done", c.edu.stage === "done");
  ok("ticking again does nothing", M.eduPgTick(c) === null);
}
{
  /* a full ladder must stay inside the state budget */
  const c = graduate("Sweden", 1990, { creds: ["bachelor"] });
  for (const track of ["masters", "doctorate", "mba", "gradCert"]) {
    if (M.eduPgAvailable(c).indexOf(track) === -1) continue;
    M.eduPgStart(c, track);
    c.ageDays += M.EDU_PG_TRACKS[track].days;
    M.eduPgTick(c);
  }
  ok("a character who studied everything holds several credentials",
    c.edu.cred.length >= 3, c.edu.cred.map((x) => x.id));
  ok("...and s.edu is still inside budget",
    Buffer.byteLength(JSON.stringify(c.edu)) < 2560, Buffer.byteLength(JSON.stringify(c.edu)));
}

/* ───────────────────────── 2 · adult and lifelong (S10) ───────────────────────── */
sec("2 · S10 adult education");

{
  const young = H.mkChar({ country: "Brazil", birthYear: 1990 });
  young.ageDays = Math.round(12 * 365.25);
  ok("a child is not offered adult re-entry", !M.eduCanReenter(young));

  const dropout = graduate("Brazil", 1970, { ageDays: Math.round(34 * 365.25) });
  ok("an adult with no diploma can go back", M.eduCanReenter(dropout));
  /* THE POINT OF S10: the gate is a missing credential, never a birthday */
  const old = graduate("Brazil", 1940, { ageDays: Math.round(61 * 365.25) });
  ok("...at any age", M.eduCanReenter(old));

  const done = graduate("Brazil", 1970, { ageDays: Math.round(34 * 365.25), creds: ["secondaryDiploma"] });
  ok("someone who already finished is not offered it", !M.eduCanReenter(done));
  const bach = graduate("Brazil", 1970, { ageDays: Math.round(34 * 365.25), creds: ["bachelor"] });
  ok("nor is a graduate", !M.eduCanReenter(bach));

  ok("re-entry enrols", M.eduReenter(dropout) === true);
  ok("...and is recorded", !!dropout.edu.pg && dropout.edu.pg.track === "adultSecondary");
  ok("re-entering twice is refused", M.eduReenter(dropout) === false);
}
{
  const c = graduate("United States", 1970, { ageDays: Math.round(30 * 365.25) });
  ok("prison study is unavailable outside prison", !M.eduPrisonStudyAvailable(c));
  c.flags.prison = { until: c.ageDays + 2000 };
  const inside = typeof M.inPrison === "function" ? M.inPrison(c) : false;
  ok("the prison check is wired to module 12's own predicate",
    typeof M.inPrison === "function");
  if (inside) ok("prison study becomes available", M.eduPrisonStudyAvailable(c));
  else ok("prison study follows module 12's predicate", !M.eduPrisonStudyAvailable(c));
}

/* ───────────────────────── 3 · the research overlay (S11 / OQ-6) ───────────────────────── */
sec("3 · S11 overlay — inert until module 09 answers OQ-6");

{
  ok("the overlay kinds are defined", Object.keys(M.EDU_OVERLAY_KINDS).length === 3);
  ok("each names a prerequisite credential",
    Object.values(M.EDU_OVERLAY_KINDS).every((o) => !!o.needs && !!o.cred && o.days > 0));
  const phd = graduate("United States", 1980, { creds: ["bachelor", "masters", "phd"] });
  ok("a doctor is eligible for a postdoc", M.eduOverlayEligible(phd).indexOf("postdoc") !== -1);
  const bare = graduate("United States", 1980);
  ok("someone without the credential is not", M.eduOverlayEligible(bare).length === 0);

  /* THE ASSERTION THIS SECTION EXISTS FOR. Modelling residency literally would
     duplicate module 09 — a second employer, salary and promotion ladder —
     which the project rule against duplicated business logic forbids. Until
     OQ-6 is answered, EDU must own the TRAINING and none of the EMPLOYMENT. */
  const SRC = fs.readFileSync(H.SRC, "utf8");
  const stripComments = (x) => x.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
  const mark = SRC.indexOf("EDU · S08 + S10 + S11");
  const raw = SRC.slice(SRC.lastIndexOf("/*", mark), SRC.indexOf("EDU · INVERSION"));
  const block = stripComments(raw);
  ok("the S08/S10/S11 block was located", raw.length > 2000, raw.length);
  ok("S11 declares no salary", !/salary|wage|pay\b/i.test(block));
  ok("S11 declares no employer", !/employer|hire|promotion/i.test(block));
  ok("S11 does not write s.career", !/s\.career\s*=|career\.job\s*=/.test(block));
}

/* ───────────────────────── 4 · invariants ───────────────────────── */
sec("4 · invariants");

{
  const SRC = fs.readFileSync(H.SRC, "utf8");
  const stripComments = (x) => x.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
  const mark = SRC.indexOf("EDU · S08 + S10 + S11");
  const block = stripComments(SRC.slice(SRC.lastIndexOf("/*", mark), SRC.indexOf("EDU · INVERSION")));
  ok("invariant 1: no Math.random in S08/S10/S11", !block.includes("Math.random"));
  ok("invariant 2: no country conditional", !/country\s*===\s*["']/.test(block));
  ok("invariant 10: progression is scheduled, not POOL", !/POOL\.push/.test(block));
  ok("EDU's POOL budget is still held", M.POOL.length <= 238, M.POOL.length);
}

/* ═════════════════ 5 · THE INVERSION ═════════════════ */
sec("5 · THE INVERSION — s.edu is authoritative");

{
  ok("the projection table covers every rung",
    Object.keys(M.EDU_STAGES).every((k) => !!M.EDU_TO_LEGACY_STAGE[k]),
    Object.keys(M.EDU_STAGES).filter((k) => !M.EDU_TO_LEGACY_STAGE[k]));
  ok("every projected value is a legacy value",
    Object.values(M.EDU_TO_LEGACY_STAGE)
      .every((v) => ["pre", "primary", "middle", "high", "college", "done"].indexOf(v) !== -1));
  /* the projection is deliberately many-to-one; that is the lossiness */
  ok("the projection is lossy, as designed",
    new Set(Object.values(M.EDU_TO_LEGACY_STAGE)).size < Object.keys(M.EDU_TO_LEGACY_STAGE).length);
  ok("the representable set is exactly the round-trippable stages",
    Object.keys(M.EDU_LEGACY_REPRESENTABLE)
      .every((k) => M.eduLegacyStage({ education: { stage: M.EDU_TO_LEGACY_STAGE[k] } }) === k),
    Object.keys(M.EDU_LEGACY_REPRESENTABLE)
      .filter((k) => M.eduLegacyStage({ education: { stage: M.EDU_TO_LEGACY_STAGE[k] } }) !== k));
}
{
  /* the sole writer must keep legacy in step on every write */
  const c = H.mkChar({ country: "Japan", birthYear: 1990 });
  for (const rung of ["primary", "lowerSec", "upperSec", "university", "masters", "done"]) {
    c.ageDays += 700;
    M.eduSetStage(c, rung);
    ok("setting " + rung + " projects onto legacy", M.eduProjectionIsConsistent(c),
      [c.edu.stage, c.education.stage]);
  }
  ok("a postgraduate rung reads as college to legacy", (() => {
    const d = H.mkChar({ country: "Japan", birthYear: 1990 });
    M.eduSetStage(d, "doctorate");
    return d.education.stage === "college";
  })());
}
{
  /* the inverted reader must agree with what it replaced */
  const c = H.mkChar({ country: "Sweden", birthYear: 1990 });
  M.eduSetStage(c, "primary");
  ok("inSchool is true at primary", M.inSchool(c));
  M.eduSetStage(c, "upperSec");
  ok("...and at upper secondary", M.inSchool(c));
  M.eduSetStage(c, "university");
  ok("...but not at university", !M.inSchool(c));
  M.eduSetStage(c, "done");
  ok("...nor when finished", !M.inSchool(c));
  ok("eduStage returns the canonical stage", M.eduStage(c) === c.edu.stage);
}
{
  /* a PRE-INVERSION save must still migrate cleanly — this is the one that
     matters for anyone already playing */
  const c = H.mkChar({ country: "United Kingdom", birthYear: 1975 });
  c.education.stage = "high";
  delete c.edu;
  M.migrate(c);
  ok("a pre-EDU save still migrates", !!c.edu);
  ok("...to the right canonical stage", c.edu.stage === "upperSec", c.edu.stage);
  ok("...and the projection is consistent", M.eduProjectionIsConsistent(c));
  ok("...and inSchool still answers correctly", M.inSchool(c));
}
{
  /* THE GATE: drive real lives and demand the projection holds at every step */
  const CELLS = [
    ["United Kingdom", 1935], ["United Kingdom", 2005], ["Nigeria", 1955],
    ["Sweden", 1975], ["Japan", 1990], ["Brazil", 1965], ["India", 1995], ["Kenya", 1980],
  ];
  let steps = 0, broken = [], crashes = 0, deadEnds = 0, aged = 0, lagRun = 0, persistent = 0;
  const stagesSeen = {};
  for (let i = 0; i < CELLS.length; i++) {
    const [country, birthYear] = CELLS[i];
    H.seed(8800 + i);
    const r = H.runLife(H.mkChar({ country, birthYear, cls: H.CLASSES[i % 4] }), {
      maxSteps: 2200,
      onStep: (s) => {
        steps++;
        stagesSeen[M.eduStage(s)] = (stagesSeen[M.eduStage(s)] || 0) + 1;
        if (!M.EDU_STAGES[M.eduStage(s)]) broken.push([country, M.eduStage(s)]);
        /* one step of lag is possible where a legacy path writes directly;
           persistent lag would mean a writer bypassing eduSetStage entirely */
        if (!M.eduProjectionIsConsistent(s)) { lagRun++; if (lagRun > 1) persistent++; }
        else lagRun = 0;
      },
    });
    crashes += r.crashes; deadEnds += r.deadEnds;
    if (M.ageYears(r.state) > 5) aged++;
  }
  ok("the sweep ran real lives", steps > 3000, steps);
  ok("nobody aged zero days", aged === CELLS.length, aged);
  ok("no crashes", crashes === 0, crashes);
  ok("no dead ends", deadEnds === 0, deadEnds);
  ok("the canonical stage is always a known rung", broken.length === 0, broken.slice(0, 3));
  ok("THE GATE: the legacy projection never persistently disagrees", persistent === 0, persistent);
  ok("more than one stage was reached", Object.keys(stagesSeen).length >= 3, stagesSeen);
}
{
  /* nothing may write the legacy stage directly any more — that is what
     inversion means, and a stray write is exactly what would rot it */
  const SRC = fs.readFileSync(H.SRC, "utf8");
  const stripComments = (x) => x.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
  const direct = (stripComments(SRC).match(/education\.stage\s*=[^=]/g) || []).length;
  /* exactly one: the projection inside eduProjectToLegacy */
  ok("legacy stage has exactly one writer, the projection", direct === 1, direct);
  ok("...and it is eduProjectToLegacy", /function eduProjectToLegacy[\s\S]{0,400}education\.stage = want/.test(SRC));
}

console.log("\n" + (fail === 0 ? "ALL PASS" : "FAILURES") + ": " + pass + " passed, " + fail + " failed");
process.exit(fail === 0 ? 0 : 1);
