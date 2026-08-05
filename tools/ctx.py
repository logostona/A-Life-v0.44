#!/usr/bin/env python3
"""ctx.py — read large files without putting them in a context window.

WHY THIS EXISTS
This repo's main source is 1.18 MB across 16,695 lines. No agent or reviewer
can hold that, and neither can any editor's "read the file" affordance. Worse,
GitHub API responses in this project have overflowed the tool-result limit six
times in one session, growing 134 KB -> 330 KB as workflow history accumulates
— and `per_page: 1` did not shrink them, because that server ignores the
parameter. Asking for less is not a fix; the payload has to never arrive.

THE RULE THIS TOOL ENFORCES
  The data stays on disk. Only a bounded ANSWER is printed.

Every command caps its own output and says what it truncated, so a careless
invocation costs a few hundred bytes instead of a megabyte.

SCALING
  outline / slice / between / find / sym / stat  stream line by line.
  Memory is O(one line), so these work on GB files.
  json  shells out to jq, which is C and streams. Also GB-safe.
There is deliberately no "load the whole thing" path anywhere.

USAGE
  ctx.py outline FILE [--kind js|md|auto]     section + symbol map with line numbers
  ctx.py slice   FILE START END               lines START..END inclusive
  ctx.py between FILE MARKER1 [MARKER2]       lines between two literal markers
  ctx.py find    FILE PATTERN [-C n] [-m n]   regex search, bounded
  ctx.py sym     FILE NAME                    locate a definition and its extent
  ctx.py stat    FILE                         size, lines, longest line, top-level count
  ctx.py json    FILE FILTER [-m n]           jq filter, bounded output
  ctx.py overflow [FILTER]                    project the newest oversized tool result

  Global: --max N   hard cap on printed lines (default 120)
"""

import argparse
import os
import re
import shutil
import subprocess
import sys

DEFAULT_MAX = 120
CHUNK_NOTE = "… truncated: {n} more line(s). Narrow the query or raise --max."


def _emit(lines, cap):
    """Print at most `cap` lines and say plainly what was withheld."""
    shown = 0
    for ln in lines:
        if shown >= cap:
            break
        print(ln.rstrip("\n"))
        shown += 1
    rest = 0
    for _ in lines[shown:]:
        rest += 1
    if rest:
        print(CHUNK_NOTE.format(n=rest))
    return shown


def _stream(path):
    """Yield (lineno, text). One line resident at a time — this is what makes
    the tool safe on a file larger than memory."""
    with open(path, "r", encoding="utf-8", errors="replace") as fh:
        for i, line in enumerate(fh, 1):
            yield i, line


# ── outline ────────────────────────────────────────────────────────────────
# Banner comments and top-level definitions are the cheapest useful map of a
# large source file: a few dozen lines that tell you where to slice next.
JS_PATTERNS = [
    (re.compile(r"^\s*/\*\s*[═=─-]{3,}\s*(.+?)\s*[═=─-]{3,}"), "section"),
    (re.compile(r"^\s*/\*\s*(?:[═=─-]*\s*)?([A-Z][A-Za-z0-9 ·+&/-]{4,60})\s*$"), "banner"),
    (re.compile(r"^(?:export\s+)?function\s+([A-Za-z_$][\w$]*)"), "fn"),
    (re.compile(r"^(?:export\s+)?const\s+([A-Z][A-Z0-9_]{2,})\s*="), "const"),
    (re.compile(r"^(?:export\s+)?class\s+([A-Za-z_$][\w$]*)"), "class"),
]
MD_PATTERNS = [(re.compile(r"^(#{1,4})\s+(.*)$"), "heading")]


def cmd_outline(args):
    kind = args.kind
    if kind == "auto":
        kind = "md" if args.file.lower().endswith((".md", ".markdown")) else "js"
    pats = MD_PATTERNS if kind == "md" else JS_PATTERNS
    out = []
    for no, text in _stream(args.file):
        for rx, label in pats:
            m = rx.match(text)
            if not m:
                continue
            if kind == "md":
                depth = len(m.group(1))
                out.append("%6d  %s%s" % (no, "  " * (depth - 1), m.group(2).strip()))
            else:
                name = m.group(1).strip()
                marker = "██" if label in ("section", "banner") else "  "
                out.append("%6d  %s %-8s %s" % (no, marker, label, name))
            break
    if not out:
        print("(no sections or symbols matched — try --kind md, or use `find`)")
        return 0
    _emit(out, args.max)
    print("--- %d entr%s in %s" % (len(out), "y" if len(out) == 1 else "ies", args.file))
    return 0


# ── slice / between ────────────────────────────────────────────────────────
def cmd_slice(args):
    start, end = args.start, args.end
    if start < 1:
        start = 1
    if end < start:
        print("end must be >= start", file=sys.stderr)
        return 2
    shown = 0
    for no, text in _stream(args.file):
        if no > end:
            break
        if no < start:
            continue
        if shown >= args.max:
            print(CHUNK_NOTE.format(n=(end - no + 1)))
            break
        print("%6d\t%s" % (no, text.rstrip("\n")))
        shown += 1
    return 0


def cmd_between(args):
    """Lines between two literal markers. The workhorse for section-scoped
    reading — and for the lint slices in this repo's suites, which have been
    mis-scoped four times by ending at a marker that moved."""
    start_no = end_no = None
    for no, text in _stream(args.file):
        if start_no is None:
            if args.marker1 in text:
                start_no = no
            continue
        if args.marker2 and args.marker2 in text:
            end_no = no
            break
    if start_no is None:
        print("marker1 not found: %r" % args.marker1, file=sys.stderr)
        return 1
    if args.marker2 and end_no is None:
        print("marker2 %r not found after line %d — section runs to EOF"
              % (args.marker2, start_no), file=sys.stderr)
    lo, hi = start_no, (end_no if end_no else 10 ** 12)
    if args.count_only:
        n = 0
        for no, _ in _stream(args.file):
            if lo <= no <= hi:
                n += 1
        print("%s:%d-%s  (%d lines)" % (args.file, lo, end_no or "EOF", n))
        return 0
    ns = argparse.Namespace(file=args.file, start=lo,
                            end=(end_no if end_no else 10 ** 12), max=args.max)
    return cmd_slice(ns)


# ── find ───────────────────────────────────────────────────────────────────
def cmd_find(args):
    try:
        rx = re.compile(args.pattern)
    except re.error as e:
        print("bad regex: %s" % e, file=sys.stderr)
        return 2
    ctx = args.context
    ring, hits, printed, suppressed = [], 0, 0, 0
    pending = 0
    for no, text in _stream(args.file):
        line = text.rstrip("\n")
        if rx.search(line):
            hits += 1
            if hits > args.matches:
                suppressed += 1
                continue
            for r_no, r_txt in ring:
                if printed < args.max:
                    print("%6d-\t%s" % (r_no, r_txt))
                    printed += 1
            ring = []
            if printed < args.max:
                print("%6d:\t%s" % (no, line))
                printed += 1
            pending = ctx
        elif pending:
            if printed < args.max:
                print("%6d-\t%s" % (no, line))
                printed += 1
            pending -= 1
            ring = []
        else:
            if ctx:
                ring.append((no, line))
                if len(ring) > ctx:
                    ring.pop(0)
    tail = []
    if suppressed:
        tail.append("%d more match(es) suppressed (-m %d)" % (suppressed, args.matches))
    if printed >= args.max:
        tail.append("output capped at --max %d" % args.max)
    print("--- %d match(es)%s" % (hits, ("; " + "; ".join(tail)) if tail else ""))
    return 0


# ── sym ────────────────────────────────────────────────────────────────────
def cmd_sym(args):
    """Find a definition and report its extent by brace balance, so you can
    slice exactly the function rather than guessing a window."""
    name = re.escape(args.name)
    dfn = re.compile(r"^(?:export\s+)?(?:async\s+)?(?:function\s+%s\b|const\s+%s\s*=|class\s+%s\b|let\s+%s\s*=)"
                     % (name, name, name, name))
    start = None
    depth = 0
    started = False
    for no, text in _stream(args.file):
        if start is None:
            if dfn.match(text):
                start = no
            else:
                continue
        depth += text.count("{") - text.count("}")
        if "{" in text:
            started = True
        if started and depth <= 0:
            print("%s:%d-%d  (%d lines)" % (args.file, start, no, no - start + 1))
            print("  slice with: ctx.py slice %s %d %d" % (args.file, start, no))
            return 0
    if start is not None:
        print("%s:%d-EOF  (unterminated — check for a brace in a string)" % (args.file, start))
        return 0
    print("symbol not found: %s" % args.name, file=sys.stderr)
    return 1


# ── stat ───────────────────────────────────────────────────────────────────
def cmd_stat(args):
    size = os.path.getsize(args.file)
    lines = 0
    longest = (0, 0)
    for no, text in _stream(args.file):
        lines = no
        n = len(text)
        if n > longest[1]:
            longest = (no, n)
    print("file       %s" % args.file)
    print("bytes      %d (%.2f MB)" % (size, size / 1048576.0))
    print("lines      %d" % lines)
    print("longest    line %d, %d chars" % longest)
    if longest[1] > 50000:
        print("  NOTE: a line this long defeats line-based reading. Use `json`")
        print("        for JSON, or `find` with a tight regex.")
    return 0


# ── json ───────────────────────────────────────────────────────────────────
def cmd_json(args):
    """Project fields out of a large JSON file with jq. jq is C and streams, so
    this is safe on payloads far past memory — and only the projection is
    printed, never the document."""
    if not shutil.which("jq"):
        print("jq not found; install it or use python with an explicit projection",
              file=sys.stderr)
        return 2
    try:
        p = subprocess.run(["jq", "-r", args.filter, args.file],
                           capture_output=True, text=True, timeout=args.timeout)
    except subprocess.TimeoutExpired:
        print("jq timed out after %ds" % args.timeout, file=sys.stderr)
        return 1
    if p.returncode != 0:
        print(p.stderr.strip()[:600], file=sys.stderr)
        return p.returncode
    out = p.stdout.splitlines()
    _emit(out, args.max)
    print("--- %d line(s) from %s" % (len(out), args.file))
    return 0


# ── overflow ───────────────────────────────────────────────────────────────
def cmd_overflow(args):
    """Find the newest tool-result dump the harness wrote when a response was
    too large, and project it. This exact recovery has been needed six times in
    one session; having it as a command removes the temptation to re-run the
    call that overflowed and hope for a smaller answer."""
    roots = [os.path.expanduser("~/.claude/projects")]
    newest, newest_t = None, -1
    for root in roots:
        for dirpath, _dirs, files in os.walk(root):
            if not dirpath.endswith("tool-results"):
                continue
            for f in files:
                fp = os.path.join(dirpath, f)
                try:
                    t = os.path.getmtime(fp)
                except OSError:
                    continue
                if t > newest_t:
                    newest, newest_t = fp, t
    if not newest:
        print("no tool-result dumps found", file=sys.stderr)
        return 1
    print("# %s (%d bytes)" % (newest, os.path.getsize(newest)))
    if not args.filter:
        print("# pass a jq filter to project it, e.g.")
        print("#   ctx.py overflow '.workflow_runs[] | .conclusion'")
        return 0
    ns = argparse.Namespace(file=newest, filter=args.filter, max=args.max, timeout=60)
    return cmd_json(ns)


def main():
    ap = argparse.ArgumentParser(
        prog="ctx.py", description="Read large files without loading them into a context window.")
    ap.add_argument("--max", type=int, default=None,
                    help="hard cap on printed lines (default %d); also accepted after the subcommand" % DEFAULT_MAX)
    sub = ap.add_subparsers(dest="cmd", required=True)

    def add(name):
        """Every subcommand takes --max too. Accepting it only before the
        subcommand is the kind of ergonomic trap that gets silently ignored:
        argparse writes the error to stderr, so a piped stdout looks simply
        empty and the caller concludes the file has no sections."""
        q = sub.add_parser(name)
        q.add_argument("--max", type=int, default=None,
                       help="cap on printed lines (overrides the global --max)")
        return q

    p = add("outline"); p.add_argument("file")
    p.add_argument("--kind", choices=["js", "md", "auto"], default="auto"); p.set_defaults(fn=cmd_outline)

    p = add("slice"); p.add_argument("file")
    p.add_argument("start", type=int); p.add_argument("end", type=int); p.set_defaults(fn=cmd_slice)

    p = add("between"); p.add_argument("file")
    p.add_argument("marker1"); p.add_argument("marker2", nargs="?")
    p.add_argument("--count-only", action="store_true"); p.set_defaults(fn=cmd_between)

    p = add("find"); p.add_argument("file"); p.add_argument("pattern")
    p.add_argument("-C", "--context", type=int, default=0)
    p.add_argument("-m", "--matches", type=int, default=40); p.set_defaults(fn=cmd_find)

    p = add("sym"); p.add_argument("file"); p.add_argument("name"); p.set_defaults(fn=cmd_sym)
    p = add("stat"); p.add_argument("file"); p.set_defaults(fn=cmd_stat)

    p = add("overflow"); p.add_argument("filter", nargs="?"); p.set_defaults(fn=cmd_overflow)

    p = add("json"); p.add_argument("file"); p.add_argument("filter")
    p.add_argument("--timeout", type=int, default=60); p.set_defaults(fn=cmd_json)

    args = ap.parse_args()
    # subcommand --max wins when given; otherwise inherit the global default
    if getattr(args, "max", None) is None:
        args.max = DEFAULT_MAX
    sys.exit(args.fn(args))


if __name__ == "__main__":
    main()
