# A Life — UI Redesign: Planning & Documentation (v1)

Owner: **Module 16 — UI / UX**. Scope: everything in "Owns" for 16 (`UI`, `RelCard` render half, `Obituary`, `Creation` render half, `CAREER/UNIVERSITY PANEL`, `Game`, `App`, `INK/PAPER/CARD/DECADE_ACCENT`). No other module's engine functions, state shapes, or content are touched by this initiative — this is a re-skin and interaction-layer pass over the existing popup/`ACT_GROUPS`/`pending` contracts, not a rebuild of them.

Goal stated by the user: **"change the UI so it is more like BitLife. Use great design."** Reference materials supplied: (1) a BitLife screenshot, (2) a current screenshot of *A Life*, (3) the *A Life* game logo. This doc is step one — audit + design system + plan — before any component code is touched.

---

## 1. Current state audit (from the supplied *A Life* screenshot)

What's actually there today:
- **Theme**: light/cream background, black body text, blue accent for the active tab underline and the "3m"/"Live on" pills. Reads closer to a document or spreadsheet than a game.
- **Header**: name with a dropdown caret (no avatar), currency top-right in plain black, age/location line, a decade pill ("2000s") top-right, a "stats ▾" disclosure link below the name.
- **Navigation**: a plain text tab row (Life / People (2) / Career / Home / Health) with small icons, blue underline for the active tab. No persistent bottom nav — the primary actions are two buttons pinned above the OS nav bar: "🎯 Act" (outlined) and "Live on ⏳ 3m" (filled blue).
- **Feed**: a vertical timeline with small gray dots and a thin connecting rule on the left margin, date stamps in gray, event text in black, world-context entries boxed in a light gray rounded panel with a globe emoji.
- **Time-range control**: a row of pill toggles (1d/3d/1w/2w/1m/3m) for how far "Live on" advances.
- **No visible stat bars** in this view (they're behind the "stats ▾" disclosure) and no persistent avatar/portrait.

This is functional and information-dense, but it under-sells the game-ness of the moment-to-moment experience: no avatar, no color-coded stats, no tactile primary action, and the "chrome" doesn't differentiate itself from a generic settings screen.

## 2. Reference audit (BitLife screenshot — what to adopt, not copy verbatim)

What BitLife's screen is doing that reads as "designed" rather than "generated":
- **Persistent identity block**: circular avatar, underlined tappable name, nationality flag, one-line status/role with an emoji anchor, bank balance in a strong accent color, all in one glanceable header row.
- **Color-coded stat bars** (`Happiness/Health/Smarts/Looks`) pinned to the bottom of the screen at all times — always visible, not tucked behind a disclosure — each with an emoji, a fill color, and a percentage.
- **One unmistakable primary action**: a large circular button dead-center of the bottom nav (the "Age" advance), visually heavier than every other control, with a secondary "step back" affordance layered on it.
- **A row of category shortcuts either side of the primary action**, each a colored icon-in-circle plus a label underneath — not text tabs.
- **Dark theme** with saturated, confident color per element (not one accent reused everywhere) — School is orange, Assets is cyan, Relationships is cyan/pink-adjacent, etc.
- **The life feed itself is quiet** — plain text, age headers as the only strong typographic break — so the chrome around it is what carries the personality, not the feed.

The lesson isn't "make it black with a green plus button" — it's: *give the character a persistent, glanceable identity block; make stats always-visible and color-coded; give the primary action unmistakable visual weight; use color to distinguish categories instead of text alone.*

## 3. Brand foundation — the logo is the throughline, not an afterthought

The supplied logo — a circular badge in the trans pride flag's blue/pink/white, with a black compass-rose diamond and a white pivot dot at the center — is doing real conceptual work if we let it: **a compass, for a game about navigating a life.** That's the signature idea this redesign should be built around, not a BitLife re-skin with different brand colors slapped on top.

Concretely: the redesign should feel like *BitLife's clarity and tactility*, executed in *A Life's own palette and one genuinely original interaction* (§5, Signature). This also directly serves this project's actual subject matter — an LGBTQ+-focused sim — better than a generic dark-mode reskin would.

---

## 4. Design system — pass 1 (brainstorm)

**Color** (4-6 named hex values, all derived from the logo rather than invented):
| Name | Hex | Role |
|---|---|---|
| Dusk Ink | `#12131A` | base background — near-black navy, not pure black (pairs better with the logo's blue than true black does) |
| Card Slate | `#1E2029` | card/panel surfaces, one step up from Dusk Ink for layering |
| Compass Blue | `#5BCEFA` | primary interactive accent — links, active states, primary category color |
| Horizon Pink | `#F5A9B8` | secondary accent — warmth, relationships/romance, positive emotional beats |
| Paper White | `#F5F5F2` | primary text on dark surfaces, warmed off-white rather than pure white |
| Alert Coral | `#FF6B6B` | the one semantic-only color — danger, health-critical, arrest/death. Never used decoratively. |

**Type** (3 roles, each chosen because it maps to a content type that already exists in the file, not decoration):
- **Display/UI face** — a bold geometric sans (e.g. Space Grotesk / Manrope) for names, age headers, buttons, nav labels. Carries the "game chrome" personality.
- **Narrative body face** — a humanist serif (e.g. Newsreader / Lora) for feed prose only. The project's own writing conventions already call the feed text "literary/short-story register" — a serif for the *story* and a sans for the *interface* is a real content-driven pairing, not two fonts for their own sake.
- **Ledger/utility face** — a monospace (e.g. IBM Plex Mono) for money, percentages, dates, and STX/career numeric data. Reinforces "this is a simulated ledger of a life," and gives stat bars and the career panel a distinct rhythm from the prose.

**Layout concept**: single-column, mobile-first, dark surfaces with generous vertical rhythm between feed entries (closer to reading a page than scanning a table). Bottom sheet (`Sheet`, already owned by 16) stays the pattern for Act/menus — this is a re-skin of an existing, working interaction, not a new one.

**Signature**: the **Compass Advance** control (see §6) — replaces the plain "Live on ⏳" pill with a circular dial styled after the logo mark, where the needle sweeps proportionally to the chosen time-step and the tick marks around the rim *are* the 1d/3d/1w/2w/1m/3m selector, collapsing two separate controls (the pill row + the button) into one component.

## 5. Design system — pass 2 (self-critique, revised)

Checked against the brief before locking this in:

- *Risk*: "dark background + one bright accent" is explicitly called out as an AI-generated-design default. **Kept anyway**, because the brief itself asks for "more like BitLife," and BitLife's screen is dark with saturated per-category color — here the brief's own words override the generic-look caution. What keeps it from being the generic version: two accents from a specific source (the logo) rather than one arbitrary bright color, plus the serif/sans/mono split, which the generic version doesn't have.
- *Revised*: first pass had Compass Blue as the single "everything" accent (buttons, links, active tab, money). Split money/positive-stat semantics onto its own use of Compass Blue but moved relationship/romance content to Horizon Pink specifically, so the palette does two distinct jobs instead of one color meaning everything (a BitLife-style "category color" idea, scaled down to two hues instead of six, since inventing six arbitrary category colors not sourced from the logo would be decoration, not a choice).
- *Revised*: dropped an initial idea to reuse the serif for age headers in the feed — age headers are functionally UI (navigation anchors within the feed), not story content, so they take the Display/UI face, and only the event lines themselves get the serif. This is a small thing but keeps the "serif = story" rule from being broken for convenience.
- *Kept deliberately plain*: no gradients, no drop shadows beyond a 1px border on Card Slate panels, no decorative iconography beyond what's functionally needed (category icons, stat emoji already in the copy). The signature element (§4/§6) is where the one real risk is spent; everything else stays disciplined per the "spend your boldness in one place" principle.

---

## 6. Wireframes (ASCII, for the two highest-traffic screens)

**A. Header + stat bars (always visible, replaces the current "stats ▾" disclosure)**
```
┌─────────────────────────────────────────────┐
│ (●avatar)  Arabella Alonso  🇦🇷            │
│            University Student   ⌁ $276      │  ← name: Display face, underlined, tappable
├─────────────────────────────────────────────┤   $ in Compass Blue, mono face
│ 😆 Happiness ███████████████████████ 100%   │
│ ❤ Health    ██████████████░░░░░░░░░  63%   │  ← always visible, no disclosure
│ 💡 Smarts   ███████████████████████ 100%   │     bar fill: Compass Blue / Horizon Pink
│ ☀ Looks     ████████░░░░░░░░░░░░░░░  38%   │     alternating by stat, per §4 palette
└─────────────────────────────────────────────┘
```

**B. Feed + Compass Advance (the signature element, replaces the pill row + "Live on" button)**
```
┌─────────────────────────────────────────────┐
│  Age 21                          (Display)   │
│  My big sister, Fabiola, graduated…  (serif) │
│  My mother retired.                          │
│                                               │
│  ╭───────────────────────────────╮           │
│  │ 🌍 2004 — Massachusetts becomes│           │  ← world-context, Card Slate panel
│  │    the first US state with…    │           │
│  ╰───────────────────────────────╯           │
├─────────────────────────────────────────────┤
│        ⟨1d 3d 1w 2w [1m] 3m⟩                 │  ← tick marks ON the dial rim, not
│              ◒  ← compass needle             │     a separate pill row (see below)
│         (tap = advance; drag = pick step)     │
└─────────────────────────────────────────────┘
```
The compass dial is the one place this redesign takes a real interaction risk (per the design-principles guidance to spend boldness in one place): tapping advances by the currently-selected step (same underlying `advance(s, totalDays)` call as today — no engine change), and the needle animates a proportional sweep so the *amount* of time passing has a visible, consistent gesture instead of just a number changing. Dragging the needle to a tick re-selects the step size, replacing the separate pill row entirely. `🎯 Act` stays a distinct pill beside it, unchanged in function.

---

## 7. Component-by-component change list (mapped to Module 16's owned anchors)

| Owned anchor | Change |
|---|---|
| `INK/PAPER/CARD/DECADE_ACCENT` tokens | Add the §4 palette as new named tokens (`COMPASS_BLUE`, `HORIZON_PINK`, `CARD_SLATE`, `ALERT_CORAL`); redefine `INK`/`PAPER` for the dark theme; **keep `DECADE_ACCENT` as-is** — it already does era-based color work and should layer on top of, not be replaced by, the new palette. |
| `StatBar` | Restyle to always-render (remove any disclosure-gating in whatever currently hides it), color per-stat per §4, mono face for the percentage. |
| `Modal` / `ConfirmBox` / `Sheet` | Restyle surfaces to Card Slate + Paper White text; no shape/prop changes — `Sheet` keeps being the Act-menu mechanism, just re-skinned. |
| `smallBtn` | New visual variant only; no new props needed unless design review surfaces one. |
| `RelCard` (rendering half) | Avatar circle + Display-face name + mono-face stat chips; `known[]`-gated fields keep their existing reveal logic, just restyled. |
| `Obituary` | Card Slate panel, Display face for the epitaph, serif for the life-summary prose (it's narrative). |
| `Creation` (rendering half) | Same "Advanced" collapsible pattern stays (05 owns that data logic) — just re-themed to match; no new fields. |
| `CAREER/UNIVERSITY PANEL` (`MiniBar/panelCard/CareerPanel/HomePanel/HealthPanel`) | Mono face for salary/tenure/bar numbers, Card Slate surfaces, category color-coding consistent with the nav (§8). |
| `Game` (root) | New header block (avatar + always-visible stat bars, §6A) and the Compass Advance control (§6B) get mounted here; `{state, setState, onReset}` destructuring is untouched. |
| `App` | Theme provider / global tokens wiring only. |
| AI narration touchpoint (`pending.aiText \|\| pending.text`, module 15) | **Unchanged.** Still renders wherever popup body text renders today — the redesign restyles the popup container, not this fallback logic. |

No new `s.*` state fields are introduced by this pass — it's presentation-only, so **no `migrate()` changes are anticipated.** If a later phase adds a persisted UI preference (e.g. "reduced motion" for the compass needle), that gets flagged then, per Gotcha #4.

## 8. Category color mapping (bottom nav, BitLife-style)

Applying the "each category gets its own color" idea from the reference, sourced from existing `ACT_GROUPS` ids rather than inventing new categories:

| Group id | Suggested color |
|---|---|
| body / health | Alert Coral (semantic tie-in with health-critical states) |
| mind / school | Compass Blue |
| social / love / social_media | Horizon Pink |
| money / career | Compass Blue (ledger/mono pairing) |
| crime / prison / street | desaturated slate-gray (deliberately *not* a bright color — these are bad-place states, shouldn't look celebratory) |
| self / journey / home | Paper White outline (neutral/personal) |

This is a proposal for review, not a lock — it only touches how existing groups are *colored*, not their ids, items, or wiring.

---

## 9. Open questions (flagging rather than guessing, per project convention)

1. **Font loading**: the file is a single-file artifact with no build step for asset pipelines — need to confirm whether the target runtimes (claude.ai artifact, PWA, APK) can load web fonts via `@font-face`/CDN, or whether this needs to fall back to closest system-safe equivalents (e.g. `ui-sans-serif` stack instead of Space Grotesk) for the PWA/APK builds specifically, mirroring the constraint already flagged for module 15's AI calls being inert outside the artifact runtime.
2. **Existing light-theme dependents**: `test-render.js` (module 20) mounts and asserts on rendered output — need to confirm none of its 5 assertions depend on current light-theme colors/class names before restyling, or update them alongside.
3. **Decade accent interaction**: need to see the real `DECADE_ACCENT` values to confirm the new base palette has enough contrast headroom across all decades (1950s–2020s presumably shift hue/saturation) rather than just checking it against the 2000s example in the screenshots.
4. **App icon**: the logo mark should drive the actual PWA/Android icon per the existing deployment-target process (crop the circular mark, 72% fill, maskable-safe padding) — flagging so this happens in the same pass as the in-app compass motif, not as a separate later task.
5. **Motion/accessibility**: the Compass Advance needle sweep needs a reduced-motion fallback (instant snap instead of animated sweep) per the "respect reduced motion" quality floor — open question is whether that's a new `s.flags`/settings toggle (state change, needs migrate()) or purely a CSS `prefers-reduced-motion` media query (no state change needed). Leaning toward the latter unless told otherwise.

## 10. Phased rollout

1. **Phase 1 — tokens + chrome**: land the §4 palette/type tokens, restyle `Modal/ConfirmBox/Sheet/smallBtn`, header block with avatar + always-visible `StatBar`. Lowest risk, no interaction changes.
2. **Phase 2 — feed + panels**: serif narrative text, Card Slate world-context panels, `RelCard`/`Obituary`/Career-University panel restyle.
3. **Phase 3 — the Compass Advance signature element**: the one genuinely new interaction; build and test in isolation (jsdom mount, drag/tap behavior) before wiring into `Game`, since it's replacing two existing controls (time-step pills + Live-on button) with one.
4. **Phase 4 — nav category colors + polish pass**: §8 color mapping, self-critique screenshot review, contrast/motion accessibility check.

Each phase ends with the standard build & test loop (esbuild check → jsdom mount via `test-render.js` → screenshot self-critique) before moving to the next, per the project's own build discipline.
