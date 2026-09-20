import { describe, expect, it } from 'vitest';
import { getWorkoutExerciseNames, saveWorkoutExercise } from '$lib/server/services/workouts';
import type { WorkoutSetUpdate } from '$lib/server/services/workouts';
import {
	getDb,
	queryAll,
	queryOne,
	seedExercise,
	seedUser,
	seedWorkout,
	seedWorkoutExercise,
	seedWorkoutSet
} from '../support/fixtures';

function setUpdate(
	id: number,
	actualReps: number | null,
	actualWeight: number | null,
	extra: Partial<WorkoutSetUpdate> = {}
): WorkoutSetUpdate {
	return { id, actualReps, actualWeight, setType: 'working', notes: null, ...extra };
}

async function workoutStatus(workoutId: number): Promise<string | null> {
	const row = await queryOne<{ status: string }>('SELECT status FROM workouts WHERE id = ?', [
		workoutId
	]);
	return row?.status ?? null;
}

describe('saveWorkoutExercise', () => {
	it('saves every posted set plus rest and notes in one batch', async () => {
		const db = getDb();
		await seedUser({ id: 1 });
		await seedExercise({ id: 5, userId: 1 });
		await seedWorkout({ id: 1, userId: 1 });
		await seedWorkoutExercise({ id: 10, workoutId: 1, exerciseId: 5, sortOrder: 1 });
		await seedWorkoutSet({ id: 100, workoutExerciseId: 10, setNumber: 1 });
		await seedWorkoutSet({ id: 101, workoutExerciseId: 10, setNumber: 2 });
		await seedWorkoutSet({ id: 102, workoutExerciseId: 10, setNumber: 3 });

		const saved = await saveWorkoutExercise(
			db,
			1,
			10,
			[
				setUpdate(100, 5, 60, { setType: 'warmup', notes: 'easy' }),
				setUpdate(101, 8, 80),
				setUpdate(102, 8, 82.5, { notes: 'failed last rep' })
			],
			{ targetRest: '2 mins', notes: 'keep elbows tucked' }
		);

		expect(saved).toBe(true);

		const sets = await queryAll<Record<string, unknown>>(
			'SELECT id, actual_reps, actual_weight, set_type, notes FROM workout_sets ORDER BY id'
		);
		expect(sets.map((row) => [row.id, row.actual_reps, row.actual_weight, row.set_type])).toEqual([
			[100, 5, 60, 'warmup'],
			[101, 8, 80, 'working'],
			[102, 8, 82.5, 'working']
		]);
		expect(sets[0].notes).toBe('easy');
		expect(sets[2].notes).toBe('failed last rep');

		const exercise = await queryOne<Record<string, unknown>>(
			'SELECT target_rest, notes FROM workout_exercises WHERE id = 10'
		);
		expect(exercise?.target_rest).toBe('2 mins');
		expect(exercise?.notes).toBe('keep elbows tucked');
	});

	it('only touches sets that belong to the posted workout exercise', async () => {
		const db = getDb();
		await seedUser({ id: 1 });
		await seedExercise({ id: 5, userId: 1 });
		await seedExercise({ id: 6, userId: 1 });
		await seedWorkout({ id: 1, userId: 1 });
		await seedWorkoutExercise({ id: 10, workoutId: 1, exerciseId: 5, sortOrder: 1 });
		await seedWorkoutExercise({ id: 11, workoutId: 1, exerciseId: 6, sortOrder: 2 });
		await seedWorkoutSet({ id: 100, workoutExerciseId: 10, setNumber: 1 });
		await seedWorkoutSet({ id: 200, workoutExerciseId: 11, setNumber: 1 });

		// 200 belongs to exercise 11 even though it is owned by the same user; a form for exercise 10
		// must not be able to edit it.
		await saveWorkoutExercise(db, 1, 10, [setUpdate(100, 10, 100), setUpdate(200, 99, 999)]);

		const other = await queryOne<Record<string, unknown>>(
			'SELECT actual_reps, actual_weight FROM workout_sets WHERE id = 200'
		);
		expect(other?.actual_reps).toBeNull();
		expect(other?.actual_weight).toBeNull();
	});

	it('does not update soft-deleted sets', async () => {
		const db = getDb();
		await seedUser({ id: 1 });
		await seedExercise({ id: 5, userId: 1 });
		await seedWorkout({ id: 1, userId: 1 });
		await seedWorkoutExercise({ id: 10, workoutId: 1, exerciseId: 5, sortOrder: 1 });
		await seedWorkoutSet({ id: 100, workoutExerciseId: 10, setNumber: 1, isDeleted: 1 });

		await saveWorkoutExercise(db, 1, 10, [setUpdate(100, 10, 100)]);

		const deleted = await queryOne<Record<string, unknown>>(
			'SELECT actual_reps FROM workout_sets WHERE id = 100'
		);
		expect(deleted?.actual_reps).toBeNull();
	});

	it('returns false and writes nothing for another user’s workout exercise', async () => {
		const db = getDb();
		await seedUser({ id: 1 });
		await seedUser({ id: 2 });
		await seedExercise({ id: 5, userId: 2 });
		await seedWorkout({ id: 1, userId: 2 });
		await seedWorkoutExercise({ id: 10, workoutId: 1, exerciseId: 5, sortOrder: 1 });
		await seedWorkoutSet({ id: 100, workoutExerciseId: 10, setNumber: 1 });

		const saved = await saveWorkoutExercise(db, 1, 10, [setUpdate(100, 10, 100)]);

		expect(saved).toBe(false);
		const set = await queryOne<Record<string, unknown>>(
			'SELECT actual_reps FROM workout_sets WHERE id = 100'
		);
		expect(set?.actual_reps).toBeNull();
	});

	it('completes the workout when every active set has reps and weight', async () => {
		const db = getDb();
		await seedUser({ id: 1 });
		await seedExercise({ id: 5, userId: 1 });
		await seedWorkout({ id: 1, userId: 1, status: 'planned' });
		await seedWorkoutExercise({ id: 10, workoutId: 1, exerciseId: 5, sortOrder: 1 });
		await seedWorkoutSet({ id: 100, workoutExerciseId: 10, setNumber: 1 });
		await seedWorkoutSet({ id: 101, workoutExerciseId: 10, setNumber: 2 });

		await saveWorkoutExercise(db, 1, 10, [setUpdate(100, 8, 80), setUpdate(101, 8, 82)]);

		expect(await workoutStatus(1)).toBe('completed');
	});

	it('leaves the workout planned while any active set is incomplete', async () => {
		const db = getDb();
		await seedUser({ id: 1 });
		await seedExercise({ id: 5, userId: 1 });
		await seedWorkout({ id: 1, userId: 1, status: 'planned' });
		await seedWorkoutExercise({ id: 10, workoutId: 1, exerciseId: 5, sortOrder: 1 });
		await seedWorkoutSet({ id: 100, workoutExerciseId: 10, setNumber: 1 });
		await seedWorkoutSet({ id: 101, workoutExerciseId: 10, setNumber: 2 });

		await saveWorkoutExercise(db, 1, 10, [setUpdate(100, 8, 80), setUpdate(101, 8, null)]);

		expect(await workoutStatus(1)).toBe('planned');
	});

	it('does not complete a workout that has no sets at all', async () => {
		const db = getDb();
		await seedUser({ id: 1 });
		await seedExercise({ id: 5, userId: 1 });
		await seedWorkout({ id: 1, userId: 1, status: 'planned' });
		await seedWorkoutExercise({ id: 10, workoutId: 1, exerciseId: 5, sortOrder: 1 });

		await saveWorkoutExercise(db, 1, 10, [], { targetRest: '90s' });

		expect(await workoutStatus(1)).toBe('planned');
	});

	it('ignores soft-deleted sets when deciding completion', async () => {
		const db = getDb();
		await seedUser({ id: 1 });
		await seedExercise({ id: 5, userId: 1 });
		await seedWorkout({ id: 1, userId: 1, status: 'planned' });
		await seedWorkoutExercise({ id: 10, workoutId: 1, exerciseId: 5, sortOrder: 1 });
		await seedWorkoutSet({ id: 100, workoutExerciseId: 10, setNumber: 1, isDeleted: 1 });
		await seedWorkoutSet({ id: 101, workoutExerciseId: 10, setNumber: 2 });

		// The deleted set has no actuals, but it must not block completion of the active set.
		await saveWorkoutExercise(db, 1, 10, [setUpdate(101, 8, 80)]);

		expect(await workoutStatus(1)).toBe('completed');
	});

	it('rolls the whole batch back when one statement fails', async () => {
		const db = getDb();
		await seedUser({ id: 1 });
		await seedExercise({ id: 5, userId: 1 });
		await seedWorkout({ id: 1, userId: 1 });
		await seedWorkoutExercise({ id: 10, workoutId: 1, exerciseId: 5, sortOrder: 1, targetRest: 'old' });
		await seedWorkoutSet({ id: 100, workoutExerciseId: 10, setNumber: 1, actualReps: 1, actualWeight: 1 });
		await seedWorkoutSet({ id: 101, workoutExerciseId: 10, setNumber: 2, actualReps: 2, actualWeight: 2 });

		// Force the second set update to abort so the first update (and the rest change) must roll back.
		await db
			.prepare(
				`CREATE TRIGGER fail_second_set
				 BEFORE UPDATE ON workout_sets
				 WHEN OLD.id = 101
				 BEGIN SELECT RAISE(ABORT, 'boom'); END`
			)
			.run();

		await expect(
			saveWorkoutExercise(db, 1, 10, [setUpdate(100, 50, 50), setUpdate(101, 60, 60)], {
				targetRest: 'new'
			})
		).rejects.toThrow();

		const first = await queryOne<Record<string, unknown>>(
			'SELECT actual_reps, actual_weight FROM workout_sets WHERE id = 100'
		);
		expect(first?.actual_reps).toBe(1);
		expect(first?.actual_weight).toBe(1);

		const exercise = await queryOne<Record<string, unknown>>(
			'SELECT target_rest FROM workout_exercises WHERE id = 10'
		);
		expect(exercise?.target_rest).toBe('old');
	});
});

describe('getWorkoutExerciseNames', () => {
	it('groups names by workout in sort order and ignores other users and deleted rows', async () => {
		const db = getDb();
		await seedUser({ id: 1 });
		await seedUser({ id: 2 });
		await seedExercise({ id: 5, userId: 1, name: 'Squat' });
		await seedExercise({ id: 6, userId: 1, name: 'Bench press' });
		await seedExercise({ id: 7, userId: 2, name: 'Someone else’s lift' });
		await seedWorkout({ id: 1, userId: 1 });
		await seedWorkout({ id: 2, userId: 1 });
		await seedWorkout({ id: 3, userId: 2 });
		await seedWorkoutExercise({ id: 10, workoutId: 1, exerciseId: 5, sortOrder: 1 });
		await seedWorkoutExercise({ id: 11, workoutId: 1, exerciseId: 6, sortOrder: 2 });
		await seedWorkoutExercise({ id: 12, workoutId: 1, exerciseId: 5, sortOrder: 3, isDeleted: 1 });
		await seedWorkoutExercise({ id: 13, workoutId: 2, exerciseId: 6, sortOrder: 1 });
		await seedWorkoutExercise({ id: 14, workoutId: 3, exerciseId: 7, sortOrder: 1 });

		const names = await getWorkoutExerciseNames(db, [1, 2, 3], 1);

		expect(names.get(1)).toEqual(['Squat', 'Bench press']);
		expect(names.get(2)).toEqual(['Bench press']);
		expect(names.has(3)).toBe(false);
	});

	it('returns an empty map for no workouts', async () => {
		const db = getDb();
		await seedUser({ id: 1 });
		expect((await getWorkoutExerciseNames(db, [], 1)).size).toBe(0);
	});
});
