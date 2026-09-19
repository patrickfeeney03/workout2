#!/usr/bin/env bash
#
# Import a PHP gym SQLite database into the Cloudflare D1 database "gym-tracker".
#
# The D1 schema must already exist (run `npx wrangler d1 migrations apply
# gym-tracker --remote` first). Primary keys are preserved as-is; foreign keys
# are never remapped, so the dump must come from the matching PHP schema.
#
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

DB_NAME="gym-tracker"
TMP_DIR="$PROJECT_DIR/tmp"
DUMP_FILE="$TMP_DIR/dump.sql"
CLEAN_BODY="$TMP_DIR/dump.clean.body.sql"
CLEAN_FILE="$TMP_DIR/dump.clean.sql"
CHUNK_DIR="$TMP_DIR/import-chunks"
CHUNK_BYTES="${CHUNK_BYTES:-900000}"
COLUMN_MAP="$TMP_DIR/columns.tsv"

# Tables that exist in both the old SQLite schema and the new D1 schema.
# `sessions` is new in the Worker and must not be imported.
TABLES=(
  users
  movement_patterns
  exercises
  routines
  routine_exercises
  routine_sets
  training_blocks
  block_weeks
  workouts
  workout_exercises
  workout_sets
  exercise_images
  workout_set_media
)

usage() {
  cat <<EOF
Usage: scripts/import-sqlite.sh <path-to-gym.sqlite> [--local] [--skip-verify]

Exports a PHP gym SQLite database and loads it into the D1 database
"$DB_NAME". Primary keys are preserved; foreign keys are NOT remapped.

Steps:
  1. sqlite3 <db> .dump > tmp/dump.sql
  2. Strip PRAGMAs, BEGIN/COMMIT, schema DDL (already applied by D1
     migrations), sqlite_sequence rows and the dropped insight tables
     (note_analyses, insight_briefs, insight_jobs, insight_jobs_user_status).
  3. Prepend "PRAGMA defer_foreign_keys = true;" plus DELETE FROM statements
     and split the result into complete statements, < 1MB per file, under
     tmp/import-chunks/.
  4. Apply every chunk in order with:
       npx wrangler d1 execute $DB_NAME --file <chunk> --remote
  5. Verify per-table row counts against the source DB (unless --skip-verify).

Options:
  --local           Target the local wrangler D1 database instead of remote.
  --persist-to DIR  Local persistence directory (only with --local).
  --skip-verify     Do not verify row counts and content after the import.
  --no-truncate     Do not clear the target tables first (additive import).
  -h, --help        Show this help.

Behavior:
  By default the migrated tables (and \`sessions\`) are emptied before the
  INSERTs are applied. This removes the stub user 1 from migration 0002,
  guarantees the row counts match the source, and makes the import safe to
  re-run for the final sync. Use --no-truncate for a purely additive import.

Prerequisites:
  - The D1 migrations must already be applied:
      npx wrangler d1 migrations apply $DB_NAME --remote
  - The source DB should be a consistent copy, not a live database:
      sqlite3 data/gym.sqlite ".backup 'gym-backup.sqlite'"
    (With WAL mode, either checkpoint or copy the -wal/-shm files too.)
  - You must be logged in: npx wrangler login
EOF
}

LOCAL=0
SKIP_VERIFY=0
TRUNCATE=1
PERSIST_TO=""
DB_PATH=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --local) LOCAL=1; shift ;;
    --skip-verify) SKIP_VERIFY=1; shift ;;
    --no-truncate) TRUNCATE=0; shift ;;
    --persist-to)
      PERSIST_TO="${2:?--persist-to requires a directory}"
      shift 2
      ;;
    -h|--help) usage; exit 0 ;;
    -*) echo "error: unknown option: $1" >&2; usage >&2; exit 2 ;;
    *)
      if [[ -n "$DB_PATH" ]]; then
        echo "error: unexpected argument: $1" >&2
        usage >&2
        exit 2
      fi
      DB_PATH="$1"
      shift
      ;;
  esac
done

if [[ -z "$DB_PATH" ]]; then
  usage >&2
  exit 2
fi
if [[ ! -f "$DB_PATH" ]]; then
  echo "error: source database not found: $DB_PATH" >&2
  exit 1
fi
DB_PATH="$(cd -- "$(dirname -- "$DB_PATH")" && pwd)/$(basename -- "$DB_PATH")"
if ! command -v sqlite3 >/dev/null 2>&1; then
  echo "error: sqlite3 was not found in PATH" >&2
  exit 1
fi

TARGET_FLAGS=()
if [[ "$LOCAL" -eq 1 ]]; then
  TARGET_FLAGS+=(--local)
  if [[ -n "$PERSIST_TO" ]]; then
    TARGET_FLAGS+=(--persist-to "$PERSIST_TO")
  fi
  TARGET_LABEL="local"
else
  TARGET_FLAGS+=(--remote)
  TARGET_LABEL="remote"
fi

run_d1_file() {
  local output
  if ! output="$(npx wrangler d1 execute "$DB_NAME" "${TARGET_FLAGS[@]}" --file "$1" --yes 2>&1)"; then
    printf '%s\n' "$output" >&2
    return 1
  fi
}

# `sqlite3 .backup`/`.dump` output ends up here; keep the map fresh with the dump.
build_column_map() {
  local table cols
  : > "$COLUMN_MAP"
  while IFS= read -r table; do
    cols="$(sqlite3 "$DB_PATH" \
      "SELECT group_concat('\"' || name || '\"', ',') FROM pragma_table_info('$table');")"
    if [[ -z "$cols" ]]; then
      echo "error: could not read the column list for table \"$table\"." >&2
      exit 1
    fi
    printf '%s\t(%s)\n' "$table" "$cols" >> "$COLUMN_MAP"
  done < <(sqlite3 "$DB_PATH" "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;")
}

# --- 1. Dump -----------------------------------------------------------------
mkdir -p "$TMP_DIR"
rm -rf "$CHUNK_DIR"
mkdir -p "$CHUNK_DIR"
rm -f "$DUMP_FILE" "$CLEAN_BODY" "$CLEAN_FILE"

echo "==> Dumping $DB_PATH -> $DUMP_FILE"
sqlite3 "$DB_PATH" .dump > "$DUMP_FILE"

build_column_map

# Keep only INSERT statements. This drops PRAGMA lines, BEGIN/COMMIT, the
# sqlite_sequence bookkeeping insert, the AI insight tables and all schema DDL
# (the D1 migrations own the schema). Non-INSERT lines, including multi-line
# CREATE TRIGGER bodies, are discarded entirely.
#
# `.dump` writes `INSERT INTO t VALUES(...)` with no column list, and the PHP
# and D1 schemas do not always order columns the same way (google_sub in
# `users`, is_deleted in `block_weeks` were appended by PHP ALTER TABLE, while
# D1 defines them in the middle). Rewrite every INSERT to name its columns so
# values cannot land in the wrong field.
#
# Statement detection is quote-aware because `sqlite3 -escape off` (used below)
# emits literal newlines inside string values.
sanitize_dump() {
  awk -v colmap="$COLUMN_MAP" '
function rewrite_insert(stmt,   rest, tbl, q, cols) {
  if (substr(stmt, 1, 13) == "INSERT INTO \"") {
    q = index(substr(stmt, 14), "\"")
    if (q == 0) return stmt
    tbl = substr(stmt, 14, q - 1)
    rest = substr(stmt, 14 + q)
  } else if (substr(stmt, 1, 12) == "INSERT INTO ") {
    rest = substr(stmt, 13)
    q = index(rest, " VALUES(")
    if (q == 0) return stmt
    tbl = substr(rest, 1, q - 1)
    rest = substr(rest, q)
  } else {
    return stmt
  }
  if (substr(rest, 1, 8) != " VALUES(") return stmt
  cols = COLUMNS[tbl]
  if (cols == "") {
    printf "error: no column map for table \"%s\"\n", tbl > "/dev/stderr"
    exit 1
  }
  return "INSERT INTO \"" tbl "\" " cols rest
}
function stmt_complete(s,   i, n, c, inq) {
  n = length(s)
  inq = 0
  for (i = 1; i <= n; i++) {
    c = substr(s, i, 1)
    if (inq) {
      if (c == SQ) {
        if (i < n && substr(s, i + 1, 1) == SQ) i++
        else inq = 0
      }
    } else if (c == SQ) {
      inq = 1
    } else if (c == ";") {
      if (substr(s, i + 1) ~ /^[ \t\r\n]*$/) return 1
    }
  }
  return 0
}
function is_dropped(stmt,   t) {
  t = tolower(stmt)
  if (t ~ /^insert into "?sqlite_sequence"?[ (]/) return 1
  if (t ~ /^insert into "?(note_analyses|insight_briefs|insight_jobs|insight_jobs_user_status)"?[ (]/) return 1
  return 0
}
BEGIN {
  SQ = sprintf("%c", 39)
  while ((getline line < colmap) > 0) {
    p = index(line, "\t")
    if (p > 0) COLUMNS[substr(line, 1, p - 1)] = substr(line, p + 1)
  }
  close(colmap)
}
/^INSERT / {
  stmt = $0
  while (!stmt_complete(stmt) && (getline line) > 0) {
    stmt = stmt "\n" line
  }
  if (!is_dropped(stmt)) print rewrite_insert(stmt)
  next
}
' "$DUMP_FILE" > "$CLEAN_BODY"
}

echo "==> Sanitizing dump"
sanitize_dump

# D1's authorizer rejects the unistr() function that the default .dump uses to
# escape control characters. Re-dump with escaping disabled (raw characters are
# valid inside SQL string literals) and sanitize again.
if grep -q 'unistr(' "$CLEAN_BODY"; then
  echo "==> unistr() escapes detected; re-dumping with 'sqlite3 -escape off'"
  if ! sqlite3 -escape off "$DB_PATH" .dump > "$DUMP_FILE" 2>/dev/null; then
    echo "error: this sqlite3 build does not support '-escape off', which is" >&2
    echo "       required because D1 rejects unistr(). Please use a newer sqlite3." >&2
    exit 1
  fi
  sanitize_dump
  if grep -q 'unistr(' "$CLEAN_BODY"; then
    echo "error: unistr() is still present after re-dumping; aborting." >&2
    exit 1
  fi
fi

# --- 3. Prepend pragma/cleanup and split into chunks -------------------------
# Delete in child -> parent order. `sessions` is cleared too so no session can
# point at a dropped or replaced user id. defer_foreign_keys makes the order
# forgiving; the explicit order keeps it safe without the pragma as well.
{
  printf 'PRAGMA defer_foreign_keys = true;\n'
  if [[ "$TRUNCATE" -eq 1 ]]; then
    printf 'DELETE FROM sessions;\n'
    printf 'DELETE FROM workout_set_media;\n'
    printf 'DELETE FROM exercise_images;\n'
    printf 'DELETE FROM workout_sets;\n'
    printf 'DELETE FROM workout_exercises;\n'
    printf 'DELETE FROM workouts;\n'
    printf 'DELETE FROM block_weeks;\n'
    printf 'DELETE FROM training_blocks;\n'
    printf 'DELETE FROM routine_sets;\n'
    printf 'DELETE FROM routine_exercises;\n'
    printf 'DELETE FROM routines;\n'
    printf 'DELETE FROM exercises;\n'
    printf 'DELETE FROM movement_patterns;\n'
    printf 'DELETE FROM users;\n'
  fi
  cat "$CLEAN_BODY"
} > "$CLEAN_FILE"

echo "==> Splitting into < $CHUNK_BYTES byte chunks under $CHUNK_DIR"
awk -v outdir="$CHUNK_DIR" -v max="$CHUNK_BYTES" '
function open_next() {
  if (fname != "") close(fname)
  n++
  fname = sprintf("%s/chunk-%04d.sql", outdir, n)
  size = 0
}
function emit(stmt) {
  if (size > 0 && size + length(stmt) > max) open_next()
  if (size == 0 && length(stmt) > max) {
    printf "warning: statement is %d bytes (> %d) and cannot be split\n", length(stmt), max > "/dev/stderr"
  }
  print stmt > fname
  size += length(stmt) + 1
}
function stmt_complete(s,   i, n, c, inq) {
  n = length(s)
  inq = 0
  for (i = 1; i <= n; i++) {
    c = substr(s, i, 1)
    if (inq) {
      if (c == SQ) {
        if (i < n && substr(s, i + 1, 1) == SQ) i++
        else inq = 0
      }
    } else if (c == SQ) {
      inq = 1
    } else if (c == ";") {
      if (substr(s, i + 1) ~ /^[ \t\r\n]*$/) return 1
    }
  }
  return 0
}
function table_of(stmt,   q) {
  if (substr(stmt, 1, 13) != "INSERT INTO \"") return ""
  q = index(substr(stmt, 14), "\"")
  if (q == 0) return ""
  return substr(stmt, 14, q - 1)
}
BEGIN {
  SQ = sprintf("%c", 39)
  n = 0
  size = 0
  fname = ""
  # D1 enforces foreign keys per statement and does not honour
  # `PRAGMA defer_foreign_keys`, so rows must be emitted parent table first.
  ORDER_N = split("users movement_patterns exercises routines routine_exercises routine_sets " \
    "training_blocks block_weeks workouts workout_exercises workout_sets exercise_images " \
    "workout_set_media", ORDER, " ")
  open_next()
}
{
  buf = buf $0 "\n"
  if (stmt_complete(buf)) {
    stmt = buf
    sub(/\n$/, "", stmt)
    buf = ""
    tbl = table_of(stmt)
    if (tbl == "") {
      # PRAGMA/DELETE preamble and anything else non-INSERT, kept in order.
      pre_count++
      pre[pre_count] = stmt
      next
    }
    count[tbl]++
    stmts[tbl, count[tbl]] = stmt
  }
}
END {
  if (buf != "") {
    printf "warning: discarded %d trailing bytes without a statement terminator\n", length(buf) > "/dev/stderr"
  }
  for (i = 1; i <= pre_count; i++) emit(pre[i])
  for (k = 1; k <= ORDER_N; k++) {
    tbl = ORDER[k]
    if (!(tbl in count)) continue
    for (i = 1; i <= count[tbl]; i++) emit(stmts[tbl, i])
    delete count[tbl]
  }
  for (tbl in count) {
    printf "warning: flushing %d row(s) from unexpected table \"%s\" last\n", count[tbl], tbl > "/dev/stderr"
    for (i = 1; i <= count[tbl]; i++) emit(stmts[tbl, i])
  }
  if (fname != "") close(fname)
}
' "$CLEAN_FILE"

mapfile -t CHUNKS < <(find "$CHUNK_DIR" -maxdepth 1 -type f -name 'chunk-*.sql' | sort)
if [[ "${#CHUNKS[@]}" -eq 0 ]]; then
  echo "error: no chunks were produced; is the source database empty?" >&2
  exit 1
fi

# --- 4. Apply ----------------------------------------------------------------
echo "==> Applying ${#CHUNKS[@]} chunk(s) to D1 ($TARGET_LABEL)"
index=0
for chunk in "${CHUNKS[@]}"; do
  index=$((index + 1))
  printf '  [%d/%d] %s (%s bytes)\n' "$index" "${#CHUNKS[@]}" "$(basename "$chunk")" "$(wc -c < "$chunk" | tr -d ' ')"
  run_d1_file "$chunk"
done

# --- 5. Verify ---------------------------------------------------------------
if [[ "$SKIP_VERIFY" -eq 1 ]]; then
  echo "==> Skipping verification (--skip-verify)"
else
  echo "==> Verifying ($TARGET_LABEL)"
  if ! "$SCRIPT_DIR/verify-import.sh" "$DB_PATH" "${TARGET_FLAGS[@]}"; then
    echo "error: verification failed; the import does not match the source." >&2
    exit 1
  fi
fi

# --- Summary -----------------------------------------------------------------
echo
echo "==> Import summary"
echo "    source : $DB_PATH"
echo "    target : D1 database \"$DB_NAME\" ($TARGET_LABEL)"
echo "    chunks : ${#CHUNKS[@]} applied from $CHUNK_DIR"
if [[ "$TRUNCATE" -eq 1 ]]; then
  echo "    mode   : truncate + insert (target tables emptied first)"
else
  echo "    mode   : additive (--no-truncate)"
fi
echo "    tables : ${TABLES[*]}"
echo "    skipped: sessions (new in the Worker), sqlite_sequence,"
echo "             note_analyses, insight_briefs, insight_jobs, insight_jobs_user_status"
