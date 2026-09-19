import { describe, expect, it } from 'vitest';
import { createEmptyWorkoutSet } from '$lib/server/services/workouts';
import type { WorkoutSet } from '$lib/types';
import {
	getDb,
	queryAll,
	seedExercise,
	seedUser,
	seedWorkout,
	seedWorkoutExercise,
	seedWorkoutSet
} from '../support/fixtures';

// Port of tests/integration/add_empty_set_test.php
async function seedWorkoutExerciseFixture(): Promise<void> {
	await seedUser();
	await seedExercise({ id: 1, userId: 1 });
	await seedWorkout({ id: 1, userId: 1, title: 'Workout 1' });
	await seedWorkoutExercise({ id: 10, workoutId: 1, exerciseId: 1, sortOrder: 1 });
}

describe('createEmptyWorkoutSet', () => {
	it('adds set to the end', async () => {
		const db = getDb();
		await seedWorkoutExerciseFixture();

		// Seed one existing set
		await seedWorkoutSet({
			id: 100,
			workoutExerciseId: 10,
			setNumber: 1,
			actualReps: 10,
			actualWeight: 135,
			setType: 'working'
		});

		const newSet = (await createEmptyWorkoutSet(db, 10, 1, 'end')) as WorkoutSet;

		// Verify database changes
		const dbSets = await queryAll<Record<string, unknown>>(
			'SELECT * FROM workout_sets WHERE workout_exercise_id = 10 ORDER BY set_number ASC'
		);
		expect(dbSets).toHaveLength(2);

		// Assert the new set returned matches database values
		expect(newSet.setNumber).toBe(2);
		expect(newSet.setType).toBe('working');
		expect(newSet.actualReps).toBeNull();

		// Assert database sync
		expect(dbSets[1].set_number).toBe(2);
		expect(dbSets[1].set_type).toBe('working');
	});

	it('adds set to the start and re-sequences existing sets', async () => {
		const db = getDb();
		await seedWorkoutExerciseFixture();

		// Seed one existing set
		await seedWorkoutSet({
			id: 100,
			workoutExerciseId: 10,
			setNumber: 1,
			actualReps: 10,
			actualWeight: 135,
			setType: 'working'
		});

		// Returns array of all sets when added to start
		const sets = (await createEmptyWorkoutSet(db, 10, 1, 'start')) as WorkoutSet[];

		expect(sets).toHaveLength(2);

		// The new set should be set_number = 1, type = warmup
		expect(sets[0].setNumber).toBe(1);
		expect(sets[0].setType).toBe('warmup');
		expect(sets[0].actualReps).toBeNull();

		// The original set (id=100) should be shifted to set_number = 2
		expect(sets[1].id).toBe(100);
		expect(sets[1].setNumber).toBe(2);
		expect(sets[1].setType).toBe('working');
	});

	it('adds set when no sets exist yet', async () => {
		const db = getDb();
		await seedWorkoutExerciseFixture();

		// Returns array of all sets when added to start
		const sets = (await createEmptyWorkoutSet(db, 10, 1, 'start')) as WorkoutSet[];

		expect(sets).toHaveLength(1);

		expect(sets[0].setNumber).toBe(1);
		expect(sets[0].setType).toBe('warmup');
		expect(sets[0].actualReps).toBeNull();
	});
});
