/* test-ui.js — keybindings, the Career subtabs, and the shared subtab bar.
 *
 * WHAT MATTERS HERE
 *
 *   1. CONTEXT. `1`-`9` are deliberately bound twice — to a main tab and to a
 *      popup choice. That is only safe because a popup is modal, so exactly
 *      one context is live. If kbResolve ever stops taking context into
 *      account, pressing 1 to pick an option would also jump you to the Life
 *      tab, and the bug would look like "the popup closed weirdly".
 *   2. THE TYPING GUARD. The Creation screen has text inputs. Without the
 *      guard, naming a character would advance time and switch tabs on every
 *      keystroke. This is the single highest-consequence line in the feature.
 *   3. REBINDING ROUND-TRIPS. What kbChord produces from an event must be
 *      exactly what kbResolve matches, or a binding captured in Settings
 *      silently never fires.
 *   4. CAREER HISTORY IS CAPTURED BY DIFFING. s.career.job is written in seven
 *      places; history must record all of them without any of them knowing.
 *
 * Run: node --max-old-space-size=4096 test-ui.js
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

const mk = (o) => H.mkChar(Object.assign({ country: "Sweden", birthYear: 1990, cls: "Middle" }, o || {}));
/* a keyboard event as the browser would deliver it */
const ev = (key, mods) => Object.assign({ key: key, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false }, mods || {});

/* ═══════════════ 1 · chords ═══════════════ */
sec("1 · chords round-trip");

{
  ok("a bare key", M.kbChord(ev("a")) === "a");
  ok("...is lower-cased", M.kbChord(ev("A")) === "a");
  ok("ctrl", M.kbChord(ev("a", { ctrlKey: true })) === "ctrl+a");
  ok("alt", M.kbChord(ev("a", { altKey: true })) === "alt+a");
  ok("shift", M.kbChord(ev("a", { shiftKey: true })) === "shift+a");
  /* order is fixed, or the same combination produces two different strings
     depending on which modifier the browser reports first */
  ok("modifiers are always in the same order",
    M.kbChord(ev("a", { ctrlKey: true, altKey: true, shiftKey: true })) === "ctrl+alt+shift+a");
  ok("cmd counts as ctrl, so a Mac is not locked out",
    M.kbChord(ev("a", { metaKey: true })) === "ctrl+a");
  ok("space is a real binding", M.kbChord(ev(" ")) === " ");
  ok("arrows survive", M.kbChord(ev("ArrowRight", { ctrlKey: true })) === "ctrl+arrowright");

  /* formatting is for humans and must never print a raw key name */
  ok("space formats readably", M.kbFormat(" ") === "Space");
  ok("arrows format as arrows", M.kbFormat("ctrl+arrowright") === "Ctrl + →");
  ok("escape formats readably", M.kbFormat("escape") === "Esc");
  ok("a plain letter is upper-cased", M.kbFormat("a") === "A");
  ok("nothing formats as an em dash rather than 'undefined'", M.kbFormat(null) === "—");
  ok("every default formats without printing undefined",
    M.KB_ACTIONS.every((a) => { const f = M.kbFormat(a.def); return f && !/undefined/.test(f); }),
    M.KB_ACTIONS.filter((a) => /undefined/.test(M.kbFormat(a.def))).map((a) => a.id));
}

/* ═══════════════ 2 · context ═══════════════ */
sec("2 · context decides what a key means");

{
  const s = mk();
  ok("1 goes to Life in the game", M.kbResolve(s, "1", "game") === "tabLife");
  ok("1 picks option 1 in a popup", M.kbResolve(s, "1", "popup") === "choose1");
  ok("...and the tabs are unreachable from a popup", M.kbResolve(s, "3", "popup") === "choose3");
  ok("...and choices are unreachable from the game", M.kbResolve(s, "9", "game") === null,
    M.kbResolve(s, "9", "game"));
  ok("Escape works in both", M.kbResolve(s, "escape", "game") === "dismiss" && M.kbResolve(s, "escape", "popup") === "dismiss");
  ok("space advances time in the game", M.kbResolve(s, " ", "game") === "advance");
  ok("...and does nothing in a popup", M.kbResolve(s, " ", "popup") === null);
  ok("an unbound chord resolves to nothing", M.kbResolve(s, "ctrl+alt+q", "game") === null);

  /* THE reason context exists: without it these five would be real conflicts */
  ok("the defaults report no conflicts", M.kbConflicts(s).length === 0, M.kbConflicts(s));
  ok("...and a genuine clash IS reported", (() => {
    const d = mk();
    M.kbSet(d, "act", "1");                 // now two game-context actions share "1"
    return M.kbConflicts(d).some((c) => c.ctx === "game" && c.chord === "1");
  })());
}

/* ═══════════════ 3 · the typing guard ═══════════════ */
sec("3 · keys never fire while typing");

{
  ok("a text input swallows keys", M.kbIsTyping({ tagName: "INPUT" }) === true);
  ok("a textarea does too", M.kbIsTyping({ tagName: "TEXTAREA" }) === true);
  ok("and a select", M.kbIsTyping({ tagName: "SELECT" }) === true);
  ok("contenteditable counts", M.kbIsTyping({ tagName: "DIV", isContentEditable: true }) === true);
  ok("lower-case tag names are handled too", M.kbIsTyping({ tagName: "input" }) === true);
  ok("an ordinary div does not", M.kbIsTyping({ tagName: "DIV" }) === false);
  ok("a button does not", M.kbIsTyping({ tagName: "BUTTON" }) === false);
  ok("no target at all is safe", M.kbIsTyping(null) === false && M.kbIsTyping(undefined) === false);
  /* the handler must consult it — a guard nobody calls is not a guard */
  const SRC = fs.readFileSync(H.SRC, "utf8");
  ok("the key handler actually calls the guard", /if \(kbIsTyping\(e\.target\)\) return;/.test(SRC));
  ok("...and checks the enabled flag", /state\.cfg\.kbEnabled === false\) return;/.test(SRC));
  ok("...and ignores auto-repeat unless the action allows it", /e\.repeat && !\(KB_BY_ID\[id\] && KB_BY_ID\[id\]\.repeatable\)/.test(SRC));
}

/* ═══════════════ 4 · rebinding ═══════════════ */
sec("4 · rebinding");

{
  const s = mk();
  ok("nothing is overridden to begin with", Object.keys(s.cfg.keys).length === 0);
  M.kbSet(s, "act", "ctrl+alt+k");
  ok("an override is stored", s.cfg.keys.act === "ctrl+alt+k");
  ok("...and resolves", M.kbResolve(s, "ctrl+alt+k", "game") === "act");
  ok("...and the old chord no longer does", M.kbResolve(s, "a", "game") === null);

  /* a chord captured from a real event must resolve — same function both ends */
  const captured = M.kbChord(ev("K", { ctrlKey: true, altKey: true }));
  ok("what Settings captures is what the handler matches",
    M.kbResolve(s, captured, "game") === "act", captured);

  M.kbSet(s, "act", M.KB_BY_ID.act.def);
  ok("rebinding back to the default drops the override rather than storing it",
    s.cfg.keys.act === undefined, s.cfg.keys);
  M.kbSet(s, "act", "ctrl+alt+k");
  M.kbSet(s, "act", null);
  ok("clearing also drops it", s.cfg.keys.act === undefined);

  M.kbSet(s, "advance", "z");
  M.kbSet(s, "act", "x");
  M.kbReset(s);
  ok("restore-defaults clears everything", Object.keys(s.cfg.keys).length === 0);
  ok("...and the defaults are back", M.kbResolve(s, " ", "game") === "advance");

  ok("an unknown action cannot be bound", (() => {
    const d = mk();
    M.kbSet(d, "notAnAction", "q");
    return d.cfg.keys.notAnAction === undefined;
  })());
}
{
  /* config state, with the same Gotcha #4 discipline as everything else */
  const s = mk();
  ok("a new life has a config", !!s.cfg && s.cfg.v === 1 && s.cfg.kbEnabled === true);
  const old = JSON.parse(JSON.stringify(s));
  delete old.cfg;
  M.migrate(old);
  ok("an old save is backfilled", !!old.cfg && !!old.cfg.keys);
  const bad = JSON.parse(JSON.stringify(s));
  bad.cfg = { v: 9, keys: "nonsense", kbEnabled: "yes" };
  M.migrate(bad);
  ok("a damaged config is repaired",
    bad.cfg.keys && typeof bad.cfg.keys === "object" && bad.cfg.kbEnabled === true && bad.cfg.v === 1);
  /* a save from a later build may bind actions this one does not have */
  const future = JSON.parse(JSON.stringify(s));
  future.cfg.keys = { act: "q", timeTravel: "ctrl+t" };
  M.migrate(future);
  ok("bindings for actions this build lacks are dropped",
    future.cfg.keys.act === "q" && future.cfg.keys.timeTravel === undefined, future.cfg.keys);
}
{
  /* every action is reachable and described */
  ok("every action belongs to a declared group",
    M.KB_ACTIONS.every((a) => M.KB_GROUPS.some((g) => g.id === a.group)),
    M.KB_ACTIONS.filter((a) => !M.KB_GROUPS.some((g) => g.id === a.group)).map((a) => a.id));
  ok("every action has a label and a default",
    M.KB_ACTIONS.every((a) => a.label && a.def));
  ok("action ids are unique", new Set(M.KB_ACTIONS.map((a) => a.id)).size === M.KB_ACTIONS.length);
  ok("the popup choices cover 1-9",
    M.KB_ACTIONS.filter((a) => a.inPopup).length === 9);
}

/* ═══════════════ 5 · career ═══════════════ */
sec("5 · the career screen");

{
  ok("there are eight subtabs", M.CR_TABS.length === 8, M.CR_TABS.length);
  ok("every one has a renderer", M.CR_TABS.every((t) => typeof M.CR_SUBPANELS[t.id] === "function"),
    M.CR_TABS.filter((t) => typeof M.CR_SUBPANELS[t.id] !== "function").map((t) => t.id));
  ok("ids are unique", new Set(M.CR_TABS.map((t) => t.id)).size === 8);
  for (const id of ["job", "ladder", "edu", "quals", "skills", "money", "hustle", "history"]) {
    ok("the " + id + " tab exists", M.CR_TABS.some((t) => t.id === id));
  }
}
{
  /* HISTORY IS CAPTURED BY DIFFING — nothing calls into the history list, so
     all seven job write sites are covered, including ones added later */
  const s = mk();
  s.ageDays = Math.round(22 * 365.25);
  ok("a new life has an empty record", s.cr.hist.length === 0 && s.cr.cur === null);

  s.career.job = { industry: "retail", title: "Sales Associate", tier: 1, salary: 120, boss: "B", perf: 55, since: s.ageDays };
  M.crOnTick(s);
  ok("being hired opens an entry", s.cr.hist.length === 1 && s.cr.hist[0].to === null);

  s.ageDays += 365 * 3;
  s.career.job.title = "Shift Lead"; s.career.job.tier = 2; s.career.job.salary = 180;
  M.crOnTick(s);
  ok("a promotion is its own row", s.cr.hist.length === 2, s.cr.hist.length);
  ok("...and closes the previous one", s.cr.hist[0].to !== null);

  s.ageDays += 365 * 2;
  s.career.job = null;                        // laid off / quit / retired — all identical here
  M.crOnTick(s);
  ok("losing the job closes the entry without opening one",
    s.cr.hist.length === 2 && s.cr.hist[1].to !== null);

  s.ageDays += 365;
  s.career.job = { industry: "tech", title: "Dev", tier: 2, salary: 400, boss: "C", perf: 55, since: s.ageDays };
  M.crOnTick(s);
  ok("a new job opens a new entry", s.cr.hist.length === 3 && s.cr.hist[2].to === null);

  /* the unemployed year must not count as worked */
  ok("years worked excludes the gap", Math.abs(M.crYearsWorked(s) - 5) < 0.1, M.crYearsWorked(s));
  ok("peak pay is the best ever, not the current", M.crPeakPay(s) === 400);

  /* an unchanged job must not spam rows */
  const before = s.cr.hist.length;
  for (let i = 0; i < 50; i++) { s.ageDays += 30; M.crOnTick(s); }
  ok("ticking with no change records nothing", s.cr.hist.length === before, s.cr.hist.length);
}
{
  /* an existing save has a job and no history behind it */
  const s = mk();
  s.ageDays = Math.round(45 * 365.25);
  s.career.job = { industry: "law", title: "Solicitor", tier: 3, salary: 700, boss: "D", perf: 60, since: Math.round(30 * 365.25) };
  delete s.cr;
  M.migrate(s);
  ok("a save with a job but no record is seeded", s.cr.hist.length === 1, s.cr.hist.length);
  ok("...from the job's own start date, not from today",
    s.cr.hist[0].from === Math.round(30 * 365.25), s.cr.hist[0].from);
  ok("...and is still open", s.cr.hist[0].to === null);
  ok("...so years worked is fifteen, not zero", Math.abs(M.crYearsWorked(s) - 15) < 0.2, M.crYearsWorked(s));

  const bad = mk();
  bad.cr = { v: 99, hist: "nope", cur: undefined };
  M.migrate(bad);
  ok("a damaged record is repaired", Array.isArray(bad.cr.hist) && bad.cr.v === 1);
}
{
  /* credential and stage labels must never print a raw id at the player */
  ok("credential labels exist", !!M.EDU_CRED_LABEL && Object.keys(M.EDU_CRED_LABEL).length > 6);
  ok("every stage that awards a credential has a label for it",
    Object.values(M.EDU_STAGES).filter((st) => st.exitCredential)
      .every((st) => !!M.EDU_CRED_LABEL[st.exitCredential]));
  /* the two named after the institution rather than the award */
  ok("a bachelor's is a degree, not 'University'", M.EDU_CRED_LABEL.bachelor === "Bachelor's degree");
  ok("an associate is a degree, not 'Community college'", M.EDU_CRED_LABEL.associate === "Associate degree");
  ok("no label is a bare id", Object.entries(M.EDU_CRED_LABEL).every(([k, v]) => v !== k));
  ok("stage labels exist for every stage",
    Object.keys(M.EDU_STAGES).every((k) => !!M.EDU_STAGE_LABEL[k]));
}

/* ═══════════════ 6 · the subtab bar ═══════════════ */
sec("6 · one bar, three screens");

{
  const SRC = fs.readFileSync(H.SRC, "utf8");
  ok("there is a single shared bar component", /function SubtabBar\(/.test(SRC));
  const uses = (SRC.match(/<SubtabBar\b/g) || []).length;
  ok("all three screens use it", uses === 3, uses);
  /* the affordance is the whole reason it exists: the bar used to end
     mid-word with nothing to say it continued */
  ok("it fades at the edge that has more to show", /linear-gradient\(to \$\{side/.test(SRC));
  ok("...and offers arrows", /aria-label="Scroll tabs (left|right)"/.test(SRC));
  ok("...only when there is something that way",
    /\{edge\.l && <button/.test(SRC) && /\{edge\.r && <button/.test(SRC));
  ok("the selected chip is scrolled into view", /scrollIntoView/.test(SRC));
  ok("every tab list it is given is non-empty and well-formed",
    [M.HLT_TABS, M.PPL_TABS, M.CR_TABS].every((list) =>
      list.length > 0 && list.every((t) => t.id && t.emoji && t.label)));
  /* subtab state is lifted, or the key handler cannot move through them */
  ok("subtab lists are registered against their main tab",
    M.TAB_SUBS.people === M.PPL_TABS && M.TAB_SUBS.career === M.CR_TABS && M.TAB_SUBS.health === M.HLT_TABS);
  ok("the main tab order is complete", M.MAIN_TABS.length === 5);
  ok("...and every tab with subtabs is in it",
    Object.keys(M.TAB_SUBS).every((t) => M.MAIN_TABS.indexOf(t) !== -1));
}

/* ═══════════════ 7 · nothing broke ═══════════════ */
sec("7 · lives still run");

{
  let crashes = 0, aged = 0, withCfg = 0, withCr = 0;
  for (const sd of [2, 9, 16, 23]) {
    H.seed(sd);
    const s = H.mkChar({ country: ["Sweden", "Brazil", "Nigeria", "India"][sd % 4], birthYear: 1950 + (sd % 4) * 16 });
    let r;
    try { r = H.runLife(s, { maxSteps: 2000, days: 30 }); } catch (e) { crashes++; continue; }
    if (r.finalAge > 5) aged++;
    if (r.state.cfg && r.state.cfg.keys) withCfg++;
    if (r.state.cr && Array.isArray(r.state.cr.hist)) withCr++;
  }
  ok("no life crashed", crashes === 0, crashes);
  ok("time actually moved", aged === 4, aged);
  ok("every life kept a config", withCfg === 4, withCfg);
  ok("every life kept a career record", withCr === 4, withCr);
}

console.log("\n" + (fail === 0 ? "ALL PASS" : "FAILURES") + ": " + pass + " passed, " + fail + " failed");
process.exit(fail === 0 ? 0 : 1);
