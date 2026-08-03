# A Life — Project Reference (read this first, every chat)

Single-file React artifact life simulator (BitLife-style, LGBTQ+-focused, mobile-first).
Working filename: `life-sim.jsx`. Current size: **~886 KB / 11,353 lines** (dense — many one-line event/data literals).
Last integration round: **HRE Phase 6** (S06 Marketplace, Channels & Listings, plus the minimal S12 Interface Adapter wiring — `hreHome`/`hreMarket` Act items). Before that: HRE Phases 0–5, and before that modules 14, 15, 11-STX.
**698 assertions green across 12 suites — re-verified against this exact file, not carried over from the last doc.**
**Nothing beyond browsing is player-actionable yet** — Phase 6 ships search/listings/presentation only. Offers, viewings, tenancy applications and moving in are S07 (Phase 7), not built.
The user re-uploads this file each new chat — it is NOT stored in project knowledge (too large). This doc is the memory; the file is re-supplied each time.

**If you are a module-writing chat: you will never see the actual file.** Everything you need is in "Engine contract" and "Data dictionaries" below. Do not guess at shapes — they are transcribed verbatim from the real source. If something you need isn't covered here, say so explicitly in your handoff instead of guessing.

**Companion docs** (in the restart kit, not in project knowledge): `MODULE_MAP.md` (24-module ownership), `HRE-STATUS.md` (housing brief — decisions made, Phase 6, what's owed by other modules), `HRE-PHASE0-EXIT.md` (evidence behind the housing decisions), `HRE-ARCHITECTURE-part1/2/3.md` (the housing spec).

## Workflow at the start of any chat in this project
1. User uploads current `life-sim.jsx` to `/mnt/user-data/uploads/`.
2. Copy it to `/home/claude/life-sim.jsx` as the working copy.
3. **Run `python3 hre-extract.py`** if you will touch or test HRE — it regenerates the standalone `hre-*.js` section files from `life-sim.jsx`, which is their single authority. It aborts if a section banner appears twice, which is also the fastest check that the file hasn't been double-spliced.
4. Before writing ANY patch, re-read "Known feature inventory" so you don't rebuild something that exists.
5. All patches go through the Python `str.replace` splice pattern — never regenerate the whole file.

## Build & test loop (always do this, every change, no exceptions)
```bash
# 1. Syntax/bundle check after every edit:
npx --yes esbuild life-sim.jsx --loader:.jsx=jsx --bundle --external:react --outfile=/dev/null
# (ignore the "npm error config prefix" line, harmless)

# 2. Extract the logic slice (auto-exports every top-level symbol — 504 today):
python3 build-slice.py     # writes /tmp/t.js

# 3. Regenerate HRE section files from life-sim.jsx (single authority):
python3 hre-extract.py

# 4. Use harness.js for anything life-shaped:
#      const H = require('/home/claude/harness.js');
#      const s = H.mkChar({ country, cls, birthYear, sex });
#      const r = H.runLife(s);   // -> {steps, finalAge, deadEnds, crashes, popups, inSchool, state}
#    runLife also accepts {maxSteps, onStep}.

# 5. For UI/render changes, mount via jsdom + react-dom/client with stubbed
#    window.storage (see test-render.js). Needs: npm install jsdom react react-dom
#    Build the test bundle INSIDE /home/claude (not /tmp) or React resolves to
#    two copies and you get a bogus "Invalid hook call":
npx --yes esbuild life-sim.jsx --loader:.jsx=jsx --bundle --format=cjs \
  --external:react --external:react-dom \
  --jsx-factory=React.createElement --jsx-fragment=React.Fragment \
  --banner:js='const React = require("react");' --outfile=bundle.test.js

# 6. Only after tests pass: cp life-sim.jsx /mnt/user-data/outputs/ and present_files it.
```

Never skip step 1. Never claim something works without running the harness — and never trust a green soak without checking it *aged anybody* (Gotcha #6).

### Current test suite (all green — keep them green)
| file | covers | assertions |
|---|---|---|
| `test-integration-1.js` | modules 14 + 15, full-life soak | 53 |
| `test-stx-verify.js` | STX behaviour end-to-end | 69 |
| `test-stx-wiring.js` | STX Act-sheet/RelCard wiring + soak | 22 |
| `test-ai-guarantee.js` | AI cannot affect simulation | 19 |
| `test-render.js` | jsdom mount, no network on boot | 5 |
| `test-hre-s01.js` | HRE deterministic core | 83 |
| `test-hre-s03-s04.js` | HRE geography + law | 82 |
| `test-hre-s02.js` | HRE property generator | 110 |
| `test-hre-calib.js` | HRE money calibration (B4) | 20 |
| `test-hre-s05.js` | HRE market index + valuation | 88 |
| `test-hre-s09.js` | HRE state/tenure/migration + shim equivalence, incl. explicit v1→v2 ladder | 87 |
| `test-hre-s06.js` | HRE marketplace/channels/listings + Act-sheet wiring | 60 |
| | **total** | **698** |

Run them all:
```bash
for f in test-integration-1.js test-stx-verify.js test-stx-wiring.js \
         test-ai-guarantee.js test-render.js test-hre-s01.js \
         test-hre-s03-s04.js test-hre-s02.js test-hre-calib.js \
         test-hre-s05.js test-hre-s09.js test-hre-s06.js; do
  printf "%-24s " "$f"; node $f 2>&1 | grep -E "[0-9]+ passed, [0-9]+ failed" | tail -1
done
```
Expected: 53, 69, 22, 19, 5, 83, 82, 110, 20, 88, 87, 60.

**`hre-extract.py` now also extracts `hre-s06.js`** (banner `HRE · S06 · MARKETPLACE, CHANNELS & LISTINGS`) — 7 section files total, not 6. Run it before touching S06, same as any other HRE section.

**`test-stx.js` (209) is RETIRED** — it needs `stx-module.js`, a pre-integration standalone extract, and expects `STX_BOARD_ITEM`, which integration deliberately deleted as a duplicate. Superseded by `test-stx-verify.js` + `test-stx-wiring.js`, which run against the real file. Do not revive it; the old "377 assertions across 6 suites" figure was never true of a runnable suite.

## Architecture map (search these anchors, don't re-derive structure)

Line numbers are for the **current 11,353-line file** (post-Phase-6) and shift every round — treat § as "search near here" and always confirm by grepping the anchor name. Note that several **in-source comments still carry pre-Phase-5 or pre-Phase-6 line references** (e.g. `test-hre-s09.js`'s legacy-expression comment cites §4519/§7896/§2868); trust this table and your own grep, not those.

| anchor | § |
|---|---|
| `DATA` banner / `const COUNTRIES` | 3 / 5 |
| `HELPERS` banner (`rnd`/`pick`/`clamp`/`push` §164–191) | 162 |
| `PROCEDURAL SIMULATION ENGINE` (module 14: `npcDisposition` 228, `institutionalTier` 273, `makeReactionEvent` 298) | 215 |
| `CHARACTER` banner / `function newCharacter(form)` | 328 / 403 |
| `function migrate(s)` | 447 |
| `FX` banner / `function applyFx(s, fx)` | 510 / 512 |
| `const MILESTONES` (16 entries) | 649 |
| `const POOL = [` | 763 |
| **HRE · S01 deterministic core** | 1460 |
| **HRE · Layer 2 (S03 geography §1734, S04 law §2029)** | 1681 |
| **HRE · S02 property generator** | 2275 |
| **HRE · calibration constants (B4)** | 2888 |
| **HRE · S05 market index & valuation** | 3000 |
| **HRE · S09 state, tenure & residence migration** (`HRE_STATE_V` 3314, `hreMigrate` 3493, `hreTenure` 3524, `hreSetTenure` 3531) | 3285 |
| **HRE · S06 marketplace, channels & listings** (`hreListing` 3943, `hreSearch` 3997) | 3548 |
| `ENGINE` banner / `function advance(state, totalDays)` | 4075 / 4077 |
| `function chooseOption` | 4159 |
| `ACTIVITIES` banner / `const ACT_GROUPS` / `function doActivity(s, act)` | 4166 / 4204 / 4265 |
| `function pClone` | 4490 |
| `TRANSITION` banner / `const TRANSITION_GROUP` | 4930 / 5027 |
| `CRIME · ARREST · PRISON` / `CRIME_GROUP` + `PRISON_GROUP` | 5208 / 5455, 5459 |
| `const STREET_GROUP` | 5494 |
| `HEALTH · CONDITIONS · CARE` | 5697 |
| `SCHOOL LIFE` / `const SCHOOL_GROUP` (hosts the `stxBoard` item) | 6379 / 6706 |
| `PRESENTATION · DYSPHORIA` | 6838 |
| `HOME · YOUR ROOM` / `const HOME_GROUP` | 6943 / 7143 |
| **HRE · S12 interface adapter** (`hreMarketMenu` 7295, `hreHomeMenu` 7428, `HRE_GROUP` 7456) — sits between `HOME_GROUP` and `STYLE · NONCONFORMITY`, not with the rest of HRE | 7148–7462 |
| `STYLE · NONCONFORMITY · CONCEALMENT` | 7463 |
| `SALON & SPA` | 7637 |
| `SCHOOL: STUDENT BODY · PRESENTING · CONSEQUENCES` | 7922 |
| `SOCIAL MEDIA` / `const SOCIAL_GROUP` | 8687 / 8849 |
| `SCHOOL SOCIAL TRANSITION` (`schoolLegal` 8874) | 8871 |
| `STX · SCHOOL TRANSITION LEDGER` (`stxInit` 9400) | 9345 |
| `AI NARRATION (LLM)` (`AI_NARRATION_CONFIG` 10097, `aiNarrationAllowed` 10110, `generateNPCLine` 10206) / `const AI_GROUP` | 10085 / 10218 |
| `STORAGE` (`SAVE_KEY` 10251) | 10249 |
| `UI` / `function RelCard` | 10256 / 10310 |
| `OBITUARY` / `CREATION` / `CAREER · UNIVERSITY PANEL` | 10416 / 10444 / 10551 |
| `GAME` (`function Game` 11015) / `APP` (`export default function App` 11317) | 11013 / 11315 |

**HRE is now split across two locations in the file** — S01/S03-S04/S02/calib/S05/S09/S06 sit contiguously at §1460–4074, immediately before `ENGINE`; but S12 (§7148–7462) had to be spliced later, after `HOME_GROUP`, because it needs `ACT_GROUPS` (defined in `ENGINE`) and `hreCurSym`/`hreQueerRead`-style helpers that read `isOutQueer`/`localAcceptance`, which aren't available until deeper in the file. `hre-extract.py`'s section list reflects both locations — don't assume every HRE symbol is in one place.

- `const COUNTRIES = {...}` — **41 countries** (older docs said 39; the *list* was right, the count was wrong). Each `{cur, cities[], ssm, tui, aoc}`.
- `function newCharacter(form)` — `form` is spread onto `s.profile`, so REQUIRED fields are `first, last, sex, orient, gid, cls, country, city, birthYear`. Optional: `stHealth/stHappiness/stSmarts/stLooks`, `discOAt/discGAt`. Use `harness.js`'s `mkChar()` in tests. **`curSym` is injected only by the Creation screen**, so harness characters have `profile.curSym === undefined` — a known harness gap that will bite any display layer reading currency.
- `function advance(state, totalDays)` — **takes TWO arguments.** `advance(s)` is a silent no-op. Always `advance(s, 7)`.
- `const POOL = [...]` — **214 events at runtime** (41 in the base literal, the rest from 26 `POOL.push(...)` calls). Append-only; never edit the base literal.
- `const ACT_GROUPS = [...]` — 15 groups. Later systems `.push()`/`.splice()` their own after the base array.
- `function doActivity(s, act)` — the dispatcher. **38 `special` keys today:** `aiSettings, askhome, blockers, classmates, clubs, coast, crime, dating, dropschool, expunge, faculty, hreHome, hreMarket, hrt, hustle, jobs, legalMarker, legalName, lottery, masckit, parentsroom, party, pride, prison, room, salon, schoolpresent, schooltrans, selftrans, shelter, skipschool, socialhub, srgFace, srgGcs, srgTop, study, stxBoard, workhard`.
- **Every menu-opening special branch advances zero time — this is exhaustively confirmed, not "most."** Brace-matched over all 38 branches: exactly 3 (`workhard`, `coast`, `lottery`) call `advance()` anywhere in their own block; the other 35, including HRE's `hreHome`/`hreMarket`, set `s.pending` and return before ever reaching the dispatcher's bottom `advance(s, act.cost)` fallthrough. The `cost` declared on a menu-opening `ACT_GROUPS` item (e.g. `dating: cost 2`, `jobhunt: cost 4`, `salon: cost 1`) is therefore **dead data for all 35** — it is never charged, in any of them, without exception. **This means HRE's `hreHome`/`hreMarket` at `cost: 0` are not a deviation from convention — they are simply honest about what the other 35 already do silently.** A fix isn't a one-line cost change: `advance()` itself no-ops whenever `s.pending` is already truthy (`while (remaining > 0 && !s.pending && s.alive)`), so charging real time to a menu-opener requires calling `advance()` *before* building the menu, and then guarding against that `advance()` call itself surfacing a milestone/POOL popup that the menu would silently clobber. This is real, scoped, cross-cutting work — see module 24's queue below, not a per-module patch.

### `advance()`'s loop, in order — there is NO tick hook
Per 7-day step, inside `while (remaining > 0 && !s.pending && s.alive)`:
1. stat drift (25% chance, ±1 on a random stat; extra −1 health at 52+ on a 10% roll)
2. birthday push + `mortalityCheck` (can `break`)
3. college degree completion (schedule-based, not a dice roll)
4. `WORLD_EVENTS` for each year crossed, guarded by `flags["w_" + y]`
5. `MILESTONES` scan — **first match fires, then `continue`**, pre-empting the rest of the step
6. **one** weighted POOL draw at `p = min(0.72, step × 0.09)`; 35% of the time the draw is restricted to interactive (`i:1`) events

There is no place for a module to register per-tick work. **HRE's one outstanding engine ask (B3)** is a single additive line inside this loop, after the `WORLD_EVENTS` block and before the `MILESTONES` scan — so it can never be pre-empted by step 5. Needs modules 01/03 sign-off. Do not deliver recurring obligations through POOL: that mechanism already loses ~70% of wages (see Measured facts).

## Engine contract — exact shapes modules MUST follow

### The `run(s) → out` contract
```js
if (out && out.auto) out.auto.forEach((t) => push(s, t));
if (out && out.fx)   applyFx(s, out.fx);
if (out && out.event) s.pending = out.event;
```
All three optional and independent. `s.flags["cd_" + event.id]` is set by the engine right before `run()` — never set your own cooldown.

### POOL event shape
```js
{ id: "uniqueId", i: 1 (optional: interactive/popup vs ambient), w: <weight>,
  minAge, maxAge, cd: <cooldown in days>, prison: 1 (optional), once: true (optional),
  cond: (s) => bool, run: (s) => ({ auto: [...] } | { fx: {...} } | { event: {...} }) }
```

### Popup shape (`s.pending`)
```js
{ emoji, title, text, options: [{ label, cond?: (s) => bool, fx: <FxObject> }] }
```
**Always guarantee at least one option is valid in every reachable state** (the soak asserts zero dead-ends).

### The `FxObject` — the ONLY keys `applyFx` understands
```js
{
  stats:     { health?, happiness?, smarts?, looks? }   // added then clamp(0-100)
  money:     ±number                                     // added then floored at 0
  rel:       { famKey: ±number }
  relF:      { friendKey: ±number }
  relR:      { romanceKey: ±number }
  subj:      { subjectKey: ±number }
  emergent:  { traitKey: ±number }                       // NEW key auto-seeds at 50
  addFriend: { key, name, role, rel?, pet? }
  addRomance:{ name, g?, rel?, chem? }
  setR:      { romanceKey: {...fieldsToAssign} }
  breakup:   { key, hard? }
  run:       (st) => { ... }                             // arbitrary mutation of the SAME draft
  flags:     { flagKey: value }
  feed:      "text"
  next:      <popup object>
}
```
**No other key exists.** Anything else (mutating `s.body`, `s.school`, `s.hre`, adding a child) must go through `run:` — `applyFx` silently ignores unknown keys.

### The discarded-clone gotcha, in its exact real form
```js
if (act.special === "salon") { return Object.assign(s, { pending: salonMenu(s).pending }); }
```
Only `.pending` is lifted out. A menu-builder that mutates its internal `pClone` loses that mutation. If opening a menu must itself change state, do it on `s` in `doActivity`, or defer it into each option's `fx.run`.

### Person object shape (`makePerson`)
```js
{ name, role, rel: 50-80, warmth: 25-95, kindness: 25-95, loyalty: 25-95,
  acceptance: 20-90, politics: 5-95, pet: false, g: null,
  known: [], lastTime: -999, lastTalk: -999, lastGift: -999 }
```
`politics` HIGH = progressive/accepting (`traitText` reads >65 as "leans progressive"). **Do NOT invert it** — that bug shipped once and silently reversed every NPC's read on queer content. Parents add `ageAtBirth`; romance adds `status`/`openOk`/`chem`/`exSince`. All person objects live in `s.family`, `s.friends`, `s.romance`, `s.relatives` or `s.children`.

### `ACT_GROUPS` wiring
Define `const YOUR_GROUP = { id, emoji, name, cond?, items: [...] }` near your code, then one `ACT_GROUPS.push(YOUR_GROUP)` (or `.splice` with an explicit position). Never edit the base literal. Registered ids in order: `body, mind, fun, social, love, money, journey, self, crime, prison, street, school, home, social_media, ai` (15). The Act sheet hides everything but `prison` while `inPrison(state)` — new groups get that for free.

Item shape:
```js
{ id, minAge, maxAge?, emoji, label, cost, price?, cond?, special?,
  fx?, fxDyn?: (s)=>FxObject, lines?, linesDyn?, sub?: {emoji,title,text,opts:[...]},
  danger?: {title, body, yes} }
```
`cost` is the time-step unit consumed by `advance()`; `price` is money, checked and deducted first. Any new `special: "x"` needs a matching `doActivity` branch — list it explicitly in your handoff.

### Reserved flag prefixes on `s.flags`
`cd_<eventId>` · `m_<milestoneId>` · `w_<year>` · `fam_*` · `stx_*` · **`hre_*`** (reserved by HRE; its state lives on `s.hre`, not in flags). Give any new persistent flag a short unique prefix.

### Always-available helpers (don't redefine)
`rnd(a,b)` · `pick(arr)` · `clamp(v)` · `push(s,text,extra?)` · `ageYears(s)` · `ageLabel(s)` · `yearOf(s)` · `currentDate(s)`/`fmtDate(d)` · `localAcceptance(s)` · `criminalized(s)` · `ageOfConsent(s)` · `isQueerO(s)`/`isQueerG(s)`/`isOutQueer(s)` · `sameSexCouple(s,p)` · `marriageLegal(s,p)` · `activePartners(s)` · `usedName(s)` · `inSchool(s)` · `inPrison(s)` · `pClone(state)` · `applyFx(s,fx)` · `doBreakup(s,key,hard)` · `makePerson(name,role,opts)` · `npcDisposition(npc,s,opts)` · `institutionalTier(domain,s,opts)` · `makeReactionEvent(cfg)` · `hreTenure(s)` · `hreHome(s)` · `hreSetTenure(s,tenure,home?)`.

### State top-level shape (`v: 4`)
```
profile, hidden, discovered, outTo, stats{health,happiness,smarts,looks}, emergent{},
money, family{mom,dad,sib*,...}, relatives{}, friends{}, romance{}, spouse, children{},
conditions{}, suspicion{}, school, social{accounts,followers,reach,drama},
body{hair,color,nails,pedi,tan,wax,laserFace,laserBody},
education{stage,subjects,extra,college,degree,debt}, career{job,sideHustle,quitCount},
birth{y,m,d}, ageDays, feed[], pending, timeStep, flags{}, alive, death, v,
ai{enabled,level}, stx{v,req{},staff{},inst,cred,lies[],caught,complaints,log[]},
hre{v,seed,tenure,since,home,recon}
```
**`s.feed` holds OBJECTS, not strings** — `push(s, text, extra)` appends `{date, text, ...extra}`. Anything reading the feed must use `.text`.
Every top-level key needs BOTH a `newCharacter()` initializer AND a `migrate()` backfill, in the same patch (Gotcha #4). `migrate()` calls `hreMigrate(s)` immediately after seeding `s.ai`, and ends by setting `s.v = 4`.

### `s.hre` — HRE state (Phase 6, schema `v: 2` — `HRE_STATE_V`)
```js
{ v: 2, seed: <uint32>, tenure: <one of HRE_TENURE_STATES>, since: <ageDays>,
  home: <crystallised dwelling|null>, recon: <bool>,
  mem: { ch: <channel id|null>, filt: <one of HRE_FILTERS' ids, default "all"> } }
```
~1.15–1.23 KB in a full-life save (~0.44–0.53% of total). **`seed` is written once and NEVER changed** — the whole housing world derives from it. On a new character the seed's entropy includes `Math.random()`; on a *migrated* save it is derived deterministically from character identity, so an old save doesn't get a different childhood home on every load. Use `hreSetTenure(s, tenure, home?)` as the sole writer for tenure.

**`mem`** (added Phase 6, S06's own branch of state) remembers which channel and filter the player last browsed with, so reopening the market doesn't reset their view. `hreMigrate` runs a guarded version ladder (`HRE_STATE_LADDER`, driven by `h.v`) and then a defensive repair pass independent of version — a hand-edited or truncated save carrying a current `v` but a missing `mem` is still backfilled, not just upgraded. Verified: a genuine pre-S06 (`v:1`, no `mem`) save upgrades to `v:2` preserving `seed`/`tenure`/`since` exactly and backfilling `mem`; migration is idempotent (`test-hre-s09.js`, "1 · schema and creation").

## Data dictionaries (exact keys — typos fail silently, not loudly)

- **`COUNTRIES`** — 41 keys: Argentina, Australia, Austria, Brazil, Canada, Chile, China, Colombia, Cuba, Denmark, Egypt, France, Germany, Greece, India, Indonesia, Ireland, Israel, Italy, Japan, Kenya, Mexico, Netherlands, "New Zealand", Nigeria, Norway, Philippines, Poland, Portugal, Russia, "South Africa", "South Korea", Spain, Sweden, Switzerland, Thailand, Turkey, Ukraine, "United Kingdom", "United States", Vietnam.
- **`SUBJECTS`** — `math, science, lit, history, arts, lang, geo, music, pe, tech`.
- **`ORIENTS`** — `["Straight","Bisexual","Pansexual","Lesbian","Gay","Asexual","Fluid"]`.
- Gender tag `p.g` — `"M" | "F" | "NB"` — distinct from `s.profile.sex` ("Male"/"Female") and `s.hidden.gender` (identity string).
- **HRE region/dev maps** — `HRE_REGION` and `HRE_DEV` cover all 41 countries; extend both together if a country is ever added.

## Known feature inventory (do NOT rebuild — extend)

Identity/discovery, transition (presentation bar, dysphoria, FtM passing kit, style/nonconformity, concealment), closet/coming out (suspicion, multi-beat conversations, being outed, country+era realism), relationships (dating/propose/wedding/children/exes/siblings/relatives/fertility/non-monogamy), crime & jail (14 crimes, arrest→bail/lawyer/trial, records, parole, expungement, prison lockdown), health (12 conditions, country-priced care), school (12 types, classmates/faculty with rich attributes, clubs, study cooldowns) **plus the full school gender-transition system** (`schoolLegal`, 10 request types, 5 channels, `staffDisposition`, outcomes from granted through danger), salon & spa, home tab, work panel, social media (era-gated, country-banned, age-gated), creation-screen advanced panel.

**Procedural framework** (module 14, §215): `npcDisposition()`, `institutionalTier()`, `makeReactionEvent()`. All deterministic — callers roll their own dice against the returned score. `makeReactionEvent` and `generateNPCLine` still have **no production callers**; new content should prefer these over bespoke conditionals.

**AI narration** (module 15, §9205): opt-in (`s.ai.enabled`, default false), presentation-only by contract — hand-written text renders first and synchronously, the model only overwrites `pending.aiText`. Failure/offline/timeout/disabled are indistinguishable from the module being absent. Sanitised, capped at 600 chars, throttled 1.2 s, 60 calls/session. **Inert outside the claude.ai artifact runtime** — the keyless endpoint has no proxy in the PWA/APK builds, so the toggle is visible but does nothing there. Unresolved product decision.

**STX** (module 11, §8465): persistent per-request school-transition ledger on `s.stx` — states, staff memory, institutional friction, credibility, lies with escalating risk. Act-sheet board via `special: "stxBoard"` inside `SCHOOL_GROUP` (§6140). Its outcome vocabulary does **not** map 1:1 onto `resolveRequest`'s: STX's `informal` is an unofficial *grant*, `resolveRequest`'s is an informal *refusal*.

**HRE** (module 13 subsystem, Phases 0–6, §1460–4074 + §7148–7462): deterministic core (FNV-1a, mulberry32, namespaced sub-streams), geography (neighbourhoods with class drift, blocks, addressing incl. Japanese block format, distance class), law & era (merging fallback chain over 41 countries), property generator (16 archetypes, 13-stage pipeline, topologically-sorted amenity prerequisites, condition, defects, base HVU), calibration constants, market index (era curves + dated shocks with onset ramps + city/hood multipliers + yields), state/tenure/migration with a proven-equivalent legacy shim, and **now a live marketplace**: 6 era-gated search channels (word of mouth → noticeboard → classifieds → agent → portal → app, each with its own onset year per development tier, newest-available-first), deterministic per-period listing selection bounded by `HRE_SCAN_CAP` regardless of market emptiness, 5 filters (all/rent/sale/afford/family), 4 era-appropriate presentation registers (terse/plain/agentic/portal) composing listing titles and blurbs strictly from the property's own attributes, and a disclosure ladder that shows only `open`-tier defects at listing level — `apparent`/`technical`/`latent` are reserved for Phase 7's viewings and surveys. **The Act sheet now has two live HRE items** (`hreHome` "Where you live", `hreMarket` "What's on the market") wired through `HRE_GROUP`, both `cost: 0` — see the zero-time-branch finding above; this matches the other 35 menu-openers in the file, not a deviation. **Still nothing beyond browsing is actionable** — no offers, no viewings, no applications, no moving in; those are S07/S08/S09-continued, Phase 7+. No pre-Phase-6 call site has been inverted. See `HRE-STATUS.md` before touching it.

## Known gotchas (check for these specifically)

1. **Patch scripts silently roll back — or run twice.** After ANY patch, grep the anchor back out before claiming success. **AND grep for your own inserted content, not just the anchor you spliced against**: a splice guarded only on its anchor ran twice in Phase 5 and duplicated 2,000 lines, because the anchor was still present and still unique afterwards. A `cp` backup taken in the *same command* as the splice captured the corrupted file — take backups in a separate step, or restore from the restart kit.
2. **The discarded-clone bug** — see the Engine contract. Seen 3+ separate times.
3. **Magic-number scaling after list changes** — subjects went 5→10 and two separate code paths divided by the old count; the second was found much later. Grep for the old number everywhere.
4. **Migration gaps** — new state fields need BOTH `newCharacter()` and `migrate()`, always in the same patch. Fresh test characters never exercise the migrate path, so the bug only hits real saves.
5. **Test-harness false negatives** — `ageYears()` uses `365.25`; hand-construct ages with `Math.ceil(age * 365.25) + 1`. React SSR inserts `<!-- -->` markers and escapes quotes/`&`; strip these in render assertions.
6. **Harness false-POSITIVES — the worst class.** `advance(s)` without the second arg is a silent no-op that reports thousands of steps and simulates nothing (it once produced a green 33,600-step, 8-life, age-80 run in which nobody aged a day). `newCharacter(form)` missing `cls`/`city`/`country`/`birthYear` throws at the first milestone. Always assert on an *observable outcome* (`finalAge >= 60`, popups seen, school steps), never step counts. Generate slice exports with `build-slice.py`, never by hand.
7. **Node buffers stdout to a file**, so a long probe looks hung when it is merely quiet. Use `fs.appendFileSync` for progress logging in long runs.
8. **`pClone` cost grows with the feed.** `s.feed` is unbounded and is **91–92% of a ~240 KB full-life save**. Any long soak that keeps the feed is quadratic and will look like a deadlock. Trim the feed in probes where it isn't the measurement.

## Measured facts (don't re-derive; re-measure only if you change the cause)

- **Full-life save ≈ 240 KB**, of which `s.feed` is 91–92% (1,600–1,950 entries). `school` is next at ~3%. `s.hre` is ~1.1 KB.
- **Wages are a lottery, not a payroll.** Delivered by a POOL event (`id:"salary"`, `w:6`, `cd:30`) that must win a weighted draw. Measured: characters are paid in only **29.8%** of employed months (range 0.192–0.433, n=18 country×era cases). Nominal `TIER_SALARY` is not income; realised annual ≈ nominal monthly × 3.58. Isolated into `HRE_INCOME_REALISATION = 0.298` — when payroll is fixed, that constant goes to 1.0 and one line rebalances HRE.
- **Salary compounds without ceiling** — `askRaise` ×1.12, promotion ×1.30, both repeatable. Measured peaks 12k–85k/month against a table max of 16k.
- **`TIER_SALARY` is flat across BOTH era and country** (§157). A manager earns the same in 1930 as 2020 and the same in Lagos as Oslo. This distorts any economic model built on top of it, and forces HRE's index to measure price-to-income rather than real price level.
- **Starting money is `0` for every class.** Class drives the health roll, school type and college tuition help only.
- **HRE law coverage is 20%** — 8 of 41 countries have country-level entries; 33 fall back to region or development defaults. Every entry is marked `provisional: true`. The resolver is correct; the history in it is placeholder and must not ship as fact (module 22).

## Latent issues in legacy code (found, deliberately NOT fixed)

Fixing these would break HRE's shim equivalence; they are Phase 7 work, to be resolved in the same patch that inverts the call sites.
- The `parentsroom` predicate is **duplicated verbatim** at **§6579** (the `HOME_GROUP` item's `cond`) and **§9965** (the button in `Game`). Inverting one and missing the other would be invisible without a test that counts both.
- The home-tab **header** (§9956/§9959) uses `movedOut || age >= 26` while the **button beside it** uses the full parentsroom rule — so a 20-year-old with `couchAt` set is told "your own door" and then denied the door.
- `flags.movedOut` is set **only** on the homelessness exit path (§4962, §4963), so most characters never have it set and "move out" at 26 by an unwritten rule.
- `flags.couchAt` is set at §4912 and **never cleared** — which is why HRE ranks it LOW in tenure derivation, rather than stranding anyone who ever couch-surfed in `lodging` for life.
- **Every one of the 35 menu-opening `doActivity` branches advances no simulated time** (exhaustively confirmed at Phase 6, see the anchor-table note above) — every browse loop across the whole game, not just HRE's, is free and grows the feed without bound. Fixing this is real work (advance-before-build-menu, guard against a pre-empting popup) and belongs to module 24 as one cross-cutting patch, not 35 uncoordinated ones.

## Tone/writing conventions for event text
Second person, literary/short-story register, specific concrete detail over generic description, avoid saccharine resolution, let bad outcomes actually sting and good ones actually land. Bracket ranges for stat effects (`rnd(a,b)`) rather than fixed values. Every popup outcome — success AND failure — gets real prose, never a bare stat change with no line.

## Module patch submission format (for chats that never see the file)
1. **New code, self-contained**, with globally-unique prefixed names (check against the Architecture map and feature inventory for collisions).
2. **Wiring lines**, listed separately: `POOL.push(...)`, `ACT_GROUPS.push(...)`/`.splice(...)` with position, and any new `special: "x"` with its exact `doActivity` branch.
3. **State changes**, with BOTH the `newCharacter()` initializer and the `migrate()` backfill.
4. **Data dictionary usage** — confirm exact `COUNTRIES`/`SUBJECTS`/`ORIENTS` keys referenced.
5. **Anything not covered here** — flag it as an open question rather than guessing at a shape.

## Deployment targets (only when asked to "update/import to the zip")
- `a-life-app.zip` — PWA (Add to Home Screen). Rebuild via `npx esbuild --bundle --format=iife --global-name=LifeSimBundle --external:react --external:react-dom`, copy into `a-life-app/life-sim.bundle.js`, rezip.
- `a-life-android-project.zip` — Capacitor Android project + GitHub Actions workflow (`.github/workflows/build-apk.yml`) that compiles the APK on GitHub's servers (the sandbox can't reach Gradle's). Sync the same web assets into both `www/` and `android/app/src/main/assets/public/`.
- App icon: circular mark only (crop text) → PWA `icon.png` (1024, 72% fill) + full Android mipmap set (5 densities × legacy square/round + adaptive foreground within the 66% safe zone + background XML) via Pillow.
- Always verify the rebuilt bundle actually **mounts** (jsdom + react-dom/client, stub `window.storage`) before repackaging — not just that esbuild compiled it.

## Backlog (raised, not yet built)
Assets (car, investing, self-employment), richer partner personalities beyond the current trait set, fuller pets, immigration as an adult, war/conscription events, economic events (recession — note `HRE_SHOCKS` and `HRE_ECONOMIC_WORLD_EVENT_YEARS` already exist and should be the source), memories/year-in-review recap, achievements list, notoriety UI surface (stat exists, invisible). **Housing is no longer backlog — see `HRE-STATUS.md`.**
