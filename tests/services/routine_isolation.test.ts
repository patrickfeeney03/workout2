import { describe, expect, it } from 'vitest';
import * as routines from '$lib/server/services/routines';
import {
	getDb,
	queryOne,
	seedExercise,
	seedRoutine,
	seedRoutineExercise,
	seedRoutineSet,
	seedUser
} from '../support/fixtures';

// Port of tests/integration/routine_isolation_test.php
describe('RoutineService isolation', () => {
	it('routines are isolated per user', async () => {
		const db = getDb();
		await seedUser({ id: 1 });
		await seedUser({ id: 2, name: 'User Two', email: 'two@example.com' });
		await seedRoutine({ id: 10, userId: 1, name: 'User 1 Routine' });
		await seedRoutine({ id: 11, userId: 2, name: 'User 2 Routine' });

		const userRoutines = await routines.getRoutines(db, 1);
		expect(userRoutines).toHaveLength(1);
		expect(userRoutines[0].name).toBe('User 1 Routine');
		expect(userRoutines[0].id).toBe(10);

		expect(await routines.getRoutine(db, 11, 1)).toBeNull();
	});

	it('routine exercises and sets are isolated per user', async () => {
		const db = getDb();
		await seedUser({ id: 1 });
		await seedUser({ id: 2, name: 'User Two', email: 'two@example.com' });
		await seedExercise({ id: 1, userId: 1, name: 'User 1 Squat' });
		await seedExercise({ id: 2, userId: 2, name: 'User 2 Bench' });
		await seedRoutine({ id: 10, userId: 1, name: 'User 1 Routine' });
		await seedRoutine({ id: 11, userId: 2, name: 'User 2 Routine' });
		await seedRoutineExercise({ id: 20, routineId: 10, exerciseId: 1, sortOrder: 1 });
		await seedRoutineExercise({ id: 21, routineId: 11, exerciseId: 2, sortOrder: 1 });
		await seedRoutineSet({ id: 100, routineExerciseId: 20, setNumber: 1 });
		await seedRoutineSet({ id: 101, routineExerciseId: 21, setNumber: 1 });

		const exercises = await routines.getRoutineExercises(db, 1);
		expect(exercises).toHaveLength(1);
		expect(exercises[0].id).toBe(20);

		expect(await routines.getRoutineExercisesFromRoutine(db, 11, 1)).toEqual([]);
		expect(await routines.getRoutineExercise(db, 21, 1)).toBeNull();
		expect(await routines.getSetsForRoutineExercise(db, 21, 1)).toEqual([]);
		expect(await routines.getRoutineSet(db, 101, 1)).toBeNull();
	});

	it('mutations do not affect another user routine', async () => {
		const db = getDb();
		await seedUser({ id: 1 });
		await seedUser({ id: 2, name: 'User Two', email: 'two@example.com' });
		await seedExercise({ id: 1, userId: 1, name: 'User 1 Squat' });
		await seedExercise({ id: 2, userId: 2, name: 'User 2 Bench' });
		await seedRoutine({ id: 10, userId: 1, name: 'User 1 Routine' });
		await seedRoutine({ id: 11, userId: 2, name: 'User 2 Routine' });
		await seedRoutineExercise({ id: 20, routineId: 10, exerciseId: 1, sortOrder: 1 });
		await seedRoutineExercise({ id: 21, routineId: 11, exerciseId: 2, sortOrder: 1 });
		await seedRoutineSet({ id: 100, routineExerciseId: 20, setNumber: 1 });
		await seedRoutineSet({ id: 101, routineExerciseId: 21, setNumber: 1 });
		await seedRoutineSet({ id: 102, routineExerciseId: 21, setNumber: 2 });

		await routines.deleteRoutine(db, 1, 11);
		expect(
			(await queryOne<Record<string, unknown>>('SELECT is_deleted FROM routines WHERE id = 11'))
				?.is_deleted
		).toBe(0);

		await routines.deleteRoutineExercise(db, 1, 21);
		expect(
			(
				await queryOne<Record<string, unknown>>(
					'SELECT is_deleted FROM routine_exercises WHERE id = 21'
				)
			)?.is_deleted
		).toBe(0);

		await routines.deleteRoutineSet(db, 101, 1);
		expect(
			(await queryOne<Record<string, unknown>>('SELECT is_deleted FROM routine_sets WHERE id = 101'))
				?.is_deleted
		).toBe(0);

		await routines.handleUpdateRoutineSets(db, 1, {
			routineExerciseId: 21,
			targetRest: '100s',
			exerciseNotes: 'hacked'
		});
		const exerciseRow = await queryOne<Record<string, unknown>>(
			'SELECT target_rest, notes FROM routine_exercises WHERE id = 21'
		);
		expect(exerciseRow?.target_rest).toBeNull();
		expect(exerciseRow?.notes).toBeNull();

		expect(await routines.createEmptyRoutineSet(db, 21, 1)).toBeNull();
		expect(
			(
				await queryOne<{ count: number }>(
					'SELECT COUNT(*) AS count FROM routine_sets WHERE routine_exercise_id = 21'
				)
			)?.count
		).toBe(2);

		expect(await routines.moveRoutineSet(db, 102, 'up', 1)).toBe(false);
		expect(
			(await queryOne<Record<string, unknown>>('SELECT set_number FROM routine_sets WHERE id = 102'))
				?.set_number
		).toBe(2);

		await routines.addExerciseToRoutine(db, 11, 1, '', 1);
		expect(
			(
				await queryOne<{ count: number }>(
					'SELECT COUNT(*) AS count FROM routine_exercises WHERE routine_id = 11'
				)
			)?.count
		).toBe(1);

		await routines.addExerciseToRoutine(db, 10, 2, '', 1);
		expect(
			(
				await queryOne<{ count: number }>(
					'SELECT COUNT(*) AS count FROM routine_exercises WHERE routine_id = 10'
				)
			)?.count
		).toBe(1);
	});

	it('createRoutine uses provided userId', async () => {
		const db = getDb();
		await seedUser({ id: 1 });
		await seedUser({ id: 2, name: 'User Two', email: 'two@example.com' });

		const routine = await routines.createRoutine(db, 2, {
			name: 'Created By User 2',
			description: '',
			splitName: '',
			splitDay: '',
			notes: ''
		});

		expect(routine?.userId).toBe(2);
		expect(routine?.name).toBe('Created By User 2');

		expect(await routines.getRoutines(db, 1)).toHaveLength(0);

		const forUser2 = await routines.getRoutines(db, 2);
		expect(forUser2).toHaveLength(1);
		expect(forUser2[0].id).toBe(routine?.id);
	});

	it('addExerciseToRoutine creates exercises for the given user', async () => {
		const db = getDb();
		await seedUser({ id: 1 });
		await seedUser({ id: 2, name: 'User Two', email: 'two@example.com' });
		await seedRoutine({ id: 10, userId: 1, name: 'User 1 Routine' });

		await routines.addExerciseToRoutine(db, 10, 0, 'New Lift', 1);

		const created = await queryOne<Record<string, unknown>>(
			"SELECT * FROM exercises WHERE name = 'New Lift'"
		);
		expect(created?.user_id).toBe(1);

		expect(
			(
				await queryOne<{ count: number }>(
					'SELECT COUNT(*) AS count FROM routine_exercises WHERE routine_id = 10'
				)
			)?.count
		).toBe(1);
	});
});
