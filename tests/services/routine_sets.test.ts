import { describe, expect, it } from 'vitest';
import { handleUpdateRoutineSets } from '$lib/server/services/routines';
import {
	getDb,
	queryOne,
	seedExercise,
	seedRoutine,
	seedRoutineExercise,
	seedRoutineSet,
	seedUser
} from '../support/fixtures';

// Port of tests/integration/routine_sets_test.php
describe('handleUpdateRoutineSets', () => {
	it('updates routine exercise notes and target rest', async () => {
		const db = getDb();
		await seedUser({ id: 1 });
		await seedExercise({ id: 5, userId: 1 });
		await seedRoutine({ id: 10, userId: 1, name: 'My Routine' });
		await seedRoutineExercise({
			id: 20,
			routineId: 10,
			exerciseId: 5,
			sortOrder: 1,
			targetRest: '90s',
			notes: 'old notes'
		});

		await handleUpdateRoutineSets(db, 1, {
			routineExerciseId: 20,
			targetRest: '100s',
			exerciseNotes: 'updated notes'
		});

		const row = await queryOne<Record<string, unknown>>(
			'SELECT target_rest, notes FROM routine_exercises WHERE id = 20'
		);
		expect(row?.target_rest).toBe('100s');
		expect(row?.notes).toBe('updated notes');
	});

	it('updates existing sets and inserts new template sets', async () => {
		const db = getDb();
		await seedUser({ id: 1 });
		await seedExercise({ id: 5, userId: 1 });
		await seedRoutine({ id: 10, userId: 1, name: 'My Routine' });
		await seedRoutineExercise({
			id: 20,
			routineId: 10,
			exerciseId: 5,
			sortOrder: 1,
			targetRest: '90s',
			notes: 'notes'
		});
		await seedRoutineSet({
			id: 100,
			routineExerciseId: 20,
			setNumber: 1,
			targetReps: 10,
			targetWeight: 135,
			setType: 'warmup',
			notes: 'old notes'
		});

		await handleUpdateRoutineSets(db, 1, {
			routineExerciseId: 20,
			targetReps: { 100: '12', new_1: '10' },
			targetWeight: { 100: '140', new_1: '150' },
			setTypes: { 100: 'working', new_1: 'warmup' },
			notes: { 100: 'updated set note', new_1: 'new set note' }
		});

		const row100 = await queryOne<Record<string, unknown>>(
			'SELECT target_reps, target_weight, set_type, notes FROM routine_sets WHERE id = 100'
		);
		expect(row100?.target_reps).toBe(12);
		expect(row100?.target_weight).toBe(140);
		expect(row100?.set_type).toBe('working');
		expect(row100?.notes).toBe('updated set note');

		const rowNew = await queryOne<Record<string, unknown>>(
			`SELECT set_number, target_reps, target_weight, set_type, notes
			 FROM routine_sets
			 WHERE routine_exercise_id = 20 AND id != 100`
		);
		expect(rowNew?.set_number).toBe(2);
		expect(rowNew?.target_reps).toBe(10);
		expect(rowNew?.target_weight).toBe(150);
		expect(rowNew?.set_type).toBe('warmup');
		expect(rowNew?.notes).toBe('new set note');
	});

	it('converts empty strings and null inputs to database NULL', async () => {
		const db = getDb();
		await seedUser({ id: 1 });
		await seedExercise({ id: 5, userId: 1 });
		await seedRoutine({ id: 10, userId: 1, name: 'My Routine' });
		await seedRoutineExercise({
			id: 20,
			routineId: 10,
			exerciseId: 5,
			sortOrder: 1,
			targetRest: '90s',
			notes: 'notes'
		});

		await handleUpdateRoutineSets(db, 1, {
			routineExerciseId: 20,
			targetReps: { new_1: '' },
			targetWeight: { new_1: '' },
			setTypes: { new_1: 'working' },
			notes: { new_1: '' }
		});

		const row = await queryOne<Record<string, unknown>>(
			`SELECT target_reps, target_weight, notes
			 FROM routine_sets
			 WHERE routine_exercise_id = 20`
		);
		expect(row?.target_reps).toBeNull();
		expect(row?.target_weight).toBeNull();
		expect(row?.notes).toBeNull();
	});
});
