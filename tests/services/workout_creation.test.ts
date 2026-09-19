import { describe, expect, it } from 'vitest';
import { handleWorkout } from '$lib/server/services/workouts';
import {
	getDb,
	queryAll,
	queryOne,
	seedExercise,
	seedRoutine,
	seedRoutineExercise,
	seedRoutineSet,
	seedTrainingBlock,
	seedBlockWeek,
	seedUser
} from '../support/fixtures';

// Port of tests/integration/workout_creation_test.php
describe('handleWorkout', () => {
	it('clones a routine into a workout with exercises and sets', async () => {
		const db = getDb();
		const userId = await seedUser();
		const exerciseId = await seedExercise({ id: 5, userId });
		const routineId = await seedRoutine({ id: 10, userId, name: 'Leg Day' });
		await seedTrainingBlock({ id: 50, userId });
		await seedBlockWeek({ id: 100, trainingBlockId: 50, weekNumber: 1 });

		await seedRoutineExercise({
			id: 20,
			routineId,
			exerciseId,
			sortOrder: 1,
			targetRest: '90s',
			notes: 'heavy squats'
		});
		await seedRoutineExercise({
			id: 21,
			routineId,
			exerciseId,
			sortOrder: 2,
			targetRest: '60s',
			notes: 'deleted exercise',
			isDeleted: 1
		});

		await seedRoutineSet({
			id: 30,
			routineExerciseId: 20,
			setNumber: 1,
			targetReps: 10,
			targetWeight: 225
		});
		await seedRoutineSet({
			id: 31,
			routineExerciseId: 20,
			setNumber: 2,
			targetReps: 8,
			targetWeight: 245
		});
		await seedRoutineSet({
			id: 32,
			routineExerciseId: 20,
			setNumber: 3,
			targetReps: 6,
			targetWeight: 265,
			isDeleted: 1
		});

		const workoutId = await handleWorkout(db, userId, {
			routineId,
			blockWeekId: 100,
			title: 'My Custom Workout',
			plannedOn: '2026-07-01'
		});

		const workout = await queryOne<Record<string, unknown>>('SELECT * FROM workouts WHERE id = ?', [
			workoutId
		]);
		expect(workout?.title).toBe('My Custom Workout');
		expect(workout?.routine_id).toBe(10);
		expect(workout?.block_week_id).toBe(100);
		expect(workout?.planned_on).toBe('2026-07-01');
		expect(workout?.status).toBe('planned');

		const wexes = await queryAll<Record<string, unknown>>(
			'SELECT * FROM workout_exercises WHERE workout_id = ?',
			[workoutId]
		);
		expect(wexes).toHaveLength(1);
		expect(wexes[0].exercise_id).toBe(5);
		expect(wexes[0].sort_order).toBe(1);
		expect(wexes[0].target_rest).toBe('90s');
		expect(wexes[0].notes).toBe('heavy squats');
		expect(wexes[0].is_deleted).toBe(0);

		const sets = await queryAll<Record<string, unknown>>(
			'SELECT * FROM workout_sets WHERE workout_exercise_id = ? ORDER BY set_number ASC',
			[wexes[0].id]
		);
		expect(sets).toHaveLength(2);
		expect(sets[0].set_number).toBe(1);
		expect(sets[0].target_reps).toBe(10);
		expect(sets[0].target_weight).toBe(225);
		expect(sets[0].set_type).toBe('working');
		expect(sets[1].set_number).toBe(2);
		expect(sets[1].target_reps).toBe(8);
		expect(sets[1].target_weight).toBe(245);
	});

	it('stores null FKs when no week and no routine are selected', async () => {
		const db = getDb();
		const userId = await seedUser();

		const workoutId = await handleWorkout(db, userId, {
			routineId: 0,
			blockWeekId: 0,
			title: 'Standalone',
			plannedOn: '2026-08-19'
		});

		const workout = await queryOne<Record<string, unknown>>('SELECT * FROM workouts WHERE id = ?', [
			workoutId
		]);
		expect(workout?.title).toBe('Standalone');
		expect(workout?.routine_id).toBeNull();
		expect(workout?.block_week_id).toBeNull();
		expect(workout?.planned_on).toBe('2026-08-19');
		expect(workout?.status).toBe('planned');

		const count = await queryOne<{ c: number }>(
			'SELECT COUNT(*) AS c FROM workout_exercises WHERE workout_id = ?',
			[workoutId]
		);
		expect(count?.c).toBe(0);
	});

	it('does not clone a routine that belongs to another user', async () => {
		const db = getDb();
		const userId = await seedUser();
		await seedUser({ id: 2, name: 'Other', email: 'other@example.com' });
		const exerciseId = await seedExercise({ id: 90, userId: 2 });
		const routineId = await seedRoutine({ id: 40, userId: 2 });
		await seedRoutineExercise({ id: 41, routineId, exerciseId });

		const workoutId = await handleWorkout(db, userId, {
			routineId,
			blockWeekId: null,
			title: 'Sneaky',
			plannedOn: '2026-08-19'
		});

		const count = await queryOne<{ c: number }>(
			'SELECT COUNT(*) AS c FROM workout_exercises WHERE workout_id = ?',
			[workoutId]
		);
		expect(count?.c).toBe(0);
	});
});
