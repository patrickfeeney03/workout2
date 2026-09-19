import { describe, expect, it } from 'vitest';
import { getNextSetNumber, getNextSortOrder } from '$lib/server/services/common';
import { getDb, seedExercise, seedRoutine, seedRoutineExercise, seedRoutineSet, seedUser } from '../support/fixtures';

// Port of tests/integration/sets_order_test.php
describe('set and sort ordering helpers', () => {
	it('getNextSetNumber returns 1 for empty table', async () => {
		const db = getDb();
		expect(await getNextSetNumber(db, 'routine_sets', 'routine_exercise_id', 999)).toBe(1);
	});

	it('getNextSetNumber increments from max active set_number', async () => {
		const db = getDb();
		const userId = await seedUser();
		const exerciseId = await seedExercise({ userId });
		const routineId = await seedRoutine({ userId });
		const routineExerciseId = await seedRoutineExercise({ id: 1, routineId, exerciseId });
		const otherRoutineExerciseId = await seedRoutineExercise({
			id: 2,
			routineId,
			exerciseId,
			sortOrder: 2
		});

		await seedRoutineSet({ id: 10, routineExerciseId, setNumber: 1 });
		await seedRoutineSet({ id: 11, routineExerciseId, setNumber: 2 });
		await seedRoutineSet({ id: 12, routineExerciseId, setNumber: 5, isDeleted: 1 });
		await seedRoutineSet({ id: 13, routineExerciseId: otherRoutineExerciseId, setNumber: 4 });

		expect(await getNextSetNumber(db, 'routine_sets', 'routine_exercise_id', routineExerciseId)).toBe(3);
		expect(await getNextSetNumber(db, 'routine_sets', 'routine_exercise_id', otherRoutineExerciseId)).toBe(5);
	});

	it('getNextSortOrder ignores deleted rows', async () => {
		const db = getDb();
		const userId = await seedUser();
		const exerciseId = await seedExercise({ userId });
		const routineId = await seedRoutine({ userId });

		await seedRoutineExercise({ id: 100, routineId, exerciseId, sortOrder: 1 });
		await seedRoutineExercise({ id: 101, routineId, exerciseId, sortOrder: 2 });
		await seedRoutineExercise({ id: 102, routineId, exerciseId, sortOrder: 10, isDeleted: 1 });

		expect(await getNextSortOrder(db, 'routine_exercises', 'routine_id', routineId)).toBe(3);
	});
});
