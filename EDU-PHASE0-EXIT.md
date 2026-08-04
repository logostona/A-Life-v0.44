# EDU — Phase 0 Exit
### Evidence gathered against the real `life-sim.jsx` · companion to `EDU-ARCHITECTURE.md` and `EDU-ROADMAP.md`
### Status: **Phase 0 complete. Phases 1–5 shipped (S01, S02, S09, S04+S05, S03+S06).**

`EDU-ARCHITECTURE.md` states plainly that it was written without access to the source:

> *Nothing in here has been verified against the real `life-sim.jsx` — this chat has never seen it.*

This document closes that gap. Every number below was measured, not inferred, and the
measurement command is recorded so it can be re-run rather than re-derived. Where the
architecture doc turned out to be wrong, that is stated rather than quietly corrected.

---

## 1 · Verdict on the architecture doc

**Correct, verified:**

| claim | reality |
|---|---|
| `hreHash` / `hreMulberry` / `hreRng` / `hreRngRetry` exist | yes — lines 1874, 1966, 1986, 2058 |
| `HRE_REGION` / `HRE_DEV` cover all countries | yes — 41 countries, 11 regions, 4 dev tiers |
| `HRE_INCOME_REALISATION` is a single isolated constant | yes — `= 0.298`, line 3322 |
| `SCHOOL_TYPES` has 12 entries | exactly 12 |
| `POOL` has 214 entries | exactly 214 (now 213, see §3) |
| **OQ-4** — a schedule-based degree-completion block exists in `advance()` | **yes**, and it is where the design hoped |

**OQ-4 resolved in detail.** The block sits at `life-sim.jsx:6799`, inside `advance()`'s
`while` loop, *after* the birthday/mortality check and *before* `WORLD_EVENTS`, `MILESTONES`
and the POOL draw:

```js
// degrees finish on schedule, not on a dice roll
if (s.education.college) {
  const need = s.education.college.major === "Medicine" ? 2190 : 1460;
  if (s.ageDays - s.education.college.startDay >= need) gainDegree(s);
}
```

There is room for a general scheduled-education step here, and its position is the right one:
it runs before anything that can set `s.pending`, so it cannot be starved by a popup.

**Wrong or stale:**

| claim | measured |
|---|---|
| "698 green assertions" | **942** (identity work added 142 + 5; EDU S01 adds 81 → **1023**) |
| "`s.feed` is 91–92% of the save" | **75.3%** |
| "~240 KB full-life save" | **~85 KB** (step-capped lives; treat as a floor, not a refutation) |
| "progression must never be delivered through POOL" — implied to already hold | **it did not**; see §3 |
| "21 educational stages" | the vision document lists **23**; see §5 |

---

## 2 · OQ-8 — what the legacy state actually carries

Measured across 40 lives × 10 countries × 5 eras.

```
s.school     = { classmates, faculty, lastStudy, name, present, skips, stage, trouble, type }
s.education  = { stage, subjects, extra, college, degree, debt }
```

| slice | avg bytes | share of save |
|---|---|---|
| total save | 85,176 | — |
| `s.feed` | 64,145 | **75.3%** |
| `s.school` | 7,551 | **8.87%** |
| `s.education` | 193 | 0.23% |

**Consequence for the ≤2.5 KB `s.edu` budget:** the budget is sound, but note that `s.school`
already spends **three times** it, almost entirely on per-classmate and per-faculty data. EDU
must not add a second population. Architecture §8.5 already says module 06 owns people and EDU
passes institution attributes as `opts` — this measurement is the reason that rule matters.

`s.feed` remains the dominant cost and remains unbounded. Not EDU's to fix, but any EDU feature
that pushes lines is spending the most expensive resource in the save.

Reachable legacy stages in practice: only `done` (39/40) and `college` (1/40) survive to end of
life. The legacy ladder is effectively 6 values with 2 terminal states — which is why the shim
in P3 is a small job, not a large one.

---

## 3 · Finding: `collegeGrad` was unreachable dead code — **removed**

`POOL` contained an entry whose condition duplicated the scheduled block exactly:

```js
{ id: "collegeGrad", w: 1, minAge: 19, maxAge: 40, cd: 60,
  cond: (s) => !!s.education.college && s.ageDays - s.education.college.startDay >= (… 2190 : 1460),
  run: (s) => { gainDegree(s); … } }
```

`gainDegree` sets `s.education.college = null`, and the scheduled block runs **before** the POOL
draw in the same step. So on the first step where the duration is met, `advance()` graduates the
character and disarms the condition the POOL entry needs.

**Measured: 0 fires across 40 full lives.**

Removed. `POOL` is now 213. The architecture doc's rule — *"progression must never be delivered
through POOL"* — is now true by construction rather than by accident. `test-edu-s01.js` §9 pins
both halves: the entry is gone, **and** a started degree still completes on schedule, which is
the assertion that would have caught a careless deletion.

---

## 4 · Finding: tertiary access has no country or era gating at all

The motivating measurement for the entire subsystem.

| birth | reaches college |
|---|---|
| **Nigeria 1935** | **88%** |
| Sweden 1935 | 75% |
| Nigeria 1995 | 63% |
| India 1935 | 63% |
| Sweden 1995 | 63% |
| United Kingdom 1935 | 50% |

n = 8 per cell, so the individual figures are noisy. The **ordering** is not survivable: a
character born in colonial Nigeria in 1935 reaches university more often than one born in Sweden
in 1995. College entry runs off class and smarts alone; nothing consults country or era.

This is the number S01's `tertiaryAccess` and `femaleAccess` exist to correct. After S01 the
model resolves **0.4%** for Nigeria 1935 against **52%** for Sweden 1995 — but note that S01 is
data-only and additive, so *the live game still behaves as measured above*. Wiring the gate into
college entry is P4/P5 work and is deliberately not done here.

Re-run: `node --max-old-space-size=4096 <probe>` (probe scripts in scratch; see §7).

---

## 5 · Finding: the vision list is 23 items, and they are not 23 rungs

The architecture doc says 21 stages. The vision document lists **23**. More importantly they are
not all the same *kind* of thing, and flattening them into one enum would break the
single-canonical-stage contract that `eduSetStage` depends on — a character at a religious
boarding secondary school would need three simultaneous values.

S01 therefore separates them, and `EDU_NON_RUNG` records the mapping explicitly so nothing is
silently dropped:

| kind | items | owner |
|---|---|---|
| **rung** — sequential, one at a time | nursery, preschool, primary, lowerSec, upperSec, vocational, community, university, gradCert, mba, masters, profMasters, doctorate, profDoctorate | `EDU_STAGES` |
| **variant** — same rung, different institution | technical / military / religious secondary | S02 archetypes |
| **modifier** — orthogonal attribute | boarding | S02 attribute + `hreSetTenure` (arch §8.4) |
| **mode** — re-entry / parallel | adult education, preparatory courses | S10 / bridge |
| **overlay** — not education state | medical residency, postdoc, academic research | module 09 job + EDU overlay (arch §8.2) |

The vision document supports this itself for boarding:

> *Rather than representing a separate academic level, boarding schools function as residential
> institutions that may provide Primary, Secondary or … Postsecondary education.*

This is an extension of the architecture doc's own logic (§8.2 already routes research to module
09; §8.4 already routes residence to HRE), not a contradiction of it. **It is the one design
decision in Phase 0 that was made rather than measured, and it is the one most worth arguing
with.**

---

## 6 · Open questions — status

| # | status |
|---|---|
| **OQ-1** | **Answered.** EDU calls `hreHash`/`hreMulberry`/`hreRng` directly; no second FNV-1a. Renaming to neutral `sim*` names is mechanical and deferred until 01/05 want it. |
| **OQ-2** | **Answered (fallback taken).** No single `s.seed`. When S02 needs one, `s.edu.seed` is derived by the identical identity-based policy as `hreSeedFrom`. Does not block any phase. |
| **OQ-3** | **Answered.** `HRE_REGION` / `HRE_DEV` / `HRE_INCOME_REALISATION` are consumed under their current names. Renaming deferred with OQ-1. |
| **OQ-4** | **Answered.** See §1. Block confirmed at `life-sim.jsx:6799`; position is safe. |
| **OQ-5** | **Open** — needs module 11. Not required before P2. |
| **OQ-6** | **Open** — needs module 09. Deliberately last (P8). |
| **OQ-7** | **Open** — needs module 13. Not required before P7. |
| **OQ-8** | **Answered.** See §2. |

---

## 7 · Invariant baselines

Recorded so later phases assert against a known state rather than re-deriving it.

- **Invariant 1 (no RNG in S01–S09 generative code):** S01 is clean — no `Math.random`, `rnd(`,
  `pick(`, `Date.now`, `new Date`. Lint-asserted in `test-edu-s01.js` §8.
- **Invariant 2 (no country conditionals):** S01 is clean. The file carries **3 pre-existing
  matches**, none of them a CE rule and none of them EDU's — one inside a comment at ~2066 that
  warns against the pattern, and two in a single cosmetic GDPR aside in a POOL event at ~12119.
  The suite pins the count at exactly 3 so a fourth fails.
- **POOL budget:** 213 entries now. EDU's ceiling is +25 across the whole subsystem (invariant 6),
  so the end state must be ≤ 238.
- **`s.edu` budget:** ≤ 2.5 KB. Measured 226 bytes at creation, 2,159 after a budgeted 12-rung ladder with a crystallised institution. All 16 rungs overflows; unreachable in play.

---

## 8 · What Phase 1 shipped

`EDU_STAGES`, `EDU_NON_RUNG`, `EDU_STAGE_KINDS`, the four-layer era-banded CE tables
(`EDU_SYSTEM_UNIVERSAL` / `_DEV` / `_REGION` / `_COUNTRY`), the resolver
(`eduSystemBandAt` / `eduSystemStack` / `eduSystemMerge` / `eduSystemFor` / `eduSystem`),
`eduLadderFor`, `eduTertiaryOdds`, and `eduSystemCoverage()`.

**`test-edu-s01.js` — 81 assertions, all green** (roadmap target was ~70).

**Country-level coverage: 24% (10 of 41).** Comparable to HRE's law tables at 20%, and reported
by `eduSystemCoverage()` rather than padded out with invented rows.

**Every band ships `provisional: true`.** None of the numbers are sourced. They are shaped to be
the right *kind* of curve — mass secondary before mass tertiary, female access trailing then
converging, compulsory schooling ratcheting up — so the resolver can be built and tested against
something plausible. Module 22 tranche 2 owns the real dates. The suite reflects this by
asserting **orderings**, never values: an assertion that pinned `tertiaryAccess === 0.45` would
have to be rewritten by the very patch that makes it correct.

**S01 is additive.** It adds no state, touches no existing function, and changes nothing a player
can see. Deleting every `edu*` symbol would leave the game behaving identically.

---

## 8b · What Phase 2 shipped

`EDU_ARCHETYPES` (17 archetypes with era / development / region availability windows),
`EDU_ENROL_ENVELOPE`, `EDU_DEV_FOUNDING_FLOOR`, parseable ids (`eduIdMake` / `eduIdParse`),
the 12-stage blueprint pipeline, `eduValidateBlueprint`, `eduBlueprint` / `eduInstitution`,
`eduCrystallise`, and `eduInstitutionOpts` — the handover of institutional character to
modules 06 and 11.

**`test-edu-s02.js` — 93 assertions, all green** (roadmap target ~90). Largest crystallised
institution: **421 bytes**, against a 900-byte assertion and the 2.5 KB `s.edu` budget.
Generator retry rate **0%** across a ~950-institution sweep; nothing ships still-invalid.

**`edu-sample-review.js` earned its place immediately.** It is not a test, asserts nothing,
and cannot fail — it renders generated institutions as prose for a human to read. It caught
three absurdities that were green on every assertion in `test-edu-s02.js` at the time:

1. **A university founded in its own reference year, with 19,983 students.** `eduStage2Founded`
   took `max(a, b)` of two draws, skewing *young*. Institutions standing in any given year are
   mostly not new. Now skews older, and a genuinely new institution fills up over ~15 years via
   an enrolment ramp rather than opening at capacity.
2. **A 17,050-student single-sex university.** Scaling single-sex probability down by enrolment
   left a tail that still fired; above 5,000 students it is now a hard constraint, not a low
   chance.
3. **A Kenyan regional university founded in 1853.** An archetype's `era` window is global —
   "universities have existed since 1850" says nothing about whether one existed *here*.
   `EDU_DEV_FOUNDING_FLOOR` adds a per-development-tier founding floor, so tertiary education
   in Kenya or Nigeria simply does not exist before it plausibly could.

All three are pinned as regressions in `test-edu-s02.js` §10. This is the second time the
project has found a generator bug this way, after HRE's amenity-prerequisite bug, and the
argument for the gate is now empirical rather than theoretical.

One lint bug worth recording: the invariant-1 check initially failed on S02's **own header
comment**, which contains the sentence "No `Math.random` … anywhere below." The lint now strips
comments before scanning, and slices from the `/*` that opens the header rather than from the
banner text inside it — starting mid-comment leaves an unterminated block the stripper cannot
match.

---

## 8c · What Phase 3 shipped

`s.edu` schema v1, `eduInit`, `eduSeedFrom`, `eduSetStage` (sole writer), `eduLegacyStage`
(the shim), `eduStageAgreesWithLegacy`, `eduSyncStage`, `eduStage` (the read-through), and
`eduMigrate` — a guarded `v` ladder plus a version-independent repair pass. The
`newCharacter()` initializer and the `migrate()` backfill landed in the same patch, per
invariant 9 and Gotcha #4.

**`test-edu-s09.js` — 109 assertions, all green** (roadmap target ~80).

**The gate passed.** Shim equivalence was proven by driving 12 real lives across
country × era × class and checking both views at **every step** — not by unit-testing the
mapping table, which would pass happily while the derivation was wrong for anyone actually
playing. Zero disagreements, zero undefined derivations, across a sweep covering 43 distinct
ages and reaching primary, lower and upper secondary.

**The shim derives only what legacy actually says.** Legacy has six values —
`pre / primary / middle / high / college / done` — and no concept of nursery, preschool,
vocational or postgraduate study. So `pre` maps to `none` rather than guessing nursery from
the character's age. Inventing a fact the legacy state never held would have made the
equivalence gate pass by fabrication. Those rungs become reachable when S04/S05 drive
progression, and the suite pins that the shim never claims them.

Three findings from building it:

1. **`eduMigrate` clobbered its own sole writer.** The legacy backfill ran on every call, and
   `eduSetStage` migrates before it writes — so every stage transition was silently reverted
   and nothing was ever recorded. Backfilling now belongs to creation and repair; keeping the
   mirror in step during play is `eduSyncStage`'s job, called deliberately rather than as a
   side effect.
2. **The 2.5 KB budget is real and was breached.** A 12-rung ladder with a crystallised elite
   research university measured **2,599 bytes**. The cause was institution ids — ~39
   characters — duplicated into all 18 `record` and `cred` rows. The credential ledger now
   stores `{id, year}` only: `stage` is derivable (each exit credential belongs to exactly one
   rung) and `instId` is already on the matching `record` row. Now **2,159 bytes**.
   Recorded rather than hidden: walking all 16 rungs still exceeds budget. That path is
   unreachable in play — several rungs are mutually exclusive — but P5/P8 should know the
   headroom is finite, and the suite asserts it as the known overflow case.
3. **Two P1/P2 assertions were superseded, not broken.** Both asserted `c.edu === undefined`,
   which was correct when no state slice existed and is exactly what P3 changed. They now
   assert what remains true: S01 writes nothing into the slice, and S02 crystallises nothing
   into it.

---

## 8d · What Phase 4 shipped — **the first phase a player can see**

Everything through P3 was additive. P4 is not, deliberately: the tertiary gate changes who
reaches university, because that is the bug the subsystem exists to fix.

**S04 — performance.** `eduPerf` blends smarts, attendance, institution quality, family
support, health and conduct into a grade, weighted so no single input dominates — the
roadmap's "never a single roll", and the only way the number responds to the rest of the
simulation. Pure and RNG-free. Supporting components: `eduAttendance` (skips and health),
`eduConduct` (trouble), `eduFamilySupport` (parents), `eduInstQuality` (the crystallised
institution, or what the country and era would typically provide).

**S05 — progression.** `eduTertiaryVerdict` turns the era's cohort share into a threshold on
the character's own standing. The player's *choice* is untouched; what changes is whether the
world had a place to offer. Legacy stays authoritative — EDU decides, then expresses the
decision through existing legacy state, so P3's equivalence gate keeps holding.

**Result — the 88% bug, closed:**

| birth | before | after | model share |
|---|---|---|---|
| **Nigeria 1935** | **88%** | **0%** | 0.4% |
| United Kingdom 1935 | 50% | 0% | 5% |
| Sweden 1995 | 63% | 25% | 52% |
| United States 2005 | — | 38% | 35% |

The US 2005 figure landing at 38% against a 35% model share is the strongest evidence the
calibration works. Sweden 1995's 25% is under its 52% share, but n = 8 and the auto-player
also sometimes declines a place it was offered.

Three findings:

1. **The first gate over-corrected, and replaced one wrong answer with its opposite.** Mapping
   the cohort share linearly onto a 0–108 scale silently assumed admission scores were
   uniformly distributed. They are not — they cluster at 58–91 — so a 5% share demanded a score
   of ~102.6 that almost nobody has, and *everyone goes* became *nobody goes*.
   `EDU_SCORE_QUANTILES` is now the **measured** empirical distribution (70 characters, 6
   countries, 4 classes), and the gate is the (1 − p) quantile of it.
2. **`eduOnTick`'s position in `advance()` is load-bearing.** Placed before the `MILESTONES`
   scan — which is what writes `education.stage` — the canonical mirror lagged a full step
   every time a character advanced. It cannot go at the end of the loop body either, because
   `if (milestoneFired) continue` skips past it *precisely* when a stage has just changed. It
   now runs immediately after the milestone scan, on every step, fired or not.
3. **A single step of lag is expected and harmless.** A POOL event can still change
   `education.stage` after the tick has run. Nothing reads the mirror to make a decision before
   inversion, so the suite asserts the useful property instead: lag must never *persist*, which
   would mean the mirror had stopped tracking rather than merely trailing.

**`test-edu-s04-s05.js` — 85 assertions, all green** (roadmap target ~85). The soak asserts
observable outcomes only — someone aged, nobody stranded, zero dead ends — never step counts,
per Gotcha #6's green 33,600-step run in which nobody aged a day.

**Not deployed.** This is the first EDU phase whose behaviour is visible in play, so it should
be looked at before it reaches anyone.

---

## 8e · What Phase 5 shipped — admissions, finance, and the absoluteness fix

P4 fixed the 88% bug **absolutely**: the cohort share became a hard threshold, so a scarce era
was *sealed* — a determined player had no path at all. That is its own kind of false. Real
scarce systems were not sealed; they were narrow, and they had doors.

**The fix is not to soften the era model.** S01's shares are unchanged. What P5 adds is the
exceptions that actually existed, each rare and each conditioned on the thing that made it
real:

| route | condition | aid |
|---|---|---|
| `merit` | top 5% of the cohort distribution | ~92% |
| `sponsorFaith` | religious schooling context, within 15 points of the gate | ~85% |
| `sponsorState` | access rising >3 points across the character's own lifetime — what a post-independence or post-war expansion looks like in the data | ~85% |
| `abroad` | wealthy family, scarce local system | none — it is paid for, not subsidised |

**Finance is expressed as ratios to realised income, never absolute amounts** (arch §8.2, R8).
Module 09's `TIER_SALARY` is flat across era and country and only ~29.8% of scheduled wages
reach `s.money`, so an absolute tuition figure would inherit both distortions silently. The
calibration reads true: US 2005 costs a poor family **53% of realised annual income** after
aid — "a serious burden" — while Sweden is free.

**Two calibration bugs, both found by measuring rather than by the suite:**

1. **The exceptions became the backdoor they were written to avoid.** Flat rates inflated a
   0.2% cohort share to an **11% admission rate — 55×** — mostly from `abroad` firing at 45%.
   `eduExceptionScale` now scales every exception with the system's own capacity: a country
   with almost no university places also has almost no scholarships or sponsorship budget. A
   floor keeps a scarce era narrow rather than sealed.
2. **An absolute score bar can land above the gate it is an exception to.** Raising the state
   bar to q78 against a gate at q70 left a window of **zero width** — a route that could never
   fire. The near-miss routes now set their bar *relative to the gate* (`gate − 15`), so a
   window always exists whatever the era.

**Where it landed:**

| | admitted | model share | ratio |
|---|---|---|---|
| Nigeria 1935 | 4% | 0.2% | — |
| Sweden 1935 | 14% | 10.5% | 1.3× |
| India 1955 | 8% | 0.8% | — |
| Sweden 1995 | 55% | 52% | 1.1× |
| United States 2005 | 76% | 68% | 1.1× |

Honest caveat on the two large ratios: `abroad` is **not domestic tertiary enrolment**, so
counting it against `tertiaryAccess` overstates the inflation — those students are studying in
another country entirely. The synthetic sampler is also 25% wealthy and uniform in ability,
both unrepresentative of a real cohort. The absolute rates are the meaningful figures, and 4%
for 1935 Nigeria is roughly the colonial-era elite plus a handful of scholarship students.

**`test-edu-s03-s06.js` — 65 assertions, all green** (roadmap target ~70), including a
calibration section in the shape of `test-hre-calib.js` and an assertion that **no country or
era is completely sealed to every student**.

---

## 9 · Sequencing note for Phase 6

**P6 (S12, the read-only interface) is next — the first browsable phase.** Two things carried forward:

1. **S02 must not generate people.** `s.school` already spends 7.5 KB on classmates and faculty
   (§2). Institution attributes go to module 06 as `opts`.
2. **OQ-5 is now live with module 11.** `eduInstitutionOpts()` already hands over exactly what `schoolLegal()` would need, so S02's `religiosity` /
   `strictness` / `administration` attributes are exactly what `schoolLegal()` would consume in
   place of inferring from `SCHOOL_TYPES` strings.
