import { describe, expect, it } from 'vitest';
import { dashboard, type DashboardData } from '$lib/server/services/stats';
import { getDb } from '../support/fixtures';
import { seedStatsFixtures } from '../support/stats-fixtures';

/**
 * Golden-master parity test: TypeScript `dashboard()` vs the original PHP
 * `Service\StatsService::dashboard()`.
 *
 * The golden object is produced by the PHP app on a box that has PHP 8.5 and
 * committed as a TypeScript module (workerd has no filesystem). When that
 * module is absent every case is skipped, so the suite stays green locally.
 * See scripts/php/README.md for the two-command regeneration flow.
 */

interface GoldenParams {
	userId: number;
	range: string;
	exerciseId: number | null;
	blockId: number | null;
	today: string | null;
}

interface GoldenCase {
	params: GoldenParams;
	dashboard: unknown;
}

interface GoldenFile {
	generatedAt: string;
	phpVersion: string;
	cases: GoldenCase[];
}

const goldenModules = import.meta.glob<{ statsGolden?: GoldenFile }>('./stats.golden.ts', {
	eager: true
});

const golden: GoldenFile | null = Object.values(goldenModules)[0]?.statsGolden ?? null;

/** Mirror of the cases dump-stats.php asks PHP for; used only while skipped. */
const FALLBACK_CASES: GoldenCase[] = [
	{
		params: { userId: 1, range: 'all', exerciseId: null, blockId: null, today: '2026-08-19' },
		dashboard: null
	},
	{
		params: { userId: 1, range: '12w', exerciseId: 1, blockId: null, today: '2026-08-19' },
		dashboard: null
	},
	{
		params: { userId: 1, range: 'block', exerciseId: 1, blockId: 1, today: '2026-08-19' },
		dashboard: null
	},
	{
		params: { userId: 2, range: 'all', exerciseId: null, blockId: null, today: '2026-08-19' },
		dashboard: null
	}
];

if (golden === null) {
	console.warn(
		[
			'',
			'[golden] tests/golden/stats.golden.ts not found - skipping PHP parity checks.',
			'Generate it on a machine with PHP 8.5 (see scripts/php/README.md):',
			'  php scripts/php/dump-stats.php > /tmp/stats.json',
			'  node scripts/php/json-to-ts.mjs /tmp/stats.json tests/golden/stats.golden.ts',
			'Then commit tests/golden/stats.golden.ts.',
			''
		].join('\n')
	);
}

/** PHP's snake_case dashboard shape, as produced by json_encode(). */
interface PhpDashboard {
	range: string;
	start: string | null;
	end: string;
	block_id: number | null;
	block_name: string | null;
	blocks: { id: number; name: string; start_date: string | null; end_date: string | null }[];
	has_data: boolean;
	kpis: {
		workouts_completed: number;
		avg_duration_minutes: number | null;
		latest_body_weight: number | null;
	};
	body_weight: { date: string; weight: number }[];
	workout_length: { date: string; minutes: number; workout_id: number }[];
	workout_length_by_split: { split_day: string; avg_minutes: number; count: number }[];
	exercises: { id: number; name: string }[];
	selected_exercise_id: number | null;
	selected_exercise_name: string | null;
	lift_progress: {
		date: string;
		weight: number;
		reps: number;
		e1rm: number | null;
		set_number: number;
		workout_id: number;
		workout_exercise_id: number;
		set_id: number;
		url: string;
		effort: null;
	}[];
}

/** camelCase DashboardData -> PHP snake_case keys. */
function toPhpShape(data: DashboardData): PhpDashboard {
	return {
		range: data.range,
		start: data.start,
		end: data.end,
		block_id: data.blockId,
		block_name: data.blockName,
		blocks: data.blocks.map((block) => ({
			id: block.id,
			name: block.name,
			start_date: block.startDate,
			end_date: block.endDate
		})),
		has_data: data.hasData,
		kpis: {
			workouts_completed: data.kpis.workoutsCompleted,
			avg_duration_minutes: data.kpis.avgDurationMinutes,
			latest_body_weight: data.kpis.latestBodyWeight
		},
		body_weight: data.bodyWeight.map((point) => ({ date: point.date, weight: point.weight })),
		workout_length: data.workoutLength.map((point) => ({
			date: point.date,
			minutes: point.minutes,
			workout_id: point.workoutId
		})),
		workout_length_by_split: data.workoutLengthBySplit.map((row) => ({
			split_day: row.splitDay,
			avg_minutes: row.avgMinutes,
			count: row.count
		})),
		exercises: data.exercises.map((exercise) => ({ id: exercise.id, name: exercise.name })),
		selected_exercise_id: data.selectedExerciseId,
		selected_exercise_name: data.selectedExerciseName,
		lift_progress: data.liftProgress.map((point) => ({
			date: point.date,
			weight: point.weight,
			reps: point.reps,
			e1rm: point.e1rm,
			set_number: point.setNumber,
			workout_id: point.workoutId,
			workout_exercise_id: point.workoutExerciseId,
			set_id: point.setId,
			url: point.url,
			effort: point.effort
		}))
	};
}

const goldenCases = golden?.cases ?? FALLBACK_CASES;

describe('stats dashboard parity with PHP (golden master)', () => {
	for (const goldenCase of goldenCases) {
		const { userId, range, exerciseId, blockId, today } = goldenCase.params;
		const label = `${range} (user ${userId}), today ${today ?? 'now'}`;

		it.skipIf(golden === null)(label, async () => {
			const db = getDb();
			await seedStatsFixtures();

			const actual = await dashboard(db, userId, { range, exerciseId, blockId, today });

			expect(toPhpShape(actual)).toEqual(goldenCase.dashboard);
		});
	}
});
