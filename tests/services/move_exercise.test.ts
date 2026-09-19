import { describe, expect, it } from 'vitest';
import { moveExercise } from '$lib/server/services/common';
import { getWorkoutExercise, getWorkoutExercisesForWorkout } from '$lib/server/services/workouts';
import type { Db } from '$lib/server/db';
import { getDb, queryOne, seedExercise, seedUser, seedWorkout, seedWorkoutExercise } from '../support/fixtures';

// Port of tests/integration/move_exercise_test.php
async function callMoveExercise(db: Db, id: number, dir: string): Promise<boolean> {
	const currentExercise = await getWorkoutExercise(db, id, 1);
	if (!currentExercise) {
		return false;
	}
	const workoutExercises = await getWorkoutExercisesForWorkout(db, currentExercise.workoutId, 1);
	return moveExercise(db, currentExercise, workoutExercises, dir, 'workout_exercises');
}

async function sortOrder(db: Db, id: number): Promise<number | null> {
	const row = await queryOne<{ sort_order: number }>(
		'SELECT sort_order FROM workout_exercises WHERE id = ?',
		[id]
	);
	return row ? row.sort_order : null;
}

async function seedWorkoutWithExercise(): Promise<void> {
	await seedUser();
	await seedExercise({ id: 1, userId: 1 });
	await seedWorkout({ id: 1, userId: 1, title: 'Workout 1' });
}

describe('moveExercise', () => {
	it('moves an exercise up by swapping sort_order', async () => {
		const db = getDb();
		await seedWorkoutWithExercise();
		await seedWorkoutExercise({ id: 10, workoutId: 1, exerciseId: 1, sortOrder: 1 });
		await seedWorkoutExercise({ id: 11, workoutId: 1, exerciseId: 1, sortOrder: 2 });
		await seedWorkoutExercise({ id: 12, workoutId: 1, exerciseId: 1, sortOrder: 3 });

		expect(await callMoveExercise(db, 11, 'up')).toBe(true);

		expect(await sortOrder(db, 10)).toBe(2);
		expect(await sortOrder(db, 11)).toBe(1);
	});

	it('moves an exercise down by swapping sort_order', async () => {
		const db = getDb();
		await seedWorkoutWithExercise();
		await seedWorkoutExercise({ id: 10, workoutId: 1, exerciseId: 1, sortOrder: 1 });
		await seedWorkoutExercise({ id: 11, workoutId: 1, exerciseId: 1, sortOrder: 2 });
		await seedWorkoutExercise({ id: 12, workoutId: 1, exerciseId: 1, sortOrder: 3 });

		expect(await callMoveExercise(db, 11, 'down')).toBe(true);

		expect(await sortOrder(db, 11)).toBe(3);
		expect(await sortOrder(db, 12)).toBe(2);
	});

	it('top exercise up is a no-op', async () => {
		const db = getDb();
		await seedWorkoutWithExercise();
		await seedWorkoutExercise({ id: 10, workoutId: 1, exerciseId: 1, sortOrder: 1 });
		await seedWorkoutExercise({ id: 11, workoutId: 1, exerciseId: 1, sortOrder: 2 });

		expect(await callMoveExercise(db, 10, 'up')).toBe(false);

		expect(await sortOrder(db, 10)).toBe(1);
		expect(await sortOrder(db, 11)).toBe(2);
	});

	it('bottom exercise down is a no-op', async () => {
		const db = getDb();
		await seedWorkoutWithExercise();
		await seedWorkoutExercise({ id: 10, workoutId: 1, exerciseId: 1, sortOrder: 1 });
		await seedWorkoutExercise({ id: 11, workoutId: 1, exerciseId: 1, sortOrder: 2 });

		expect(await callMoveExercise(db, 11, 'down')).toBe(false);

		expect(await sortOrder(db, 10)).toBe(1);
		expect(await sortOrder(db, 11)).toBe(2);
	});

	it('when only one exercise exists', async () => {
		const db = getDb();
		await seedWorkoutWithExercise();
		await seedWorkoutExercise({ id: 10, workoutId: 1, exerciseId: 1, sortOrder: 1 });

		expect(await callMoveExercise(db, 10, 'up')).toBe(false);
		expect(await callMoveExercise(db, 10, 'up')).toBe(false);
		expect(await callMoveExercise(db, 10, 'up')).toBe(false);

		expect(await callMoveExercise(db, 10, 'down')).toBe(false);
		expect(await callMoveExercise(db, 10, 'down')).toBe(false);

		expect(await sortOrder(db, 10)).toBe(1);
	});

	it('when exercise doesnt exist', async () => {
		const db = getDb();
		await seedWorkoutWithExercise();

		expect(await callMoveExercise(db, 10, 'up')).toBe(false);

		// doesn't really matter, since it just doesn't exist.
		expect(await sortOrder(db, 10)).toBeNull();
	});

	it('when exercise is marked is_deleted=1 returns false', async () => {
		const db = getDb();
		await seedWorkoutWithExercise();
		await seedWorkoutExercise({ id: 10, workoutId: 1, exerciseId: 1, sortOrder: 1, isDeleted: 1 });
		await seedWorkoutExercise({ id: 11, workoutId: 1, exerciseId: 1, sortOrder: 2 });
		await seedWorkoutExercise({ id: 12, workoutId: 1, exerciseId: 1, sortOrder: 3 });

		// Should return false because exercise 10 is deleted
		expect(await callMoveExercise(db, 10, 'up')).toBe(false);

		const row = await queryOne<Record<string, unknown>>(
			'SELECT * FROM workout_exercises WHERE id = 10'
		);
		expect(row?.sort_order).toBe(1);
		expect(row?.is_deleted).toBe(1);
	});

	it('skips deleted exercises in the list when swapping active ones', async () => {
		const db = getDb();
		await seedWorkoutWithExercise();

		// Seed 3 exercises: 10 (active), 11 (deleted), 12 (active)
		await seedWorkoutExercise({ id: 10, workoutId: 1, exerciseId: 1, sortOrder: 1 });
		await seedWorkoutExercise({ id: 11, workoutId: 1, exerciseId: 1, sortOrder: 2, isDeleted: 1 });
		await seedWorkoutExercise({ id: 12, workoutId: 1, exerciseId: 1, sortOrder: 3 });

		// Move exercise 12 "up" (should skip deleted 11 and swap directly with 10)
		expect(await callMoveExercise(db, 12, 'up')).toBe(true);

		expect(await sortOrder(db, 10)).toBe(3); // 10 goes to order 3
		expect(await sortOrder(db, 11)).toBe(2); // deleted 11 stays unchanged
		expect(await sortOrder(db, 12)).toBe(1); // 12 goes to order 1
	});
});
