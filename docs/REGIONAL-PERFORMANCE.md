# Regional performance: WEUR primary, read replication, placement off

Decision record and measurements for the Ireland-first / occasional-Peru setup. One Worker, one
D1 database, one set of routes and one schema — no second deployment, no geo-router.

- **Worker**: `gym-tracker` (single deployment, edge default placement — `placement` removed from
  `wrangler.jsonc`)
- **D1 primary**: `gym-tracker-weur` (`8a2604e1-a45b-4c94-a61c-c635c19e4035`), created WEUR
- **Read replication**: `mode: auto` (enabled 2026-09-20 via the D1 REST API)
- **Sessions API**: every request runs through a D1 session with sequential consistency; the
  session bookmark is persisted per browser in `gym_d1_bookmark_v1` (`src/lib/server/d1.ts`,
  `src/hooks.server.ts`)
- **Old primary retained for rollback**: `gym-tracker` (`4597a552-baac-423d-acaf-a52d15b3cce7`,
  ENAM), untouched, replication still disabled on it

## Why this shape

The previous setup pinned the Worker to `aws:us-east-1` so its D1 calls would be local to the ENAM
primary. That made every request from Ireland pay the request-forwarding trip, and did nothing for
Peru. Locating the primary in WEUR puts the writes where the usual training happens; read
replication plus bookmarks lets the travelling browser read from a replica while never losing
read-after-write consistency. Placement stays off because Smart Placement is a traffic-based
optimization that needs volume from several locations and moves *all* requests — including reads a
replica could serve locally — to one location.

## Code changes that came with the move

- Batched workout set saves: `saveWorkoutExercise` (`src/lib/server/services/workouts.ts`) does one
  ownership read, then one atomic `db.batch` containing the rest/notes updates, every set update
  (scoped to the posted `workout_exercise_id`), and the workout completion `UPDATE`. The previous
  route read and updated each set sequentially. A cross-exercise or other user's set id is now
  ignored rather than updated (stricter than before, same visible behavior).
- Week details: `getWorkoutExerciseNames` loads exercise names for every workout in the week with a
  single chunked query instead of one `getExercise` lookup per association.
- Workout form saves: per-form saving/saved/error state, unsaved input kept on failure, and saves
  serialized per form so a slower earlier response cannot overwrite a newer edit
  (`src/routes/workouts/[id]/+page.svelte`, `src/lib/components/SaveState.svelte`).

## Cutover (2026-09-20)

The two databases have identical schemas (both built from `migrations/`), and the copy preserved
primary keys, so no foreign keys were remapped.

1. Exported the live ENAM database: `wrangler d1 export gym-tracker --remote --no-schema`.
   Removed the `d1_migrations` and `sqlite_sequence` rows; kept the insert order (parents first).
2. Created `gym-tracker-weur --location weur`, applied `migrations/`, cleared the seeded stub user,
   imported the data file.
3. Verified **row counts and per-column content fingerprints** for all 13 domain tables matched the
   old primary exactly (the same method `scripts/verify-import.sh` uses). Re-verified after the
   production write test — still identical.
4. Enabled read replication (`{"read_replication": {"mode": "auto"}}`).
5. Pointed the `DB` binding in `wrangler.jsonc` at the new database and deployed. The binding name
   `DB` did not change, so services and tests were untouched.
6. Exercised production: dashboard, workout list/detail, week details, exercises, routines render;
   a temporary workout written through the real `update_workout_sets` action stored the last of
   two rapid saves, auto-completed the workout, and was hard-deleted afterwards. The temp session
   was deleted; the two original sessions were copied by the export and still authenticate.

The old database keeps its copy and is not deleted. Bookmarks from before the move would be invalid
for the new database, so the cookie name carries a version; it was introduced together with the new
database, and a future database replacement must bump `D1_BOOKMARK_COOKIE` in
`src/lib/server/d1.ts` (`_v1` → `_v2`).

## Measurements

All timings below are `time_starttransfer` from curl on the user's machine in Lima, Peru. Median of
7 samples for `/login` (unauthenticated) and median of 5 for authenticated pages (temporary
session, deleted afterwards). The `/login` page does not query D1, so it isolates network/Worker
latency.

| Measurement (Peru, curl)      | Before (Worker pinned ENAM) | After (WEUR primary, placement off) |
| ----------------------------- | --------------------------- | ----------------------------------- |
| `/login` median TTFB          | 0.589 s                     | **0.357 s**                         |
| `/` dashboard, authenticated  | not measured                | 1.550 s                             |
| `/workouts` list              | not measured                | 0.920 s                             |
| `/workouts/76` detail         | not measured                | 1.164 s                             |
| week details                  | not measured                | 1.563 s                             |
| `/exercises`                  | not measured                | 0.844 s                             |
| `/routines`                   | not measured                | 1.118 s                             |

D1 metadata: the old primary reported `served_by_region: ENAM`, `served_by_colo: IAD`,
`served_by_primary: true`. The new database reports `running_in_region: WEUR`,
`read_replication.mode: auto`. The app's own queries do not log `served_by_region`; adding that
would require a temporary logging change.

**Not measured (must be established by the user):**

- Anything from Ireland — this machine is in Peru; no Ireland measurement exists yet.
- Real browser timings (DOM ready, save interaction latency) rather than curl TTFB.
- Set-save round trips from either location; server-side write behavior was verified, not timed.
- Replica placement/warm-up for the new database: replication was enabled immediately before the
  measurements, so the first authenticated reads may still have gone to the WEUR primary.

## Repeating the measurement

From any machine, with curl (unauthenticated — no session needed):

```sh
URL=https://gym-tracker.patrickfeeneytamayo.workers.dev/login
for i in $(seq 1 9); do curl -s -o /dev/null -w '%{time_starttransfer}\n' "$URL"; done \
  | sort -n | awk '{a[NR]=$1} END {print "median:", a[(NR+1)/2]}'
```

For authenticated pages, log in from a browser, copy the `gym_session` cookie out of devtools, then:

```sh
SID='<gym_session cookie>'
for p in / /workouts /workouts/<id> /blocks/<block>/weeks/<week>; do
  for i in 1 2 3 4 5; do
    curl -s -o /dev/null -w "$p %{time_starttransfer}\n" \
      -H "Cookie: gym_session=$SID" "https://gym-tracker.patrickfeeneytamayo.workers.dev$p"
  done
done
```

Record Ireland numbers in this file before considering the Smart Placement trial below.

## Next: Smart Placement trial (only after measuring)

The baseline above is placement-off. To trial Smart Placement, add to `wrangler.jsonc`:

```jsonc
"placement": { "mode": "smart" }
```

deploy, repeat the same measurements, and keep it only if median **and tail** latency improve
without regressing Ireland's main workflows. Otherwise remove it and redeploy. Smart Placement
considers where the Worker has already run and needs traffic from multiple locations, so a lightly
used personal app may never move.

## Rollback

The old ENAM database still holds the pre-cutover data. To roll back:

1. In `wrangler.jsonc`, repoint `DB` at `gym-tracker` / `4597a552-baac-423d-acaf-a52d15b3cce7`.
2. Bump `D1_BOOKMARK_COOKIE` in `src/lib/server/d1.ts` so bookmarks from the WEUR database are
   ignored.
3. `npm run deploy`.

Any writes made after the cutover are only in the WEUR database; rolling back discards them. To
keep them, copy the live rows back first (same export/import/fingerprint procedure as the cutover,
clearing the destination tables before the import). The exported cutover snapshot is kept at
`tmp/regional-migration/` locally (gitignored).

## Cost

$5/month Workers Paid covers this: D1 read replication adds no storage or compute charge of its
own (D1 pricing), and the database is a few hundred kB with a single user. Reads are included up to
25 billion rows/month, writes up to 50 million rows/month, 5 GB storage.
