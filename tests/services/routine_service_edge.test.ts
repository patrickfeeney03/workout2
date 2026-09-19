import { describe, expect, it } from 'vitest';
import {
	createRoutine,
	deleteRoutine,
	deleteRoutineExercise,
	deleteRoutineSet
} from '$lib/server/services/routines';
import {
	getDb,
	queryOne,
	seedExercise,
	seedRoutine,
	seedRoutineExercise,
	seedRoutineSet,
	seedUser
} from '../support/fixtures';

// Port of tests/integration/routine_service_edge_test.php
describe('RoutineService edge cases', () => {
	it('createRoutine handles empty fields gracefully', async () => {
		const db = getDb();
		const userId = await seedUser({ id: 1 });

		const routine = await createRoutine(db, userId, {
			name: '   ',
			description: '',
			splitName: '   ',
			splitDay: '',
			notes: '   '
		});

		expect(routine?.id).toBe(1);
		expect(routine?.name).toBe('');
		expect(routine?.description).toBeNull();
		expect(routine?.splitName).toBeNull();
		expect(routine?.splitDay).toBeNull();
		expect(routine?.notes).toBeNull();
		expect(routine?.userId).toBe(1);
	});

	it('deleteRoutine cascades soft delete to exercises and sets', async () => {
		const db = getDb();
		await seedUser({ id: 1 });
		await seedExercise({ id: 1, userId: 1 });
		await seedRoutine({ id: 1, userId: 1, name: 'My Routine' });
		await seedRoutineExercise({ id: 10, routineId: 1, exerciseId: 1, sortOrder: 1 });
		await seedRoutineSet({ id: 100, routineExerciseId: 10, setNumber: 1 });

		await deleteRoutine(db, 1, 1);

		const routine = await queryOne<Record<string, unknown>>(
			'SELECT is_deleted FROM routines WHERE id = 1'
		);
		expect(routine?.is_deleted).toBe(1);

		const routineExercise = await queryOne<Record<string, unknown>>(
			'SELECT is_deleted FROM routine_exercises WHERE id = 10'
		);
		expect(routineExercise?.is_deleted).toBe(1);

		const routineSet = await queryOne<Record<string, unknown>>(
			'SELECT is_deleted FROM routine_sets WHERE id = 100'
		);
		expect(routineSet?.is_deleted).toBe(1);
	});

	it('deleteRoutineExercise soft deletes the exercise', async () => {
		const db = getDb();
		await seedUser({ id: 1 });
		await seedExercise({ id: 1, userId: 1 });
		await seedRoutine({ id: 1, userId: 1, name: 'My Routine' });
		await seedRoutineExercise({ id: 10, routineId: 1, exerciseId: 1, sortOrder: 1 });

		await deleteRoutineExercise(db, 1, 10);

		const routineExercise = await queryOne<Record<string, unknown>>(
			'SELECT is_deleted FROM routine_exercises WHERE id = 10'
		);
		expect(routineExercise?.is_deleted).toBe(1);
	});

	it('deleteRoutineSet soft deletes the set', async () => {
		const db = getDb();
		await seedUser({ id: 1 });
		await seedExercise({ id: 1, userId: 1 });
		await seedRoutine({ id: 1, userId: 1, name: 'My Routine' });
		await seedRoutineExercise({ id: 10, routineId: 1, exerciseId: 1, sortOrder: 1 });
		await seedRoutineSet({ id: 100, routineExerciseId: 10, setNumber: 1 });

		await deleteRoutineSet(db, 100, 1);

		const routineSet = await queryOne<Record<string, unknown>>(
			'SELECT is_deleted FROM routine_sets WHERE id = 100'
		);
		expect(routineSet?.is_deleted).toBe(1);
	});
});
