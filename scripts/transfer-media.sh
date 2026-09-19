#!/usr/bin/env bash
#
# Copy a legacy PHP `data/uploads/` tree into the R2 bucket "gym-media".
#
# Object keys are the path relative to the uploads directory, e.g.
#   data/uploads/exercises/12_123.png  ->  exercises/12_123.png
# which matches the Worker's r2Key() mapping of the legacy `file_path` column.
#
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

BUCKET="gym-media"

usage() {
  cat <<EOF
Usage: scripts/transfer-media.sh <path-to-data/uploads> [--dry-run] [--delete-extra]

Uploads every file under <path-to-data/uploads> to the R2 bucket "$BUCKET".
The object key is the path relative to the uploads directory, so
data/uploads/exercises/12_123.png is stored as exercises/12_123.png.

Options:
  --dry-run        Print the put/delete commands without running them.
  --delete-extra   Delete keys already in the bucket that are not present in
                   the source tree. Requires listing bucket objects, which
                   requires a wrangler build that supports
                   \`npx wrangler r2 object list\`.
  -h, --help       Show this help.

Notes:
  - Content type is derived from the file extension
    (png/jpg/jpeg/webp/gif/avif/mp4/webm/mov); anything else is uploaded as
    application/octet-stream.
  - Commands always pass --remote: wrangler 4.x defaults \`r2 object\` to the
    local (miniflare) bucket, which would silently not touch real R2.
EOF
}

DRY_RUN=0
DELETE_EXTRA=0
SRC_DIR=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    --delete-extra) DELETE_EXTRA=1; shift ;;
    -h|--help) usage; exit 0 ;;
    -*) echo "error: unknown option: $1" >&2; usage >&2; exit 2 ;;
    *)
      if [[ -n "$SRC_DIR" ]]; then
        echo "error: unexpected argument: $1" >&2
        usage >&2
        exit 2
      fi
      SRC_DIR="$1"
      shift
      ;;
  esac
done

if [[ -z "$SRC_DIR" ]]; then
  usage >&2
  exit 2
fi
if [[ ! -d "$SRC_DIR" ]]; then
  echo "error: uploads directory not found: $SRC_DIR" >&2
  exit 1
fi
SRC_DIR="$(cd -- "$SRC_DIR" && pwd)"

mime_for_extension() {
  case "${1,,}" in
    png) printf 'image/png' ;;
    jpg|jpeg) printf 'image/jpeg' ;;
    webp) printf 'image/webp' ;;
    gif) printf 'image/gif' ;;
    avif) printf 'image/avif' ;;
    mp4) printf 'video/mp4' ;;
    webm) printf 'video/webm' ;;
    mov) printf 'video/quicktime' ;;
    *) printf 'application/octet-stream' ;;
  esac
}

# Print a shell-escaped command for --dry-run.
print_command() {
  local arg
  printf 'npx'
  for arg in "$@"; do
    printf ' %q' "$arg"
  done
  printf '\n'
}

# List all object keys in the bucket, one per line. Returns non-zero when the
# installed wrangler cannot list objects.
list_bucket_keys() {
  local output
  if ! output="$(npx wrangler r2 object list "$BUCKET" --json --remote 2>&1)"; then
    printf '%s\n' "$output" | grep -m1 -iE 'error|unknown' >&2 || true
    return 1
  fi

  if command -v jq >/dev/null 2>&1; then
    printf '%s' "$output" | jq -r '
      (if type == "array" then . else (.result // .objects // .keys // []) end)
      | .[] | (if type == "string" then . else (.key // .name // .Key // empty) end)
      | select(. != null and . != "")
    ' 2>/dev/null || return 1
  else
    printf '%s' "$output" | node -e '
      let s = "";
      process.stdin.on("data", (d) => (s += d));
      process.stdin.on("end", () => {
        let data;
        try {
          data = JSON.parse(s);
        } catch {
          process.exit(1);
        }
        const arr = Array.isArray(data)
          ? data
          : data.result || data.objects || data.keys || [];
        if (!Array.isArray(arr)) process.exit(1);
        for (const item of arr) {
          const key = typeof item === "string" ? item : item.key || item.name || item.Key || "";
          if (key) console.log(key);
        }
      });
    ' || return 1
  fi
}

declare -A SOURCE_KEY=()
scanned=0
uploaded=0
would_upload=0
skipped=0

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "==> Would upload $SRC_DIR -> r2://$BUCKET (dry-run)"
else
  echo "==> Uploading $SRC_DIR -> r2://$BUCKET"
fi
while IFS= read -r -d '' file; do
  relative="${file#"$SRC_DIR"/}"
  scanned=$((scanned + 1))

  base="$(basename -- "$file")"
  if [[ "$base" == ".DS_Store" || "$base" == "Thumbs.db" || "$base" == ._* ]]; then
    skipped=$((skipped + 1))
    continue
  fi

  key="$relative"
  SOURCE_KEY["$key"]=1

  extension=""
  if [[ "$base" == *.* ]]; then
    extension="${base##*.}"
  fi
  content_type="$(mime_for_extension "$extension")"

  if [[ "$DRY_RUN" -eq 1 ]]; then
    print_command wrangler r2 object put "$BUCKET/$key" --file "$file" --content-type "$content_type" --remote
    would_upload=$((would_upload + 1))
    continue
  fi

  echo "  put $key ($content_type)"
  npx wrangler r2 object put "$BUCKET/$key" --file "$file" --content-type "$content_type" --remote
  uploaded=$((uploaded + 1))
done < <(find "$SRC_DIR" -type f -print0 | sort -z)

echo "==> Source files scanned: $scanned"
if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "==> Would upload: $would_upload, skipped: $skipped"
else
  echo "==> Uploaded: $uploaded, skipped: $skipped"
fi

# --- Extra keys --------------------------------------------------------------
extra_count=0
extra_known=0
extras=()

echo "==> Checking for extra objects in the bucket"
if key_list="$(list_bucket_keys)"; then
  extra_known=1
  while IFS= read -r key; do
    [[ -z "$key" ]] && continue
    if [[ -z "${SOURCE_KEY[$key]:-}" ]]; then
      extras+=("$key")
      extra_count=$((extra_count + 1))
    fi
  done <<< "$key_list"

  if [[ "$extra_count" -eq 0 ]]; then
    echo "  no extra objects"
  elif [[ "$DELETE_EXTRA" -eq 1 ]]; then
    for key in "${extras[@]}"; do
      if [[ "$DRY_RUN" -eq 1 ]]; then
        print_command wrangler r2 object delete "$BUCKET/$key" --force --remote
      else
        echo "  delete $key"
        npx wrangler r2 object delete "$BUCKET/$key" --force --remote
      fi
    done
  else
    echo "  $extra_count extra object(s) (pass --delete-extra to remove):"
    for key in "${extras[@]}"; do
      echo "    $key"
    done
  fi
else
  echo "warning: this wrangler build does not support 'r2 object list', so extra objects" >&2
  echo "         cannot be enumerated. Upgrade wrangler or inspect the bucket in the" >&2
  echo "         Cloudflare dashboard. No objects were deleted." >&2
  if [[ "$DELETE_EXTRA" -eq 1 ]]; then
    echo "error: --delete-extra requires bucket listing, which is unavailable." >&2
    exit 3
  fi
fi

# --- Summary -----------------------------------------------------------------
echo
echo "==> Media transfer summary"
echo "    source        : $SRC_DIR"
echo "    bucket        : $BUCKET"
echo "    mode          : $([[ "$DRY_RUN" -eq 1 ]] && echo dry-run || echo live)"
echo "    files scanned : $scanned"
if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "    would upload  : $would_upload"
else
  echo "    uploaded      : $uploaded"
fi
echo "    skipped       : $skipped"
if [[ "$extra_known" -eq 1 ]]; then
  echo "    extra objects : $extra_count"
else
  echo "    extra objects : unknown (bucket listing unavailable)"
fi
