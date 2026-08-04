# A Life — Restart Brief for a Fresh Integration Chat

**Supersedes `23-integration.md`** for HRE status, test counts, and anchors — that doc was written at Phase 6 and is now stale on all three. Its Engine Contract, gotchas, and submission-format sections are still accurate and are compressed here rather than dropped. If you want the long-form version of anything below, `23-integration.md` has it, but trust *this* document's numbers over that one's.

**Read this whole file before touching anything.** Then re-read the "session-specific hazards" section a second time — it exists because of things that actually happened, not things that might.

---

## 0. Workflow — do this before anything else, every time

1. User uploads `life-sim.jsx` to `/mnt/user-data/uploads/`. Copy to `/home/claude/life-sim.jsx`.
2. **Check for container drift before assuming the upload is the current state.** This has happened repeatedly: work gets done in a session, delivery to the user fails or the conversation moves on, and the *next* session's container already contains further, untested work the current conversation has no record of. `md5sum` the file, `wc -l` it, and diff the line count against what this doc states below. If it's higher, something was built that you don't have context for — read it before writing anything, and check whether it has a test suite (it may not; see §4 for two real cases of this).
3. `python3 hre-extract.py` before touching any HRE code. It regenerates the standalone section files and **aborts on a duplicated banner** — the fastest available check that the file hasn't been double-spliced. It also enforces that its `SECTIONS` list is in file order; if you add a new section, insert its entry in the position matching where you spliced, not the phase number (S08c, S08b and S07b are NOT in phase order in the file — see the anchor table).
4. Before writing any patch, re-read "Known feature inventory" (§6) so you don't rebuild something that exists.
5. All patches: Python `str.replace`, guarded on **your own inserted content**, not just the anchor you spliced against (a splice guarded only on its anchor ran twice in Phase 5 and duplicated 2,000 lines). Take backups in a **separate command** from the splice.

## 1. Current state — verified, not asserted

**File: `life-sim.jsx`, 14,321 lines, ~1,060 KB** (12,531 / ~945 KB before Phase 9; 13,638 after it).
**Of the suites present in the git repo: 549 of 557 assertions green.** The 8 failures are one stale uploaded fixture, not a regression, and are diagnosed in §2. The larger sandbox-only figures elsewhere in this doc describe files this repo does not have — read §2's availability note before quoting them.

**HRE phase status against the spec's own roadmap** (`HRE-ARCHITECTURE-part3.md` §10.3–10.4):

| Phase | Content | Status |
|---|---|---|
| 0–5 | determinism, geography/law, generator, calibration, market index, tenure+migration | done |
| 6 | S06 marketplace, S12 adapter (browsing) | done |
| **7** | **renting end to end — the MVP gate** | **done, formal exit gate passed** (`test-hre-phase7-gate.js`) |
| 8 | S08 finance & buying (mortgages, purchase, repossession) | done, independently verified this session |
| **9** | **S10 upkeep & failures — this is what "HRE v1 complete" actually means** | **done, formal exit gate passed** (`test-hre-s10.js`, 170 assertions) |
| 10–15 | event fabric, NPC housing, renovation, advanced tenure, content, polish | not started, and not required for v1 |

**HRE v1 is complete, including the voluntary sale.** Phase 9 shipped this session: `HRE · S10 · UPKEEP, FAILURES, DISASTERS & INSURANCE` (§5225–6060), the B3-hooked `hreUpkeepTick` (§5982), and the `hreUpkeep` Act item. The spec's v1 sentence — *"a character can live with their parents, leave, rent, be discriminated against or protected according to where and when they live, buy, borrow, maintain, neglect, lose, and move"* — is now true in full. The last clause, **"move"**, shipped as `HRE · S11 · SALE & MOVING ON` — see §9.

**The spec is explicit that Phase 9, not Phase 7 or 8, is the finish line:** *"HRE v1 is complete at Phase 9: a character can live with their parents, leave, rent, be discriminated against or protected according to where and when they live, buy, borrow, maintain, neglect, lose, and move — coherently, in any of 41 countries, in any era."* (The spec's own prose says "39 countries" here — that's stale; the real, verified count is 41, corrected everywhere else. Don't let this one line reintroduce the old number.)

**The game is deployed, and it was REDEPLOYED this session** — `life-sim.bundle.js` was rebuilt from source so the live PWA carries Phase 9, S11 and the UI redesign. Before that rebuild the served bundle still predated all of it (verified by diffing string literals against the previously-live file). See §7 for the corrected build, which is now reproducible for the first time.

**Historic note from the previous session, kept for context:** `https://github.com/logostona/A-Life-v0.44` (repo) / `https://logostona.github.io/A-Life-v0.44` (live PWA). This is new since the last integration brief and isn't in `PROJECT_CONTEXT.md` or `MODULE_MAP.md` yet — flag it if you're updating those. Verified this session by pulling the actual served bytes over the sandbox's own network access (`raw.githubusercontent.com` is an allowed domain) and mounting them in jsdom: boots with zero uncaught errors, real UI renders, the `storage-polyfill.js` round-trips correctly through real `localStorage`. The deployed bundle contains Phase 8 (confirmed via minification-surviving string literals — see §4 for why that check exists). **If you ship a new build, the deployment is a separate manual step** (rebuild with the PWA esbuild command in §7, push to the repo) — nothing here does that automatically, and nothing here re-checked whether it's been redeployed since.

## 2. Test suite — exact, current

| file | covers | assertions |
|---|---|---|
| `test-integration-1.js` | modules 14+15, full-life soak | 53 |
| `test-stx-verify.js` | STX end-to-end | 69 |
| `test-stx-wiring.js` | STX Act-sheet/RelCard wiring | 22 |
| `test-ai-guarantee.js` | AI cannot affect simulation | 19 |
| `test-render.js` | jsdom mount, no network on boot | 5 |
| `test-hre-s01.js` | deterministic core | 83 |
| `test-hre-s03-s04.js` | geography + law | 82 |
| `test-hre-s02.js` | property generator | 110 |
| `test-hre-calib.js` | money calibration | 20 |
| `test-hre-s05.js` | market index + valuation | 88 |
| `test-hre-s09.js` | state/tenure/migration + ownership model + contradiction guards | 107 |
| `test-hre-s06.js` | marketplace/channels/listings | 60 |
| `test-hre-s07.js` | engagement pinning | 50 |
| `test-hre-s07b.js` | viewings, applications, landlord decisions | 55 |
| `test-hre-s08a.js` | tenancy formation, recurring rent (tick hook) | 48 |
| `test-hre-s08b.js` | eviction, notice, deposit settlement | 39 |
| `test-hre-s08c.js` | mortgages, purchase, amortisation, repossession | 58 |
| `test-hre-phase7-gate.js` | **formal Phase 7 exit gate** — leave/rent/live/lose, multi-country soak | 30 |
| `test-hre-s10.js` | **formal Phase 9 exit gate** — R5 continuity, decay, compounding, failures, disasters, insurance | 170 |
| `test-hre-s11.js` | voluntary sale — offers, fees, negative equity, survey, destinations | 83 |
| `test-integration.js` | **cross-system** — soak, tenure authority, S10 seams, persistence, regressions | 49 |
| `test-render.js` | mount + WCAG contrast + the redesign's own contract | 99 |
| `test-deploy.js` | **the built artifact** — bundle boots in jsdom via index.html's real load order | 37 |
| | **total** | **1,436** |

### ⚠️ Test-file availability in the GitHub repo — read before trusting the table above

The table is the *project's* full suite as it exists in the Claude.ai sandbox. **The `logostona/A-Life-v0.44` git repo contains 8 suites**: the four originally uploaded (`test-hre-s06.js`, `test-hre-s08b.js`, `test-hre-s09.js`, `test-hre-phase7-gate.js`) plus five written here (`test-hre-s10.js`, `test-hre-s11.js`, `test-integration.js`, `test-render.js`, `test-deploy.js`). `build-slice.py` and the remaining sandbox suites were never uploaded; `harness.js` is a reimplementation.

Consequences, all verified this session rather than assumed:

- **`harness.js` in the repo is a reimplementation, not the original.** It was rewritten from `PROJECT_CONTEXT.md`'s documented contract because the real one was absent. It exposes `mkChar`/`runLife`/`CLASSES` and builds a CJS bundle of `life-sim.jsx` into `.harness-cache/`. If the original is ever uploaded, prefer it and delete this one — but re-run all five suites first, because they now depend on this one's exact surface.
- **Hardcoded `/home/claude/...` paths were repointed to the repo root** in `hre-extract.py` (`SRC`/`OUT_DIR`) and in the `require(...)` line of all four pre-existing suites. These were artifacts of the sandbox's home directory, not design.
- **`test-hre-s09.js` in the repo is the STALE pre-Phase-7 version** (87 assertions, not the 107 this doc's table claims). Its section 5, "nothing inverted", asserts the legacy call sites have *not* been inverted — but Phase 7 inverted them deliberately. **It reports 79 passed / 8 failed, and it does so identically against the pristine pre-Phase-9 file.** Confirmed by checking out the untouched original and re-running: the 8 failures are the stale fixture, not a regression. Do not "fix" them by re-inverting anything.

**Actual current state of what the repo can run:** S06 60/60 · S08b 39/39 · phase7-gate 30/30 · S10 170/170 · S11 83/83 · integration 49/49 · render 99/99 · deploy 37/37 · S09 79/87 (8 pre-existing stale-fixture failures). Run them ONE AT A TIME — several in one `for` loop OOM-killed the S09 process (exit 137); `node --max-old-space-size=4096` fixes it.

**The suites are deterministic now.** `harness.js` installs a seeded PRNG over `Math.random` for test processes only, because `newCharacter` seeds the HRE world with `Math.random()` — correct for the game, poison for a suite. Before that, S09 alternated between 78 and 79 passing on an unchanged file. Use `A_LIFE_TEST_SEED=<n>` (or `H.seed`/`H.eachSeed`) to confirm a green suite is green on purpose: S10 and S11 were both verified across four separate seeds. Determinism that is never varied is just a different way to hide a seed-specific bug.

```bash
for f in test-integration-1.js test-stx-verify.js test-stx-wiring.js test-ai-guarantee.js \
         test-render.js test-hre-s01.js test-hre-s03-s04.js test-hre-s02.js test-hre-calib.js \
         test-hre-s05.js test-hre-s09.js test-hre-s06.js test-hre-s07.js test-hre-s07b.js \
         test-hre-s08a.js test-hre-s08b.js test-hre-s08c.js test-hre-phase7-gate.js; do
  printf "%-26s " "$f"; node $f 2>&1 | grep -E "[0-9]+ passed, [0-9]+ failed" | tail -1
done
```
Expected: 53, 69, 22, 19, 5, 83, 82, 110, 20, 88, 107, 60, 50, 55, 48, 39, 58, 30.

`test-stx.js` (209, pre-integration standalone) is retired — don't revive it, see `23-integration.md` for why.

## 3. Anchors — re-derived this session, will shift again

```bash
grep -n "^const COUNTRIES\|^function newCharacter\|^function migrate\|^function advance\|^const ACT_GROUPS\|^function doActivity\|^function Game\|^export default function App" life-sim.jsx
```
As of this file: `COUNTRIES` §5, `newCharacter` §403, `migrate` §447, `advance` §5204, `ACT_GROUPS` §5338, `doActivity` §5399, `Game` §12193, `App` §12495.

**HRE section positions** (12 sections in `hre-extract.py`) — note these are **not in phase order in the file**, because later phases got spliced at earlier line numbers than some Phase 7 work:
`S01` §1465 · `S03/S04` · `S02` · `calib` · `S05` · `S09` (state/tenure) · `S06` (marketplace) §3633 · `S08c` (mortgages) §4505 · `S08b` (eviction) §4796 · `S07b` (applications) §4923 · `S08a` (tenancy/tick) · **`S10` (upkeep) §5225** · **`S11` (sale) — immediately before `ENGINE`** · `ENGINE`/`ACT_GROUPS`/`doActivity` · `S12` (adapter, now also holds `hreSaleMenu`/`hreSaleDestinationMenu`).

⚠️ **A section-slicing trap, hit for real:** `test-hre-s10.js` sliced "S10 banner → ENGINE banner" to lint S10 for `Math.random`. S11 was later spliced *between* those two, so the slice swallowed S11 — whose header documents that same invariant in prose — and S10 read as breaching it. Anchor a section slice to the NEXT SECTION BANNER, never to `ENGINE`, and strip comments before any substring lint: a rule and a breach of the rule look identical to `indexOf`.

**`hre-extract.py` now extracts 9 sections** (S11 added; the note below said 8 when S10 landed) — `hre-s10.js` was added to its `SECTIONS` list. Its list is order-checked against the file, and S10 sits between S08a and the `ENGINE` banner. Post-Phase-9 the file is **13,638 lines**; every § above Phase 8's has shifted, so grep the banner name as always.

**Always grep the banner name, never trust a cached line number** — this file has grown by ~7,000 lines since Phase 0 and every prior anchor table in every doc has gone stale within one or two sessions.

## 4. Session-specific hazards — things that actually happened, in order of how much time they cost

**Container drift, repeatedly, across at least four separate sessions.** Every single time "continue" was said after a gap, the container already contained more work than the conversation had discussed — once a full engine change (the B3 tick hook), once a whole new phase (S08c). The fix is always the same: `md5sum` and `wc -l` before doing anything, and if they don't match what you expect, **read what's there before writing new code.** Assume nothing about what "hasn't been built yet."

**Code gets spliced without a test suite, twice now (S06 at Phase 6, S08c at Phase 8).** Both times the code itself turned out to be well-built on inspection, but "well-built on inspection" is not the same as tested, and in both cases the actual verification (does it terminate, does it execute, does it agree with the rest of the system) only happened when a suite was written after the fact. **If you find HRE code with no matching `test-hre-*.js`, assume it is unverified regardless of how it reads.**

**Minified deployed code needs string-literal checks, not symbol checks.** Confirming what's in the GitHub Pages bundle required grepping for player-facing text ("the locks were changed while you were out", "direct debit bounced") because esbuild's minifier renames every function and variable. If you ever need to check what's actually deployed, this is the only reliable method — `grep -o "S08c"` on a minified bundle will always come back empty even when S08c is fully present.

**A decorative state machine is a real, recurring bug class in this codebase, not a one-off.** S08a shipped an arrears *ladder* whose final stage ("eviction") was reached and then just... stayed there — 92 unpaid periods, tenant still housed, because nothing was wired to actually execute on it. The fix pattern (S08b) was proven and then correctly reused for the mortgage side (S08c's repossession) — but if Phase 9 introduces any staged/escalating mechanic (deferred maintenance compounding is explicitly one), **check that the terminal stage actually fires a consequence**, don't just check that the stage label is reached.

**Ownership/authority contradictions are the other recurring bug class.** Two separate real bugs this project (not hypothetical): `hreTenure()` returning a stale birth-time snapshot for 66% of a character's life once a reader inverted, and a tenant evicted by a legacy writer reading as `renting` and `homeless` simultaneously. Both were caught by **full-life soaks that compare two independent derivations at every step**, never by unit tests of either derivation in isolation. If Phase 9 adds any new derived/cached value (condition, most likely), soak-test it against a from-scratch recomputation across a real multi-year life before trusting it.

**Legacy flags are still dual-write, not retired.** `flags.homeless`/`movedOut`/`couchAt`/`cohabiting` are written by every inverted writer *alongside* `hreSetTenure`, because `STREET_GROUP`, the street POOL conditions, and `statusChips` still read some of them raw (now mostly inverted too — see the anchor table's writer-inversion note in `HRE-PHASE7-ENUMERATION.md`). Don't delete the flag writes without re-confirming nothing still reads them raw.

**No voluntary exit from ownership exists yet.** Found this session while checking Phase 9 readiness: `hreCloseTenancy` handles renting↔owning in one direction, but an owner can only leave ownership via forced repossession. The spec's Phase 9 gate says "lose, and move" — "move" (a voluntary sale) has no mechanism. This may be Phase 9's job or may be separate; worth resolving before deep in S10, since a decaying, sellable property and a decaying, un-sellable one are different scopes.

## 5. Engine contract — compressed (full version in `23-integration.md` or `PROJECT_CONTEXT.md`)

- `advance(state, totalDays)` — **two args**, `advance(s)` alone is a silent no-op.
- `applyFx`'s fixed key set (`stats`, `money`, `rel`/`relF`/`relR`, `subj`, `emergent`, `addFriend`, `addRomance`, `setR`, `breakup`, `run`, `flags`, `feed`, `next`) is the **only** thing it understands — anything else needs `run:`.
- **Discarded-clone gotcha**: `Object.assign(s, { pending: menuBuilder(s).pending })` only lifts `.pending` out. Any state mutation a menu needs must happen on `s` directly or be deferred into an option's `fx.run`. S12's own spec (§3.5) calls this out as a subsystem-level invariant because HRE has more menus than any other module — one violation is silent data loss.
- **The B3 tick hook exists now** (resolved this project as option (b), not the POOL-event option the original spec recommended — that recommendation predated the wage-delivery measurement and was wrong). It's a line inside `advance()`'s loop after `WORLD_EVENTS`, before `MILESTONES`. HRE's recurring-cost mechanisms (rent, mortgage payments) both run through it and both measured at 100% delivery reliability, versus the ~30% a POOL event would have given.
- 35 of 38 `doActivity` `special` branches never call `advance()` — menu-opener `cost` values are dead data project-wide, not an HRE-specific issue. Module 24's queue, not yours unless asked.

## 6. Known feature inventory (do NOT rebuild)

Full identity/transition/coming-out/relationship/crime/health/school systems — see `PROJECT_CONTEXT.md`. **HRE specifically**, Phases 0–8: deterministic core; geography+law across 41 countries; 16-archetype property generator; market index with shocks; tenure/migration with ownership-authority model (`s.hre.owned`); marketplace with 6 era-gated channels; engagement pinning; viewings/applications with deterministic, R13-bounded landlord decisions; tenancy formation with 100%-reliable recurring rent; eviction that actually executes; mortgages with correctly-terminating amortisation; purchase; repossession that actually executes. **Phase 9 adds:** per-component decay driven by archetype/build quality/age/climate exposure with compounding deferred maintenance; four maintenance tiers; failures emitted by the condition model crossing `HRE_FAIL_THRESHOLD` (not an authored list); a three-stage failure ladder (`open`→`worsening`→`unfit`) whose terminal stage genuinely condemns the building or forces a paid emergency repair; hazard-based disasters; three insurance tiers with claim loading and a neglect-based refusal rule. **Not present: any renovation system (Phase 12), any voluntary sale.**

## 7. Deployment — CORRECTED, and now reproducible

**The command previously recorded here was wrong and would have broken the live
site.** It is replaced by `./build.sh`, which was reconstructed from the shipped
bundle rather than guessed. What the old command got wrong:

- `--external:react --external:react-dom` — `index.html` loads React from
  nowhere, and the app must work fully offline (that is the whole point of the
  PWA, and `sw.js` caches the shell on that promise). Externals would resolve to
  nothing at runtime and the page would die on the first import. **React must be
  inlined**, which is why the bundle is ~780 KB.
- `--global-name=LifeSimBundle` — only exposes a global. It never mounts
  anything, so the page would render an empty `<div id="root">`.
- It also omitted `--jsx=automatic`. `life-sim.jsx` imports ONLY hooks and never
  React itself, so the classic transform emits `React.createElement` against an
  undefined `React`.

There was also **no entry file in the repo at all** — `life-sim.jsx` exports
`App` and nothing mounts it — so the bundle simply could not be rebuilt from
source. `src-entry.jsx` now exists, reconstructed from the minified tail of the
shipped build (`getElementById("root")` → `createRoot` → `.render(App)`),
with React pinned to the 18.3.1 that the live bundle already contained.

```bash
./build.sh          # -> life-sim.bundle.js
node test-deploy.js # MANDATORY: esbuild exiting 0 is not "it mounts"
```

`test-deploy.js` (37 assertions) is the only suite that tests the ARTIFACT
rather than the source: it loads `storage-polyfill.js` and the bundle in
`index.html`'s real order inside jsdom against a real `localStorage`, waits out
React 18's concurrent first paint, and asserts a first-time visitor actually
reaches the creation screen. It also string-probes the minified build for this
round's content, because **symbol greps on a minified bundle always come back
empty** — string literals are the only reliable probe (§4).

**Pages serves the repo root from `main` with no CI step, so the committed
bundle IS the live site.** Deploying = merging to `main`. Nothing rebuilds it
for you, and nothing downstream will catch a bad bundle.

## 8. What "next" means right now

**Phase 9 is DONE — the section below is kept as the record of what it was built against, not as an open task.** How each gate clause was satisfied, and the measured evidence:

| gate clause | how it was met | evidence |
|---|---|---|
| condition handoff continuous at purchase (R5) | `s.hre.upk` holds **bookkeeping only** — never a condition number. Decay mutates the crystallised `home.condition` object in place, so there is no second condition value to disagree with the first. | §1 of `test-hre-s10.js`: the home's condition at purchase equals the blueprint's component-for-component, the first tick changes nothing, and `u.base` equals the crystallised score rather than a fresh derivation |
| failures emerge from the model, not a list | `hreEmitFailures` fires off `hreFailureRisk(v)`, a function of the component's **live** condition value crossing `HRE_FAIL_THRESHOLD` (20). Any of the 10 components can fail; none is special-cased. | §6 |
| a neglected property degrades and loses value measurably over decades | 4-country soak, neglected vs. maintained control: condition **60→30** and value **×0.85** neglected, against **×1.20** kept. | §9 |

**The decorative-state-machine trap was checked explicitly** (§6b), because this codebase has shipped that bug twice. The `unfit` terminal stage is not a label: a destitute owner loses the building (`tenure → homeless`, `hre.home → null`, `flags.homeless` kept in step, prose in the feed), and a solvent one is forced into a real emergency repair that costs money and actually restores the component. Both branches assert on observable state, not on the stage name being reached.

**Design decisions a human should sanity-check:**
- **Insurance** was under-specified in the spec (one word). It shipped as three tiers with premium loading per prior claim (`HRE_CLAIM_LOADING`, capped) and a neglect rule: a failure claim on a component neglected beyond `HRE_CLAIM_NEGLECT_YEARS` (4) is refused as wear and tear. That refusal rule is a judgment call, not something the spec dictated.
- **The `hreUpkeep` Act item is `cost: 0`**, matching the other 35 menu-openers rather than deviating; the brake on repeat use is `hreMaintenanceReady`'s cooldown and the money, not the clock. Consistent with the file, but it does mean maintenance is time-free like everything else — revisit if module 24 ever lands the cross-cutting fix.
- **`hreUpkeepTick` is its own line in `advance()`, not folded into `hreOnTick`**, because `hreOnTick` returns early for a tenant in prison and a building does not stop rotting while its occupant is inside.

**Next after this:** Phases 10–15 (event fabric, NPC housing, renovation, advanced tenure, content, polish) are not required for v1.

## 9. S11 — voluntary sale (shipped after Phase 9, not a numbered phase)

The spec's v1 sentence ends "...lose, and **move**", and until this landed an owner could only stop owning involuntarily — repossession (S08c) or condemnation (S10). Ownership was a one-way door.

**Why it is its own section rather than part of S08c:** a sale is where three subsystems meet and none of them owns it — S05 says what the market thinks it is worth, S10 says what condition has done to that number, S08c says how much the bank takes back first. Housing it inside any one of those would have made that one an authority over the other two.

**What it makes real, retroactively:** Phase 9's decay was measurable but not yet *consequential* — a neglected house lost value on a screen. The sale is where that loss is finally charged, because the offers derive from `hreHomeValueNow()`, which already carries S10's condition ratio. `test-hre-s11.js` §4 pins it: two identical properties, one maintained and one let go, and the neglected one is worth materially less at the till.

**Shape:** `hreSaleOffers` (three deterministic offer bands, gated on the S05 market's own momentum and the property's condition, redrawn each period so *waiting* is a real strategy but *reloading* is not) → `hreSaleSurveyAdjust` (the information asymmetry finally runs the other way: for all of S06/S07 the player could not see `technical`/`latent` defects, and now the buyer's surveyor finds them and knocks money off at the last moment) → `hreSellHome` (the single exit, mirroring `hreCloseTenancy`, so tenure/mortgage/dwelling cannot disagree).

**Negative equity is modelled rather than avoided:** when the loan outruns the sale the shortfall becomes `education.debt` — the game's one existing "money you owe with nothing to show for it" mechanism — instead of being silently forgiven.

**A sale always asks where you are going.** `hreSaleDestinationMenu` is a second screen on purpose: a sale that silently dumped the character somewhere would be the same decorative-state mistake the failure ladder was built to avoid.

**Still open after this:** renovation (Phase 12) remains the one substantial housing system unbuilt, and `sellerFeePct` is the only `transaction` field in the S04 law table with a real reader — the rest of that table is still `provisional: true` at 20% country coverage (module 22's research debt, unchanged).

<details>
<summary>Original Phase 9 brief (superseded — kept for reference)</summary>

**Phase 9 — S10 Upkeep & Failures core** (renovation is Phase 12, separate and later). Per the spec (`HRE-ARCHITECTURE-part1.md` §3.4, `part3.md` §10.3):

**Scope:** decay (per-component deterioration rates by archetype/construction quality/age/climate/maintenance history, with deferred maintenance *compounding*, not just accruing), maintenance spend that slows decay, failures **emitted by the condition model** (a component crossing a threshold generates its own event — not an authored list of "boiler breaks" events), disasters, insurance.

**Exit gate, verbatim:** *"condition handoff is continuous at purchase (R5); failures emerge from the condition model rather than a list; a neglected property degrades and loses value measurably over decades."*

**R5, the specific risk this gate protects against:** *"Condition handoff discontinuity — house visibly changes on purchase."* Mitigation is structural, not a test you bolt on after: **the first tracked condition value must be constructed to exactly equal S02's `hreStage7Condition` output at the moment of purchase/crystallisation** — derived, not re-rolled. If Phase 9's condition-tracking is built as a fresh roll rather than a continuation of the generator's own value, a house will visibly jump in condition the instant someone buys it, and no amount of downstream testing fixes that after the fact — it has to be right at the seam.

**Where it plugs in:** `hreCloseTenancy`/purchase (S08c) is where a property currently gets a `home` object with a static `condition`. Decay needs a tick source — likely the same B3 hook rent and mortgage payments already use, since it's proven reliable and the alternative (POOL) has the same 30%-delivery problem for this as for everything else recurring.

**Not required for the Phase 9 gate, but flagged above as adjacent and worth deciding early:** the missing voluntary-sale mechanism.

</details>
