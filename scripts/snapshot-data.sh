#!/usr/bin/env bash
# Snapshot + restore Marinara-Engine chat state.
#
# Snapshots only the files that hold real state (SQLite DB, encryption key,
# user-uploaded media). Skips the ~9.5GB of reproducible junk: sidecar-runtime,
# downloaded models, fonts, knowledge-sources.
#
# Snapshots live OUTSIDE the project. Default: ~/marinara-snapshots/
# Override via: MARINARA_SNAPSHOT_DIR=/some/other/path ./scripts/snapshot-data.sh snap
#
# Usage:
#   ./scripts/snapshot-data.sh snap [label]          # create snapshot
#   ./scripts/snapshot-data.sh list                  # list snapshots
#   ./scripts/snapshot-data.sh restore <name>        # restore (safe — takes prerestore snapshot)
#   ./scripts/snapshot-data.sh restore-latest        # restore the most recent user snapshot
#   ./scripts/snapshot-data.sh prune [keep-count]    # delete all but N most recent (default 10)
#   ./scripts/snapshot-data.sh help                  # show this

set -euo pipefail

# ── Configuration ────────────────────────────────────────────────────────
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="$REPO_ROOT/packages/server/data"
SNAPSHOT_DIR="${MARINARA_SNAPSHOT_DIR:-$HOME/marinara-snapshots}"

# What to include (relative to DATA_DIR). Everything NOT in this list is skipped.
INCLUDE_PATHS=(
  "marinara-engine.db"
  "marinara-engine.db-wal"
  "marinara-engine.db-shm"
  ".encryption-key"
  "avatars/"
  "backgrounds/"
  "gallery/"
  "sprites/"
  "game-assets/"
)

# ── Helpers ──────────────────────────────────────────────────────────────
die()  { echo "❌ $*" >&2; exit 1; }
info() { echo "→ $*"; }
ok()   { echo "✅ $*"; }

ensure_data_dir() {
  [[ -d "$DATA_DIR" ]] || die "Data dir not found: $DATA_DIR"
}

ensure_snapshot_root() {
  mkdir -p "$SNAPSHOT_DIR"
}

timestamp() {
  date +"%Y%m%d-%H%M%S"
}

# ── Commands ─────────────────────────────────────────────────────────────

cmd_snap() {
  local label="${1:-}"
  ensure_data_dir
  ensure_snapshot_root

  local name="marinara-$(timestamp)"
  [[ -n "$label" ]] && name+="-${label//[^a-zA-Z0-9-]/-}"
  local dest="$SNAPSHOT_DIR/$name"

  info "Snapshotting to: $dest"
  mkdir -p "$dest"

  local copied=0
  for path in "${INCLUDE_PATHS[@]}"; do
    local src="$DATA_DIR/$path"
    if [[ -e "$src" ]]; then
      # rsync -a preserves timestamps/perms; --relative keeps directory structure
      rsync -a "$src" "$dest/$path" 2>/dev/null || true
      copied=$((copied + 1))
    fi
  done

  local size
  size=$(du -sh "$dest" | cut -f1)
  ok "Snapshot created ($copied entries, $size): $name"
}

cmd_list() {
  ensure_snapshot_root
  if [[ -z "$(ls -A "$SNAPSHOT_DIR" 2>/dev/null)" ]]; then
    echo "(no snapshots in $SNAPSHOT_DIR)"
    return
  fi
  echo "Snapshots in $SNAPSHOT_DIR:"
  echo ""
  # Show newest first, with size + readable timestamp
  (cd "$SNAPSHOT_DIR" && ls -1dt marinara-* 2>/dev/null) | while read -r name; do
    local size
    size=$(du -sh "$SNAPSHOT_DIR/$name" 2>/dev/null | cut -f1)
    printf "  %-6s  %s\n" "$size" "$name"
  done
}

cmd_restore() {
  local name="${1:-}"
  [[ -n "$name" ]] || die "Usage: restore <snapshot-name>  (use 'list' to see options)"

  local src="$SNAPSHOT_DIR/$name"
  [[ -d "$src" ]] || die "Snapshot not found: $src"

  ensure_data_dir

  # Warn if server appears to be running (WAL being actively written)
  local wal="$DATA_DIR/marinara-engine.db-wal"
  if [[ -f "$wal" ]] && lsof "$wal" >/dev/null 2>&1; then
    echo "⚠️  The server appears to be running (db-wal is locked)."
    echo "   Restore can produce an inconsistent state. Stop the server first."
    read -r -p "   Continue anyway? (y/N) " answer
    [[ "$answer" == "y" || "$answer" == "Y" ]] || die "Aborted."
  fi

  echo ""
  echo "About to overwrite current state in: $DATA_DIR"
  echo "With snapshot:                       $src"
  read -r -p "Proceed? (y/N) " answer
  [[ "$answer" == "y" || "$answer" == "Y" ]] || die "Aborted."

  # Safety net: take a snapshot of current state first
  info "Taking prerestore safety snapshot of current state..."
  cmd_snap "prerestore"

  info "Restoring..."
  for path in "${INCLUDE_PATHS[@]}"; do
    local target="$DATA_DIR/$path"
    local source="$src/$path"
    if [[ -e "$source" ]]; then
      # For directories, wipe the target first so deletes in the snapshot propagate
      if [[ -d "$source" ]]; then
        rm -rf "$target"
      fi
      rsync -a --delete "$source" "$target" 2>/dev/null || true
    fi
  done
  ok "Restored: $name"
  echo "   (Prior state saved as a prerestore snapshot — use 'list' to see it.)"
}

cmd_restore_latest() {
  ensure_snapshot_root
  # Exclude auto-generated prerestore snapshots — those are safety nets,
  # not known states you deliberately took. Use `restore <name>` to pick one.
  local latest
  latest=$(cd "$SNAPSHOT_DIR" && ls -1dt marinara-* 2>/dev/null | grep -v -- '-prerestore$' | head -n1 || true)
  [[ -n "$latest" ]] || die "No user snapshots found (prerestore snapshots excluded; use 'list' + 'restore <name>' to pick one)."
  info "Latest user snapshot: $latest"
  cmd_restore "$latest"
}

cmd_prune() {
  local keep="${1:-10}"
  ensure_snapshot_root
  local count
  count=$(find "$SNAPSHOT_DIR" -maxdepth 1 -type d -name "marinara-*" | wc -l | tr -d ' ')
  if [[ "$count" -le "$keep" ]]; then
    ok "$count snapshots, keeping $keep — nothing to prune."
    return
  fi
  local to_delete=$((count - keep))
  info "Found $count snapshots, keeping $keep most recent, deleting $to_delete..."
  (cd "$SNAPSHOT_DIR" && ls -1dt marinara-* 2>/dev/null | tail -n +$((keep + 1))) | while read -r name; do
    rm -rf "$SNAPSHOT_DIR/$name"
    echo "  deleted: $name"
  done
  ok "Pruned $to_delete snapshots."
}

cmd_help() {
  sed -n '2,/^$/p' "$0" | sed 's/^# \?//'
}

# ── Dispatch ─────────────────────────────────────────────────────────────
cmd="${1:-help}"
shift || true

case "$cmd" in
  snap|snapshot|create)  cmd_snap    "$@" ;;
  list|ls)               cmd_list ;;
  restore|revert)        cmd_restore "$@" ;;
  restore-latest|rl)     cmd_restore_latest ;;
  prune|gc)              cmd_prune   "$@" ;;
  help|-h|--help)        cmd_help ;;
  *)                     die "Unknown command: $cmd — try 'help'" ;;
esac
