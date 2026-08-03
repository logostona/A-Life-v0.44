#!/usr/bin/env python3
"""Regenerate the standalone hre-*.js section files FROM life-sim.jsx.

WHY THIS EXISTS
The HRE sections were authored as standalone files and then spliced into
life-sim.jsx at Phase 5. That left two copies of the same code, and the HRE test
suites were reading the standalone ones — so a change made in life-sim.jsx would
have been invisible to its own tests, and a change made in the standalone file
would have been tested but never shipped. Exactly the duplicated-authority
failure the project rules forbid.

life-sim.jsx is now the ONLY authority. Run this before the HRE suites:

    python3 hre-extract.py && node test-hre-s02.js

It is idempotent and read-only with respect to life-sim.jsx.
"""
import re, sys, os

SRC = "/home/claude/life-sim.jsx"
OUT_DIR = "/home/claude"

# (output filename, banner text that opens the section)
SECTIONS = [
    ("hre-s01.js",      "HRE · S01 · DETERMINISTIC CORE"),
    ("hre-s03-s04.js",  "HRE · LAYER 2 · WORLD MODEL (S03 · S04)"),
    ("hre-s02.js",      "HRE · S02 · PROPERTY GENERATOR"),
    ("hre-calib.js",    "HRE · CALIBRATION CONSTANTS (B4 decision)"),
    ("hre-s05.js",      "HRE · S05 · MARKET INDEX & VALUATION"),
    ("hre-s09.js",      "HRE · S09 · STATE, TENURE & RESIDENCE MIGRATION"),
    ("hre-s06.js",      "HRE · S06 · MARKETPLACE, CHANNELS & LISTINGS"),
]
END_BANNER = "/* ═══════════════ ENGINE ═══════════════ */"


def main():
    src = open(SRC, encoding="utf-8").read()

    # locate each section's opening banner line
    starts = []
    for fname, banner in SECTIONS:
        hits = [m.start() for m in re.finditer(re.escape(banner), src)]
        if len(hits) != 1:
            sys.exit("ABORT: banner %r found %d times (expected 1). "
                     "More than one means life-sim.jsx was spliced twice."
                     % (banner, len(hits)))
        # rewind to the start of the /* ... */ comment that opens the section
        line_start = src.rfind("/*", 0, hits[0])
        starts.append((fname, line_start))

    end = src.find(END_BANNER)
    if end < 0:
        sys.exit("ABORT: ENGINE banner not found")
    if starts[0][1] > end:
        sys.exit("ABORT: HRE block is not before the ENGINE banner")

    bounds = [s[1] for s in starts] + [end]
    written = []
    for i, (fname, _) in enumerate(SECTIONS):
        body = src[bounds[i]:bounds[i + 1]].rstrip() + "\n"
        path = os.path.join(OUT_DIR, fname)
        old = open(path, encoding="utf-8").read() if os.path.exists(path) else None
        open(path, "w", encoding="utf-8").write(body)
        written.append((fname, len(body), "unchanged" if old == body else
                        ("CHANGED" if old is not None else "created")))

    total = sum(w[1] for w in written)
    for fname, n, status in written:
        print("  %-18s %7d B  %s" % (fname, n, status))
    print("extracted %d sections, %d bytes total, from %s" % (len(written), total, SRC))


if __name__ == "__main__":
    main()
