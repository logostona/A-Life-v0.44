/* test-realism.js — IQ, romantic discovery, and medical hormone therapy
 *
 * Three additions whose whole point is that they are REALISTIC, so the
 * assertions are about shape rather than about values:
 *
 *   · IQ must be normally distributed with mean 100 and SD 15, because that is
 *     what an IQ score is. A uniform draw would make 70 and 100 equally common.
 *   · Romantic discovery must be a scene with consequences, not a flag flip —
 *     and the varioriented case must differ from the mirrored one, since that
 *     divergence is the only reason the axis exists.
 *   · Hormone therapy must be gated on era, health system, age and BODY. A
 *     52-year-old cis woman in 1930 cannot have menopausal HT because it did
 *     not exist; in 2004 she can, but it is much harder to get than in 2001.
 *
 * Run: node --max-old-space-size=4096 test-realism.js
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

/* ───────────────────────── 1 · IQ is an IQ ───────────────────────── */
sec("1 · IQ");

{
  /* the defining properties of the scale */
  ok("the median percentile is IQ 100", M.iqFromPercentile(50) === 100, M.iqFromPercentile(50));
  /* THIS IS DELIBERATELY NOT A CLINICAL SCALE, and the suite should say so
     rather than quietly encode the old one. The range was widened to 75-180 on
     request; a mean-100 SD-15 curve puts p0.5/p99.5 at about 61/139, so the
     top of that range was unreachable until the spread above the mean was
     widened independently of the spread below it. What is asserted now is the
     SHAPE — ordered, monotonic, densest in the middle, both ends reachable —
     not the clinical anchors, which no longer hold and should not pretend to. */
  ok("the scale is asymmetric by design", M.IQ_SD_HIGH > M.IQ_SD_LOW,
    [M.IQ_SD_LOW, M.IQ_SD_HIGH]);
  ok("a point above the mean is further from it than the mirrored point below",
    (M.iqFromPercentile(84) - 100) > (100 - M.iqFromPercentile(16)),
    [M.iqFromPercentile(16), M.iqFromPercentile(84)]);
  ok("...and both stay ordered around the median",
    M.iqFromPercentile(16) < M.iqFromPercentile(50) && M.iqFromPercentile(50) < M.iqFromPercentile(84));
  ok("the mean and SD are the standard ones", M.IQ_MEAN === 100 && M.IQ_SD === 15);
  ok("it is monotonic", (() => {
    let prev = -1;
    for (let p = 1; p <= 99; p++) { const v = M.iqFromPercentile(p); if (v < prev) return false; prev = v; }
    return true;
  })());
  ok("it is clamped at both ends", M.iqFromPercentile(0) >= M.IQ_MIN && M.iqFromPercentile(100) <= M.IQ_MAX,
    [M.iqFromPercentile(0), M.iqFromPercentile(100)]);
  /* the requested range must be REACHABLE, not merely permitted by a clamp —
     widening the clamp alone left everything above 139 impossible to produce */
  ok("the bottom of the range is reachable", M.iqFromPercentile(0.5) === M.IQ_MIN, M.iqFromPercentile(0.5));
  ok("the top of the range is reachable", M.iqFromPercentile(99.5) === M.IQ_MAX, M.iqFromPercentile(99.5));
  ok("...and the round trip holds at both ends",
    M.iqFromPercentile(M.iqToPercentile(M.IQ_MAX)) > 160 && M.iqFromPercentile(M.iqToPercentile(M.IQ_MIN)) < 90,
    [M.iqFromPercentile(M.iqToPercentile(M.IQ_MAX)), M.iqFromPercentile(M.iqToPercentile(M.IQ_MIN))]);
  ok("out-of-range input does not produce NaN",
    isFinite(M.iqFromPercentile(-10)) && isFinite(M.iqFromPercentile(200)));
}
{
  /* the normal machinery itself */
  ok("normalCdf(0) is 0.5", Math.abs(M.normalCdf(0) - 0.5) < 1e-6);
  ok("normalCdf(1) is ~0.841", Math.abs(M.normalCdf(1) - 0.8413) < 1e-3, M.normalCdf(1));
  ok("normalQuantile inverts normalCdf", (() => {
    for (const z of [-2, -1, -0.5, 0, 0.5, 1, 2]) {
      if (Math.abs(M.normalQuantile(M.normalCdf(z)) - z) > 1e-4) return false;
    }
    return true;
  })());
  ok("normalPercentile stays inside 1..99", (() => {
    for (let i = 0; i < 2000; i++) { const v = M.normalPercentile(); if (v < 1 || v > 99) return false; }
    return true;
  })());
}
{
  /* THE ASSERTION THAT MATTERS: the population has the shape a population has.
     A uniform draw would pass every test above and still be wrong. */
  const N = 6000, vals = [];
  for (let i = 0; i < N; i++) vals.push(M.iqFromPercentile(M.normalPercentile()));
  const mean = vals.reduce((a, b) => a + b, 0) / N;
  const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) * (b - mean), 0) / N);
  /* The asymmetric scale pulls the arithmetic mean above the median — a wider
     upper tail has to. The MEDIAN is what stays pinned at 100, and that is the
     honest statistic to assert on a skewed distribution. */
  const sorted = vals.slice().sort((a, b) => a - b);
  const median = sorted[Math.floor(N / 2)];
  ok("the median is 100", Math.abs(median - 100) <= 2, median);
  ok("the mean sits above it, because the upper tail is longer", mean > median, [mean, median]);
  ok("the spread is wider than a clinical scale's", sd > 15, sd);

  /* the shape assertions, restated in percentile terms so they survive any
     future change to where the ends of the range sit */
  const q = (pc) => sorted[Math.floor(N * pc)];
  ok("quartiles are ordered", q(0.25) < median && median < q(0.75), [q(0.25), median, q(0.75)]);
  const mid = vals.filter((v) => v >= q(0.16) && v <= q(0.84)).length / N;
  ok("the middle two thirds really are the middle two thirds", Math.abs(mid - 0.68) < 0.06, mid);
  /* THE DISTINGUISHING TEST, unchanged in intent: a uniform draw over the same
     range would put only about a third of its mass in the middle band. */
  const band = vals.filter((v) => v >= 90 && v <= 120).length / N;
  ok("the middle is denser than the tails — i.e. NOT uniform", band > 0.4, band);
  ok("both ends of the range are actually produced",
    sorted[0] < 85 && sorted[N - 1] > 150, [sorted[0], sorted[N - 1]]);
}
{
  const c = H.mkChar({ country: "Sweden", birthYear: 1990 });
  ok("a character has an IQ", M.iqOf(c) >= M.IQ_MIN && M.iqOf(c) <= M.IQ_MAX, M.iqOf(c));
  ok("IQ derives from the stored percentile", M.iqOf(c) === M.iqFromPercentile(c.stats.smarts));
  ok("the stored stat is still a 0-100 percentile",
    c.stats.smarts >= 0 && c.stats.smarts <= 100, c.stats.smarts);
  /* the 69 existing call sites must keep working on the old scale */
  const before = c.stats.smarts;
  c.stats.smarts = M.clamp(c.stats.smarts + 3);
  ok("writes on the 0-100 scale still work", c.stats.smarts === Math.min(100, before + 3));
  ok("...and move the IQ with them", M.iqOf(c) >= M.iqFromPercentile(before));

  ok("every band has a name", [58, 72, 85, 100, 115, 125, 140]
    .every((v) => typeof M.iqBand(v) === "string" && M.iqBand(v).length > 3));
  ok("100 is average", M.iqBand(100) === "average");
  ok("135 is very superior", M.iqBand(135) === "very superior");
  ok("the top of the range still has a name", typeof M.iqBand(M.IQ_MAX) === "string" && M.iqBand(M.IQ_MAX).length > 3);
}

/* ───────────────── 2 · romantic orientation, discovered ───────────────── */
sec("2 · romantic discovery is a scene");

const discR = M.MILESTONES.find((m) => m.id === "discoverR");
ok("the milestone exists", !!discR);

function atDiscovery(orient, romantic) {
  const c = H.mkChar({ country: "United Kingdom", birthYear: 1990, gid: "Cisgender",
                       orient, romantic, knowsSelf: false });
  c.ageDays = 6100;
  return c;
}
{
  const c = atDiscovery("Bisexual", "Biromantic");            // mirrored
  const out = discR.run(c);
  ok("it returns an event, not just feed lines", !!out.event && !!out.event.options, Object.keys(out));
  ok("...with a title and text", !!out.event.title && out.event.text.length > 40);
  ok("...and real choices", out.event.options.length >= 2);
  ok("every option has a label and fx",
    out.event.options.every((o) => o.label && o.fx));
  /* nothing is discovered until the player chooses — that is what makes it a
     scene rather than a flag flip */
  ok("the flag is NOT set merely by the event firing", c.discovered.romantic !== true);
  const d = JSON.parse(JSON.stringify(c));
  M.applyFx(d, out.event.options[0].fx);
  ok("choosing an option is what sets it", d.discovered.romantic === true);
}
{
  /* the varioriented case must actually differ — it is the reason the axis
     exists at all */
  const mirrored = atDiscovery("Bisexual", "Biromantic");
  const crossed = atDiscovery("Bisexual", "Heteroromantic");
  const mOut = discR.run(mirrored), cOut = discR.run(crossed);
  ok("a cross-oriented character gets a different scene",
    mOut.event.text !== cOut.event.text);
  ok("...and more to do with it", cOut.event.options.length > mOut.event.options.length,
    [mOut.event.options.length, cOut.event.options.length]);
  ok("the cross-oriented scene names the mismatch",
    cOut.event.options.some((o) => /mismatch|wrong|tell someone/i.test(o.label)), cOut.event.options.map((o) => o.label));

  const d = JSON.parse(JSON.stringify(crossed));
  M.applyFx(d, cOut.event.options[0].fx);
  ok("understanding it is recorded", d.flags.knowsSplit === true);
  ok("...and is worth more self-awareness than the simple case",
    (d.emergent.selfAwareness || 0) > 5, d.emergent.selfAwareness);
}
{
  /* aromantic gets its own framing and its own option */
  const aro = atDiscovery("Asexual", "Aromantic");
  const out = discR.run(aro);
  ok("an aromantic character gets their own scene", /pull|weather|waiting/i.test(out.event.text), out.event.text.slice(0, 80));
  ok("...including a queerplatonic option",
    out.event.options.some((o) => /instead of romance/i.test(o.label)), out.event.options.map((o) => o.label));
  const d = JSON.parse(JSON.stringify(aro));
  const qpr = out.event.options.find((o) => /instead of romance/i.test(o.label));
  M.applyFx(d, qpr.fx);
  ok("choosing it is recorded", d.flags.knowsQpr === true);
  ok("...and it is a good outcome, not a consolation", (d.stats.happiness || 0) > (aro.stats.happiness || 0));
}
{
  /* THE SHAPES. "Does it equal the mirror" is one bit, and the axis needs more
     than one: three of the eight labels differ from their orientation in a way
     that is not about direction at all, and the one-bit split put the
     cross-orientation scene in front of all of them. */
  const shape = M.romanticShape;
  ok("a mirrored pair is mirrored", shape("Bisexual", "Biromantic") === "mirrored");
  ok("a genuine direction clash is crossed", shape("Bisexual", "Heteroromantic") === "crossed");
  ok("...in both directions", shape("Straight", "Homoromantic") === "crossed");
  /* bi and pan are not a clash worth a months-of-confusion scene */
  ok("bisexual + panromantic is not a mismatch", shape("Bisexual", "Panromantic") === "mirrored");
  ok("aromantic is absence, not mismatch", shape("Bisexual", "Aromantic") === "absent");
  ok("...whatever the sexual orientation is", shape("Asexual", "Aromantic") === "absent");
  ok("demiromantic is a condition, not a direction", shape("Bisexual", "Demiromantic") === "conditional");
  ok("grayromantic likewise", shape("Bisexual", "Grayromantic") === "conditional");
  ok("questioning stays open", shape("Bisexual", "Questioning") === "open");
  ok("every label the roller can produce has a shape",
    M.ROMANTIC_ALL.every((r) => M.ORIENT_ALL.every((o) =>
      ["mirrored", "crossed", "absent", "conditional", "open"].indexOf(shape(o, r)) !== -1)));

  /* and each shape must actually reach a DIFFERENT scene, or classifying them
     bought nothing */
  const textFor = (o, r) => { const c = atDiscovery(o, r); c.hidden.orientation = o; c.hidden.romantic = r;
                              return discR.run(c).event.text; };
  const scenes = [textFor("Bisexual", "Biromantic"), textFor("Bisexual", "Heteroromantic"),
                  textFor("Bisexual", "Aromantic"), textFor("Bisexual", "Demiromantic"),
                  textFor("Bisexual", "Questioning")];
  ok("the five shapes are five different scenes", new Set(scenes).size === 5,
    scenes.map((t) => t.slice(0, 34)));

  /* the two conditional labels are different conditions: demi is about ORDER,
     gray is about FREQUENCY, and giving gray demi's text told a character
     their feelings needed someone they already knew — a different life */
  ok("demiromantic and grayromantic do not share a scene",
    textFor("Bisexual", "Demiromantic") !== textFor("Bisexual", "Grayromantic"));
  ok("the grayromantic scene is about how rarely, not about trust first",
    /rare|twice a decade|wanders|snow/i.test(textFor("Bisexual", "Grayromantic")),
    textFor("Bisexual", "Grayromantic").slice(0, 90));

  /* an aromantic character must never be told to sit with a mismatch */
  for (const o of ["Bisexual", "Asexual", "Straight"]) {
    const c = atDiscovery(o, "Aromantic"); c.hidden.orientation = o; c.hidden.romantic = "Aromantic";
    const labels = discR.run(c).event.options.map((x) => x.label).join(" | ");
    ok("an aromantic " + o.toLowerCase() + " character is not offered a mismatch to sit with",
      !/sit with the mismatch|must be wrong/i.test(labels), labels);
  }
  /* the aro-allosexual case is a real and distinct bind and gets its own option */
  const alloAro = (() => { const c = atDiscovery("Bisexual", "Aromantic");
    c.hidden.orientation = "Bisexual"; c.hidden.romantic = "Aromantic"; return discR.run(c); })();
  const aceAro = (() => { const c = atDiscovery("Asexual", "Aromantic");
    c.hidden.orientation = "Asexual"; c.hidden.romantic = "Aromantic"; return discR.run(c); })();
  ok("an aromantic character who does feel sexual attraction gets a different scene",
    alloAro.event.text !== aceAro.event.text);
  ok("...and something to do about the specific bind",
    alloAro.event.options.length > aceAro.event.options.length,
    [alloAro.event.options.length, aceAro.event.options.length]);
}
{
  /* every romantic label must reach a scene without printing "undefined" */
  let bad = [];
  for (const r of M.ROMANTIC_ALL) {
    const c = atDiscovery("Bisexual", r);
    if (!c.hidden.romantic) continue;
    const out = discR.run(c);
    const txt = out.event.text + out.event.options.map((o) => o.label + JSON.stringify(o.fx)).join(" ");
    if (/undefined|\[object/.test(txt)) bad.push(r);
  }
  ok("no romantic label produces undefined text", bad.length === 0, bad);
}
{
  /* the creation-time override, matching the other two axes */
  const c = H.mkChar({ country: "Sweden", birthYear: 1990, discRAt: 24 });
  ok("a chosen discovery age is stored", c.flags.discRAt === 24, c.flags.discRAt);
  const SRC = fs.readFileSync(H.SRC, "utf8");
  ok("...and the milestone scan honours it", /discoverR" && s\.flags\.discRAt/.test(SRC));
}

/* ───────────────── 3 · medical hormone therapy ───────────────── */
sec("3 · HRT that is not transition care");

{
  ok("the kinds are defined", Object.keys(M.HRT_KINDS).length >= 3);
  ok("each names an era curve, an age band and a body requirement",
    Object.values(M.HRT_KINDS).every((k) => Array.isArray(k.era) && k.era.length
      && typeof k.minAge === "number" && typeof k.maxAge === "number" && !!k.needs));
  ok("era curves are chronological",
    Object.values(M.HRT_KINDS).every((k) => k.era.every((b, i) => i === 0 || b[0] > k.era[i - 1][0])));
}
const woman = (country, year, age) => {
  const c = H.mkChar({ country, birthYear: year - age, sex: "Female", gid: "Cisgender", cls: "Middle" });
  c.ageDays = Math.round(age * 365.25); return c;
};
const man = (country, year, age) => {
  const c = H.mkChar({ country, birthYear: year - age, sex: "Male", gid: "Cisgender", cls: "Middle" });
  c.ageDays = Math.round(age * 365.25); return c;
};
const ix = (dsd, year, age) => {
  const c = H.mkChar({ country: "United Kingdom", birthYear: year - age, sex: "Intersex",
                       dsd, assigned: "Female", gid: "Cisgender" });
  c.ageDays = Math.round(age * 365.25); return c;
};
const kinds = (c) => M.hrtMedicalOptions(c).map((o) => o.id);

{
  /* ERA — the thing the request specifically asked for */
  ok("menopausal HT does not exist in 1930", kinds(woman("United Kingdom", 1930, 52)).indexOf("menopause") === -1);
  ok("...exists by 1965", kinds(woman("United Kingdom", 1965, 52)).indexOf("menopause") !== -1);
  const av = (y) => { const o = M.hrtMedicalOptions(woman("United Kingdom", y, 52)).find((x) => x.id === "menopause"); return o ? o.avail : 0; };
  ok("...peaks before 2002", av(1995) > av(2004), [av(1995), av(2004)]);
  /* the Women's Health Initiative trial was halted in July 2002 and prescribing
     roughly halved within a year — the sharpest real discontinuity in this
     therapy's history, and the reason the curve is not monotonic */
  ok("...falls sharply after the 2002 trial", av(2001) / Math.max(0.01, av(2004)) > 2, [av(2001), av(2004)]);
  ok("...and partially recovers later", av(2018) > av(2004), [av(2004), av(2018)]);
  ok("testosterone replacement is unavailable in 1900", kinds(man("United Kingdom", 1900, 55)).length === 0);
  ok("...and available by 2000", kinds(man("United Kingdom", 2000, 55)).indexOf("androgen") !== -1);
}
{
  /* COUNTRY — through health-system capacity, never a country name */
  const a = (cn) => { const o = M.hrtMedicalOptions(woman(cn, 2010, 52)).find((x) => x.id === "menopause"); return o ? o.avail : 0; };
  ok("a richer health system offers it more readily", a("Sweden") > a("Nigeria"), [a("Sweden"), a("Nigeria")]);
  ok("...with middle tiers in between", a("Sweden") >= a("Brazil") && a("Brazil") >= a("Nigeria"),
    [a("Sweden"), a("Brazil"), a("Nigeria")]);
  ok("access is a share", M.hrtAccessScale(woman("Nigeria", 2010, 52)) > 0 && M.hrtAccessScale(woman("Sweden", 2010, 52)) <= 1);
}
{
  /* BODY — the medically decisive factor */
  ok("a 52yo cis woman is offered menopausal HT", kinds(woman("United Kingdom", 2010, 52)).indexOf("menopause") !== -1);
  ok("a 30yo cis woman is not", kinds(woman("United Kingdom", 2010, 30)).indexOf("menopause") === -1);
  ok("a cis man is never offered menopausal HT", kinds(man("United Kingdom", 2010, 52)).indexOf("menopause") === -1);
  ok("a 55yo cis man is offered testosterone", kinds(man("United Kingdom", 2010, 55)).indexOf("androgen") !== -1);
  ok("a 25yo cis man is not", kinds(man("United Kingdom", 2010, 25)).indexOf("androgen") === -1);
  ok("a cis woman is never offered testosterone", kinds(woman("United Kingdom", 2010, 52)).indexOf("androgen") === -1);

  /* the intersex cases, which is where this matters most: without induction a
     character with Swyer or Turner syndrome has no puberty at all */
  ok("Swyer syndrome indicates pubertal induction", kinds(ix("swyer", 2010, 15)).indexOf("induction") !== -1);
  ok("Turner syndrome does too", kinds(ix("turner", 2010, 14)).indexOf("induction") !== -1);
  ok("CAH does NOT — those ovaries work", kinds(ix("cah", 2010, 15)).indexOf("induction") === -1);
  ok("induction is not offered to a 40-year-old", kinds(ix("swyer", 2010, 40)).indexOf("induction") === -1);

  /* The endocrine facts are stated per variation rather than inferred from
     `repro`, which is a FERTILITY field. Reading it as an endocrine one got
     three variations wrong, and each of those is pinned here. */
  ok("every variation has its endocrine facts stated",
    Object.keys(M.DSD_VARIATIONS).every((k) => !!M.DSD_ENDOCRINE[k]),
    Object.keys(M.DSD_VARIATIONS).filter((k) => !M.DSD_ENDOCRINE[k]));
  ok("no variation is left without an answer either way",
    Object.values(M.DSD_ENDOCRINE).every((e) =>
      typeof e.ovaries === "boolean" && typeof e.testes === "boolean"
      && typeof e.induction === "boolean" && (e.lifelong === null || typeof e.lifelong === "string")));

  /* Klinefelter is the commonest indication for lifelong testosterone in
     medicine. Inferring from `repro` (null, because infertile) offered it
     nothing at all. */
  ok("Klinefelter is on lifelong replacement as an adult",
    kinds(ix("klf", 2010, 30)).indexOf("lifelong") !== -1, kinds(ix("klf", 2010, 30)));
  ok("...and the hormone is testosterone", M.DSD_ENDOCRINE.klf.lifelong === "testosterone");
  ok("Turner is too, and on oestrogen",
    kinds(ix("turner", 2010, 30)).indexOf("lifelong") !== -1 && M.DSD_ENDOCRINE.turner.lifelong === "estrogen");
  ok("Swyer is too", kinds(ix("swyer", 2010, 30)).indexOf("lifelong") !== -1);
  ok("CAH is NOT on lifelong replacement — it is an adrenal condition",
    M.DSD_ENDOCRINE.cah.lifelong === null && kinds(ix("cah", 2010, 30)).length === 0);

  /* complete androgen insensitivity means exactly that: those testes produce
     testosterone the body cannot use, so androgen therapy is not a treatment */
  ok("CAIS is never offered testosterone", kinds(ix("cais", 2010, 45)).indexOf("androgen") === -1,
    kinds(ix("cais", 2010, 45)));
  ok("...but is on oestrogen replacement", M.DSD_ENDOCRINE.cais.lifelong === "estrogen");

  /* the two windows overlap from 18 to 22 and must not both fire */
  for (const age of [18, 20, 22, 25, 30, 45]) {
    ok("exactly one therapy is on offer at " + age + " with Turner syndrome",
      kinds(ix("turner", 2010, age)).length === 1, kinds(ix("turner", 2010, age)));
  }
  ok("inside the overlap it is induction, not continuation",
    kinds(ix("turner", 2010, 20)).indexOf("induction") !== -1, kinds(ix("turner", 2010, 20)));
  ok("...and past it, continuation",
    kinds(ix("turner", 2010, 25)).indexOf("lifelong") !== -1, kinds(ix("turner", 2010, 25)));
}
{
  /* The era note is per therapy, not per year. The 2002 trial was a study of
     postmenopausal oestrogen-plus-progestin; a 16-year-old starting pubertal
     induction is not in that conversation and must not be told they are. */
  const note = (kind, y) => M.hrtEraNote(kind, y);
  ok("the menopausal note names the trial in its window", /trial/i.test(note("menopause", 2008)));
  ok("induction is never told about the trial",
    [1955, 1980, 2005, 2010, 2020].every((y) => !/trial/i.test(note("induction", y))),
    [1955, 1980, 2005, 2010, 2020].map((y) => note("induction", y).slice(0, 30)));
  ok("neither is lifelong replacement",
    [1955, 1980, 2005, 2020].every((y) => !/trial/i.test(note("lifelong", y))));
  ok("every kind has a note in every era",
    Object.keys(M.HRT_KINDS).every((k) => [1930, 1955, 1980, 2005, 2020].every((y) =>
      typeof note(k, y) === "string" && note(k, y).length > 20 && !/undefined/.test(note(k, y)))));
  /* and the panel a real character sees must use their own therapy's note */
  const teen = ix("swyer", 2008, 16);
  const panel = M.medicalHrtMenu(teen).pending;
  ok("a teenager starting induction in 2008 is not given the trial framing",
    !/trial/i.test(panel.text), panel.text);
}
{
  /* it must be reachable, and it must not be transition care */
  const c = woman("United Kingdom", 2010, 52);
  ok("the therapy is available to a cis character", M.hrtMedicalAvailable(c));
  const menu = M.medicalHrtMenu(c).pending;
  ok("the menu builds", !!menu && !!menu.options.length);
  ok("...and has a way out", menu.options.some((o) => !o.fx.run));
  const d = JSON.parse(JSON.stringify(c));
  d.money = 500;
  M.applyFx(d, menu.options[0].fx);
  ok("starting it is recorded", !!d.flags.medHrt && !!d.flags.medHrt.kind, d.flags.medHrt);
  /* THE SEPARATION THAT MATTERS: flags.hrt means gender-affirming care and
     drives presentation, the butterfly chip, dating and sterility. A menopause
     prescription must not set it. */
  ok("it does NOT set the gender-affirming flag", !d.flags.hrt, d.flags.hrt);
  ok("...and does not make the character read as transitioning", !d.flags.transitioning);
  ok("it is not offered twice", !M.hrtMedicalAvailable(d));
}
{
  /* testosterone suppresses spermatogenesis — a real consequence, and one the
     game states rather than hides */
  const c = man("United Kingdom", 2010, 45);
  ok("precondition: fertile", !M.isSterile(c));
  c.flags.medHrt = { kind: "androgen", since: c.ageDays };
  ok("...still fertile immediately", !M.isSterile(c));
  c.ageDays += Math.round(2 * 365.25);
  ok("androgen therapy suppresses fertility over time", M.isSterile(c));
  const w = woman("United Kingdom", 2010, 52);
  w.flags.medHrt = { kind: "menopause", since: w.ageDays };
  w.ageDays += Math.round(2 * 365.25);
  ok("menopausal therapy does not cause sterility on its own",
    M.isSterile(w) === M.isSterile(woman("United Kingdom", 2010, 54)));
}
{
  /* migration, per Gotcha #4 */
  const c = H.mkChar({ country: "Brazil", birthYear: 1960 });
  delete c.flags.medHrt;
  M.migrate(c);
  ok("migrate backfills the field", c.flags.medHrt === null);
  ok("...idempotently", (() => { M.migrate(c); return c.flags.medHrt === null; })());
}
{
  /* invariants */
  const SRC = fs.readFileSync(H.SRC, "utf8");
  const strip = (x) => x.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
  /* The slice ENDS AT THE NEXT BANNER, not at a function name. This lint used
     to stop at `function hrtMenu(state)`, which lives INSIDE this section
     rather than after it, so it silently checked about half the block and the
     rest was never linted at all. */
  const start = SRC.lastIndexOf("/*", SRC.indexOf("MEDICAL HORMONE THERAPY"));
  const end = SRC.indexOf("/* ═══════════════ INTIMACY", start);
  ok("the section end banner was found", end > start, [start, end]);
  const block = strip(SRC.slice(start, end));
  ok("the block was located", block.length > 1500, block.length);
  ok("...and reaches the end of the section", SRC.slice(start, end).includes("function medicalHrtMenu"));
  ok("no country conditional — access comes from the dev tier",
    !/country\s*===\s*["']/.test(block));
  ok("it reads the development tier", block.includes("hreDevOf"));
  ok("it reads the intersex variation", block.includes("dsdEndocrine"));
  /* endocrine facts must not be inferred from the fertility field — that is
     the bug this whole table exists to fix */
  ok("it does not infer endocrine facts from the fertility field",
    !/\.repro\s*===/.test(block), (block.match(/.{40}\.repro\s*===.{20}/) || [])[0]);
}

/* ───────────────── 4 · nothing broke ───────────────── */
sec("4 · lives still run");

{
  let crashes = 0, deadEnds = 0, aged = 0, bad = [];
  for (let i = 0; i < 6; i++) {
    const country = ["United Kingdom", "Nigeria", "Japan", "Sweden", "Brazil", "India"][i];
    H.seed(9100 + i);
    const r = H.runLife(H.mkChar({ country, birthYear: 1950 + i * 9, cls: H.CLASSES[i % 4] }), {
      maxSteps: 2000,
      onStep: (s) => {
        const iq = M.iqOf(s);
        if (!(iq >= M.IQ_MIN && iq <= M.IQ_MAX)) bad.push(["iq", country, iq]);
      },
    });
    crashes += r.crashes; deadEnds += r.deadEnds;
    if (M.ageYears(r.state) > 5) aged++;
    const feed = (r.state.feed || []).map((f) => f.text).join(" ");
    if (/undefined|NaN|\[object/.test(feed)) bad.push(["feed", country]);
  }
  ok("no crashes", crashes === 0, crashes);
  ok("no dead ends", deadEnds === 0, deadEnds);
  ok("everyone aged", aged === 6, aged);
  ok("IQ stayed in range for every character at every step", bad.length === 0, bad.slice(0, 3));
}

console.log("\n" + (fail === 0 ? "ALL PASS" : "FAILURES") + ": " + pass + " passed, " + fail + " failed");
process.exit(fail === 0 ? 0 : 1);
