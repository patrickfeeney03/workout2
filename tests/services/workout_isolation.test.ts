import { describe, expect, it } from 'vitest';
import {
	addExerciseToWorkout,
	createEmptyWorkoutSet,
	deleteWorkoutExercise,
	deleteWorkoutSet,
	duplicateWorkout,
	getPastWorkoutSetsForExercise,
	getWorkout,
	getWorkoutExercise,
	getWorkoutExercisesForWorkout,
	getWorkouts,
	getWorkoutSet,
	getWorkoutSetsForWorkoutExercise,
	getWorkoutsByBlockWeekId,
	handleWorkout,
	moveWorkoutSet,
	updateWorkoutPlannedOn,
	updateWorkoutTitle,
	updateWorkoutWeek
} from '$lib/server/services/workouts';
import {
	getDb,
	queryOne,
	seedBlockWeek,
	seedExercise,
	seedRoutine,
	seedRoutineExercise,
	seedRoutineSet,
	seedTrainingBlock,
	seedUser,
	seedWorkout,
	seedWorkoutExercise,
	seedWorkoutSet
} from '../support/fixtures';

// Port of tests/integration/workout_isolation_test.php
describe('WorkoutService isolation', () => {
	it('user 2 workout is invisible to user 1 getWorkouts and getWorkout', async () => {
		const db = getDb();
		const userId = await seedUser();
		await seedUser({ id: 2, name: 'Other User', email: 'other@example.com' });
		await seedWorkout({ id: 1, userId, title: 'User 1 Workout' });
		await seedWorkout({ id: 2, userId: 2, title: 'User 2 Workout' });

		const user1Workouts = await getWorkouts(db, userId);
		expect(user1Workouts).toHaveLength(1);
		expect(user1Workouts[0].id).toBe(1);
		expect(user1Workouts[0].title).toBe('User 1 Workout');

		const otherUsersWorkout = await getWorkout(db, 2, userId);
		expect(otherUsersWorkout).toBeNull();

		const ownWorkout = await getWorkout(db, 1, userId);
		expect(ownWorkout?.id).toBe(1);
		expect(ownWorkout?.title).toBe('User 1 Workout');
	});

	it('workout exercises and sets are isolated per user', async () => {
		const db = getDb();
		const userId = await seedUser();
		await seedUser({ id: 2, name: 'User Two', email: 'two@example.com' });
		await seedExercise({ id: 1, userId });
		await seedExercise({ id: 2, userId: 2 });
		await seedTrainingBlock({ id: 90, userId });
		await seedBlockWeek({ id: 1, trainingBlockId: 90, weekNumber: 1 });

		await seedWorkout({ id: 10, userId, title: 'User 1 Workout', blockWeekId: 1 });
		await seedWorkout({ id: 11, userId: 2, title: 'User 2 Workout', blockWeekId: 1 });
		await seedWorkoutExercise({ id: 20, workoutId: 10, exerciseId: 1, sortOrder: 1 });
		await seedWorkoutExercise({ id: 21, workoutId: 11, exerciseId: 2, sortOrder: 1 });
		await seedWorkoutSet({ id: 100, workoutExerciseId: 20, setNumber: 1 });
		await seedWorkoutSet({ id: 101, workoutExerciseId: 21, setNumber: 1 });

		const fromOtherWorkout = await getWorkoutExercisesForWorkout(db, 11, userId);
		expect(fromOtherWorkout).toEqual([]);

		const otherExercise = await getWorkoutExercise(db, 21, userId);
		expect(otherExercise).toBeNull();

		const otherSets = await getWorkoutSetsForWorkoutExercise(db, 21, userId);
		expect(otherSets).toEqual([]);

		const otherSet = await getWorkoutSet(db, 101, userId);
		expect(otherSet).toBeNull();

		const weekWorkouts = await getWorkoutsByBlockWeekId(db, 1, userId);
		expect(weekWorkouts).toHaveLength(1);
		expect(weekWorkouts[0].id).toBe(10);

		const past = await getPastWorkoutSetsForExercise(db, 2, userId);
		expect(past).toEqual({});
	});

	it('mutations do not affect another user workout', async () => {
		const db = getDb();
		const userId = await seedUser();
		await seedUser({ id: 2, name: 'User Two', email: 'two@example.com' });
		await seedExercise({ id: 1, userId, name: 'User 1 Squat' });
		await seedExercise({ id: 2, userId: 2, name: 'User 2 Bench' });
		await seedWorkout({ id: 10, userId, title: 'User 1 Workout' });
		await seedWorkout({ id: 11, userId: 2, title: 'User 2 Workout' });
		await seedWorkoutExercise({ id: 20, workoutId: 10, exerciseId: 1, sortOrder: 1 });
		await seedWorkoutExercise({ id: 21, workoutId: 11, exerciseId: 2, sortOrder: 1 });
		await seedWorkoutSet({ id: 100, workoutExerciseId: 20, setNumber: 1 });
		await seedWorkoutSet({ id: 101, workoutExerciseId: 21, setNumber: 1 });
		await seedWorkoutSet({ id: 102, workoutExerciseId: 21, setNumber: 2 });

		await deleteWorkoutExercise(db, userId, 21);
		const wexDeleted = await queryOne<{ is_deleted: number }>(
			'SELECT is_deleted FROM workout_exercises WHERE id = 21'
		);
		expect(wexDeleted?.is_deleted).toBe(0);

		await deleteWorkoutSet(db, 101, userId);
		const setDeleted = await queryOne<{ is_deleted: number }>(
			'SELECT is_deleted FROM workout_sets WHERE id = 101'
		);
		expect(setDeleted?.is_deleted).toBe(0);

		await updateWorkoutTitle(db, 11, 'Hacked', userId);
		const title = await queryOne<{ title: string }>('SELECT title FROM workouts WHERE id = 11');
		expect(title?.title).toBe('User 2 Workout');

		await updateWorkoutPlannedOn(db, 11, '2026-01-01', userId);
		const plannedOn = await queryOne<{ planned_on: string | null }>(
			'SELECT planned_on FROM workouts WHERE id = 11'
		);
		expect(plannedOn?.planned_on).toBeNull();

		await updateWorkoutWeek(db, 11, 99, userId);
		const blockWeek = await queryOne<{ block_week_id: number | null }>(
			'SELECT block_week_id FROM workouts WHERE id = 11'
		);
		expect(blockWeek?.block_week_id).toBeNull();

		const newSet = await createEmptyWorkoutSet(db, 21, userId);
		expect(newSet).toEqual([]);
		const setCount = await queryOne<{ c: number }>(
			'SELECT COUNT(*) AS c FROM workout_sets WHERE workout_exercise_id = 21'
		);
		expect(setCount?.c).toBe(2);

		expect(await moveWorkoutSet(db, 102, 'up', userId)).toBe(false);
		const setNumber = await queryOne<{ set_number: number }>(
			'SELECT set_number FROM workout_sets WHERE id = 102'
		);
		expect(setNumber?.set_number).toBe(2);

		const otherWorkout = await getWorkout(db, 11, 2);
		await addExerciseToWorkout(db, otherWorkout!, 1, '', userId);
		const otherCount = await queryOne<{ c: number }>(
			'SELECT COUNT(*) AS c FROM workout_exercises WHERE workout_id = 11'
		);
		expect(otherCount?.c).toBe(1);

		const ownWorkout = await getWorkout(db, 10, userId);
		await addExerciseToWorkout(db, ownWorkout!, 2, '', userId);
		const ownCount = await queryOne<{ c: number }>(
			'SELECT COUNT(*) AS c FROM workout_exercises WHERE workout_id = 10'
		);
		expect(ownCount?.c).toBe(1);
	});

	it('handleWorkout uses provided userId and skips unowned routines', async () => {
		const db = getDb();
		const userId = await seedUser();
		await seedUser({ id: 2, name: 'User Two', email: 'two@example.com' });
		await seedExercise({ id: 1, userId: 2 });
		await seedRoutine({ id: 10, userId: 2, name: 'User 2 Routine' });
		await seedRoutineExercise({ id: 20, routineId: 10, exerciseId: 1, sortOrder: 1 });
		await seedRoutineSet({ id: 30, routineExerciseId: 20, setNumber: 1 });

		const workoutId = await handleWorkout(db, userId, {
			routineId: 10,
			blockWeekId: 0,
			title: 'From Other Routine',
			plannedOn: '2026-07-01'
		});

		const workout = await queryOne<Record<string, unknown>>('SELECT * FROM workouts WHERE id = ?', [
			workoutId
		]);
		expect(workout?.user_id).toBe(1);
		expect(workout?.routine_id).toBe(10);

		const count = await queryOne<{ c: number }>(
			'SELECT COUNT(*) AS c FROM workout_exercises WHERE workout_id = ?',
			[workoutId]
		);
		expect(count?.c).toBe(0);
	});

	it('addExerciseToWorkout creates exercises for the given user', async () => {
		const db = getDb();
		const userId = await seedUser();
		await seedUser({ id: 2, name: 'User Two', email: 'two@example.com' });
		await seedWorkout({ id: 10, userId, title: 'User 1 Workout' });

		const workout = await getWorkout(db, 10, userId);
		await addExerciseToWorkout(db, workout!, 0, 'New Lift', userId);

		const created = await queryOne<Record<string, unknown>>(
			"SELECT * FROM exercises WHERE name = 'New Lift'"
		);
		expect(created?.user_id).toBe(1);

		const count = await queryOne<{ c: number }>(
			'SELECT COUNT(*) AS c FROM workout_exercises WHERE workout_id = 10'
		);
		expect(count?.c).toBe(1);
	});

	it('duplicateWorkout copies with caller userId', async () => {
		const db = getDb();
		const userId = await seedUser();
		await seedUser({ id: 2, name: 'User Two', email: 'two@example.com' });
		await seedExercise({ id: 1, userId });
		await seedWorkout({ id: 10, userId, title: 'User 1 Workout', notes: 'note' });
		await seedWorkoutExercise({ id: 20, workoutId: 10, exerciseId: 1, sortOrder: 1 });

		await expect(duplicateWorkout(db, 10, 2)).rejects.toThrow();

		const newId = await duplicateWorkout(db, 10, userId);
		const copy = await queryOne<Record<string, unknown>>(
			'SELECT user_id, cloned_from_workout_id FROM workouts WHERE id = ?',
			[newId]
		);
		expect(copy?.user_id).toBe(1);
		expect(copy?.cloned_from_workout_id).toBe(10);
	});
});
