import { describe, expect, it } from 'vitest';
import { normalizeWorkoutSetNumbers } from '$lib/server/services/workouts';
import type { Db } from '$lib/server/db';
import {
	getDb,
	queryOne,
	seedExercise,
	seedUser,
	seedWorkout,
	seedWorkoutExercise,
	seedWorkoutSet
} from '../support/fixtures';

// Port of tests/integration/normalize_sets_test.php
async function setNumber(db: Db, id: number): Promise<number | null> {
	const row = await queryOne<{ set_number: number }>(
		'SELECT set_number FROM workout_sets WHERE id = ?',
		[id]
	);
	return row ? row.set_number : null;
}

async function seedWorkoutExercises(): Promise<void> {
	await seedUser();
	await seedExercise({ id: 1, userId: 1 });
	await seedWorkout({ id: 1, userId: 1, title: 'Workout 1' });
	await seedWorkoutExercise({ id: 10, workoutId: 1, exerciseId: 1, sortOrder: 1 });
	await seedWorkoutExercise({ id: 20, workoutId: 1, exerciseId: 1, sortOrder: 2 });
}

describe('normalizeWorkoutSetNumbers', () => {
	it('collapses gaps in set numbers', async () => {
		const db = getDb();
		await seedWorkoutExercises();

		// Seed sets with a gap (set_number 2 is missing)
		await seedWorkoutSet({ id: 100, workoutExerciseId: 10, setNumber: 1 });
		await seedWorkoutSet({ id: 101, workoutExerciseId: 10, setNumber: 3 }); // Gap
		await seedWorkoutSet({ id: 102, workoutExerciseId: 10, setNumber: 4 });

		await normalizeWorkoutSetNumbers(db, 10);

		expect(await setNumber(db, 100)).toBe(1);
		expect(await setNumber(db, 101)).toBe(2);
		expect(await setNumber(db, 102)).toBe(3);
	});

	it('ignores deleted sets', async () => {
		const db = getDb();
		await seedWorkoutExercises();

		await seedWorkoutSet({ id: 100, workoutExerciseId: 10, setNumber: 1 });
		await seedWorkoutSet({ id: 101, workoutExerciseId: 10, setNumber: 2, isDeleted: 1 }); // deleted
		await seedWorkoutSet({ id: 102, workoutExerciseId: 10, setNumber: 3 });

		await normalizeWorkoutSetNumbers(db, 10);

		expect(await setNumber(db, 100)).toBe(1);
		expect(await setNumber(db, 101)).toBe(2); // deleted so nothing happened to it
		expect(await setNumber(db, 102)).toBe(2);
	});

	it('isolates updates to target exercise', async () => {
		const db = getDb();
		await seedWorkoutExercises();

		// Seed sets for exercise 10 and 20 (both have gaps)
		await seedWorkoutSet({ id: 100, workoutExerciseId: 10, setNumber: 1 });
		await seedWorkoutSet({ id: 101, workoutExerciseId: 10, setNumber: 3 });

		await seedWorkoutSet({ id: 200, workoutExerciseId: 20, setNumber: 1 });
		await seedWorkoutSet({ id: 201, workoutExerciseId: 20, setNumber: 3 });

		// Normalize ONLY exercise 10
		await normalizeWorkoutSetNumbers(db, 10);

		// Exercise 10 sets should be normalized (1, 2)
		expect(await setNumber(db, 100)).toBe(1);
		expect(await setNumber(db, 101)).toBe(2);

		// Exercise 20 sets should remain untouched (1, 3)
		expect(await setNumber(db, 200)).toBe(1);
		expect(await setNumber(db, 201)).toBe(3);
	});

	// This test demonstrates that bringing back 'deleted' sets would work ok.
	it('heals duplicate set numbers', async () => {
		const db = getDb();
		await seedWorkoutExercises();

		// Seed sets with duplicate set_numbers (two sets have set_number=2)
		await seedWorkoutSet({ id: 100, workoutExerciseId: 10, setNumber: 1 });
		await seedWorkoutSet({ id: 101, workoutExerciseId: 10, setNumber: 2 });
		await seedWorkoutSet({ id: 102, workoutExerciseId: 10, setNumber: 2 }); // Duplicate

		await normalizeWorkoutSetNumbers(db, 10);

		// Verify duplicates are resolved to 1, 2, 3
		expect(await setNumber(db, 100)).toBe(1);
		expect(await setNumber(db, 101)).toBe(2);
		expect(await setNumber(db, 102)).toBe(3);
	});
});
