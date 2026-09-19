import { applyD1Migrations, env } from 'cloudflare:test';
import { beforeEach } from 'vitest';

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);

// vitest-pool-workers 0.22 does not reset storage between tests, so wipe all
// domain tables before each test. `d1_migrations` is intentionally untouched.
const TABLES = [
	'sessions',
	'workout_set_media',
	'exercise_images',
	'workout_sets',
	'workout_exercises',
	'workouts',
	'routine_sets',
	'routine_exercises',
	'routines',
	'block_weeks',
	'training_blocks',
	'exercises',
	'movement_patterns',
	'users'
];

beforeEach(async () => {
	await env.DB.batch([
		env.DB.prepare('PRAGMA defer_foreign_keys = true'),
		...TABLES.map((table) => env.DB.prepare(`DELETE FROM ${table}`))
	]);
});
