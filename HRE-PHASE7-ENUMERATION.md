# HRE Phase 7 — Residence Authority Enumeration & the B3 Decision

**Status:** Phase 7 opening deliverable. Produced by module 23 (Integration) against the real `life-sim.jsx` at 11,353 lines, post-Phase-6.

Part 3 §7.13 assigns migration step 1 — *"The Integration chat reports every existing expression of residence: the exact flags, fields and conditions"* — to this chat, and makes it the precondition for steps 5 (invert) and 6 (retire). This is that report, plus one blocking decision that has to be settled before any S07 code is written.

---

## 1. The B3 decision must be made now, and the spec's own recommendation is stale

Part 3 §7.2 poses blocker B3 and recommends **option (a)** — deliver recurring costs as a POOL event with a short cooldown — on delivery-risk grounds, because it needs no core-engine change and therefore no cross-module sign-off. It also says the choice *"must be made before Phase 8 begins"*.

**Both halves of that are now wrong, and for evidence gathered after the spec was written.**

**Wrong on timing.** Phase 7's scope includes *rent payment*. Rent is a recurring obligation. The decision is needed at the start of Phase 7, not Phase 8 — Phase 8's mortgage is simply the second instance of the same mechanism.

**Wrong on the recommendation.** Option (a) was proposed before the P0-D wage probe measured POOL delivery reliability. That probe found the `salary` event (`w:6`, `cd:30`) fires in only **29.8%** of employed months — the finding now frozen into `HRE_INCOME_REALISATION = 0.298`. A ~30%-reliable delivery channel is tolerable for income, where the shortfall reads as precarity and the player only notices a wrong *mean*. It is not tolerable for an obligation:

- Rent that charges in ~30% of months is not "variable rent", it is **rent that mostly doesn't happen**. A tenancy would be nearly free.
- Arrears computed against a payment that usually never fired are **arithmetically meaningless** — the arrears/eviction pipeline in Phase 7 and the distress pipeline in Phase 8 both become noise.
- The failure is silent and passes tests. Every assertion about "rent was charged when it fired" stays green while the system as a whole is wrong.

The asymmetry is the point: for *income*, a missed POOL draw costs the player money and reads as bad luck. For an *obligation*, a missed draw is a gift, and gifts compound. `PROJECT_CONTEXT.md` already states the conclusion — *"Do not deliver recurring obligations through POOL"* — but the architecture spec still recommends the opposite, so the two documents are in direct conflict and a module chat reading only the spec would build the wrong thing.

**Recommendation: option (b), the tick hook.** One additive line in `advance()`'s loop, placed after the `WORLD_EVENTS` block and before the `MILESTONES` scan so it can never be pre-empted by a firing milestone (§5 `continue`s past the rest of the step). Needs modules 01 + 03 sign-off, per their entries in `MODULE_MAP.md`.

**This is a decision for the project owner, not for me to take unilaterally** — it is the one core-engine change HRE has ever asked for, and §7.2 explicitly frames it as requiring cross-module sign-off.

### What each option costs
| | (a) POOL event | (b) tick hook |
|---|---|---|
| Core-engine change | none | 1 line in `advance()` |
| Cross-module sign-off | none | modules 01 + 03 |
| Rent charged reliably | **no — ~30% of periods** | yes, exactly |
| Arrears/eviction coherent | **no** | yes |
| Phase 8 mortgage amortisation | **not viable** | viable |
| Reversible later | yes | yes |

If (a) is chosen anyway for delivery-risk reasons, Phase 7 must drop arrears, eviction-for-non-payment and deposit disputes from its scope, because none of them can be made correct on top of it — which removes most of what makes Phase 7 the MVP.

---

## 2. Complete enumeration of residence expressions

Every site below was grepped out of the current file. **Line numbers are post-Phase-6 and will shift** — confirm by name before patching. The HRE shim's own internal references (§3343–3360) are excluded, since they are the replacement, not a call site.

### 2.1 State that encodes residence today
| field | set at | cleared at | notes |
|---|---|---|---|
| `s.flags.homeless` | §591, §5663 (set to `s.ageDays`) | §5478, §5528, §5529, §5530 | truthy = on the street; stores the day it began |
| `s.flags.movedOut` | §5528, §5529 **only** | never | set *only* on the homelessness exit path, so the overwhelming majority of characters never have it |
| `s.flags.couchAt` | §5478 (set to a friend key) | **never cleared** | why HRE ranks it LOW in tenure derivation |
| `s.flags.cohabiting` | §6185, §6187 | never | set by the move-in-together path |
| `s.spouse` | §545 (cleared), marriage events | §545 on divorce | residence-adjacent, owned by module 07 |
| `s.profile.city` | §8550 `relocate()` | — | location, not tenure; `relocate` sets `flags.movedCity`, never a residence flag |

**Observation for the inversion:** there is no single field today whose value answers "where do you live". The answer is reconstructed at each call site from a different subset of these, which is precisely why two of them disagree (§2.3 below).

### 2.2 Readers — call sites that *infer* residence (these get inverted)
| § | site | current expression | maps to |
|---|---|---|---|
| 7145 | `HOME_GROUP` parentsroom item `cond` | full 6-clause predicate | `hreAtParents(s)` |
| 10845 | `Game` parentsroom button | **verbatim duplicate of 7145** | `hreAtParents(s)` |
| 10836 | home-tab header label | `homeless ? … : movedOut \|\| age>=26 ? …` | `hreTenure(s)` |
| 10839 | home-tab header body | `movedOut \|\| age >= 26` | `hreTenure(s)` |
| 5494 | `STREET_GROUP.cond` | `!!s.flags.homeless` | `hreIsHomeless(s)` |
| 5522 | `streetGrind` POOL `cond` | `!!s.flags.homeless` | `hreIsHomeless(s)` |
| 5527 | `streetOut` POOL `cond` | `!!s.flags.homeless && ageDays - homeless > 200` | `hreIsHomeless(s)` + duration |
| 6023 | `statusChips` | `s.flags.homeless` → "🛏 no home" | `hreIsHomeless(s)` |
| 588 | coming-out fallout guard | `!homeless && !movedOut` | `hreAtParents(s)` |
| 5657 | family-rupture `homeRisk` | `!homeless && !movedOut` | `hreAtParents(s)` |
| 1389 | `moveInTogether` POOL `cond` | `!s.flags.cohabiting` | `hreTenure(s) !== "withPartner"` |
| 8575 | partner distance | `cohabiting \|\| status==="married"` | **module 07's, not residence authority — leave** |
| 5886 | stat-growth modifier | `cohabiting ? 4 : 0` | **module 11's, residence-adjacent — leave** |

### 2.3 The two disagreements this enumeration exposes
1. **§7145 vs §10845** — the parentsroom predicate is duplicated *verbatim*. Inverting one and missing the other is invisible without a test that counts both. Already in module 24's queue as item 1.
2. **§10836/§10839 vs §7145** — the header uses `movedOut || age >= 26`, the button beside it uses the full 6-clause rule. A 20-year-old with `couchAt` set is told *"Your own door, your own rules"* and then denied the door. This is a live, shipping bug, not a hypothetical.

### 2.4 Writers — sites that *change* residence (these call `hreSetTenure`)
| § | event | current write | becomes |
|---|---|---|---|
| 591 | thrown out after coming out | `flags.homeless = ageDays` | `hreSetTenure(s, "homeless")` |
| 5663 | family rupture | `flags.homeless = ageDays` | `hreSetTenure(s, "homeless")` |
| 5478 | couch-surf at a friend's | `homeless = null; couchAt = k` | `hreSetTenure(s, "lodging")` |
| 5528 | room in a shared flat (−300) | `homeless = null; movedOut = true` | `hreSetTenure(s, "renting", home)` |
| 5529 | hostel bed | `homeless = null; movedOut = true` | `hreSetTenure(s, "lodging")` — *hostel is not a tenancy; the current code conflates them* |
| 5530 | go back to parents | `homeless = null` | `hreSetTenure(s, "withParents")` |
| 6185 | move in together | `cohabiting = true` | `hreSetTenure(s, "withPartner")` |
| 6187 | new place together | `cohabiting = true` | `hreSetTenure(s, "withPartner")` |

**§5529 is a real modelling error worth fixing during inversion, not preserving:** a hostel bed sets `movedOut = true`, which every reader then treats as *"has their own place"*. Under HRE's nine-state model a hostel is `lodging`, not `renting`. The shim currently reproduces the old (wrong) answer faithfully — which is correct shim behaviour — but inversion is the moment to correct it, and it will change soak statistics, so it must land with its own assertion rather than as a silent side effect.

---

## 3. Recommended sequencing for Phase 7

R1 (§9.2) is the only High/High risk in the project and its mitigation is entirely about ordering. The destructive step goes **last**, after the replacement demonstrably works:

1. **Engagement pinning** (`s.hre.active`, Part 2 §4.7) — schema `v2 → v3` with a ladder step, cap and expiry. Blocked on nothing. Needed before any offer or application can survive a save/reload.
2. **Viewing + application + landlord decision** — `npcDisposition` for the person, `institutionalTier` for the legal climate, discrimination *computed* from attributes and never authored as a flag (R13). Refusals state a real reason. No tenure change yet.
3. **Tenancy formation** — `hreSetTenure(s, "renting", home)`, tenancy record, deposit. First real tenure write from new code.
4. **Rent payment** — *gated on the B3 decision above.* Everything downstream (arrears, eviction, deposit disputes) depends on it.
5. **Notice, arrears, eviction, deposit disputes.**
6. **Call-site inversion** — §2.2 readers first, one at a time, each verified; then §2.4 writers; then retire the legacy expressions. Module 24's frozen items 1–3 unfreeze here and must land in this same patch.
7. **Full-life soak** — multiple countries and eras, asserting coherent tenure throughout and zero state contradictions.

Steps 1–3 can proceed immediately. Step 4 cannot start until B3 is decided. Step 6 will **intentionally break `test-hre-s09.js`'s shim-equivalence assertions** — that suite asserts new answers equal *old* answers, and inversion is the moment the old answers stop being authoritative. Those assertions get replaced by contradiction assertions (no state where two systems disagree), not deleted.

---

## 4. What I need from you before writing S07 code

1. **B3: option (a) or option (b)?** Recommendation above is (b), against the spec's original (a), on measured evidence. If (b), it needs modules 01/03 sign-off for one line in `advance()`.
2. **§5529 hostel:** correct it to `lodging` during inversion (recommended), or preserve the existing conflation for compatibility?
3. **Scope confirmation:** steps 1–3 now, with 4–7 following once B3 is settled — or a different cut?
