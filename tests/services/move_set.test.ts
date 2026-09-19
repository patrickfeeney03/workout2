import { describe, expect, it } from 'vitest';
import { moveSet } from '$lib/server/services/common';
import { moveRoutineSet } from '$lib/server/services/routines';
import { moveWorkoutSet } from '$lib/server/services/workouts';
import type { Db } from '$lib/server/db';
import {
	getDb,
	queryOne,
	seedExercise,
	seedRoutine,
	seedRoutineExercise,
	seedRoutineSet,
	seedUser,
	seedWorkout,
	seedWorkoutExercise,
	seedWorkoutSet
} from '../support/fixtures';

// Port of tests/integration/move_set_test.php
async function setNumber(db: Db, id: number): Promise<number | null> {
	const row = await queryOne<{ set_number: number }>(
		'SELECT set_number FROM routine_sets WHERE id = ?',
		[id]
	);
	return row ? row.set_number : null;
}

async function seedRoutineForSets(): Promise<void> {
	await seedUser();
	await seedExercise({ id: 1, userId: 1 });
	await seedRoutine({ id: 1, userId: 1, name: 'My Routine' });
	await seedRoutineExercise({ id: 1, routineId: 1, exerciseId: 1, sortOrder: 1 });
}

describe('moveSet', () => {
	it('moves a set up by swapping set_number', async () => {
		const db = getDb();
		await seedRoutineForSets();

		await seedRoutineSet({ id: 10, routineExerciseId: 1, setNumber: 1 });
		await seedRoutineSet({ id: 11, routineExerciseId: 1, setNumber: 2 });
		await seedRoutineSet({ id: 12, routineExerciseId: 1, setNumber: 3 });

		expect(await moveSet(db, 11, 'up', 'routine_sets', 'routine_exercise_id')).toBe(true);

		expect(await setNumber(db, 10)).toBe(2);
		expect(await setNumber(db, 11)).toBe(1);
	});

	it('moves a set down by swapping set_number', async () => {
		const db = getDb();
		await seedRoutineForSets();

		await seedRoutineSet({ id: 10, routineExerciseId: 1, setNumber: 1 });
		await seedRoutineSet({ id: 11, routineExerciseId: 1, setNumber: 2 });
		await seedRoutineSet({ id: 12, routineExerciseId: 1, setNumber: 3 });

		expect(await moveSet(db, 11, 'down', 'routine_sets', 'routine_exercise_id')).toBe(true);

		expect(await setNumber(db, 11)).toBe(3);
		expect(await setNumber(db, 12)).toBe(2);
	});

	it('top set up is a no-op returning false', async () => {
		const db = getDb();
		await seedRoutineForSets();

		await seedRoutineSet({ id: 10, routineExerciseId: 1, setNumber: 1 });
		await seedRoutineSet({ id: 11, routineExerciseId: 1, setNumber: 2 });

		expect(await moveSet(db, 10, 'up', 'routine_sets', 'routine_exercise_id')).toBe(false);

		expect(await setNumber(db, 10)).toBe(1);
		expect(await setNumber(db, 11)).toBe(2);
	});

	it('bottom set down is a no-op returning false', async () => {
		const db = getDb();
		await seedRoutineForSets();

		await seedRoutineSet({ id: 10, routineExerciseId: 1, setNumber: 1 });
		await seedRoutineSet({ id: 11, routineExerciseId: 1, setNumber: 2 });

		expect(await moveSet(db, 11, 'down', 'routine_sets', 'routine_exercise_id')).toBe(false);

		expect(await setNumber(db, 10)).toBe(1);
		expect(await setNumber(db, 11)).toBe(2);
	});

	it('when set does not exist returns false', async () => {
		const db = getDb();
		expect(await moveSet(db, 999, 'up', 'routine_sets', 'routine_exercise_id')).toBe(false);
	});

	/* Wrapper tests, moveRoutineSet and moveWorkoutSet */

	it('moveRoutineSet wrapper swaps routine_sets', async () => {
		const db = getDb();
		await seedRoutineForSets();

		await seedRoutineSet({ id: 10, routineExerciseId: 1, setNumber: 1 });
		await seedRoutineSet({ id: 11, routineExerciseId: 1, setNumber: 2 });

		expect(await moveRoutineSet(db, 11, 'up', 1)).toBe(true);

		expect(await setNumber(db, 10)).toBe(2);
		expect(await setNumber(db, 11)).toBe(1);
	});

	it('moveWorkoutSet wrapper swaps workout_sets', async () => {
		const db = getDb();
		await seedUser();
		await seedExercise({ id: 1, userId: 1 });
		await seedWorkout({ id: 1, userId: 1, title: 'My Workout' });
		await seedWorkoutExercise({ id: 1, workoutId: 1, exerciseId: 1, sortOrder: 1 });

		await seedWorkoutSet({ id: 10, workoutExerciseId: 1, setNumber: 1 });
		await seedWorkoutSet({ id: 11, workoutExerciseId: 1, setNumber: 2 });

		expect(await moveWorkoutSet(db, 11, 'up', 1)).toBe(true);

		const row10 = await queryOne<{ set_number: number }>(
			'SELECT set_number FROM workout_sets WHERE id = 10'
		);
		const row11 = await queryOne<{ set_number: number }>(
			'SELECT set_number FROM workout_sets WHERE id = 11'
		);
		expect(row10?.set_number).toBe(2);
		expect(row11?.set_number).toBe(1);
	});

	it('when set is marked is_deleted=1 returns false', async () => {
		const db = getDb();
		await seedRoutineForSets();

		await seedRoutineSet({ id: 10, routineExerciseId: 1, setNumber: 1, isDeleted: 1 });
		await seedRoutineSet({ id: 11, routineExerciseId: 1, setNumber: 2 });
		await seedRoutineSet({ id: 12, routineExerciseId: 1, setNumber: 3 });

		// Should return false because set 10 is deleted
		expect(await moveSet(db, 10, 'up', 'routine_sets', 'routine_exercise_id')).toBe(false);
	});

	it('skips deleted sets when swapping active ones', async () => {
		const db = getDb();
		await seedRoutineForSets();

		// Seed 3 sets: 10 (active), 11 (deleted), 12 (active)
		await seedRoutineSet({ id: 10, routineExerciseId: 1, setNumber: 1 });
		await seedRoutineSet({ id: 11, routineExerciseId: 1, setNumber: 2, isDeleted: 1 });
		await seedRoutineSet({ id: 12, routineExerciseId: 1, setNumber: 3 });

		// Move set 12 "up" (should skip deleted 11 and swap directly with 10)
		expect(await moveSet(db, 12, 'up', 'routine_sets', 'routine_exercise_id')).toBe(true);

		expect(await setNumber(db, 10)).toBe(3); // 10 goes to order 3
		expect(await setNumber(db, 11)).toBe(2); // deleted 11 stays unchanged
		expect(await setNumber(db, 12)).toBe(1); // 12 goes to order 1
	});
});
