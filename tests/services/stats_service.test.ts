import { describe, expect, it } from 'vitest';
import { dashboard, epley } from '$lib/server/services/stats';
import { getDb, seedRoutine, seedWorkout } from '../support/fixtures';
import { seedStatsFixtures } from '../support/stats-fixtures';

// Port of tests/integration/stats_service_test.php
describe('stats service', () => {
	it('epley estimated 1RM for 100kg x 5', () => {
		expect(epley(100, 5)).toBe(116.67);
		expect(epley(100, 15)).toBeNull();
		expect(epley(0, 5)).toBeNull();
	});

	it('dashboard counts completed workouts and ignores planned, deleted, and other users', async () => {
		const db = getDb();
		await seedStatsFixtures();

		const dash = await dashboard(db, 1, {
			range: '12w',
			exerciseId: 1,
			blockId: null,
			today: '2026-08-19'
		});
		expect(dash.hasData).toBe(true);
		expect(dash.kpis.workoutsCompleted).toBe(2);
		expect(dash.kpis.avgDurationMinutes).toBe(52.5);
		expect(dash.kpis.latestBodyWeight).toBe(81.0);
		expect(dash.selectedExerciseId).toBe(1);
	});

	it('lift progress is one point per working set', async () => {
		const db = getDb();
		await seedStatsFixtures();

		const dash = await dashboard(db, 1, {
			range: '12w',
			exerciseId: 1,
			blockId: null,
			today: '2026-08-19'
		});
		expect(dash.liftProgress).toHaveLength(4);

		const [first, second, third, fourth] = dash.liftProgress;
		expect(first.date).toBe('2026-08-01');
		expect(first.weight).toBe(100.0);
		expect(first.reps).toBe(5.0);
		expect(first.e1rm).toBe(116.67);
		expect(first.setId).toBe(1);
		expect(first.workoutId).toBe(1);
		expect(first.workoutExerciseId).toBe(1);
		expect(first.url).toBe('/gym/workout.php?workout_id=1#we-1');

		expect(second.weight).toBe(110.0);
		expect(second.e1rm).toBe(128.33);
		expect(second.setId).toBe(2);

		expect(third.weight).toBe(120.0);
		expect(third.e1rm).toBe(132.0);

		// Planned sessions with actuals still appear on the strength curve.
		expect(fourth.date).toBe('2026-08-11');
		expect(fourth.weight).toBe(200.0);
	});

	it('workout length and split-day averages use completed sessions in range', async () => {
		const db = getDb();
		await seedStatsFixtures();

		const dash = await dashboard(db, 1, {
			range: '12w',
			exerciseId: 1,
			blockId: null,
			today: '2026-08-19'
		});
		expect(dash.workoutLength).toHaveLength(2);
		expect(dash.workoutLength[0].minutes).toBe(60.0);
		expect(dash.workoutLength[1].minutes).toBe(45.0);
		expect(dash.workoutLength[0].workoutId).toBe(1);

		const bySplit = new Map(dash.workoutLengthBySplit.map((row) => [row.splitDay, row]));
		expect(bySplit.get('Lower')?.avgMinutes).toBe(60.0);
		expect(bySplit.get('Upper')?.avgMinutes).toBe(45.0);
		expect(bySplit.has('No split')).toBe(false);
	});

	it('weekday split_day falls back to the routine name', async () => {
		const db = getDb();
		await seedStatsFixtures();
		await seedRoutine({
			id: 10,
			userId: 1,
			name: 'Upper A',
			splitName: 'Upper/Lower',
			splitDay: 'Monday'
		});
		await seedWorkout({
			id: 20,
			userId: 1,
			routineId: 10,
			title: 'Legacy',
			status: 'completed',
			performedOn: '2026-08-12',
			durationSeconds: 1800
		});

		const dash = await dashboard(db, 1, {
			range: '12w',
			exerciseId: 1,
			blockId: null,
			today: '2026-08-19'
		});
		const bySplit = new Map(dash.workoutLengthBySplit.map((row) => [row.splitDay, row]));
		expect(bySplit.has('Monday')).toBe(false);
		// Upper B 45 min + Upper A (weekday fallback) 30 min
		expect(bySplit.get('Upper')?.avgMinutes).toBe(37.5);
		expect(bySplit.get('Upper')?.count).toBe(2);
	});

	it('all-time range includes old sessions; 12w does not', async () => {
		const db = getDb();
		await seedStatsFixtures();

		const twelve = await dashboard(db, 1, {
			range: '12w',
			exerciseId: 2,
			blockId: null,
			today: '2026-08-19'
		});
		const all = await dashboard(db, 1, {
			range: 'all',
			exerciseId: 2,
			blockId: null,
			today: '2026-08-19'
		});
		expect(twelve.kpis.workoutsCompleted).toBe(2);
		expect(all.kpis.workoutsCompleted).toBe(3);
		// Lift progress is all-time for the selected exercise, not clipped to 12w.
		expect(twelve.liftProgress).toHaveLength(2);
		expect(all.liftProgress).toHaveLength(2);
		expect(twelve.liftProgress[0].date).toBe('2026-01-02');
	});

	it('block range uses the block dates', async () => {
		const db = getDb();
		await seedStatsFixtures();

		const dash = await dashboard(db, 1, {
			range: 'block',
			exerciseId: 1,
			blockId: 1,
			today: '2026-08-19'
		});
		expect(dash.start).toBe('2026-07-01');
		expect(dash.end).toBe('2026-08-31');
		expect(dash.blockName).toBe('Summer Block');
		expect(dash.kpis.workoutsCompleted).toBe(2);
	});

	it('user 2 data is isolated', async () => {
		const db = getDb();
		await seedStatsFixtures();

		const dash = await dashboard(db, 2, {
			range: 'all',
			exerciseId: null,
			blockId: null,
			today: '2026-08-19'
		});
		expect(dash.kpis.workoutsCompleted).toBe(1);
		expect(dash.exercises[0].name).toBe('Secret Lift');
		expect(dash.liftProgress[0].weight).toBe(400.0);
	});

	it('26w range is accepted', async () => {
		const db = getDb();
		await seedStatsFixtures();

		const dash = await dashboard(db, 1, {
			range: '26w',
			exerciseId: 1,
			blockId: null,
			today: '2026-08-19'
		});
		expect(dash.range).toBe('26w');
		expect(dash.start).toBe('2026-02-18');
		expect(dash.kpis.workoutsCompleted).toBe(2);
	});
});
