#!/usr/bin/env bash
# ghfetch.sh — get GitHub content at MB/GB scale without a context window.
#
# WHY NOT THE REST API
# Direct calls to api.github.com are intercepted in this environment and
# refused with an Anthropic-issued 403:
#
#   {"message":"GitHub access is not enabled for this session.
#     An org admin must connect the Claude GitHub App for this organization."}
#
# That is a policy block, not a code problem: GITHUB_TOKEN is present but
# unusable for REST here. Remedy, if you want the REST path: an org admin
# enables the Claude GitHub App at https://claude.ai/admin-settings.
#
# WHAT WORKS INSTEAD, AND IS BETTER ANYWAY
# git. Pushes and fetches succeed through the proxy's git injection, and for
# large repositories git beats REST regardless:
#
#   · --filter=blob:none downloads history WITHOUT file contents.
#     Measured on this repo: 236 KB of .git for 40 commits of a
#     multi-megabyte tree.
#   · --no-checkout means no working tree, so nothing is written to disk
#     until you name a file.
#   · blobs are then fetched lazily, one at a time, on demand.
#
# So the cost of "access a GB repo" is the cost of the files you actually
# read — not the repo. Reading is then handed to ctx.py, which streams and
# bounds its own output.
#
# USAGE
#   ghfetch.sh repo   OWNER/REPO [REF]        blobless clone into the cache
#   ghfetch.sh ls     OWNER/REPO [REF]        list tracked paths + sizes, no download
#   ghfetch.sh size   OWNER/REPO PATH [REF]   byte size of one file, no download
#   ghfetch.sh file   OWNER/REPO PATH [REF]   fetch one blob to disk, print where
#   ghfetch.sh read   OWNER/REPO PATH [REF]   fetch + outline it via ctx.py
#   ghfetch.sh grep   OWNER/REPO PATTERN [REF]  search the tree, bounded
#   ghfetch.sh log    OWNER/REPO [N]          bounded commit log
#
# Everything prints a bounded answer. Nothing prints a file.
set -euo pipefail

CACHE="${GHFETCH_CACHE:-${TMPDIR:-/tmp}/ghfetch}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CTX="$HERE/ctx.py"
MAX="${GHFETCH_MAX:-80}"

die() { echo "ghfetch: $*" >&2; exit 1; }

slug_dir() { echo "$CACHE/$(echo "$1" | tr '/' '__')"; }

ensure_repo() {
  local slug="$1" dir; dir="$(slug_dir "$slug")"
  if [ ! -d "$dir/.git" ]; then
    mkdir -p "$(dirname "$dir")"
    echo "# cloning $slug (blobless, no checkout)…" >&2
    git clone --filter=blob:none --no-checkout -q \
      "https://github.com/$slug" "$dir" >&2 \
      || die "clone failed for $slug — check the name, or that the repo is in this session's scope"
  fi
  echo "$dir"
}

resolve_ref() {
  local dir="$1" ref="${2:-}"
  if [ -z "$ref" ]; then git -C "$dir" symbolic-ref --short HEAD 2>/dev/null || echo HEAD
  else echo "$ref"; fi
}

cmd_repo() {
  local dir; dir="$(ensure_repo "$1")"
  local ref; ref="$(resolve_ref "$dir" "${2:-}")"
  git -C "$dir" fetch -q --filter=blob:none origin 2>/dev/null || true
  echo "repo     $1"
  echo "cache    $dir"
  echo "git size $(du -sh "$dir/.git" | cut -f1)   (history only — blobs are fetched on demand)"
  echo "commits  $(git -C "$dir" rev-list --count "$ref" 2>/dev/null || echo '?')"
  echo "ref      $ref"
}

cmd_ls() {
  local dir; dir="$(ensure_repo "$1")"
  local ref; ref="$(resolve_ref "$dir" "${2:-}")"
  # -l gives sizes straight from the tree objects: no blob download at all
  git -C "$dir" ls-tree -r -l "$ref" \
    | awk '{printf "%12s  %s\n", $4, $5}' \
    | sort -rn \
    | head -"$MAX"
  local n; n="$(git -C "$dir" ls-tree -r "$ref" | wc -l)"
  echo "--- $n tracked path(s); showing the $MAX largest. No file contents were downloaded."
}

cmd_size() {
  local dir; dir="$(ensure_repo "$1")"
  local path="$2"; local ref; ref="$(resolve_ref "$dir" "${3:-}")"
  local bytes; bytes="$(git -C "$dir" cat-file -s "$ref:$path" 2>/dev/null)" \
    || die "no such path at $ref: $path"
  echo "$path  $bytes bytes  ($(awk -v b="$bytes" 'BEGIN{printf "%.2f", b/1048576}') MB)"
}

cmd_file() {
  local dir; dir="$(ensure_repo "$1")"
  local path="$2"; local ref; ref="$(resolve_ref "$dir" "${3:-}")"
  local out="$dir/.ghfetch-out/$(echo "$path" | tr '/' '__')"
  mkdir -p "$(dirname "$out")"
  # streams the blob straight to disk; it never passes through a shell variable
  git -C "$dir" cat-file -p "$ref:$path" > "$out" 2>/dev/null \
    || die "no such path at $ref: $path"
  echo "$out"
  echo "# $(wc -c < "$out") bytes on disk. Read it with:" >&2
  echo "#   python3 $CTX outline $out" >&2
  echo "#   python3 $CTX find    $out 'pattern'" >&2
}

cmd_read() {
  local out; out="$(cmd_file "$@" 2>/dev/null | head -1)"
  [ -n "$out" ] || die "fetch failed"
  python3 "$CTX" stat "$out"
  echo
  python3 "$CTX" outline "$out" --max "$MAX"
}

cmd_grep() {
  local dir; dir="$(ensure_repo "$1")"
  local pat="$2"; local ref; ref="$(resolve_ref "$dir" "${3:-}")"
  # git grep against a ref fetches only the blobs it must, and prints matches
  git -C "$dir" grep -n -I --max-count=3 -e "$pat" "$ref" 2>/dev/null \
    | head -"$MAX" || true
  echo "--- bounded to $MAX lines, 3 matches per file. Raise with GHFETCH_MAX."
}

cmd_log() {
  local dir; dir="$(ensure_repo "$1")"
  local n="${2:-20}"
  git -C "$dir" log --oneline -n "$n" --no-decorate
  echo "--- $n most recent commit(s)"
}

[ $# -ge 1 ] || { sed -n '1,40p' "${BASH_SOURCE[0]}" | sed 's|^# \{0,1\}||'; exit 1; }
sub="$1"; shift
case "$sub" in
  repo) [ $# -ge 1 ] || die "repo OWNER/REPO [REF]";        cmd_repo "$@" ;;
  ls)   [ $# -ge 1 ] || die "ls OWNER/REPO [REF]";          cmd_ls   "$@" ;;
  size) [ $# -ge 2 ] || die "size OWNER/REPO PATH [REF]";   cmd_size "$@" ;;
  file) [ $# -ge 2 ] || die "file OWNER/REPO PATH [REF]";   cmd_file "$@" ;;
  read) [ $# -ge 2 ] || die "read OWNER/REPO PATH [REF]";   cmd_read "$@" ;;
  grep) [ $# -ge 2 ] || die "grep OWNER/REPO PATTERN [REF]"; cmd_grep "$@" ;;
  log)  [ $# -ge 1 ] || die "log OWNER/REPO [N]";           cmd_log  "$@" ;;
  *)    die "unknown subcommand: $sub" ;;
esac
