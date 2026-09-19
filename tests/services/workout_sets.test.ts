import { describe, expect, it } from 'vitest';
import { handleUpdateWorkoutSetsDTO } from '$lib/server/services/workouts';
import type { WorkoutSet } from '$lib/types';
import {
	getDb,
	queryOne,
	seedExercise,
	seedUser,
	seedWorkout,
	seedWorkoutExercise,
	seedWorkoutSet
} from '../support/fixtures';

// Port of tests/integration/workout_sets_test.php
describe('handleUpdateWorkoutSetsDTO', () => {
	it('updates an existing set', async () => {
		const db = getDb();
		await seedUser({ id: 1 });
		await seedExercise({ id: 5, userId: 1 });
		await seedWorkout({ id: 1, userId: 1 });
		await seedWorkoutExercise({ id: 10, workoutId: 1, exerciseId: 5, sortOrder: 1 });
		await seedWorkoutSet({
			id: 100,
			workoutExerciseId: 10,
			setNumber: 1,
			actualReps: 8,
			actualWeight: 135,
			setType: 'working',
			notes: 'old note 1',
			isDeleted: 0
		});

		const workoutSet: WorkoutSet = {
			id: 100,
			workoutExerciseId: 10,
			setNumber: 1,
			targetReps: null,
			targetWeight: null,
			actualReps: 10.0,
			actualWeight: 140.0,
			durationSeconds: null,
			distance: null,
			notes: 'felt heavy',
			createdAt: null,
			modifiedAt: null,
			setType: 'working',
			targetRest: null,
			isDeleted: 0
		};

		await handleUpdateWorkoutSetsDTO(db, workoutSet);

		const row = await queryOne<Record<string, unknown>>(
			'SELECT actual_reps, actual_weight, set_type, notes FROM workout_sets WHERE id = 100'
		);
		expect(row?.actual_reps).toBe(10.0);
		expect(row?.actual_weight).toBe(140.0);
		expect(row?.set_type).toBe('working');
		expect(row?.notes).toBe('felt heavy');
	});
});
