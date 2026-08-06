# Working in this repo

`life-sim.jsx` is **1.18 MB across 16,695 lines**, and the deployed bundle is **857 KB**.
Neither fits in a context window, and neither ever needs to. This file records how to work
here without paying for that, plus the project-specific traps that have already cost time.

---

## 1 · Never read a large file whole

`tools/ctx.py` streams line by line — **11.7 MB resident regardless of file size**, measured on
a 137 MB / 1.4M-line file, against 280 MB for a naive `open().read()` of the same file. It scales
to GB (~1.8 s/GB); there is deliberately no "load it all" path in it.

```sh
python3 tools/ctx.py stat    life-sim.jsx                 # size, lines, longest line
python3 tools/ctx.py outline life-sim.jsx --max 400       # section + symbol map (1024 entries)
python3 tools/ctx.py sym     life-sim.jsx eduSetStage     # exact line span of a definition
python3 tools/ctx.py slice   life-sim.jsx 2956 2992       # just those lines
python3 tools/ctx.py between life-sim.jsx "EDU · S07" "const EDU_GROUP"
python3 tools/ctx.py find    life-sim.jsx "hreSetTenure" -C 2 -m 10
```

**The workflow that works:** `outline` to find the region → `sym` or `between` to get its exact
bounds → `slice` to read only that. Three cheap calls instead of one impossible one.

Every command caps its output and states what it withheld, so a careless query costs a few
hundred bytes rather than a megabyte.

## 2 · Oversized tool results

GitHub MCP responses in this repo have overflowed the tool-result limit **six times in one
session**, growing 134 KB → 330 KB as workflow history accumulates. `per_page: 1` does **not**
help — that server ignores it and still returned 27 runs in 330 KB.

Do not re-run the call hoping for a smaller answer. The harness already wrote the payload to
disk; project the answer out of it:

```sh
python3 tools/ctx.py overflow '.workflow_runs[0] | "\(.head_sha[0:8]) \(.conclusion)"'
```

Measured: **330,558 bytes → 175 bytes**, and the 175 bytes are the actual answer.

For any large JSON on disk, `ctx.py json FILE 'jq-filter'` does the same thing. jq is C and
streams, so this is safe well past memory.

## 3 · Getting content FROM GitHub

**The REST API is blocked in this environment.** Direct calls to `api.github.com` are
intercepted and refused with an Anthropic-issued 403:

> `{"message":"GitHub access is not enabled for this session. An org admin must connect the
> Claude GitHub App for this organization."}`

`GITHUB_TOKEN` is present but unusable for REST here. That is a policy block, not a code
problem — the remedy is an org admin enabling the Claude GitHub App at
<https://claude.ai/admin-settings>. Until then, MCP tools are the only REST path, and they are
the thing that overflows (§2).

**Use git instead — it is better for large repos regardless.** `tools/ghfetch.sh` wraps it:

```sh
tools/ghfetch.sh repo logostona/A-Life-v0.44          # blobless clone: 240 KB for 40 commits
tools/ghfetch.sh ls   logostona/A-Life-v0.44          # every path + size, NO blob downloaded
tools/ghfetch.sh size logostona/A-Life-v0.44 life-sim.jsx
tools/ghfetch.sh read logostona/A-Life-v0.44 life-sim.jsx    # fetch + outline, bounded
tools/ghfetch.sh grep logostona/A-Life-v0.44 "eduProjectToLegacy"
tools/ghfetch.sh log  logostona/A-Life-v0.44 5
```

Why this scales: `--filter=blob:none` fetches history *without file contents*, `--no-checkout`
writes no working tree, and blobs arrive lazily one at a time. **The cost of accessing a GB
repo is the cost of the files you actually read, not the repo.** Measured here: clone + list +
size + fetching the 1.18 MB source + a tree-wide grep + log came to **2.8 MB of disk total**,
with every output bounded.

`ls` and `size` read sizes straight from tree objects, so you can survey a huge repository
having downloaded no file contents at all.

## 4 · Build, test, deploy

**Pages serves the repo root from `main` with no CI step — the committed
`life-sim.bundle.js` IS the live site.** Rebuilding is manual and `build.sh` is the whole of it.

```sh
./build.sh                                  # flags in the script are all load-bearing
node test-deploy.js                         # tests the ARTIFACT, not the source
node -e 'require("./harness.js")'           # see the trap below
```

**`esbuild` compiling is not the same as the module loading.** A `const` referenced above its
declaration compiles cleanly and dies at load — that is how `ACT_GROUPS.push(EDU_GROUP)` took
the whole file down in P6. Always run the harness import as part of a build check.

Before deploying, bump `CACHE_NAME` in `sw.js`. It is cache-first and its `activate` handler
deletes only caches whose name *differs*, so shipping without renaming leaves every installed
PWA on the old bundle for an extra launch. Currently `a-life-cache-v8`.

### Adding to the Health subsystem (HLT)

Eleven subtabs, five content tables, one state blob. Everything is a registry, so the common
changes are data rather than code:

- **a new illness / vaccine / addiction / disability / allergy** → a row in the matching
  `HLT_*` table, or `hltRegister(kind, id, def)` at runtime for generated content;
- **a new subtab** → a row in `HLT_TABS` plus a renderer in `HLT_SUBPANELS`. `HealthPanel`
  itself never changes;
- **a new health field** → `hltInit` *and* the repair pass in `hltMigrate`, same patch.

`hltExport(s)` is the LLM seam: the whole record as plain JSON with stable ids. There is no
network call anywhere in the subsystem and there should not be — the game is an offline PWA.

Two things that are easy to get wrong and were:

- **Per-step probabilities compound over ~4,000 weeks of life.** A rate that looks tiny becomes
  near-certain by eighty. The first cut gave 12 lives out of 12 an alcohol problem. Each
  substance now carries a `lifetime` figure and the per-step rate is *derived* from it across
  `HLT_ONSET_WEEKS` — change the age weights and that constant must be recomputed with them.
- **Risk multipliers must be capped.** Four stacked factors reached 6×, which took alcohol from
  a 20% lifetime rate to 32%. Capped at 3×.

### Merging to `main` is not the same as the site updating

There is no workflow file in this repo — `.github/workflows` does not exist. Publishing is
GitHub's auto-generated **`pages build and deployment`** run (`event: dynamic`), and it is a
separate thing that can fail on its own after a perfectly good merge.

**A healthy run finishes in about 30 seconds.** That is the number to judge against: measured
across this repo's history, every successful run completed within ~30 s of being created.
Anything still queued after a couple of minutes is not "slow", it is stuck.

The wedged state looks like this, and none of it is fixable from the repo side:

```sh
python3 tools/ctx.py overflow '.workflow_runs[0] | "\(.head_sha[0:8]) \(.status)/\(.conclusion) \(.updated_at)"'
```

- run sits at `queued`/`pending` with `updated_at` frozen, then flips to `cancelled` on its own
  with **nothing having superseded it**;
- `list_workflow_jobs` returns `total_count: 0` — the run exists but never made a job;
- `rerun_workflow_run` returns 201 and changes nothing, and a follow-up cancel then fails with
  `409 Cannot cancel a workflow re-run that has not yet queued`.

**The recovery is a new commit on `main`** — that mints a fresh run id and check suite instead
of fighting the stuck one. Rerunning the same run does not work.

Two things that make diagnosis harder here, so do not burn time on them:

- **The live site is unreachable from this environment.** `logostona.github.io` is refused by
  the agent proxy (`CONNECT tunnel failed, response 403`), via both `curl` and `WebFetch`, as is
  `githubstatus.com`. So "did the site actually update" cannot be answered directly — the
  closest available check is reading the artifact out of `origin/main`, which is what Pages
  publishes but is one step short of end to end.
- **Ordinary supersession also shows as `cancelled`.** Pushing twice in quick succession
  cancels the first run, which is normal and harmless. Distinguish by timing: a superseded run
  is cancelled within seconds of the next push, a wedged one is cancelled minutes later with no
  newer run to blame. Batch a follow-up commit into the same PR rather than pushing again a
  minute later.

## 5 · Test suites

```sh
for t in test-edu-s01 test-edu-s02 test-edu-s09 test-edu-s04-s05 test-edu-s03-s06 \
         test-edu-s07 test-edu-s12 test-edu-s08 test-identity test-integration \
         test-render test-deploy test-hre-s11 test-hre-s10 test-hre-s06 \
         test-hre-s08b test-hre-phase7-gate test-hre-s09 test-realism test-health; do
  printf "%-24s " "$t"; node --max-old-space-size=4096 $t.js 2>&1 | grep -oE "[0-9]+ passed, [0-9]+ failed" | tail -1
done
```

**1801 assertions.** `test-hre-s09.js` fails 8 of 87 — a stale pre-Phase-7 fixture that predates
current work. That is the known baseline, not a regression.

`edu-sample-review.js` is **not a test**: it renders generated institutions as prose for a human
to read, asserts nothing, and cannot fail. It has caught three absurdities that were green on
every assertion. Run it after touching the generator.

**Read new content as prose before shipping it, whatever the assertions say.** Rendering the
scenes and menus added in the IQ/romantic/HRT patch turned up four things that were green on
every assertion: an aromantic character told to "sit with the mismatch", a grayromantic one
handed demiromantic's text, a sixteen-year-old starting pubertal induction told to expect the
risks first because of a trial of postmenopausal HRT, and Klinefelter — the commonest
indication for lifelong testosterone in medicine — offered nothing at all, because the code
read `repro` (a **fertility** field) as an endocrine one. Assertions check the shape you
thought to check. Prose shows you the one you didn't.

## 6 · Traps that have already cost time

**Lint slices must end at the next section banner.** Five suites have been mis-scoped by ending
at a function name, and two were passing *by luck*. The fifth ended at `function hrtMenu(state)`,
which lives **inside** its section rather than after it, so about half the block was never
linted at all and nobody could tell from the green tick. Sections are not in numeric order in
the file — S12 physically precedes S07 — so never assume order; use `ctx.py outline` to check.

**One name per `const`.** The harness export scanner matches column-0 declarations with a
single-capture regex, so `const A = 1, B = 2;` exports `A` and silently drops `B` — and a suite
then asserts on `undefined` and passes. Three lines shipped this way: `IQ_SD`, then
`A12`/`A25`/`A40` and `PAPER`/`CARD`, all found only because the grep was re-run later. Run it
after any patch that adds top-level declarations, and do not trust one clean result as proof
the file is clean — verify a name is actually exported before asserting on it:

```sh
grep -nE '^(const|let|var)\s+\w+\s*=[^;]*,\s*\w+\s*=' life-sim.jsx
node -e 'const M=require("./harness.js").M; console.log(M.YOUR_SYMBOL !== undefined)'
```

**A lint that reads prose flags the sentence forbidding the thing as the thing.** Strip comments
before scanning, and slice from the `/*` that *opens* a banner, not from the banner text inside
it, or the block is unterminated and the stripper cannot match it.

**Gotcha #2 — menu builders must not mutate.** They are handed a clone that gets discarded, so a
write there is silent data loss with nothing to report it. Builders return; options mutate in
`fx.run`.

**Gotcha #6 — never assert on step counts.** A green 33,600-step run once had nobody aging a
day. Assert observable outcomes.

**Gotcha #4 — a new state field lands with its `newCharacter()` initializer and its `migrate()`
backfill in the same patch.** This is the most frequently repeated bug in the project's history.

**Never add a `Math.random()` call to `newCharacter()`.** Every seeded suite depends on the
ORDER of the draws it makes, so one extra call silently rebuilds every fixture in the repo.
Nothing fails — the assertions just quietly stop existing. `s.hlt`'s initializer did this and
`test-edu-s07` dropped from 87 assertions to 75 with a green tick, because its character no
longer matched the same POOL conditions. Derive new seeds from a value already drawn
(`hreHash("hlt:" + s.hre.seed + …)`) and assign after the object literal.

**A suite reporting FEWER assertions than last time is a regression**, even when all of them
pass. Compare counts, not just pass/fail: `git stash && node test-x.js; git stash pop`.

**`advance()` halts the moment anything sets `s.pending`.** A test that advances 1500 days and
expects a scheduled thing to happen proves nothing. Drive the scheduled block directly.

## 7 · Open questions with other modules

Both carry a specific ask; neither blocks anything shipped.

- **OQ-6 → module 09.** Does `s.career.job` accept an `eduOverlay` key naming a training track,
  so EDU can advance residency/postdoc progress without owning employment? Until answered, S11
  ships inert — writing an EDU-side employer and salary would be the duplication the
  architecture exists to prevent.
- **OQ-7 → module 13.** `hreLegacyTenure` needs a boarding representation before EDU can call
  `hreSetTenure`. Measured: writing `institutional` put HRE's two authorities out of step for a
  character's entire schooling, and the integration suite passed anyway because its lives never
  reached a boarding school.

## 8 · Provisional data

Every EDU band ships `provisional: true`. **None of the dates or rates are sourced** — they are
shaped to be the right *kind* of curve so the resolver could be built and tested. Module 22
tranche 2 owns the real ones.

Suites therefore assert **orderings, never values**. An assertion pinning `tertiaryAccess ===
0.45` would have to be rewritten by the very patch that makes it correct.
