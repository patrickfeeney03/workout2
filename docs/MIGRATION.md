# Migration runbook: PHP gym → SvelteKit/Cloudflare

The old PHP app is the **source of truth** until the final sync. The Worker is
`gym-tracker`; its D1 id and R2 bucket (`gym-media`) live in `wrangler.jsonc`. The
D1 database name is `gym-tracker-weur` (WEUR primary with read replication, see
[docs/REGIONAL-PERFORMANCE.md](REGIONAL-PERFORMANCE.md)).

## 0. Prerequisites

```sh
cd /home/patrick/code/workout_php/gym-web
npx wrangler login
npx wrangler whoami
npx wrangler r2 bucket create gym-media   # only if missing
npm run db:migrate:remote                 # schema MUST exist first
```

Imports preserve primary keys and never remap foreign keys, so use a dump from
the matching PHP schema.

## 1. Consistent VPS dump

Stop writes (maintenance/read-only) first. WAL mode means the raw `.sqlite` can
be inconsistent (copy `-wal`/`-shm` together, or just use `.backup`):

```sh
ssh vps
cd /path/to/workout_php
sqlite3 data/gym.sqlite ".backup '/tmp/gym.sqlite'"
sqlite3 /tmp/gym.sqlite "PRAGMA integrity_check;"
exit
scp vps:/tmp/gym.sqlite ./gym.sqlite
rsync -av vps:/path/to/workout_php/data/uploads/ ./data/uploads/
```

## 2. Import, verify, media

```sh
scripts/import-sqlite.sh ./gym.sqlite            # remote (default)
scripts/import-sqlite.sh ./gym.sqlite --local    # rehearse against local D1
scripts/verify-import.sh ./gym.sqlite            # counts + content fingerprint; non-zero exit on mismatch
scripts/transfer-media.sh ./data/uploads --dry-run
scripts/transfer-media.sh ./data/uploads
```

Import dumps, strips schema DDL/PRAGMAs/`sqlite_sequence` and the dropped
`note_analyses`/`insight_briefs`/`insight_jobs*` tables, rewrites every INSERT
with an explicit column list (the PHP and D1 schemas order columns differently
for `users` and `block_weeks`), empties the target tables (removes the stub
user 1 from migration `0002`), then applies the INSERTs parent table first in
ordered <1 MB chunks (D1 enforces foreign keys per statement and ignores
`PRAGMA defer_foreign_keys`).
`import-sqlite.sh` finishes by running `verify-import.sh`, which compares row
counts *and* a per-column content fingerprint (summed `quote()` lengths per
column) against the source. Safe to re-run. Media keys mirror `file_path` with
`data/uploads/` stripped (`exercises/12_123.png`). `--delete-extra` needs
`wrangler r2 object list`, absent in wrangler 4.135; without it extras are
reported as unknown.

## 3. Secrets (Google OAuth + allowlist)

```sh
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put GOOGLE_REDIRECT_URI   # https://<worker>/auth/google/callback
npx wrangler secret put ALLOWED_EMAILS        # comma-separated
node scripts/set-password.mjs --id 1 --email you@example.com --remote  # prompts; claims stub user 1
```

## 4. Deploy and first-run checks

```sh
npm run deploy
```

Check Google login, password login, counts (`scripts/verify-import.sh`), exercise
images at `/media/exercise_image/<id>`, set media, and logging a new workout.

## Rollback / final sync

Keep PHP serving until verified; if anything is wrong, point traffic back — the
import only reads the source, so nothing is lost, and it is idempotent to re-run.

Final sync: (1) make PHP read-only, (2) fresh `.backup` + re-copy uploads,
(3) `scripts/import-sqlite.sh ./gym-final.sqlite`, (4) `scripts/verify-import.sh
./gym-final.sqlite`, (5) `scripts/transfer-media.sh ./data/uploads`, (6) flip
traffic to the Worker and retire PHP.
