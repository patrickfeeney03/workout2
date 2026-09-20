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

## Follow-up: workout detail round trips (2026-09-20, later)

Clicking a workout still took seconds. Temporary `Server-Timing` instrumentation showed the whole
request handler was D1 round trips: auth 230 ms + wave 1 240 ms + wave 2 265 ms, i.e. three
sequential Worker→WEUR round trips (~250 ms each from a South American Worker), with rendering
negligible. The second wave was seven queries, but concurrent queries in a session do parallelize
(a probe measured five parallel queries in ~250 ms and five serial in ~1.2 s), so the fix was
collapsing waves, not adding concurrency.

`getWorkoutDetail` (`src/lib/server/services/workoutDetail.ts`) now runs the ownership read and
every page read in a single `db.batch()`: workout, workout exercises, sets, exercises, the exercise
picker, training blocks, weeks and the current week. No statement depends on another's result
(joins and a subquery keyed by workout id), so all eight are prepared up front. Handler time went
from ~1.18 s (auth + 2 waves) to ~0.49 s (auth + 1 batch); `/workouts/76` TTFB median fell from
~1.35 s to ~0.9–1.1 s (network variance to LHR dominates the remainder). `app.html` also sets
`data-sveltekit-preload-code="eager"` so the route's ~18 KB JS chunk is fetched while the list page
is idle instead of after the click — SvelteKit does not preload code by default.

Remaining per-request round trips are the auth session lookup (one) and the page batch (one).
Other pages still do sequential waves (week details is four reads, ownership check first); the same
batch pattern applies if they feel slow.

## Follow-up: mobile (2026-09-20, later)

A phone still felt slow. Playwright with a Pixel 7 profile, 4–6× CPU throttling and 150–300 ms
network latency measured the production deployment:

| | before | after |
| --- | --- | --- |
| workouts list load | ~1.5 s | ~1.4–1.6 s |
| tap first (preloaded) workout → rendered | ~1.06–1.25 s | **~0.31–0.42 s** |
| tap any other workout → rendered | ~1.06–1.25 s | **~0.55–0.64 s** |
| save a set → “Saved” | full page reload (~1.5 s+) | **~0.85 s, no reload** |

What changed:

- **Session lookup edge cache** (`src/lib/server/sessionCache.ts`). Every request authenticates
  before routing; that D1 round trip is now cached per colo for 60 s and deleted on logout. This is
  what removed one London round trip from most navigations, since each tap fetches data and the
  layout.
- **First-link data preload** on the workouts list (`onMount` → `preloadData`). SvelteKit keeps only
  one data preload at a time and there is no hover on a phone, so the most recent workout is warmed
  while the list is idle. Other links are preloaded on `touchstart`, just before the tap.
- **One-round-trip saves** (`saveWorkoutExercise`). Ownership is now enforced inside every batched
  statement (`EXISTS` on the owning workout) and the completion targets the workout through a
  subquery, so there is no ownership pre-read and no separate status read. Saving a set no longer
  re-fetches the page: the action returns the resulting status and the page reflects it
  (`invalidateAll: false`), which also removes the re-render that followed every edit.

What did **not** change: the page batch still reads from the LHR primary (~250 ms from GIG) because
no read replica was serving American traffic at the time of measurement. Once one is, both the
batch and the (cache-miss) session lookup should shorten on their own.

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
`read_replication.mode: auto`.

A temporary probe route (a `SELECT 1` through `first-unconstrained` and `first-primary`, returning
`served_by_region`/`served_by_colo`/`served_by_primary` and the Worker's `cf.colo`) was deployed
right after the cutover and then removed. It showed that **reads were still served by the WEUR
primary in LHR (`served_by_primary: true`), not by a replica**, minutes after replication was
enabled. The Worker ran in `GIG` (Rio de Janeiro) for this Lima connection — note that `cf.city:
Lima` is the *client's* city, not the data center's. There is no D1 South America region, so if and
when replicas are assigned for the Americas they will most likely be ENAM/WNAM, meaning Peru reads
from the US rather than locally. Re-check this later (re-add the probe route, or log
`result.meta.served_by_region` in `src/hooks.server.ts` temporarily): as long as
`served_by_primary` is true for Peru, its reads are paying the full trip to London, and the
latency table below is a primary-only baseline. D1-reported query durations are ~1 ms
(`wrangler d1 insights`), so the ~1 s page loads are network round trips, not database work.

**Not measured (must be established by the user):**

- Anything from Ireland — this machine is in Peru; no Ireland measurement exists yet.
- Real browser timings (DOM ready, save interaction latency) rather than curl TTFB.
- Set-save round trips from either location; server-side write behavior was verified, not timed.
- Whether (and where) read replicas are serving: at the time of measurement they were not — Peru
  reads still went to the WEUR primary, see above.

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
