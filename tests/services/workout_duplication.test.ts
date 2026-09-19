import { describe, expect, it } from 'vitest';
import { duplicateWorkout } from '$lib/server/services/workouts';
import {
	getDb,
	queryAll,
	queryOne,
	seedBlockWeek,
	seedExercise,
	seedRoutine,
	seedTrainingBlock,
	seedUser,
	seedWorkout,
	seedWorkoutExercise,
	seedWorkoutSet
} from '../support/fixtures';

// Port of tests/integration/workout_duplication_test.php
describe('duplicateWorkout', () => {
	it('clones workout structure and maps actual performance to new targets', async () => {
		const db = getDb();
		const userId = await seedUser();
		await seedRoutine({ id: 5, userId, name: 'Leg Day' });
		await seedTrainingBlock({ id: 90, userId });
		await seedBlockWeek({ id: 100, trainingBlockId: 90, weekNumber: 1 });
		await seedExercise({ id: 6, userId, name: 'Back Squat' });
		await seedExercise({ id: 7, userId, name: 'Front Squat' });

		// 1. Seed original workout (id=10)
		await seedWorkout({
			id: 10,
			userId,
			routineId: 5,
			blockWeekId: 100,
			title: 'Leg Day A',
			notes: 'Focus on depth',
			status: 'completed'
		});

		// 2. Seed workout exercises: one active (id=20), one deleted (id=21)
		await seedWorkoutExercise({
			id: 20,
			workoutId: 10,
			exerciseId: 6,
			sortOrder: 1,
			targetRest: '120s',
			notes: 'heavy squats'
		});
		await seedWorkoutExercise({
			id: 21,
			workoutId: 10,
			exerciseId: 7,
			sortOrder: 2,
			targetRest: '60s',
			notes: 'deleted exercise',
			isDeleted: 1
		});

		// 3. Sets for exercise 20: one with actuals (id=30), one with only targets (id=31), one deleted (id=32)
		await seedWorkoutSet({
			id: 30,
			workoutExerciseId: 20,
			setNumber: 1,
			targetReps: 10,
			targetWeight: 225,
			actualReps: 12,
			actualWeight: 230,
			setType: 'working',
			notes: 'felt strong'
		});
		await seedWorkoutSet({
			id: 31,
			workoutExerciseId: 20,
			setNumber: 2,
			targetReps: 8,
			targetWeight: 245,
			setType: 'working',
			notes: 'no actuals logged'
		});
		await seedWorkoutSet({
			id: 32,
			workoutExerciseId: 20,
			setNumber: 3,
			targetReps: 6,
			targetWeight: 265,
			actualReps: 6,
			actualWeight: 265,
			setType: 'working',
			notes: 'deleted set',
			isDeleted: 1
		});

		// 4. Run duplication
		const newWorkoutId = await duplicateWorkout(db, 10, userId);

		// 5. Assert Workout copy properties
		const newWorkout = await queryOne<Record<string, unknown>>('SELECT * FROM workouts WHERE id = ?', [
			newWorkoutId
		]);
		expect(newWorkout?.title).toBe('Copy of Leg Day A');
		expect(newWorkout?.cloned_from_workout_id).toBe(10);
		expect(newWorkout?.status).toBe('planned');
		expect(newWorkout?.notes).toBe('Focus on depth');

		// 6. Assert cloned exercises (deleted one skipped)
		const wexList = await queryAll<Record<string, unknown>>(
			'SELECT * FROM workout_exercises WHERE workout_id = ?',
			[newWorkoutId]
		);
		expect(wexList).toHaveLength(1);

		const newWex = wexList[0];
		expect(newWex.exercise_id).toBe(6);
		expect(newWex.target_rest).toBe('120s');
		expect(newWex.notes).toBe('heavy squats');

		// 7. Assert cloned sets (deleted set 32 skipped)
		const newSets = await queryAll<Record<string, unknown>>(
			'SELECT * FROM workout_sets WHERE workout_exercise_id = ? ORDER BY set_number ASC',
			[newWex.id]
		);
		expect(newSets).toHaveLength(2);

		// Set 1 (original ID 30 had actual_reps=12, actual_weight=230)
		// -> promoted from actuals
		expect(newSets[0].set_number).toBe(1);
		expect(newSets[0].target_reps).toBe(12);
		expect(newSets[0].target_weight).toBe(230);
		expect(newSets[0].actual_reps).toBeNull();
		expect(newSets[0].actual_weight).toBeNull();
		expect(newSets[0].notes).toBe('felt strong');
		expect(newSets[0].set_type).toBe('working');

		// Set 2 (original ID 31 had no actuals logged, target_reps=8, target_weight=245)
		// -> fell back to targets
		expect(newSets[1].set_number).toBe(2);
		expect(newSets[1].target_reps).toBe(8);
		expect(newSets[1].target_weight).toBe(245);
		expect(newSets[1].actual_reps).toBeNull();
		expect(newSets[1].actual_weight).toBeNull();
		expect(newSets[1].notes).toBe('no actuals logged');
	});
});
