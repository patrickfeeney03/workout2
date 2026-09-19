import { describe, expect, it } from 'vitest';
import {
	addExerciseToWorkout,
	deleteWorkout,
	deleteWorkoutExercise,
	deleteWorkoutSet,
	getWorkout,
	updateWorkoutWeek
} from '$lib/server/services/workouts';
import {
	getDb,
	queryOne,
	seedBlockWeek,
	seedExercise,
	seedTrainingBlock,
	seedUser,
	seedWorkout,
	seedWorkoutExercise,
	seedWorkoutSet
} from '../support/fixtures';

// Port of tests/integration/workout_service_edge_test.php
describe('WorkoutService edge cases', () => {
	it('deleteWorkout cascades soft delete to exercises and sets', async () => {
		const db = getDb();
		const userId = await seedUser();
		await seedExercise({ id: 1, userId });
		await seedWorkout({ id: 1, userId, title: 'My Workout' });
		await seedWorkoutExercise({ id: 10, workoutId: 1, exerciseId: 1, sortOrder: 1 });
		await seedWorkoutSet({ id: 100, workoutExerciseId: 10, setNumber: 1 });

		const workout = await getWorkout(db, 1, userId);
		await deleteWorkout(db, workout!);

		const deletedWorkout = await queryOne<{ is_deleted: number }>(
			'SELECT is_deleted FROM workouts WHERE id = 1'
		);
		expect(deletedWorkout?.is_deleted).toBe(1);

		const deletedExercise = await queryOne<{ is_deleted: number }>(
			'SELECT is_deleted FROM workout_exercises WHERE id = 10'
		);
		expect(deletedExercise?.is_deleted).toBe(1);

		const deletedSet = await queryOne<{ is_deleted: number }>(
			'SELECT is_deleted FROM workout_sets WHERE id = 100'
		);
		expect(deletedSet?.is_deleted).toBe(1);
	});

	it('deleteWorkoutExercise soft deletes the exercise', async () => {
		const db = getDb();
		const userId = await seedUser();
		await seedExercise({ id: 1, userId });
		await seedWorkout({ id: 1, userId, title: 'My Workout' });
		await seedWorkoutExercise({ id: 10, workoutId: 1, exerciseId: 1, sortOrder: 1 });

		await deleteWorkoutExercise(db, userId, 10);

		const deletedExercise = await queryOne<{ is_deleted: number }>(
			'SELECT is_deleted FROM workout_exercises WHERE id = 10'
		);
		expect(deletedExercise?.is_deleted).toBe(1);
	});

	it('deleteWorkoutSet soft deletes the set', async () => {
		const db = getDb();
		const userId = await seedUser();
		await seedExercise({ id: 1, userId });
		await seedWorkout({ id: 1, userId, title: 'My Workout' });
		await seedWorkoutExercise({ id: 10, workoutId: 1, exerciseId: 1, sortOrder: 1 });
		await seedWorkoutSet({ id: 100, workoutExerciseId: 10, setNumber: 1 });

		await deleteWorkoutSet(db, 100, userId);

		const deletedSet = await queryOne<{ is_deleted: number }>(
			'SELECT is_deleted FROM workout_sets WHERE id = 100'
		);
		expect(deletedSet?.is_deleted).toBe(1);
	});

	it('addExerciseToWorkout adds existing exercise', async () => {
		const db = getDb();
		const userId = await seedUser();
		await seedWorkout({ id: 1, userId, title: 'My Workout' });
		await seedExercise({ id: 99, userId, name: 'Existing Exercise' });
		const workout = await getWorkout(db, 1, userId);

		await addExerciseToWorkout(db, workout!, 99, '', userId);

		const wex = await queryOne<Record<string, unknown>>(
			'SELECT * FROM workout_exercises WHERE workout_id = 1'
		);
		expect(wex?.exercise_id).toBe(99);
		expect(wex?.sort_order).toBe(1);
	});

	it('addExerciseToWorkout creates new exercise if name provided', async () => {
		const db = getDb();
		const userId = await seedUser();
		await seedWorkout({ id: 1, userId, title: 'My Workout' });
		const workout = await getWorkout(db, 1, userId);

		await addExerciseToWorkout(db, workout!, 0, 'New Custom Exercise', userId);

		const exercise = await queryOne<Record<string, unknown>>(
			"SELECT * FROM exercises WHERE name = 'New Custom Exercise'"
		);
		const wex = await queryOne<Record<string, unknown>>(
			'SELECT * FROM workout_exercises WHERE workout_id = 1'
		);
		expect(wex?.exercise_id).toBe(exercise?.id);
	});

	it('updateWorkoutWeek assigns a block week to the workout', async () => {
		const db = getDb();
		const userId = await seedUser();
		await seedWorkout({ id: 1, userId, title: 'My Workout' });
		await seedTrainingBlock({ id: 90, userId });
		await seedBlockWeek({ id: 42, trainingBlockId: 90, weekNumber: 1 });

		await updateWorkoutWeek(db, 1, 42, userId);

		const workout = await getWorkout(db, 1, userId);
		expect(workout?.blockWeekId).toBe(42);
	});

	it('updateWorkoutWeek clears the block week when null', async () => {
		const db = getDb();
		const userId = await seedUser();
		await seedTrainingBlock({ id: 90, userId });
		await seedBlockWeek({ id: 7, trainingBlockId: 90, weekNumber: 1 });
		await seedWorkout({ id: 1, userId, title: 'My Workout', blockWeekId: 7 });

		await updateWorkoutWeek(db, 1, null, userId);

		const workout = await getWorkout(db, 1, userId);
		expect(workout?.blockWeekId).toBeNull();
	});
});
