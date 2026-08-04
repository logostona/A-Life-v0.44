/* test-identity.js — are the five identity axes actually independent?
 *
 * The reference this was built from makes one structural claim over and over:
 * biological sex, gender identity, gender expression, sexual orientation and
 * romantic orientation are five separate axes, and none can be inferred from
 * the others. That claim is testable, and it is the thing most likely to
 * silently stop being true — every one of these axes has a "sensible default"
 * derived from another, and a default is one careless edit away from becoming
 * a derivation again.
 *
 * So the assertions below are mostly of one shape: hold four axes fixed, vary
 * the fifth, and prove the other four didn't move. A suite that only checked
 * "does a trans character exist" would pass happily while expression quietly
 * collapsed back into being a synonym for gender.
 *
 * Everything here must hold for ANY character in ANY era — never a specific
 * roll, which would just be re-testing the RNG.
 *
 * Run: node --max-old-space-size=4096 test-identity.js
 */
"use strict";

const path = require("path");
const H = require(path.join(__dirname, "harness.js"));
const M = H.M;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log("  FAIL: " + name + (extra !== undefined ? "  " + JSON.stringify(extra).slice(0, 400) : "")); }
}
function sec(t) { console.log("\n=== " + t + " ==="); }

/* ───────────────────────── 1. vocabulary integrity ───────────────────────── */
sec("1. vocabulary");

ok("gender vocabulary is non-trivial", M.GENDER_ALL.length >= 10, M.GENDER_ALL.length);
ok("orientation vocabulary covers the ace spectrum",
  ["Asexual", "Demisexual", "Gray-asexual"].every((x) => M.ORIENT_ALL.includes(x)));
ok("romantic vocabulary covers the aro spectrum",
  ["Aromantic", "Demiromantic", "Grayromantic"].every((x) => M.ROMANTIC_ALL.includes(x)));

/* The reference is explicit that Two-Spirit belongs only to Indigenous people
   and is inseparable from specific tribal contexts. Offering it as a free pick
   would be the misuse it warns about, so its ABSENCE is the correct behavior
   and is pinned here — otherwise a future "let's be more inclusive" edit
   reintroduces it without anyone reconsidering the reasoning. */
ok("Two-Spirit is deliberately not a pickable label",
  !M.GENDER_ALL.includes("Two-Spirit") && !M.GENDER_ALL.some((g) => /two.?spirit/i.test(g)));

/* Every label the roller can emit must have discovery prose. A missing key
   here prints a literal "undefined" into the feed at the single most important
   beat in the character's life, and nothing else would catch it. */
for (const o of M.ORIENT_ALL) {
  ok("orientation '" + o + "' has discovery text", typeof M.ORIENT_DISCOVERY_TEXT[o] === "string" && M.ORIENT_DISCOVERY_TEXT[o].length > 20);
}
for (const r of M.ROMANTIC_ALL) {
  ok("romantic '" + r + "' has discovery text", typeof M.ROMANTIC_DISCOVERY_TEXT[r] === "string" && M.ROMANTIC_DISCOVERY_TEXT[r].length > 20);
}

/* ─────────────────── 2. orientation is relative to GENDER ─────────────────── */
sec("2. orientation resolves against gender, not birth sex");

/* The bug this pins: orientOptionsFor used to key off birth sex, so a trans
   woman attracted to women was offered "Gay" — the label for a man — and the
   engine silently relabelled it years later. */
const twOpts = M.orientOptionsFor("Male", "Trans woman", "Male");
ok("trans woman is offered Lesbian", twOpts.includes("Lesbian"));
ok("trans woman is not offered Gay", !twOpts.includes("Gay"));

const tmOpts = M.orientOptionsFor("Female", "Trans man", "Female");
ok("trans man is offered Gay", tmOpts.includes("Gay"));
ok("trans man is not offered Lesbian", !tmOpts.includes("Lesbian"));

const cisW = M.orientOptionsFor("Female", "Cisgender", "Female");
ok("cis woman is offered Lesbian", cisW.includes("Lesbian") && !cisW.includes("Gay"));

ok("non-binary gets no same/opposite framing",
  M.orientOptionsFor("Female", "Non-binary", "Female").includes("Bisexual"));

/* livedGender is what that resolution rests on */
ok("livedGender: trans woman reads Female", M.livedGender("Male", "Trans woman", "Male") === "Female");
ok("livedGender: trans man reads Male", M.livedGender("Female", "Trans man", "Female") === "Male");
ok("livedGender: agender reads Nonbinary", M.livedGender("Female", "Agender", "Female") === "Nonbinary");
ok("livedGender: cis follows assignment", M.livedGender("Female", "Cisgender", "Female") === "Female");

/* ──────────────────── 3. the axes are actually independent ──────────────────── */
sec("3. axis independence");

/* 3a. expression must not be a function of gender identity. Previously
   presTarget() COMPUTED the target from gender, which made a butch cis woman
   and a femme cis man literally unplayable. */
{
  const masc = H.mkChar({ sex: "Female", gid: "Cisgender", expr: 10 });
  const femme = H.mkChar({ sex: "Female", gid: "Cisgender", expr: 90 });
  ok("same gender, different expression is representable",
    M.presTarget(masc) !== M.presTarget(femme), [M.presTarget(masc), M.presTarget(femme)]);
  ok("masculine cis woman keeps her gender", masc.hidden.gender === "Cisgender");
  ok("masculine cis woman's expression is masculine", M.presTarget(masc) < 30, M.presTarget(masc));
  ok("feminine cis woman's expression is feminine", M.presTarget(femme) > 70, M.presTarget(femme));
}

/* 3b. varying expression must not perturb any other axis */
{
  const base = { sex: "Male", gid: "Cisgender", orient: "Straight", romantic: "Heteroromantic" };
  const a = H.mkChar({ ...base, expr: 10 });
  const b = H.mkChar({ ...base, expr: 90 });
  ok("expression does not move gender", a.hidden.gender === b.hidden.gender);
  ok("expression does not move orientation", a.hidden.orientation === b.hidden.orientation);
  ok("expression does not move romantic orientation", a.hidden.romantic === b.hidden.romantic);
  ok("expression does not move biological sex", a.profile.sex === b.profile.sex);
}

/* 3c. romantic and sexual orientation must be able to diverge — the split
   attraction model is the entire reason the romantic field exists. */
{
  const cross = H.mkChar({ sex: "Female", gid: "Cisgender", orient: "Bisexual", romantic: "Heteroromantic" });
  ok("cross-oriented character is representable",
    cross.hidden.orientation === "Bisexual" && cross.hidden.romantic === "Heteroromantic",
    [cross.hidden.orientation, cross.hidden.romantic]);

  const aroAce = H.mkChar({ sex: "Male", gid: "Cisgender", orient: "Asexual", romantic: "Aromantic" });
  ok("aroace is representable", aroAce.hidden.orientation === "Asexual" && aroAce.hidden.romantic === "Aromantic");

  const aroAllo = H.mkChar({ sex: "Male", gid: "Cisgender", orient: "Bisexual", romantic: "Aromantic" });
  ok("aromantic-but-allosexual is representable",
    aroAllo.hidden.orientation === "Bisexual" && aroAllo.hidden.romantic === "Aromantic");
}

/* 3d. across many random rolls, every axis must show real variety AND the two
   orientation axes must sometimes disagree. If rollRomantic ever degenerated
   into "copy the sexual orientation", the split model would be decorative. */
{
  const gset = new Set(), oset = new Set(), rset = new Set();
  let mirrored = 0, crossed = 0, n = 0;
  H.eachSeed([1, 2, 3, 4, 5, 6, 7, 8], () => {
    for (let i = 0; i < 60; i++) {
      const c = M.rollHiddenIdentity("Female", "random", "random", "random", "random", "Female");
      gset.add(c.gender); oset.add(c.orientation); rset.add(c.romantic);
      if (M.ROMANTIC_MIRROR[c.orientation] === c.romantic) mirrored++; else crossed++;
      n++;
    }
  });
  ok("random rolls produce many genders", gset.size >= 6, [...gset]);
  ok("random rolls produce many orientations", oset.size >= 6, [...oset]);
  ok("random rolls produce many romantic orientations", rset.size >= 5, [...rset]);
  ok("most people are perioriented", mirrored / n > 0.5, mirrored / n);
  ok("but a real minority are cross-oriented", crossed / n > 0.12, crossed / n);
}

/* 3e. a chosen axis must be honored exactly, not treated as a hint */
{
  for (const g of M.GENDER_ALL) {
    if (!M.genderOptionsFor("Female", "Female").includes(g)) continue;
    const c = M.rollHiddenIdentity("Female", "random", g, "random", "random", "Female");
    ok("chosen gender '" + g + "' is honored", c.gender === g, c.gender);
  }
  for (const r of M.ROMANTIC_ALL) {
    const c = M.rollHiddenIdentity("Female", "random", "Cisgender", r, "random", "Female");
    ok("chosen romantic '" + r + "' is honored", c.romantic === r, c.romantic);
  }
}

/* ───────────────────────────── 4. intersex is real ───────────────────────────── */
sec("4. intersex");

ok("every variation has the fields the engine reads",
  Object.values(M.DSD_VARIATIONS).every((d) =>
    typeof d.label === "string" && typeof d.chrom === "string" &&
    typeof d.foundAt === "number" && typeof d.w === "number" &&
    (d.repro === null || d.repro === "Male" || d.repro === "Female") &&
    (d.assign === "Male" || d.assign === "Female")));

ok("variations surface across the whole lifespan, not all at birth",
  new Set(Object.values(M.DSD_VARIATIONS).map((d) => d.foundAt)).size >= 5);
ok("at least one is known from birth",
  Object.values(M.DSD_VARIATIONS).some((d) => d.foundAt === 0));
ok("at least one is not found until adulthood",
  Object.values(M.DSD_VARIATIONS).some((d) => d.foundAt > 6600));

/* The bug this pins: presStart/presTarget read profile.sex, and "Intersex"
   matched neither branch of `sex === "Female" ? … : …`, so EVERY intersex
   character was silently assigned a masculine presentation regardless of how
   they were actually raised. */
{
  const f = H.mkChar({ sex: "Intersex", dsd: "cais", assigned: "Female", gid: "Cisgender" });
  const m = H.mkChar({ sex: "Intersex", dsd: "klf", assigned: "Male", gid: "Cisgender" });
  ok("intersex raised female starts feminine", M.presStart(f) > 60, M.presStart(f));
  ok("intersex raised male starts masculine", M.presStart(m) < 40, M.presStart(m));
  ok("birth assignment is recorded", f.profile.assigned === "Female" && m.profile.assigned === "Male");
  ok("variation is recorded", f.profile.dsd === "cais" && m.profile.dsd === "klf");
}

/* Intersex must not be a dead option: it has to reach the same axes everyone
   else does. */
{
  const c = H.mkChar({ sex: "Intersex", dsd: "cah", assigned: "Female", gid: "Trans man", orient: "Bisexual" });
  ok("intersex characters can be trans", c.hidden.gender === "Trans man");
  ok("intersex characters get an orientation", M.ORIENT_ALL.includes(c.hidden.orientation));
  ok("intersex characters get a romantic orientation", M.ROMANTIC_ALL.includes(c.hidden.romantic));
  ok("intersex characters read as a gender to others", ["M", "F", "NB"].includes(M.sexTag(c)));
}

/* Fertility follows the variation, not the label. The old canConceiveBio
   tested profile.sex and so barred EVERY intersex character from conceiving,
   including CAH and 5-ARD characters whose fertility is typically intact. */
{
  const partnerM = { g: "M" }, partnerF = { g: "F" };
  const cah = H.mkChar({ sex: "Intersex", dsd: "cah", assigned: "Female" });
  const turner = H.mkChar({ sex: "Intersex", dsd: "turner", assigned: "Female" });
  const ard5 = H.mkChar({ sex: "Intersex", dsd: "ard5", assigned: "Female" });
  ok("CAH character can conceive with a man", M.canConceiveBio(cah, partnerM));
  ok("Turner character cannot conceive", !M.canConceiveBio(turner, partnerM) || M.isSterile(turner));
  ok("Turner character reads as sterile", M.isSterile(turner));
  ok("5-ARD character can father a child", M.canConceiveBio(ard5, partnerF));
  ok("CAH character is not sterile", !M.isSterile(cah));
  const plain = H.mkChar({ sex: "Female" });
  ok("non-intersex fertility is unchanged", M.canConceiveBio(plain, partnerM) && !M.canConceiveBio(plain, partnerF));
}

/* ───────────────────── 5. discovery: hidden vs already-knowing ───────────────────── */
sec("5. discovery");

{
  const hidden = H.mkChar({ sex: "Female", gid: "Trans man", orient: "Bisexual" });
  ok("by default nothing is known at birth",
    !hidden.discovered.gender && !hidden.discovered.orientation && !hidden.discovered.romantic);
  ok("but the truth is already fixed underneath",
    hidden.hidden.gender === "Trans man" && hidden.hidden.orientation === "Bisexual");

  const knows = H.mkChar({ sex: "Female", gid: "Trans man", orient: "Bisexual", knowsSelf: true });
  ok("opt-out starts the character self-aware",
    knows.discovered.gender && knows.discovered.orientation && knows.discovered.romantic);
  ok("opt-out does not change WHO they are",
    knows.hidden.gender === hidden.hidden.gender && knows.hidden.orientation === hidden.hidden.orientation);
}

/* A new character's orientation is already labelled against their own gender,
   so the legacy reconciliation flip must NOT fire — if it did it would turn a
   correctly-labelled lesbian trans woman back into "Straight". */
{
  const c = H.mkChar({ sex: "Male", gid: "Trans woman", orient: "Lesbian", knowsSelf: true });
  ok("new characters are marked already-synced", c.flags.orientSynced === true);
  const before = c.hidden.orientation;
  M.syncOrientationToGender(c);
  ok("the legacy flip does not corrupt a new character", c.hidden.orientation === before, [before, c.hidden.orientation]);
}

/* ...but an OLD save really was keyed to birth sex and still needs the flip. */
{
  const legacy = H.mkChar({ sex: "Male", gid: "Trans woman", orient: "Straight", knowsSelf: true });
  legacy.flags.orientSynced = false;          // simulate a pre-split save
  const flip = M.syncOrientationToGender(legacy);
  ok("legacy save still gets its reconciliation", flip === "Lesbian" && legacy.hidden.orientation === "Lesbian",
    [flip, legacy.hidden.orientation]);
  ok("the flip is one-shot", legacy.flags.orientSynced === true && M.syncOrientationToGender(legacy) === null);
}

/* ─────────────────────────── 6. migration safety ─────────────────────────── */
sec("6. migration of pre-split saves");

/* A migration must never rewrite who someone's existing character is. */
{
  const s = H.mkChar({ sex: "Female", gid: "Cisgender", orient: "Lesbian" });
  // strip the save back to what a pre-split version would have written
  delete s.hidden.romantic; delete s.hidden.expr;
  delete s.profile.assigned; delete s.profile.dsd;
  delete s.discovered.romantic;
  const g = s.hidden.gender, o = s.hidden.orientation;
  M.migrate(s);
  ok("migrate preserves gender", s.hidden.gender === g);
  ok("migrate preserves orientation", s.hidden.orientation === o);
  ok("migrate backfills romantic orientation", M.ROMANTIC_ALL.includes(s.hidden.romantic), s.hidden.romantic);
  ok("migrate backfills expression", typeof s.hidden.expr === "number" && s.hidden.expr >= 0 && s.hidden.expr <= 100, s.hidden.expr);
  ok("migrate backfills birth assignment", s.profile.assigned === "Female");
  ok("migrate sets dsd to null for non-intersex", s.profile.dsd === null);
  ok("migrate is idempotent", (() => { const r = s.hidden.romantic, e = s.hidden.expr; M.migrate(s); return s.hidden.romantic === r && s.hidden.expr === e; })());
}

/* An intersex save from before variations existed must acquire one. */
{
  const s = H.mkChar({ sex: "Intersex", assigned: "Female" });
  delete s.profile.dsd; delete s.profile.assigned;
  M.migrate(s);
  ok("intersex save gains a variation", !!s.profile.dsd && !!M.DSD_VARIATIONS[s.profile.dsd], s.profile.dsd);
  ok("intersex save gains an assignment", s.profile.assigned === "Male" || s.profile.assigned === "Female");
}

/* Existing presentation drift must survive migration — a character who has
   spent thirty years moving toward how they want to look must not be reset. */
{
  const s = H.mkChar({ sex: "Male", gid: "Trans woman" });
  delete s.hidden.expr;
  s.emergent.pres = 71;
  M.migrate(s);
  ok("migrate adopts existing presentation drift", s.hidden.expr === 71, s.hidden.expr);
}

/* ────────────────────── 7. romantic orientation does something ────────────────────── */
sec("7. the romantic axis has mechanical effect");

/* Dating candidates follow ROMANTIC attraction. If this collapsed back to the
   sexual axis, the split model would be pure flavour text. */
{
  const count = (c, n) => { const out = {}; for (let i = 0; i < n; i++) { const g = M.candidateGender(c); out[g] = (out[g] || 0) + 1; } return out; };
  const heteroAce = H.mkChar({ sex: "Female", gid: "Cisgender", orient: "Asexual", romantic: "Heteroromantic", knowsSelf: true });
  const homoAce = H.mkChar({ sex: "Female", gid: "Cisgender", orient: "Asexual", romantic: "Homoromantic", knowsSelf: true });
  const h = count(heteroAce, 40), o = count(homoAce, 40);
  ok("heteroromantic asexual meets men", (h.M || 0) === 40, h);
  ok("homoromantic asexual meets women", (o.F || 0) === 40, o);
  ok("two asexual characters with different romantic orientations meet different people",
    (h.M || 0) !== (o.M || 0));

  const panro = H.mkChar({ sex: "Female", gid: "Cisgender", orient: "Bisexual", romantic: "Panromantic", knowsSelf: true });
  const seen = count(panro, 120);
  ok("panromantic meets all genders", Object.keys(seen).length === 3, seen);
}

/* ─────────────────────── 8. nothing NaNs or crashes ─────────────────────── */
sec("8. full lives across every axis");

{
  const combos = [
    { sex: "Female", gid: "Cisgender", orient: "Straight", romantic: "Heteroromantic" },
    { sex: "Male", gid: "Trans woman", orient: "Lesbian", romantic: "Homoromantic" },
    { sex: "Female", gid: "Trans man", orient: "Gay", romantic: "Homoromantic" },
    { sex: "Female", gid: "Non-binary", orient: "Pansexual", romantic: "Panromantic" },
    { sex: "Male", gid: "Agender", orient: "Asexual", romantic: "Aromantic" },
    { sex: "Female", gid: "Genderqueer", orient: "Demisexual", romantic: "Demiromantic" },
    { sex: "Male", gid: "Bigender", orient: "Gray-asexual", romantic: "Grayromantic" },
    { sex: "Female", gid: "Questioning", orient: "Questioning", romantic: "Questioning" },
    { sex: "Intersex", dsd: "cais", assigned: "Female", gid: "Cisgender", orient: "Bisexual" },
    { sex: "Intersex", dsd: "klf", assigned: "Male", gid: "Non-binary", orient: "Pansexual" },
    { sex: "Intersex", dsd: "turner", assigned: "Female", gid: "Trans man", orient: "Straight" },
    { sex: "Intersex", dsd: "ard5", assigned: "Female", gid: "Cisgender", orient: "Lesbian" },
  ];
  for (const combo of combos) {
    const label = combo.gid + "/" + combo.orient + (combo.dsd ? "/" + combo.dsd : "");
    let r = null, err = null;
    try { r = H.runLife(H.mkChar({ ...combo, birthYear: 1975 }), { years: 60 }); }
    catch (e) { err = e; }
    ok("life runs to completion: " + label, !err && r, err && err.message);
    if (!r) continue;
    ok("no crashes: " + label, r.crashes === 0, r.crashes);
    // the feed is where a missing discovery-text key would surface
    const bad = (r.state.feed || []).filter((f) => /undefined|NaN|\[object/.test(f.text || ""));
    ok("no undefined/NaN in the feed: " + label, bad.length === 0, bad.slice(0, 2));
  }
}

/* Era weighting: the same identity in 1955 and 2005 must not play identically,
   because eraAcceptance is what makes the birth-year choice mean anything. */
{
  ok("era acceptance rises over time",
    M.eraAcceptance(1955) < M.eraAcceptance(1985) && M.eraAcceptance(1985) < M.eraAcceptance(2015),
    [M.eraAcceptance(1955), M.eraAcceptance(1985), M.eraAcceptance(2015)]);
}

console.log("\n" + (fail === 0 ? "ALL PASS" : "FAILURES") + ": " + pass + " passed, " + fail + " failed");
process.exit(fail === 0 ? 0 : 1);
