# PHP golden master (stats)

`tests/golden/stats.golden.test.ts` compares the TypeScript `dashboard()` with the
original PHP `Service\StatsService::dashboard()`. PHP is not installed here, so
the golden data is generated on the VPS and committed as a TS module.

1. On the VPS, point the dumper at the PHP app root (the directory containing
   `src/bootstrap.php` and `data/gym_schema.sql`):
   `php scripts/php/dump-stats.php /var/www/notes > /tmp/stats.json`
   (`PHP_GYM_ROOT` is the alternative; with neither, the legacy nested
   `<php-app>/gym-web` layout is assumed.)
2. Convert: `node scripts/php/json-to-ts.mjs /tmp/stats.json tests/golden/stats.golden.ts`
3. Commit `tests/golden/stats.golden.ts`.

If the file is absent, every golden case is skipped. Regenerate after changes to
`src/lib/server/services/stats.ts` or `src/Service/StatsService.php`.
