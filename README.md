# Gym Tracker (SvelteKit on Cloudflare)

The gym tracker, ported from the vanilla PHP app (still in its own repository). The
Ideas app stays on PHP; everything on the `gym/` pages of the old app lives here.

- **SvelteKit 2 + Svelte 5 (runes)**, SSR on Cloudflare Workers
- **D1** (serverless SQLite) for data, schema in `migrations/`
- **R2** for exercise images and set media, served through `/media/[type]/[id]`
- **Vitest + `@cloudflare/vitest-pool-workers`**: tests run in real workerd with D1
- Legacy PHP bcrypt hashes still verify at login and are transparently rehashed to
  PBKDF2-SHA256

## Quick start

```sh
npm install
npm run db:migrate:local   # create/seed the local D1
npm run dev -- --port 5173
```

Open http://localhost:5173. Without Google credentials you can log in with a
password. The local stub user 1 starts with a NULL email, so claim it and set a
password in one command (it prompts twice, hidden input):

```sh
node scripts/set-password.mjs --id 1 --email you@example.com --name "Your Name" --local
```

If the user already exists with that email, drop `--id 1`:

```sh
node scripts/set-password.mjs --email you@example.com --local
```

Passwords are only ever entered at the prompt, never as an argument. `--local`
is the default when neither `--local` nor `--remote` is given. To start over from
an empty local database:

```sh
rm -rf .wrangler/state
npm run db:migrate:local
```

`migrations/0002_seed_stub_user.sql` recreates user 1 (`Admin`) so there is
something to attach data to.

### Local secrets

Copy the shape of the deployed secrets into `.dev.vars` (gitignored):

```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:5173/auth/google/callback
ALLOWED_EMAILS=you@example.com
```

The Google button only renders when `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`
are set. `.dev.vars` and `.env` both work, but wrangler only exposes the names
listed in `secrets.required` in `wrangler.jsonc` — an allowlist or key that is
missing there is silently dropped and `platform.env` will be empty for it
(Google sign-in then fails with `access_denied`).

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server with emulated Cloudflare bindings |
| `npm run build` | Production build into `.svelte-kit/cloudflare` |
| `npm run preview` | Serve the production build locally |
| `npm run check` | `svelte-check` + TypeScript across `src/` and `tests/` |
| `npm run check:watch` | Same, in watch mode |
| `npm test` | Unit/integration tests in workerd (isolated D1 per test) |
| `npm run test:watch` | Same, in watch mode |
| `npm run types` | Regenerate `worker-configuration.d.ts` (strips the bundled-worker import) |
| `npm run db:migrate:local` | Apply D1 migrations to the local database |
| `npm run db:migrate:remote` | Apply D1 migrations to the remote database |
| `npm run db:list:local` / `db:list:remote` | Show applied/pending migrations |
| `npm run deploy` | Build, then deploy the Worker + static assets |
| `npm run deploy:dry` | Build, then validate/package without uploading |
| `npm run secrets` | List the Worker's secrets |
| `npm run tail` | Stream production logs |

After changing bindings in `wrangler.jsonc` run `npm run types` (not bare
`wrangler types`) so the generated types stay clean.

## Deploy

```sh
npm run deploy
printf '%s' '<client-id>' | npx wrangler secret put GOOGLE_CLIENT_ID
printf '%s' '<client-secret>' | npx wrangler secret put GOOGLE_CLIENT_SECRET
printf '%s' 'https://<worker-host>/auth/google/callback' | npx wrangler secret put GOOGLE_REDIRECT_URI
printf '%s' 'you@example.com' | npx wrangler secret put ALLOWED_EMAILS
```
npx wrangler secret put ALLOWED_EMAILS        # comma-separated allowlist
```

`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `GOOGLE_REDIRECT_URI` are declared
as required secrets in `wrangler.jsonc`; the deploy fails until they exist. Add
the new redirect URI in the Google Cloud console before switching domains.

`ALLOWED_EMAILS` is a secret (comma-separated Google accounts). It is not in
`wrangler.jsonc`, so it never lands in git:

```sh
printf '%s' 'you@example.com' | npx wrangler secret put ALLOWED_EMAILS
```

After changing bindings in `wrangler.jsonc` run `npm run types` (not bare
`wrangler types`) so the generated types stay clean.

### Custom domain (cutover)

`wrangler.jsonc` has no route yet, so the Worker is reachable at its
`workers.dev` URL. At cutover add a route/custom domain for `gym.<domain>` in the
Cloudflare dashboard (or `routes` in `wrangler.jsonc`), update the Google redirect
URI, then redirect the PHP `/gym/*` pages to the new host.

## Database

- `migrations/0001_init.sql` — 11 domain tables + `sessions`, triggers, indexes.
  The three AI-insight tables (`note_analyses`, `insight_briefs`, `insight_jobs`)
  are intentionally **not** migrated; the insights feature was dropped.
- `migrations/0002_seed_stub_user.sql` — idempotent stub user 1.

D1 differs from the PHP PDO code in two ways that the services handle:

1. **No interactive transactions.** Multi-statement writes use `db.batch()`
   (atomic). Workout creation/cloning builds one batch with explicit id
   generation.
2. **Foreign keys are always enforced.** Services store `NULL` instead of `0`/`''`
   for absent FKs.

## Tests

`tests/` mirrors the PHP suite intent, not its files:

- `tests/services/*` — domain services against D1 (`tests/support/fixtures.ts`
  seeds FK-complete rows; storage is wiped before every test).
- `tests/unit/*` — pure helpers, password verification/rehashing, date formatting.
- `tests/golden/*` — optional PHP-vs-TS stats comparison. It skips until
  `tests/golden/stats.golden.ts` exists; generate it with
  `php scripts/php/dump-stats.php` on a machine with PHP (see
  `scripts/php/README.md`).

## Project layout

```
migrations/            D1 schema
scripts/               import/verify/media transfer, password CLI, golden PHP dumper
src/hooks.server.ts    session cookie -> event.locals.user/db/env
src/lib/server/        auth, sessions, services (D1 data layer), media, forms
src/lib/types.ts       DTO-style types + row mappers
src/routes/            SvelteKit routes, one directory per PHP page
tests/                 vitest-pool-workers suites
```

## Migration & data import

See [docs/MIGRATION.md](docs/MIGRATION.md) for the dump → sanitize → import →
verify → media-transfer runbook and the final-sync procedure.
