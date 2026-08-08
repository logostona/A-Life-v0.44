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

const fs = require("fs");
const path = require("path");
const H = require(path.join(__dirname, "harness.js"));
const M = H.M;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log("  FAIL: " + name + (extra !== undefined ? "  " + JSON.stringify(extra).slice(0, 400) : "")); }
}
function l0(x) { return String(x || "").toLowerCase(); }
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


/* ═══════════ EXPRESSION IS EVERYONE'S AXIS, AND COMING OUT IS NEWS ═══════════
   Four reported bugs, each pinned so it cannot come back.  */
sec("expression, and what counts as news");

{
  /* 1 · A GAY MAN CANNOT BE DUMPED BY HIS BOYFRIEND FOR BEING GAY.
     comeOutReact scored every partner off the same acceptance roll, so a
     relationship that is itself evidence of the orientation could still
     produce a rejection scene. That is not a hard conversation, it is an
     impossible one. */
  const gay = () => {
    const c = H.mkChar({ country: "United Kingdom", birthYear: 1990, sex: "Male", gid: "cis", orient: "Gay" });
    c.ageDays = Math.round(24 * 365.25);
    c.hidden.orientation = "Gay"; c.discovered.orientation = true;
    c.romance = { r1: { name: "Tom", role: "Partner", rel: 70, status: "dating", g: "M",
                        acceptance: 5, warmth: 60, kindness: 50, known: [],
                        lastTime: -999, lastTalk: -999, lastGift: -999 } };
    return c;
  };
  const news = M.comeOutNews(gay(), "romance", "r1");
  ok("a same-sex partner is standing evidence of the orientation", news.evidenced === true);
  ok("...so the orientation is not news to them", news.orientation === false);
  ok("...and there is nothing left to disclose", news.any === false);

  /* the hostile case: worst possible acceptance, worst possible bonus */
  let badly = 0;
  for (let i = 0; i < 150; i++) {
    H.seed(400 + i);
    const out = M.comeOutReact(gay(), "romance", "r1", -14, "confronted");
    if (/badly/i.test(out.pending.title)) badly++;
  }
  ok("coming out to him never goes badly, at any roll", badly === 0, badly);
  ok("...and the scene says he already knew",
    /already knew/i.test(M.comeOutReact(gay(), "romance", "r1", -14, "confronted").pending.title));
  ok("...and it is still worth having said", (() => {
    const c = gay();
    const out = M.comeOutReact(c, "romance", "r1", -14, "confronted");
    const d = JSON.parse(JSON.stringify(c));
    M.applyFx(d, out.pending.options[0].fx);
    return d.stats.happiness > c.stats.happiness && d.romance.r1.status === "dating";
  })());

  /* BEING TRANS IS still news to that same partner, and is allowed to be hard */
  const transToo = gay();
  transToo.hidden.gender = "Trans man"; transToo.discovered.gender = true;
  const tn = M.comeOutNews(transToo, "romance", "r1");
  ok("being trans IS news to a same-sex partner", tn.gender === true && tn.any === true);
  ok("...and is described as that, not as the orientation",
    M.outLabelFor(transToo, "romance", "r1").indexOf("gay") === -1,
    M.outLabelFor(transToo, "romance", "r1"));

  /* an opposite-sex partner is evidence of nothing */
  const straightPassing = gay();
  straightPassing.romance.r1.g = "F";
  ok("an opposite-sex partner is not evidence", M.comeOutNews(straightPassing, "romance", "r1").evidenced === false);
  ok("...so it is still news to them", M.comeOutNews(straightPassing, "romance", "r1").orientation === true);
}
{
  /* 2 · THE SCHOOL PANEL MUST NOT OFFER TRANS-ONLY OPTIONS TO A CIS CHILD.
     It gated only pronouns, so a cisgender life was shown "Name at school —
     register name only" and "Who knows at school", neither of which means
     anything for them. */
  const pupil = (o, expr) => {
    H.seed(9);
    const c = H.mkChar(Object.assign({ country: "United Kingdom", birthYear: 1995, cls: "Middle" }, o));
    c.ageDays = Math.round(15 * 365.25);
    c.education.stage = "high";
    c.school = { stage: "high", type: Object.keys(M.SCHOOL_TYPES)[0], name: "Kestrel Hall",
                 skips: 0, trouble: 0, classmates: {}, faculty: {} };
    if (expr != null) { c.hidden.expr = expr; c.emergent.pres = M.presStart(c); }
    return c;
  };
  const names = (c) => M.schoolPresentMenu(c).pending.options.filter((o) => o.card).map((o) => o.card.name);

  const cis = names(pupil({ sex: "Male", gid: "cis", orient: "Straight" }, 22));
  ok("a cisgender pupil is not asked about a name at school", cis.indexOf("Name at school") === -1, cis);
  ok("...nor about who knows", cis.indexOf("Who knows at school") === -1, cis);
  ok("...nor about pronouns with teachers", cis.indexOf("Pronouns with teachers") === -1, cis);
  /* Uniform and PE are both a GENDERED choice — the other uniform, the other
     changing room. "Uniform · as assigned" shown to a boy with no feelings
     about it reads as a compromise he settled for, which is the same fault as
     the name option. Gated on the stake, not on the identity. */
  ok("...nor offered the other uniform", cis.indexOf("Uniform") === -1, cis);
  ok("...nor the other changing room", cis.indexOf("PE & changing rooms") === -1, cis);

  /* 3 · EVERY LIFE GETS THE PRESENTATION AXIS */
  ok("...and is asked how they dress, like everyone else", cis.indexOf("How you dress here") > -1, cis);
  for (const [label, o, e] of [["a cis girl", { sex: "Female", gid: "cis" }, 78],
                               ["a soft boy", { sex: "Male", gid: "cis" }, 70],
                               ["a sharp girl", { sex: "Female", gid: "cis" }, 30]]) {
    ok(label + " is asked how they dress", names(pupil(o, e)).indexOf("How you dress here") > -1);
  }
  /* ...and a gender-nonconforming CIS pupil gets the gendered options back,
     because for them they mean something. This is the femboy/tomboy content. */
  for (const [label, o, e] of [["a soft boy", { sex: "Male", gid: "cis" }, 74],
                               ["a sharp girl", { sex: "Female", gid: "cis" }, 24]]) {
    const n = names(pupil(o, e));
    ok(label + " IS offered the other uniform", n.indexOf("Uniform") > -1, n);
    ok(label + " IS offered PE & changing rooms", n.indexOf("PE & changing rooms") > -1, n);
    ok(label + " is still not asked about pronouns", n.indexOf("Pronouns with teachers") === -1, n);
  }
  /* the pupil who has not moved yet but wants to is the one who most needs it */
  ok("wanting to dress differently is enough, before anything has changed", (() => {
    const c = pupil({ sex: "Male", gid: "cis" }, 22);
    c.hidden.expr = 74;          /* where he wants to be */
    c.emergent.pres = 22;        /* where he still actually is */
    return M.exprStyleOf(c).id === "conforming"   /* nothing visible has changed */
        && names(c).indexOf("Uniform") > -1;      /* ...and he is still asked */
  })());

  /* a trans pupil keeps everything they had, and gains the axis */
  const tp = pupil({ sex: "Male", gid: "Trans woman" }, null);
  tp.discovered.gender = true; tp.hidden.gender = "Trans woman"; tp.profile.usedName = "Elin";
  const tn = names(tp);
  for (const want of ["Name at school", "Uniform", "PE & changing rooms", "Pronouns with teachers", "Who knows at school", "How you dress here"]) {
    ok("a trans pupil still has: " + want, tn.indexOf(want) > -1, tn);
  }
}
{
  /* 4 · A HIDDEN STYLE, DERIVED, THAT THE WORLD REACTS TO */
  const at = (sex, expr, year) => {
    const c = H.mkChar({ country: "United Kingdom", birthYear: year - 15, sex: sex, gid: "cis" });
    c.ageDays = Math.round(15 * 365.25);
    c.hidden.expr = expr; c.emergent.pres = expr;
    return c;
  };
  ok("presenting as expected reads as unremarkable",
    M.exprStyleOf(at("Male", 22, 2015)).id === "conforming");
  ok("a feminine boy reads as soft", M.exprStyleOf(at("Male", 72, 2015)).id === "soft");
  ok("a masculine girl reads as sharp", M.exprStyleOf(at("Female", 25, 2015)).id === "sharp");
  ok("the middle reads as androgynous", M.exprStyleOf(at("Male", 50, 2015)).id === "andro");
  /* identity-independent: the SAME reading for a trans character */
  ok("style does not depend on gender identity", (() => {
    const t = at("Male", 72, 2015);
    t.hidden.gender = "Trans woman"; t.discovered.gender = true;
    return M.exprStyleOf(t).id === M.exprStyleOf(at("Male", 72, 2015)).id;
  })());

  /* friction is HISTORICAL, which is the whole point of modelling it */
  ok("conforming costs nothing, ever",
    [1935, 1975, 2015].every((y) => M.exprFriction(at("Male", 22, y)) === 0));
  const soft = (y) => M.exprFriction(at("Male", 72, y));
  ok("a feminine boy meets far less friction in 2015 than in 1955", soft(2015) < soft(1955) * 0.5,
    [soft(1955), soft(2015)]);
  ok("...and it eases monotonically", soft(1955) >= soft(1985) && soft(1985) >= soft(2015));
  const sharp = (y) => M.exprFriction(at("Female", 25, y));
  /* the double standard, modelled rather than smoothed away */
  ok("a masculine girl meets less friction than a feminine boy in the same year",
    sharp(1955) < soft(1955) && sharp(2015) < soft(2015), [sharp(1955), soft(1955)]);
  ok("friction stays a share", [1935, 1975, 2015].every((y) =>
    M.exprFriction(at("Male", 72, y)) >= 0 && M.exprFriction(at("Male", 72, y)) <= 1));

  /* the events read it, and are gated on NEITHER identity nor orientation */
  ok("there are expression events", M.EXPR_POOL.length >= 3);
  ok("...all registered in POOL", M.EXPR_POOL.every((e) => M.POOL.indexOf(e) !== -1));
  ok("...none fires for a conforming life",
    M.EXPR_POOL.filter((e) => e.id !== "x_toldToChange")
      .every((e) => !e.cond(at("Male", 22, 2015))));
  ok("...and they do fire for a soft boy", (() => {
    const c = at("Male", 72, 1975);
    c.friends = { f1: { name: "A", role: "Friend", rel: 60 } };
    return M.EXPR_POOL.some((e) => e.cond(c));
  })());
  const SRC = fs.readFileSync(H.SRC, "utf8");
  const block = SRC.slice(SRC.indexOf("const EXPR_POOL"), SRC.indexOf("POOL.push(...EXPR_POOL)"));
  ok("no expression event gates on gender identity", !/isQueerG\(/.test(block));
  ok("...nor on orientation", !/isQueerO\(/.test(block));
}
{
  /* 5 · "X ALREADY KNOWS" MUST ASK ABOUT THE AXIS THEY KNOW ABOUT.
     It offered "Ask them to use your name" to everybody, so a cisgender gay
     man who had come out about his ORIENTATION was invited to ask his friend
     to call him something else. Third instance of the same fault, which is why
     it is asserted rather than merely fixed. */
  const withFriend = (o, known) => {
    H.seed(11);
    const c = H.mkChar(Object.assign({ country: "United Kingdom", birthYear: 1995 }, o));
    c.ageDays = Math.round(22 * 365.25);
    c.friends = { f1: { name: "Julia", role: "Friend", rel: 70, acceptance: 70,
                        known: [known], outDay: c.ageDays - 2000, g: "F" } };
    return c;
  };
  const labels = (c, axis) => M.stxAlreadyOutMenu(c, "friends", "f1", axis).options.map((o) => o.label);

  const gay = withFriend({ sex: "Male", gid: "cis", orient: "Gay" }, "outO");
  gay.hidden.orientation = "Gay"; gay.discovered.orientation = true;
  const gl = labels(gay, "orientation");
  ok("a cis gay man is not asked to request a different name", gl.every((l) => !/call you|use your name/i.test(l)), gl);
  ok("...nor to request pronouns", gl.every((l) => !/pronoun/i.test(l)), gl);
  ok("...but the slot is still worth opening", gl.length >= 3, gl);
  ok("...with something that follows from what he told her",
    gl.some((l) => /wrong people/i.test(l)), gl);
  ok("...and he can still ask how she feels", gl.some((l) => /how they actually feel/i.test(l)));

  /* a partner he is actually seeing is the other thing that changes */
  const seeing = withFriend({ sex: "Male", gid: "cis", orient: "Gay" }, "outO");
  seeing.romance = { r1: { name: "Tom", role: "Partner", status: "dating", rel: 72, g: "M" } };
  ok("...and can offer to introduce someone he is seeing",
    labels(seeing, "orientation").some((l) => l.indexOf("Tom") > -1));
  ok("...which is not offered when there is nobody",
    labels(gay, "orientation").every((l) => !/like to meet/i.test(l)));

  /* the trans case keeps everything it had */
  const trans = withFriend({ sex: "Male", gid: "Trans woman" }, "outG");
  trans.hidden.gender = "Trans woman"; trans.discovered.gender = true; trans.profile.usedName = "Elin";
  const tl = labels(trans, "gender");
  ok("a trans woman is asked about her name", tl.some((l) => l.indexOf("Elin") > -1), tl);
  ok("...and her pronouns", tl.some((l) => /pronoun/i.test(l)), tl);
  ok("...and being called it is worth something", (() => {
    const d = JSON.parse(JSON.stringify(trans));
    const opt = M.stxAlreadyOutMenu(trans, "friends", "f1", "gender").options.find((o) => l0(o.label).indexOf("elin") > -1);
    H.seed(3); M.applyFx(d, opt.fx);
    return d.stats.happiness > trans.stats.happiness;
  })());
  /* ...and, as at school, a name to ask for is a precondition for asking */
  const noName = withFriend({ sex: "Male", gid: "Trans woman" }, "outG");
  noName.hidden.gender = "Trans woman"; noName.discovered.gender = true;
  ok("no chosen name, no name to ask for",
    labels(noName, "gender").every((l) => !/call you/i.test(l)), labels(noName, "gender"));
}
{
  /* 6 · A FIFTEEN-YEAR-OLD DOES NOT BUY THEIR OWN CLOTHES.
     The presentation axis let a minor decide to dress differently and simply
     do it. The game gives a teenager exactly zero money, so the only honest
     routes are asking, improvising, or going without. */
  const kid = (year, cls, o) => {
    H.seed(7);
    const c = H.mkChar(Object.assign({ country: "United Kingdom", birthYear: year - 15, cls: cls,
                                       sex: "Male", gid: "cis" }, o || {}));
    c.ageDays = Math.round(15 * 365.25);
    c.hidden.expr = 74; c.emergent.pres = 22;      /* wants to move, has not */
    return c;
  };
  const c = kid(2015, "Middle");
  ok("a teenager has no money of their own", c.money === 0, c.money);
  ok("...so they have to ask", M.exprMustAsk(c) === true);
  ok("...and own nothing that goes that way yet", M.exprHasClothes(c) === false);

  const names = M.exprClothesMenu(c).pending.options.map((o) => (o.card && o.card.name) || o.label);
  ok("both parents can be asked, separately",
    names.filter((n) => n.indexOf("Ask ") === 0).length === 2, names);
  ok("improvising is always available", names.some((n) => /Piece it together/i.test(n)), names);
  ok("buying is not offered to somebody with no money",
    names.every((n) => !/Buy them yourself/i.test(n)), names);
  ok("...but is offered to somebody who has it", (() => {
    const rich = kid(2015, "Middle"); rich.money = M.EXPR_CLOTHES_COST * 3;
    return M.exprClothesMenu(rich).pending.options
      .some((o) => o.card && /Buy them yourself/i.test(o.card.name));
  })());
  ok("an adult who has left home is not asking anyone", (() => {
    const a = kid(2015, "Middle"); a.ageDays = Math.round(31 * 365.25);
    return M.exprMustAsk(a) === false;
  })());

  /* the ask has THREE outcomes. A flat yes/no made it dead in every decade
     before about 2000, and "in the house, not out of it" is what happened. */
  const spread = (ch) => {
    const opt = M.exprClothesMenu(ch).pending.options.find((o) => o.card && o.card.name.indexOf("Ask ") === 0);
    let yes = 0, half = 0, no = 0;
    for (let i = 0; i < 400; i++) {
      const d = JSON.parse(JSON.stringify(ch));
      H.seed(3000 + i); M.applyFx(d, opt.fx);
      if (d.flags.exprClothes) yes++; else if (d.flags.exprClothesDIY) half++; else no++;
    }
    return { yes: yes / 400, half: half / 400, no: no / 400 };
  };
  const now = spread(kid(2015, "Middle")), then = spread(kid(1958, "Middle"));
  ok("asking in 2015 usually works", now.yes > 0.5, now);
  ok("asking in 1958 usually does not", then.yes < 0.15, then);
  ok("...but is never simply hopeless — a compromise is always on the table", then.half > 0.15, then);
  ok("every ask resolves to exactly one of the three", (() => {
    const t = now.yes + now.half + now.no;
    return Math.abs(t - 1) < 1e-9;
  })());
  /* money is a real constraint, not only a line of prose */
  const poor = spread(kid(2015, "Poor")), mid = spread(kid(2015, "Middle"));
  ok("a poorer household says yes less often", poor.yes < mid.yes, [poor.yes, mid.yes]);

  /* improvised presentation reads as improvised, so it costs something.
     Measured on someone who has ACTUALLY MOVED — friction short-circuits to
     zero for a conforming life, correctly, before any of this is reached. */
  const moved = (f) => { const d = kid(2015, "Middle"); d.emergent.pres = 74; Object.assign(d.flags, f); return d; };
  const diy = moved({ exprClothesDIY: 1 }), bought = moved({ exprClothes: 1 });
  ok("clothes you own carry no penalty", M.exprClothesPenalty(bought) === 0);
  ok("...improvised ones do", M.exprClothesPenalty(diy) > 0);
  ok("...and that shows up as friction", M.exprFriction(diy) > M.exprFriction(bought),
    [M.exprFriction(diy), M.exprFriction(bought)]);
  ok("...but a conforming life is charged nothing either way",
    M.exprFriction(kid(2015, "Middle")) === 0);

  /* the school panel routes there instead of conjuring a wardrobe */
  const pupil = kid(2015, "Middle");
  pupil.education.stage = "high";
  pupil.school = { stage: "high", type: Object.keys(M.SCHOOL_TYPES)[0], name: "Kestrel Hall",
                   skips: 0, trouble: 0, classmates: {}, faculty: {} };
  const dress = M.schoolPresentMenu(pupil).pending.options.find((o) => o.card && o.card.name === "How you dress here");
  ok("the school panel says what is actually stopping you", /nothing to wear/i.test(dress.card.sub), dress.card.sub);
  ok("...and choosing it opens the ask rather than moving anything", (() => {
    const d = JSON.parse(JSON.stringify(pupil));
    const before = M.presently(d);
    H.seed(5); M.applyFx(d, dress.fx);
    return d.pending && /clothes first/i.test(d.pending.title) && M.presently(d) === before;
  })());
  ok("...and once you have them, it moves you", (() => {
    const d = JSON.parse(JSON.stringify(pupil));
    d.flags.exprClothes = 1;
    const before = M.presently(d);
    H.seed(5); M.applyFx(d, M.schoolPresentMenu(d).pending.options
      .find((o) => o.card && o.card.name === "How you dress here").fx);
    return M.presently(d) > before;
  })());

  /* Gotcha #2 — the builder is handed a clone that gets discarded */
  ok("the menu builder mutates nothing", (() => {
    const d = kid(2015, "Middle");
    const snap = JSON.stringify(d);
    M.exprClothesMenu(d);
    return JSON.stringify(d) === snap;
  })());
}
sec("school accommodations actually happen");
{
  /* 7 · THE INVERSE OF GOTCHA #2, AND MUCH WORSE.
     resolveRequest opened with pClone() like the builders around it, but every
     call site reads `st.pending = resolveRequest(st, …).pending` — so the
     popup survived and the GRANT did not. The head said yes, the scene said
     yes, and nothing changed. A resolver is not a builder. */
  const pupil = (year, o) => {
    H.seed(21);
    const c = H.mkChar(Object.assign({ country: "United Kingdom", birthYear: year - 15,
                                       sex: "Male", gid: "Trans woman", cls: "Middle" }, o || {}));
    c.ageDays = Math.round(15 * 365.25);
    c.hidden.gender = "Trans woman"; c.discovered.gender = true; c.profile.usedName = "Elin";
    c.education.stage = "high";
    c.school = { stage: "high", type: Object.keys(M.SCHOOL_TYPES)[0], name: "Kestrel Hall",
      skips: 0, trouble: 0, classmates: {}, faculty: {
        head: { name: "Dr Vance", beliefs: 92, professionalism: 95, empathy: 88, rel: 82,
                ruleRespect: 70, legalFear: 70, religious: 5 },
        t1:   { name: "Mr Doyle", subject: "eng", style: "warm", beliefs: 88, professionalism: 82,
                empathy: 90, rel: 78, ruleRespect: 60, legalFear: 50, religious: 5 },
      } };
    return c;
  };

  const c = pupil(2015);
  const out = M.resolveRequest(c, "name", "formal", null);
  ok("the resolver works on the live state, not a copy", out === c);
  ok("a granted request is recorded", c.school.trans && c.school.trans.granted.name === true,
    c.school.trans && c.school.trans.granted);
  ok("...and actually changes the register", c.school.present && c.school.present.name === "chosen",
    c.school.present);
  ok("...and the school panel now agrees with the scene", (() => {
    const opt = M.schoolPresentMenu(c).pending.options.find((o) => o.card && o.card.name === "Name at school");
    return opt && /they call you Elin/i.test(opt.card.sub);
  })());
  ok("...and it survives a save round-trip", (() => {
    const round = JSON.parse(JSON.stringify(c));
    return round.school.trans.granted.name === true && round.school.present.name === "chosen";
  })());
  ok("escalation is a resolver too", (() => {
    const d = pupil(2015);
    return M.escalateRequest(d, "restroom") === d;
  })());

  /* 8 · A TEACHER DOES NOT ISSUE STUDENT ID CARDS.
     ...and is still worth asking, which is the other half of it. */
  ok("a teacher can decide what they call you in their own room", M.stxTeacherCanGrant("pronouns"));
  ok("...and where you sit in it", M.stxTeacherCanGrant("lists"));
  for (const k of ["name", "id", "email", "documents", "uniform", "restroom", "changing"]) {
    ok("a teacher cannot grant " + k, M.stxTeacherCanGrant(k) === false);
  }
  {
    const d = pupil(2015);
    const scene = M.resolveRequest(d, "documents", "teacher", "t1");
    ok("asking a teacher for the exam certificate is not a refusal",
      !(d.school.trans && d.school.trans.refused && d.school.trans.refused.documents),
      d.school.trans && d.school.trans.refused);
    ok("...nor a grant", !(d.school.trans.granted && d.school.trans.granted.documents));
    ok("...it says whose it is to give", /not mine to give/i.test(scene.pending.text), scene.pending.text);
    const labels = scene.pending.options.map((o) => o.label);
    ok("...and they can be asked to back you", labels.some((l) => /back you/i.test(l)), labels);
    ok("...and asked what they would do", labels.some((l) => /what they'd do/i.test(l)), labels);

    /* backing is the mechanically interesting part: it is how these were won */
    ok("nobody is behind you yet", M.stxBacking(d, "documents") === 0);
    H.seed(3); M.applyFx(d, scene.pending.options.find((o) => /back you/i.test(o.label)).fx);
    ok("backing persists", M.stxBacking(d, "documents") === 1, d.school.trans.backing);
    ok("...and improves the odds with somebody who can decide", M.stxBackingBonus(d, "documents") > 0);
    H.seed(3); M.applyFx(d, M.resolveRequest(d, "documents", "teacher", "t1")
      .pending.options.find((o) => /already backed/i.test(o.label) || /back you/i.test(o.label)).fx);
    ok("...and the same teacher cannot sign twice", M.stxBacking(d, "documents") === 1, d.school.trans.backing);
    /* and the menu says so up front rather than letting the player find out */
    const chans = M.channelMenu(d, "documents").pending.options
      .filter((o) => o.card).map((o) => o.card.sub);
    ok("the channel menu warns that a teacher can't decide this",
      chans.some((x) => /can't decide/i.test(x)), chans);
  }
}
sec("asexuality is about attraction, not capability");
{
  const partner = (orient, disc, status, rel) => {
    H.seed(14);
    const c = H.mkChar({ country: "United Kingdom", birthYear: 1995, sex: "Female",
                         gid: "cis", orient: orient });
    c.ageDays = Math.round(27 * 365.25);
    c.hidden.orientation = orient; c.discovered.orientation = disc;
    c.romance = { r1: { name: "Ana", role: "Partner", status: status, rel: rel,
                        kindness: 70, g: "F", chem: 60 } };
    return c;
  };
  const labels = (c) => M.makeLoveMenu(c, "r1").pending.options.map((o) => o.label).filter(Boolean);

  ok("asexual is recognised", M.isAce(partner("Asexual", true, "dating", 65)));
  ok("demisexual is on the same spectrum", M.isAce(partner("Demisexual", true, "dating", 65)));
  ok("gray-asexual too", M.isAce(partner("Gray-asexual", true, "dating", 65)));
  ok("bisexual is not", M.isAce(partner("Bisexual", true, "dating", 65)) === false);

  /* the stance is DERIVED — nothing stored, so no newCharacter() draw was
     added and no seeded fixture in the repo moved (the trap that silently
     cost test-edu-s07 twelve assertions once already) */
  const a = partner("Asexual", true, "dating", 65);
  ok("stance is derived, not stored", JSON.stringify(a).indexOf("aceStance") === -1);
  ok("...and is stable for the same life", M.aceStance(a) === M.aceStance(a));
  ok("...and is one of the three real ones",
    ["repulsed", "neutral", "favourable"].indexOf(M.aceStance(a)) !== -1, M.aceStance(a));
  ok("an allosexual character has no stance", M.aceStance(partner("Bisexual", true, "dating", 65)) === null);
  ok("across many lives all three stances occur", (() => {
    const seen = new Set();
    for (let i = 0; i < 60; i++) {
      H.seed(400 + i);
      const c = H.mkChar({ country: "Sweden", birthYear: 1990, orient: "Asexual" });
      c.hidden.orientation = "Asexual";
      seen.add(M.aceStance(c));
    }
    return seen.size === 3;
  })());

  /* THE BUG: the scene was identical to everyone else's */
  const ace = labels(partner("Asexual", true, "dating", 65));
  const allo = labels(partner("Bisexual", true, "dating", 65));
  ok("an asexual character does not get the allosexual scene verbatim",
    JSON.stringify(ace) !== JSON.stringify(allo), ace);
  ok("...the evening is offered on their terms", ace.some((l) => /no further/i.test(l)), ace);
  /* NOT the mirror error — going further is still available, because people do */
  ok("...going further is still possible", ace.some((l) => /Go further|Go along/i.test(l)), ace);
  ok("...and there is a conversation to have about it",
    ace.some((l) => /what you each want/i.test(l)), ace);

  /* demisexual is not a weaker asexual: attraction arrives with the bond */
  const early = partner("Demisexual", true, "dating", 60);
  const bonded = partner("Demisexual", true, "married", 84);
  ok("a demisexual early on is not yet drawn", M.aceAttracted(early, early.romance.r1) === false);
  ok("...and after years of a bond, is", M.aceAttracted(bonded, bonded.romance.r1) === true);
  ok("...and then gets the ordinary scene", labels(bonded).some((l) => /Spend the night together/i.test(l)));
  ok("an asexual character is not 'unlocked' by a long marriage", (() => {
    const long = partner("Asexual", true, "married", 92);
    return M.aceAttracted(long, long.romance.r1) === false;
  })());
  ok("...and 'not yet' is worded differently from 'not ever'", (() => {
    const t1 = M.makeLoveMenu(early, "r1").pending.text;
    const t2 = M.makeLoveMenu(partner("Asexual", true, "dating", 60), "r1").pending.text;
    return t1 !== t2 && /has not arrived|eventually/i.test(t1);
  })());

  /* undiscovered means no word for it yet — the confusion is the content */
  const unknown = partner("Asexual", false, "dating", 65);
  const ul = labels(unknown);
  ok("without the word, the scene does not explain them to themselves",
    ul.every((l) => !/no further/i.test(l)), ul);
  ok("...but the confusion is available", ul.some((l) => /isn't landing/i.test(l)), ul);

  /* the mixed-orientation conversation turns on the PARTNER, not on conceding */
  ok("a kind partner makes the conversation go well", (() => {
    const d = partner("Asexual", true, "dating", 78); d.romance.r1.kindness = 85;
    const opt = M.makeLoveMenu(d, "r1").pending.options.find((o) => /what you each want/i.test(o.label || ""));
    H.seed(2); M.applyFx(d, opt.fx);
    return d.romance.r1.rel > 78;
  })());
  ok("an unkind one does not", (() => {
    const d = partner("Asexual", true, "dating", 55); d.romance.r1.kindness = 20;
    const opt = M.makeLoveMenu(d, "r1").pending.options.find((o) => /what you each want/i.test(o.label || ""));
    H.seed(2); M.applyFx(d, opt.fx);
    return d.romance.r1.rel < 55;
  })());
  /* going along with it costs a repulsed character more than a neutral one */
  ok("going along with it costs, and costs most where it should", (() => {
    const mk = (stance) => {
      for (let i = 0; i < 200; i++) {
        H.seed(600 + i);
        const c = H.mkChar({ country: "Sweden", birthYear: 1990, orient: "Asexual" });
        c.ageDays = Math.round(27 * 365.25);
        c.hidden.orientation = "Asexual"; c.discovered.orientation = true;
        c.romance = { r1: { name: "Ana", status: "dating", rel: 70, kindness: 60, g: "F" } };
        if (M.aceStance(c) === stance) return c;
      }
      return null;
    };
    const rep = mk("repulsed"), neu = mk("neutral");
    if (!rep || !neu) return false;
    const cost = (c) => {
      const d = JSON.parse(JSON.stringify(c));
      const opt = M.makeLoveMenu(c, "r1").pending.options.find((o) => /Go further|Go along/i.test(o.label || ""));
      H.seed(9); M.applyFx(d, opt.fx);
      return c.stats.happiness - d.stats.happiness;
    };
    return cost(rep) > cost(neu) && cost(neu) > 0;
  })());
  /* Gotcha #2 again — this one IS a builder */
  ok("the intimacy menu builder mutates nothing", (() => {
    const d = partner("Asexual", true, "dating", 65);
    const snap = JSON.stringify(d);
    M.makeLoveMenu(d, "r1");
    return JSON.stringify(d) === snap;
  })());
}

console.log("\n" + (fail === 0 ? "ALL PASS" : "FAILURES") + ": " + pass + " passed, " + fail + " failed");
process.exit(fail === 0 ? 0 : 1);