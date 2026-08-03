# A Life — Module Ownership Map

Companion to `PROJECT_CONTEXT.md`. Maps the 24 modules onto the actual code in `life-sim.jsx`, grounded in the file's own section banners (`/* ═══ ... ═══ */`) and real anchor names. Use this to know what you own, what you may read but not duplicate, and who to defer to when two modules' logic overlaps in one place.

**Line numbers re-derived against the current 11,353-line file** (post-HRE Phase 6). They shift on every round — treat § as "search near here" and always confirm by grepping the anchor name. Note that some **in-source comments still cite pre-Phase-5 line numbers** (see module 21 for the specific stale ones); this map and your own grep win over those.

The file is **not physically split into 24 files** — it's one dense single-file build. This map is the conceptual ownership boundary the integration chat (23) uses to decide where a module's patch gets spliced in and whether it collides with another module's territory. Where two modules' concerns sit in the same section (common — this sim is deliberately systemic, not siloed), both are listed with a note on who owns which slice.

Format per module: **Scope** · **Owns** (real anchors, § = line #) · **Depends on / shares with** (other module #s) · notes.

---

**01 — Core Architecture**
Scope: the engine primitives everything else is built on.
Owns: `rnd`/`pick`/`clamp` (§164–166), `push` (§191), `applyFx` (FX §510, fn §512), `pClone` (§4490), `chooseOption` (§4159), `doActivity` dispatcher + `ACT_GROUPS` registry (ACTIVITIES §4166 / §4204 / §4265), `CANCEL`.
Depends on/shares with: everything reads through `applyFx`'s fixed key set — **no module may add a new fx key**, only use `run:`. 03 owns the tick loop that calls into this; 16 owns rendering `ACT_GROUPS`.
**Open ask (HRE B3):** HRE needs one additive line inside `advance()`'s loop, after the `WORLD_EVENTS` block and before the `MILESTONES` scan, to deliver deterministic recurring obligations. There is no tick hook today. Needs 01 + 03 sign-off before HRE Phase 6/7 can carry recurring costs.
This is the module every other module's patch must conform to, not extend.

**02 — Global Event Registry**
Scope: the `POOL` master array and the append-only wiring convention.
Owns: `POOL` (§763 — 41 in the base literal, **214 events at runtime** across 26 `POOL.push(...)` calls), `MILESTONES` (§649, 16 entries), `MICRO`/`EXTRA_POOL` (§1048 / §1151), `XPOOL_A/B/C` (§6028 / §6098 / §6163).
Depends on/shares with: every domain module (06–13) authors its own `*_POOL` array and pushes into this registry — content ownership stays with the domain, registry mechanics stay here. `MILESTONES` entries like `discoverO`/`discoverG` are mechanism-owned here, content-owned by 11.
Note: a milestone that fires **pre-empts the POOL draw for that step** (`break` + `continue` in `advance()`). Weight tuning that ignores this will mis-predict frequency.

**03 — Time Engine**
Scope: the calendar/aging tick.
Owns: `TIME_STEPS` (§138), `currentDate`/`fmtDate`/`ageYears`/`ageLabel`/`yearOf` (HELPERS §162), **`advance(state, totalDays)`** (ENGINE §4075, fn §4077 — two-arg signature, see Gotcha #6), `MORTALITY` §1440 / `mortalityCheck` §1442 (shared with 10).
Loop order per 7-day step: stat drift → birthday + mortality → degree completion → `WORLD_EVENTS` → `MILESTONES` (pre-empting) → one weighted POOL draw at `p = min(0.72, step × 0.09)`, 35% of draws restricted to interactive events.
Depends on/shares with: 10 owns *what* raises mortality risk, 03 owns *when* the roll fires. Co-owner with 01 of the B3 tick-hook decision.

**04 — World Simulation**
Scope: country/era context that everything else reads.
Owns: `WORLD_EVENTS` (§113), `DECADE_ACCENT` (§106), `eraAcceptance`/`countryTol`/`localAcceptance`/`criminalized` (§168–177), `decadeNews` (§629), `GAME_ERAS`/`gameFlavor` (§7017).
Also feeds `institutionalTier()` (14, §273), which reads `eraAcceptance` + `countryTol` to project any domain's legal climate.
Depends on/shares with: 11 is the heaviest consumer of `localAcceptance`; 12 uses `criminalized()`; 17 owns the `COUNTRIES` dictionary itself, 04 owns the *functions* that interpret it over time. **HRE (13) deliberately does not use these** — its law/era model is a separate data table with its own fallback chain, because housing law and queer-acceptance law move on different curves. If those two ever need to agree, that's a 04↔13 conversation, not a silent merge.

**05 — Character System**
Scope: the player character's persistent identity/stat model and creation flow.
Owns: `newCharacter()` (§403 — **required form fields: first/last/sex/orient/gid/cls/country/city/birthYear**, spread onto `s.profile`), `sexTag`/`isOutQueer`/`sameSexCouple`/`marriageLegal`/`activePartners`/`usedName`, `genderOptionsFor`/`orientOptionsFor`/`rollHiddenIdentity` (§330–402), `Creation` data logic (UI half owned by 16, §10444).
Depends on/shares with: 18 co-owns `migrate()` (§447) — every new field here needs a matching migrate line, always in the same patch (Gotcha #4). 11 owns everything that *happens* to hidden orientation/gender after creation. 13's HRE seeds `s.hre` inside `newCharacter()` (§~440) using character identity + `Math.random()`; the migrate path derives it deterministically from identity alone.
**Known gap:** `profile.curSym` is injected only by the Creation screen, so harness characters have it `undefined` — anything rendering currency must tolerate that or 20 must fix `mkChar()`.

**06 — NPC Engine**
Scope: how any non-player person is generated and individually behaves.
Owns: `makePerson`/`makeParents`/`parentAge` (§361 / §376), `candidateGender`/`candidateName`, `makeSiblings`/`makeRelatives` (§6229 / §6248), `makeClassmates`/`makeFaculty`/`makeStudentBody` (§6444 / §6458 / §7927), `CLIQUES`/`TEACHER_STYLE`/`INTEREST`/`CLIQUE_LIST` (§6441–5876, §7924), `staffDisposition()` (§8935), `TRAIT_ORDER`/`traitText` (§4396).
**Convention:** `politics` is HIGH = progressive/accepting. Never invert it.
Depends on/shares with: 07 owns what you *do* with these people; 08 owns the school container they populate; 11 supplies the content domain `staffDisposition` reacts to. 14's `npcDisposition()` is the generalized form — `staffDisposition` was deliberately not refactored onto it (it carries domain nuance), but new NPC reactions should prefer 14.

**07 — Relationship & Family**
Scope: family/friends/romance lifecycle and the generic interaction toolkit.
Owns: `RELATIONSHIP ACTIONS` §4394/§4487 (`spendTime` §4405, `deepTalk`, `complimentMenu`, `insultMenu`, `conversationMenu`, `timeMenu`, `apologizeAction`, `spyAction`, `unfriendAction`), `GIFTS`/`giftMenu`/`resolveGift` (§4433 / §4469) + `GIFT SHOP` §4821, `DATING` §4677 / `PROPOSE` §4748, `INTIMACY · WEDDING · CHILDREN` §5058, `ASK A FRIEND OUT` §5536, `EXES` §6335, `FAMILY_POOL` §6272 / `LATER_FAMILY_POOL` §6762 / `addStepsibs`, `CHEAT_POOL`/`openTalk`, `doBreakup` (§542), `canConceive` §5060 / `isSterile` §8525 (shared w/ 10), `PARTNER AWARENESS · FERTILITY · DISTANCE` §8497.
Depends on/shares with: 06 owns the person data model; 11 owns coming-out-*as-identity* content even though the coming-out conversation for family/friends/romance targets is called from here (`comeOutTo` §562 is filed under 11 by content, invoked with a `group` key from here). **Natural first adopter of 14's `makeReactionEvent` and `generateNPCLine`, both of which still have zero production callers.**

**08 — Education System**
Scope: schooling from primary through college.
Owns: `SUBJECTS`/`MAJORS`/`COLLEGE_TIERS` (§143 / §158 / §160), `SCHOOL_TYPES`/`FAITHY`/`pickSchoolType`/`schoolName` (§6381), `enrollSchool` §6478 / `schoolFee` / `CLUBS` §6499 / `clubsMenu`, `classmatesMenu`/`classmateActions`/`facultyMenu`/`facultyActions`, `skipSchool`/`dropOutSchool`, `SCHOOL_GROUP` §6706 (also hosts 11's `stxBoard` item) / `SCHOOL_POOL` §6719, `studyMenu`, `startCollege` §743 / `gainDegree` §551.
Depends on/shares with: 06 generates the classmates/faculty; 11 owns the entire school-gender-transition subsystem (§8871) even though it lives inside the "school" container — `schoolLegal()` and the request/channel/outcome system are 11's, not 08's.

**09 — Employment & Economy**
Scope: jobs, salary, side income, money mechanics.
Owns: `INDUSTRIES`/`TIER_SALARY` (§145 / §157), `jobBoard` (§4362), `workHarder`/`askRaise`/`quitJob` (CAREER PANEL §10551, fns §10553 / §10561), the side-hustle branch in `doActivity`, `applyFx`'s `money` semantics (floor at 0), the `salary` POOL event.
Depends on/shares with: `collegeFee`/tuition (`COUNTRIES[...].tui`) shared with 08; 13 owns relocation, which can cost the job.
**Two open items HRE has isolated but not fixed, both owned here:**
1. **Wage delivery is a lottery** — the `salary` event (`w:6`, `cd:30`) wins only 29.8% of employed months, so the player is told 6,000/month and receives ~1,800. The variance is arguably a feature (precarity); the *mean* is a display lie. HRE's `HRE_INCOME_REALISATION = 0.298` isolates the dependency so a fix is a one-line rebalance here.
2. **`TIER_SALARY` is flat across era AND country.** A manager earns the same in 1930 as 2020, and the same in Lagos as Oslo. Care costs already scale by country (`HC`) and tuition via `tui`, so the pattern exists. Until this is fixed, 13's market index compresses the country spread to ~1.25× instead of ~3×.

**10 — Health & Medicine**
Scope: physical conditions and care.
Owns: `HEALTH · CONDITIONS · CARE` §5697 (`CONDITIONS` §5709, `hasCond`, `activeConds`, `untreated`, `conditionRisk`, `giveCondition`, `doctorMenu` §5741, `checkUpResult`, `treatMenu`), `HEALTH_POOL` §5833, `HC` §5700 / `careCost`.
Depends on/shares with: 03 owns *when* the mortality roll fires, 10 owns what raises its odds. 07 owns `isSterile` narratively; 10 owns the medical mechanism (HRT/GCS thresholds) it computes from.

**11 — LGBTQIA+ Systems**
Scope: hidden identity, discovery, transition, closet dynamics, coming out — the project's largest and most cross-cutting module.
Owns: `COMING OUT` §560 / §5571 (`comeOutTo` §562, `comeOutWork`, `comeOutPublic` §616, `comeOutStart`, `comeOutReact`), `syncOrientationToGender`/`isQueerO`/`isQueerG`/`isOutQueer`, `ORIENT_DISCOVERY_TEXT` §639, `TRANSITION` §4930 (`hrtMenu` §4936, `markerLegalYear` §4933, `blockersMenu`, `surgeryMenu` §4978, `TRANSITION_GROUP` §5027 (id `journey`), `TRANS_POOL` §5045), `THE CLOSET HAS WALLS` §5860 (`bumpSuspicion` §5875, `CLOSET_POOL` §5880, `visiblyQueer`), `PRESENTATION · DYSPHORIA` §6838 (`presently` §6849, `presTarget`, `movePres`, `dysphoriaLevel` §6869, `DYSPHORIA_POOL` §6887), `STYLE · NONCONFORMITY · CONCEALMENT` §7463 (`nonconformity` §7477), `MASCULINISING PRESENTATION` §8283 (binder/packer, `FTM_POOL` §8448), `SCHOOL SOCIAL TRANSITION` §8871 in full (`schoolLegal` §8874, `TRANS_REQUESTS` §8906, `CHANNELS`, `resolveRequest` §8953, `applyGrant`, `escalateRequest`, `selfTransMenu` §9168, `classAnnounce`, `reportHarassment`, `SCHOOL_TRANS_POOL` §9265), `prideMenu` §4192, and **`STX · SCHOOL TRANSITION LEDGER & CREDIBILITY` §9345 in full** (`STX_STATES` §9367, `STX_REQ_ORDER`, `STX_REQ_LABEL`, `STX_CLAIMS`, `stxInit` §9400, `stxState`, `stxReq`, `stxIs`, `stxSet`, `stxGrantedCount`, `stxBoardMenu` §9555, `stxHistoryMenu`, `stxWithdrawMenu`, `stxPresentAtSchool`, `stxSchoolSees`, `stxCoherence` §9657, `stxPresCap` §9679, `stxStaffMem`, `stxStaffStance`, `stxOnAsk`, `stxOnGoAround`, `stxOnInformal`, `stxIsOutTo`, `stxMarkOut`, `stxCanComeOut`, `stxCredTier` §9932, `stxLieRisk`, `stxTellLie`, `STX_POOL` §10030), plus the `stxBoard` Act item registered inside 08's `SCHOOL_GROUP` (§6706) and `special: "stxBoard"` in `doActivity`.
State: **`s.stx`** `{v, req{}, staff{}, inst, cred, lies[], caught, complaints, log[]}` — initialized in `newCharacter` (§~442), migrated §450–460 (incl. `stxRepairOut`).
**Vocabulary warning:** STX's outcome names do NOT map 1:1 onto `resolveRequest`'s. STX `informal` = an unofficial **grant**; `resolveRequest` `informal` = an informal **refusal**. Any patch bridging the two must translate explicitly.
Depends on/shares with: 06's `staffDisposition()` is the mechanism 11's school-trans outcomes run through; 05 owns the hidden-identity roll at creation, 11 owns everything downstream; 04's `localAcceptance` is the era/country input 11's odds are built on.

**12 — Crime & Justice**
Scope: crime, arrest, prison, record.
Owns: `CRIME · ARREST · PRISON` §5208 (`CRIMES` §5226, `crimeOdds`, `crimeAvailable`, `crimeMenu` §5264, `crimeTargets`, `resolveCrime`, `arrestEvent`, `inPrison`, `recordCount`), `CRIME_GROUP`/`PRISON_GROUP` (§5455 / §5459), `JAIL+` §5939 (`DEG_W`, `recEntries`, `recWeight`, `hasDeg`, `expungeMenu`, `JAIL_POOL`), `PRISON_POOL`/`DANGER_POOL`, `statusChips` §6015.
Depends on/shares with: 04's `criminalized()` feeds whether queerness itself is criminal in-world — a rare direct 11↔12 link worth flagging in any patch touching it. HRE's tenure model has an `institutional` state that prison should eventually drive (Phase 7).

**13 — Housing & Lifestyle**
Scope: where you live, home life, leisure, appearance services, social media — **and the HRE subsystem**.
Owns (legacy/lifestyle): `NOWHERE TO SLEEP` §5464 (`askForHomeMenu`, `STREET_GROUP` §5494, `shelterAction`, `STREET_POOL`), `HOME · YOUR ROOM` §6943 (`BOOK_GENRES` §6945, `bookshelfMenu` §6977, `roomMenu` §7031, `expressMenu` §7055, `parentsRoomMenu`, `HOME_GROUP` §7143), `SALON & SPA` §7637 in full (`HAIRSTYLES` §7650, `salonMenu` §7695), `CONCERTS & PARTIES` §4850, `relocate()` §8550, `SOCIAL MEDIA` §8687 (`PLATFORMS` §8689, `socialMenu` §8725, `platformMenu`, `SOCIAL_GROUP` §8849, `SOCIAL_POOL` §8854) — no dedicated "digital" module exists in the 24, so social media is filed here; flag if you want it split out.

Owns (**HRE — Housing & Real Estate Ecosystem, Phases 0–6 shipped**), split across two locations — S01 through S06 spliced contiguously between the POOL block and the `ENGINE` banner (§1460–4074); S12 spliced later, after `HOME_GROUP` and before `STYLE · NONCONFORMITY` (§7148–7462), because it needs `ACT_GROUPS` and identity/acceptance helpers not available until deeper in the file:

| § | section | contents |
|---|---|---|
| 1460 | **S01** deterministic core | `hreHash` (FNV-1a), `hreMix`, `hreSeedFrom`, `hreWorldSeed`, `hreIdBuild/Parse/Valid/Of`, `hreMulberry`, `hreRng`, `hreRngRetry`, `HRE_ID_V`, `HRE_SEED_V` |
| 1681 | **S03/S04** world model | `HRE_REGION`/`HRE_DEV` (all 41 countries), `HRE_CLASS_ORDER`, `HRE_URBAN_FORM`, `hreHoodCount`, `hreCityClasses`, `HRE_DRIFT_KNOTS`, `hreDriftTrajectory/At`, `hreNeighbourhood`, `hreBlock*`, `HRE_STREET_BANKS`, `HRE_ADDRESS_FORMAT`, `hreStreetName`, `hreAddress`, `hreDistanceClass`; law: `HRE_LAW_UNIVERSAL/DEV/REGION/COUNTRY`, `HRE_LAW_LEVELS`, `hreLawBandAt/Stack/Merge`, `hreLaw`, `hreLawCoverage` |
| 2275 | **S02** property generator | `HRE_ARCHETYPES` (16), `HRE_MULTI_UNIT`, `HRE_AMENITIES` (**must stay topologically sorted**), `HRE_COMPONENTS`, `HRE_DEFECTS`, `HRE_SPACE_NORMS`, `HRE_OUTDOOR_VALUE`, `hreStage3Archetype` → `hreStage9BaseValue`, `hreValidateBlueprint`, `hreBlueprint`, `hreCrystallise`, `hreVisibleDefects` (also the disclosure ladder S06 reads: `HRE_DISCLOSURE_VISIBILITY` listing/viewing/survey/owned) |
| 2888 | **calibration (B4)** | `HRE_INCOME_REALISATION` (0.298), `HRE_PAYROLL_IS_DETERMINISTIC`, `HRE_PRICE_TO_INCOME`, `HRE_RENT_TO_INCOME`, `HRE_REF_SALARY_MONTHLY`, `hreRealisedAnnual`, `hreHvuToMoney`, `hreAffordableRent`, `hreDepositMonths` |
| 3000 | **S05** market index | `HRE_INDEX_KNOTS/REGION/DEV/UNIVERSAL`, `HRE_SHOCKS`, `HRE_ECONOMIC_WORLD_EVENT_YEARS`, `hreShock*`, `hreCurveAt`, `hreIndexCurve`, `hreNationalIndex`, `hreCityMultiplier`, `hreHoodMultiplier`, `hreYieldModifier`, `hreValue`, `hreAffordability`, `hreIndexCoverage` |
| 3285 | **S09** state/tenure | `HRE_TENURE_STATES`, `HRE_STATE_V` (= 2), `HRE_STATE_LADDER`, `hreAtParents`, `hreHasOwnPlace`, `hreIsHomeless`, `hreLegacyTenure` (the shim), `hreFamilyHomeId`, `hreCrystalliseFamilyHome`, `hreInit`, `hreMigrate`, `hreTenure`, `hreHome`, **`hreSetTenure` (sole writer)**, `hreTenureAgreesWithLegacy` |
| 3548 | **S06** marketplace, channels & listings | `HRE_CHANNELS` (6: word→notice→paper→agent→portal→app, each with a per-development-tier onset year), `hreChannel(s)`, `hreChannelAvailable/From`, `hreBestChannel`, `hreHoodScope`, `hreListingIds`, `hreSeller`, `hreOfferedTenure`, `hreAsking` (+ `HRE_REDUCTION_STEP`/`HRE_MAX_REDUCTIONS`), `HRE_REGISTER_BANDS` (terse/plain/agentic/portal presentation registers), `hreListingTitle/Blurb`, `HRE_AMENITY_HEADLINE`/`hreHeadlineAmenities`, `hreDisclosedDefects` (listing-tier only — reads S02's disclosure ladder), `hreListing` (assembles one), `hreSearch` (the entry point — deterministic, bounded by `HRE_SCAN_CAP`=48), `HRE_FILTERS` (all/rent/sale/afford/family), `hreMarketPeriod`, `hreMarketCoverage` (diagnostic, mirrors `hreLawCoverage`/`hreIndexCoverage`) |
| 7148 | **S12** interface adapter (minimal — Phase 6 slice only) | `hreCurSym`, `hreMoney`, `hreDayOfYear`, `hreSearchCtx`, `hreHomeHoodOf`, `hreCityIdxOf`, `HRE_HOUSING_DOMAIN_LAG`/`hreHousingClimate` (routes through module 14's `institutionalTier`), `HRE_CLIMATE_LINE`, `hreQueerRead`, `hreListingLine`, `hreSummaryText`, `hreMarketMenu` (§7295), `hreBrowseMenu`, `hreListingMenu`, `hreHomeValuation`, `HRE_TENURE_LINE`, `hreHomeMenu` (§7428), `HRE_GROUP` (§7456 — the Act-sheet group holding `hreHome`/`hreMarket`) |

State: **`s.hre`** `{v: 2, seed, tenure, since, home, recon, mem: {ch, filt}}` (~1.15–1.23 KB/save). `seed` is written once and never changed; `mem` (added Phase 6) remembers the player's last-browsed channel/filter. `migrate()` calls `hreMigrate(s)`, which runs a guarded `v`-driven ladder (`HRE_STATE_LADDER`) then a version-independent repair pass — verified against a genuine pre-S06 fixture (`test-hre-s09.js`).
**Browsing is player-visible as of Phase 6 (`HRE_GROUP`'s `hreHome`/`hreMarket` items); nothing beyond browsing is actionable yet** — no offers, viewings, applications, or moving in (S07/S08, Phase 7+). Both items are `cost: 0`, matching the other 35 menu-opening `special` branches file-wide (see module 01's entry and `PROJECT_CONTEXT.md` — this was verified exhaustive, not HRE-specific, so it wasn't fixed in this patch). Invariants that must not break: no `Math.random`/`rnd`/`pick`/`Date.now` anywhere in S01–S06 (lint-asserted); every generated attribute draws from a *namespaced* sub-stream; law/urban-form/curves are data with no `if (country === ...)` anywhere; valuation is O(1) and cache-independent; **S06's presentation (title/blurb) may only compose from the blueprint's own attributes — it must never invent a fact**, which is also the line module 15's AI narration may not cross; the S09 shim stays equivalent to legacy until Phase 7 inverts call sites.
Depends on/shares with: 09 (both salary open items above), 17 (street-name banks are placeholder), 22 (all law/curve entries are `provisional: true`; 20% country coverage), 01/03 (the B3 tick hook — still not needed; browsing carries no recurring obligation), 14 (S12's `hreHousingClimate` is the first production caller of `institutionalTier` outside its own test suite — `makeReactionEvent` is still uncalled and is the natural fit for Phase 6's landlord/neighbour-reaction follow-up or Phase 7), 12 (`institutional` tenure), 06 (S07/Phase 7 will generate the seller/landlord as a real `makePerson`; S06 deliberately keeps them a profile-only stub — `hreSeller` — so browsing doesn't run a person factory at scan speed). Read `HRE-STATUS.md` before touching any of it.

**14 — Procedural Simulation Engine**
Scope: reusable attribute-driven frameworks other modules compute from, instead of each writing bespoke conditionals. Built at §215.
Owns: `npcDisposition(npc, s, opts)` §228 → `{score, tier ∈ hostile|cold|neutral|warm|ally, factors}`, with `opts.weight` and `opts.stakes` 0-100; `institutionalTier(domain, s, opts)` §273 → `{tier, index, score, domain}` over `INST_TIER_ORDER` `["criminalised","none","emerging","protected","strong"]`, parameterized by `domainLag` and `institutionModifier`; `makeReactionEvent(cfg)` §298 → a POOL-legal event picking a tier-banked fragment at runtime. All three **deterministic** — no RNG inside; callers roll their own dice.
Depends on/shares with: 04 supplies `eraAcceptance`/`countryTol`/`localAcceptance`; 06's `staffDisposition()` and 11's `schoolLegal()` remain the domain-specific reference implementations and were deliberately **not** refactored onto these. **Adoption is still the open work: `makeReactionEvent` has no production callers.** 07 and 13-HRE Phase 6 are the natural first adopters.

**15 — AI Narrative (LLM)**
Scope: LLM-generated *presentation* only. Built at §10085.
Owns: `AI_NARRATION_CONFIG` §10097, `_aiCache`/`_aiState` (in-memory, deliberately not saved), `aiNarrationAllowed` §10110, `buildNarrationContext`, `requestAINarration` §10139, `enhancePopupNarration`, `generateNPCLine` §10206, `AI_FALLBACK_LINES`, `aiSettingsMenu` §10228 + `AI_GROUP` §10218 + `special: "aiSettings"`. State: **`s.ai`** `{enabled:false, level:"flavor"}` — initialized §~439, migrated §448.
**Hard contract (enforced by `test-ai-guarantee.js`, 19 assertions):** never consulted for what happens — no stats, fx, cond, eligibility or RNG. Hand-written text renders first, synchronously; the model only overwrites a display field afterwards. Failure/offline/500/malformed/timeout/disabled are all indistinguishable from the module not existing. Sanitized, capped at 600 chars, never parsed as code or state. Throttle 1.2 s, session budget 60 calls.
Depends on/shares with: 16 (render site — `pending.aiText || pending.text` in the popup body), 18 (`s.ai` persistence), 01 (`applyFx` `run:` for the toggles). Open: **inert outside the claude.ai artifact runtime** (no proxy in PWA/APK — fails closed, toggle does nothing); `generateNPCLine` is built but **unwired**, which is 07's call.

**16 — UI / UX**
Scope: rendering — every component.
Owns: `UI` §10256 (`StatBar` §10258, `Modal` §10271, `ConfirmBox`, `Sheet`, `smallBtn`), `RelCard` §10310 (rendering half; 06 owns the data), `Obituary` §10416, `Creation` §10444 (rendering half; 05 owns the data logic — and the only place `profile.curSym` is set), `CAREER/UNIVERSITY PANEL` §10551, `Game` §11013 (root state machine), `App` §11315, `INK`/`PAPER`/`CARD`/`DECADE_ACCENT`.
The popup body renders `state.pending.aiText || state.pending.text` — module 15's only render-layer touchpoint.
**Carries one half of a duplicated predicate:** the home-tab parentsroom button at §10845 restates 13's `HOME_GROUP` item `cond` (§7145) verbatim, and the header above it (§10836/§10839) uses a *different, looser* rule. Any change to either must change both. Phase 7 (13) resolves this.
Depends on/shares with: every domain module's `pending` popup shape is what 16 renders generically — domain modules should never touch a UI component to add content, only conform to the popup/`ACT_GROUPS` item shape.

**17 — Assets & Localization**
Scope: name/place/flavor data dictionaries.
Owns: `COUNTRIES` §5 / `NAMES` §51, `PET_DOG`/`PET_CAT` §102 / `BOSS_NAMES`, `SAINTS`/`PREP_WORDS`/`PLAIN_WORDS` (school naming), `HAIRSTYLES` §7650 / `HAIRCOLORS`/`NAILCOLORS`, `BOOK_GENRES` §6945 / `BOOK_TITLES`, `INTERESTS`/`CLIQUE_LIST` §7924 (shared w/ 06), `ORIENTS` §8500 (shared w/ 11).
Depends on/shares with: every module referencing a country, name pool or flavor list must use these exact keys — a mismatched string fails silently.
**Owed to 13-HRE:** `HRE_STREET_BANKS` (§1968) is a rough region-level placeholder. Needs proper per-country street-name banks, agency names and address formats in 17's own format. Japan's block-based addressing (`chome-banchi-go`) is already implemented as a *format*, not a hack, so per-country formats can be added the same way.

**18 — Save / Persistence System**
Scope: load/save and backward-compatible state migration.
Owns: `STORAGE` §10249 (`SAVE_KEY` §10251, `saveGame` §10252, `loadGame` §10253, `wipeGame` §10254, `window.storage` usage), `migrate()` §447 — co-owned with 05; every new field anywhere in the state tree needs a migrate line, and this module is the enforcement point for Gotcha #4 regardless of which module added the field. `migrate()` calls `hreMigrate(s)` and ends by setting `s.v = 4`.
Depends on/shares with: all 23 other modules. Note the save-size reality: ~240 KB full life, **91–92% of which is `s.feed`** — any capping/trimming decision is 18's to make with 19.

**19 — Performance & Optimization**
Scope: **no dedicated code region — a cross-cutting concern.**
Known pressure points, in measured order of importance:
1. **`s.feed` is unbounded and is 91–92% of the save.** Since `pClone` deep-clones the whole state on every action, feed growth makes every action progressively more expensive — quadratic over a long life, and the reason long probes look like deadlocks. This is the real performance issue.
2. `pClone`/`JSON.parse(JSON.stringify(state))` on every action and at the top of `advance()`.
3. `POOL.filter(...)` eligibility scan against all 214 events on every drawing step.
4. **Every menu-opening `doActivity` branch advances no time** — exhaustively confirmed at Phase 6 (35 of 38 `special` branches never call `advance()`; see module 01/13/24's entries for the exact mechanism), so a browse loop is free and grows the feed without bound (also a balance issue — 01/13/24).
HRE was flagged as a performance risk in its own spec (R3); measured worst case is 1.2 KB. **Mis-attributed — don't spend effort there.**

**20 — Testing & Validation**
Scope: process + the test assets themselves.
Owns (real files, not in `life-sim.jsx`): `build-slice.py` (auto-exports all **560** top-level symbols — never hand-list exports), `hre-extract.py` (regenerates the standalone `hre-*.js` files from `life-sim.jsx`, the single authority; now extracts **7** sections including `hre-s06.js`; aborts on a duplicated banner, which doubles as a double-splice check), `harness.js` (`mkChar`/`runLife`/`CLASSES`), `hre-p0d.js` (wage-delivery probe — re-run if 09 changes payroll), `hre-sample-review.js` (renders 100 generated properties as prose; the un-automatable Phase 3 gate, and how the amenity-prerequisite bug was found), and the suites: `test-integration-1.js` (53) · `test-stx-verify.js` (69) · `test-stx-wiring.js` (22) · `test-ai-guarantee.js` (19) · `test-render.js` (5) · `test-hre-s01.js` (83) · `test-hre-s03-s04.js` (82) · `test-hre-s02.js` (110) · `test-hre-calib.js` (20) · `test-hre-s05.js` (88) · `test-hre-s09.js` (87, includes explicit v1→v2 ladder coverage added at Phase 6) · `test-hre-s06.js` (60, new at Phase 6 — channels/onset-years, search determinism/bounds, filters, listing shape, disclosure ladder, CE spot checks, Act-sheet wiring incl. the Gotcha #2 discarded-clone check on `s.hre.mem`, zero-dead-end soak, market coverage diagnostic). **698 assertions, all green.**
`test-stx.js` (209) is **retired** — it needs a pre-integration standalone extract and expects `STX_BOARD_ITEM`, deliberately deleted as a duplicate. Do not revive it.
Standing rule this module enforces: assert on an *observable outcome of simulation* (`finalAge >= 60`, popups seen, school steps) — never on step counts alone (Gotcha #6).
**Open item:** `mkChar()` never sets `profile.curSym`, so harness characters render currency as `undefined`. Still open at Phase 6 — S12's `hreCurSym(s)` works around it defensively (falls back to `COUNTRIES[country].cur`), which is why HRE's own display never broke, but the harness gap itself is unfixed. Fix `mkChar()` before any *non-HRE* display layer depends on `profile.curSym` directly.

**21 — Documentation**
Scope: **process, not runtime code.** `PROJECT_CONTEXT.md`, this map, `HRE-STATUS.md`, `HRE-PHASE0-EXIT.md`, `HRE-ARCHITECTURE-part1/2/3.md`, the restart-kit `README.md`, and the file's own `/* ═══ ... ═══ */` banners. Deliverables are doc edits.
Standing chore: in-source comments carrying line references go stale on every splice. **Currently stale, confirmed at Phase 6:** the HRE S09 notes at **§3303–3309** still cite `flags.couchAt` "set at §2852" and the parentsroom predicate "duplicated verbatim at §4519 and §7905" — all three are pre-Phase-5 numbers; the real ones today are §5478, §7145 and §10845. The `hreLegacyTenure` comment at **§3354** repeats the same two wrong numbers, and `test-hre-s09.js`'s header comment cites §4519/§7896/§2868. None of these affect behaviour — they are transcription anchors for a human reader — but each one costs a future chat a wasted grep. Prefer anchor *names* over line numbers in new comments.

**22 — Research**
Scope: **process, not code.** Real-world grounding for `COUNTRIES` (SSM years, age-of-consent), `WORLD_EVENTS`, `eraAcceptance()`'s curve, the school legal-tier framework in 11 — **and now HRE's law and market tables, which are the largest outstanding research debt in the project.**
HRE tranche 1, not yet landed: every entry in the S04 law table and every S05 curve is marked `provisional: true`; `hreLawCoverage()` reports **8 of 41 countries (20%)** with country-level entries, the other 33 falling back to region or development defaults. The resolver is correct and never returns empty — but the *history* in it is placeholder and must not ship as fact. Needed: mortgage market emergence dates, historical LTVs and income multiples, tenancy regimes, discrimination-prohibition dates *and whether enforcement existed*, owner-occupation rates, amenity adoption curves.
Deliverables are sourced facts handed to 04/11/13/17 to encode, not code patches.

**23 — Integration**
Scope: this chat. Takes every module's handoff, locates real anchors in the uploaded file, splices per the Engine contract, runs the full build & test loop, ships the result.
Hard-won rule: **guard on your own inserted content, not on the anchor you splice against** — a splice guarded only on its anchor ran twice and duplicated 2,000 lines. Take backups in a separate command from the splice.

**24 — Refactoring**
Scope: **process, cross-cutting.** Behavior-preserving structural cleanup, validated by 20's harness before/after.
Current queue:
1. The duplicated parentsroom predicate (§7145 `HOME_GROUP` item `cond` / §10845 `Game` button) and the looser header rule beside it (§10836/§10839).
2. `flags.movedOut` set only on the homelessness exit path (§5528/§5529).
3. `flags.couchAt` set at §5478 and never cleared.
4. **Zero-time menu branches in `doActivity` — precisely quantified at Phase 6: 35 of 38 `special` branches never call `advance()`** (brace-matched over every branch; only `workhard`/`coast`/`lottery` do). Every `cost` declared on a menu-opening `ACT_GROUPS` item, across every module, is therefore dead data.
5. The twice-hardcoded subject-count class of bug.
6. Eventually, splitting this file's mega-sections into cleaner internal boundaries.

**Items 1–3 are deliberately frozen until HRE Phase 7** — fixing them now breaks the shim-equivalence proof in `test-hre-s09.js`.

**Item 4 is not frozen, but it is not a one-line cost change and must not be attempted per-module.** `advance()` no-ops whenever `s.pending` is already set (`while (remaining > 0 && !s.pending && s.alive)`), so a menu-opener that should cost time has to call `advance()` *before* building its menu, then check whether that call itself surfaced a milestone or POOL popup before overwriting `s.pending` — otherwise the popup is silently clobbered. That is one cross-cutting patch spanning ~9 modules with a single collision policy, plus a balance pass, since it makes many currently-free actions cost time for the first time.

---

## How to use this with a module chat
Give a module chat **`PROJECT_CONTEXT.md` in full** (the shared engine contract every module needs) **plus its own entry above** (scope + owned anchors + dependencies). For anything touching housing, add **`HRE-STATUS.md`**. That's enough to write a compliant patch blind, per the "Module patch submission format" in `PROJECT_CONTEXT.md`, without ever seeing the real file.
