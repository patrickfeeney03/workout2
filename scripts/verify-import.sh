#!/usr/bin/env bash
#
# Compare per-table row counts between a PHP gym SQLite database and the
# Cloudflare D1 database "gym-tracker". Exits non-zero on any mismatch.
#
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

DB_NAME="gym-tracker"

# `sessions` is new in the Worker and `d1_migrations` is wrangler bookkeeping,
# so neither is compared.
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
Usage: scripts/verify-import.sh <path-to-gym.sqlite> [--local] [--remote] [--persist-to DIR]

Compares SELECT COUNT(*) and a per-column content fingerprint for every
migrated table between a source SQLite database and D1 "$DB_NAME". Prints a
table of results and exits non-zero if anything differs.

Tables compared:
  ${TABLES[*]}

Not compared: sessions (new in the Worker), d1_migrations (wrangler internal).

Options:
  --local           Compare against the local wrangler D1 database.
  --remote          Compare against the remote database (the default).
  --persist-to DIR  Local persistence directory (only with --local).
  -h, --help        Show this help.
EOF
}

LOCAL=0
PERSIST_TO=""
DB_PATH=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --local) LOCAL=1; shift ;;
    --remote) LOCAL=0; shift ;;
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

json_to_tsv() {
  if command -v jq >/dev/null 2>&1; then
    jq -r '.[0].results[0] | to_entries[] | [.key, (.value | tostring)] | @tsv'
  else
    node -e '
      let s = "";
      process.stdin.on("data", (d) => (s += d));
      process.stdin.on("end", () => {
        const row = JSON.parse(s)[0].results[0] || {};
        for (const [key, value] of Object.entries(row)) {
          console.log(key + "\t" + value);
        }
      });
    '
  fi
}

declare -A SRC_COUNT=()
declare -A D1_COUNT=()

for table in "${TABLES[@]}"; do
  table_exists="$(sqlite3 "$DB_PATH" \
    "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='$table';")"
  if [[ "$table_exists" == "0" ]]; then
    SRC_COUNT["$table"]="missing"
  else
    SRC_COUNT["$table"]="$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM \"$table\";")"
  fi
done

query=""
for table in "${TABLES[@]}"; do
  if [[ -z "$query" ]]; then
    query="SELECT"
  else
    query="$query,"
  fi
  query="$query (SELECT COUNT(*) FROM \"$table\") AS \"$table\""
done

if ! d1_json="$(npx wrangler d1 execute "$DB_NAME" "${TARGET_FLAGS[@]}" --command "$query" --json 2>/dev/null)"; then
  echo "error: could not read row counts from D1 ($TARGET_LABEL)." >&2
  echo "       Are the migrations applied?  npx wrangler d1 migrations apply $DB_NAME --${TARGET_LABEL}" >&2
  exit 1
fi

while IFS=$'\t' read -r table count; do
  [[ -n "$table" ]] && D1_COUNT["$table"]="$count"
done < <(printf '%s' "$d1_json" | json_to_tsv)

if [[ "${#D1_COUNT[@]}" -eq 0 ]]; then
  echo "error: D1 returned no counts (unexpected JSON)." >&2
  exit 1
fi

printf '%-22s %10s %10s  %s\n' "table" "sqlite" "d1" "status"
mismatch=0
for table in "${TABLES[@]}"; do
  src_count="${SRC_COUNT[$table]}"
  d1_count="${D1_COUNT[$table]:-?}"
  status="ok"
  if [[ "$src_count" != "$d1_count" ]]; then
    status="MISMATCH"
    mismatch=1
  fi
  printf '%-22s %10s %10s  %s\n' "$table" "$src_count" "$d1_count" "$status"
done

if [[ "$mismatch" -ne 0 ]]; then
  echo
  echo "error: one or more tables differ between $DB_PATH and D1 ($TARGET_LABEL)." >&2
  exit 1
fi

# --- Content fingerprint -----------------------------------------------------
# Counts can match while values land in the wrong columns: the PHP and D1
# schemas order columns differently (google_sub in `users`, is_deleted in
# `block_weeks`) and SQLite does not enforce types. Fingerprint each table as
# its row count plus, per column, the summed length of SQLite's canonical
# quote() text - "NULL" for NULL, "''" for the empty string - which is
# order-independent and catches shifted or truncated values.
fingerprint_expr() {
  local table="$1" column expr="SELECT count(*)"
  while IFS= read -r column; do
    expr="$expr || '|' || coalesce(sum(length(quote(\"$column\"))), 0)"
  done < <(sqlite3 "$DB_PATH" "SELECT name FROM pragma_table_info('$table');")
  printf '%s' "$expr"
}

declare -A SRC_FP=()
for table in "${TABLES[@]}"; do
  [[ "${SRC_COUNT[$table]}" == "missing" ]] && continue
  SRC_FP["$table"]="$(sqlite3 "$DB_PATH" "$(fingerprint_expr "$table") FROM \"$table\";")"
done

fp_query=""
for table in "${TABLES[@]}"; do
  [[ "${SRC_COUNT[$table]}" == "missing" ]] && continue
  if [[ -z "$fp_query" ]]; then
    fp_query="SELECT"
  else
    fp_query="$fp_query,"
  fi
  fp_query="$fp_query ($(fingerprint_expr "$table") FROM \"$table\") AS \"$table\""
done

if ! fp_json="$(npx wrangler d1 execute "$DB_NAME" "${TARGET_FLAGS[@]}" --command "$fp_query" --json 2>/dev/null)"; then
  echo "error: could not read content fingerprints from D1 ($TARGET_LABEL)." >&2
  exit 1
fi

declare -A D1_FP=()
while IFS=$'\t' read -r table value; do
  [[ -n "$table" ]] && D1_FP["$table"]="$value"
done < <(printf '%s' "$fp_json" | json_to_tsv)

printf '\n%-22s %s\n' "table" "fingerprint"
fp_mismatch=0
for table in "${TABLES[@]}"; do
  [[ "${SRC_COUNT[$table]}" == "missing" ]] && continue
  status="ok"
  if [[ "${SRC_FP[$table]}" != "${D1_FP[$table]:-?}" ]]; then
    status="MISMATCH"
    fp_mismatch=1
  fi
  printf '%-22s %s\n' "$table" "$status"
done

if [[ "$fp_mismatch" -ne 0 ]]; then
  echo >&2
  echo "error: content fingerprints differ between $DB_PATH and D1 ($TARGET_LABEL)." >&2
  for table in "${TABLES[@]}"; do
    [[ "${SRC_COUNT[$table]}" == "missing" ]] && continue
    [[ "${SRC_FP[$table]}" == "${D1_FP[$table]:-?}" ]] && continue
    mapfile -t columns < <(sqlite3 "$DB_PATH" "SELECT name FROM pragma_table_info('$table');")
    IFS='|' read -r -a src_parts <<< "${SRC_FP[$table]}"
    IFS='|' read -r -a d1_parts <<< "${D1_FP[$table]:-}"
    printf '  %s: rows source=%s d1=%s\n' "$table" "${src_parts[0]:-?}" "${d1_parts[0]:-?}" >&2
    for index in "${!columns[@]}"; do
      src_value="${src_parts[$((index + 1))]:-}"
      d1_value="${d1_parts[$((index + 1))]:-}"
      if [[ "$src_value" != "$d1_value" ]]; then
        printf '    %-20s source=%s d1=%s\n' "${columns[$index]}" "$src_value" "$d1_value" >&2
      fi
    done
  done
  exit 1
fi

echo
echo "All tables match ($TARGET_LABEL): row counts and content fingerprints."
