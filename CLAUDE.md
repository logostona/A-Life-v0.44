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

## 3 · Build, test, deploy

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
PWA on the old bundle for an extra launch. Currently `a-life-cache-v6`.

## 4 · Test suites

```sh
for t in test-edu-s01 test-edu-s02 test-edu-s09 test-edu-s04-s05 test-edu-s03-s06 \
         test-edu-s07 test-edu-s12 test-edu-s08 test-identity test-integration \
         test-render test-deploy test-hre-s11 test-hre-s10 test-hre-s06 \
         test-hre-s08b test-hre-phase7-gate test-hre-s09; do
  printf "%-24s " "$t"; node --max-old-space-size=4096 $t.js 2>&1 | grep -oE "[0-9]+ passed, [0-9]+ failed" | tail -1
done
```

**1618 assertions.** `test-hre-s09.js` fails 8 of 87 — a stale pre-Phase-7 fixture that predates
current work. That is the known baseline, not a regression.

`edu-sample-review.js` is **not a test**: it renders generated institutions as prose for a human
to read, asserts nothing, and cannot fail. It has caught three absurdities that were green on
every assertion. Run it after touching the generator.

## 5 · Traps that have already cost time

**Lint slices must end at the next section banner.** Four suites have been mis-scoped by ending
at a function name that later moved, and two were passing *by luck*. Sections are not in
numeric order in the file — S12 physically precedes S07 — so never assume order; use
`ctx.py outline` to check.

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

**`advance()` halts the moment anything sets `s.pending`.** A test that advances 1500 days and
expects a scheduled thing to happen proves nothing. Drive the scheduled block directly.

## 6 · Open questions with other modules

Both carry a specific ask; neither blocks anything shipped.

- **OQ-6 → module 09.** Does `s.career.job` accept an `eduOverlay` key naming a training track,
  so EDU can advance residency/postdoc progress without owning employment? Until answered, S11
  ships inert — writing an EDU-side employer and salary would be the duplication the
  architecture exists to prevent.
- **OQ-7 → module 13.** `hreLegacyTenure` needs a boarding representation before EDU can call
  `hreSetTenure`. Measured: writing `institutional` put HRE's two authorities out of step for a
  character's entire schooling, and the integration suite passed anyway because its lives never
  reached a boarding school.

## 7 · Provisional data

Every EDU band ships `provisional: true`. **None of the dates or rates are sourced** — they are
shaped to be the right *kind* of curve so the resolver could be built and tested. Module 22
tranche 2 owns the real ones.

Suites therefore assert **orderings, never values**. An assertion pinning `tertiaryAccess ===
0.45` would have to be rewritten by the very patch that makes it correct.
