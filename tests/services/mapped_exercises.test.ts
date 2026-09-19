import { describe, expect, it } from 'vitest';
import { getMappedRoutineExercises } from '$lib/server/services/common';
import { getWorkoutExercisesAndSetsArray } from '$lib/server/services/workouts';
import type { RoutineExercise, WorkoutExercise } from '$lib/types';
import {
	getDb,
	seedExercise,
	seedRoutine,
	seedRoutineExercise,
	seedRoutineSet,
	seedUser,
	seedWorkout,
	seedWorkoutExercise,
	seedWorkoutSet
} from '../support/fixtures';

// Port of tests/integration/mapped_exercises_test.php
function routineExerciseInput(
	overrides: Partial<RoutineExercise> & Pick<RoutineExercise, 'id' | 'exerciseId'>
): RoutineExercise {
	return {
		routineId: 1,
		sortOrder: 1,
		notes: null,
		createdAt: null,
		modifiedAt: null,
		targetRest: null,
		isDeleted: 0,
		...overrides
	};
}

describe('getMappedRoutineExercises', () => {
	it('returns mapped exercises and sets', async () => {
		const db = getDb();
		await seedUser();
		await seedRoutine({ id: 1, userId: 1 });

		// Seed exercise
		await seedExercise({ id: 5, userId: 1, name: 'Bench Press' });

		// Seed routine_exercise
		await seedRoutineExercise({ id: 20, routineId: 1, exerciseId: 5, sortOrder: 1 });

		// Seed sets
		await seedRoutineSet({
			id: 100,
			routineExerciseId: 20,
			setNumber: 1,
			targetReps: 10,
			targetWeight: 135
		});
		await seedRoutineSet({
			id: 101,
			routineExerciseId: 20,
			setNumber: 2,
			targetReps: 8,
			targetWeight: 145
		});

		const exercisesInput: RoutineExercise[] = [routineExerciseInput({ id: 20, exerciseId: 5 })];

		// Invoke the refactored function
		const result = await getMappedRoutineExercises(db, exercisesInput);

		// Assert mappings
		expect(Object.keys(result)).toHaveLength(1);
		expect(result[20]).toBeDefined();

		const mapped = result[20];
		expect(mapped.exercise?.name).toBe('Bench Press');
		expect(mapped.sets).toHaveLength(2);
		expect(mapped.sets[0].id).toBe(100);
		expect(mapped.sets[1].id).toBe(101);
		expect(mapped.sets[0].targetWeight).toBe(135);
		expect(mapped.sets[1].targetReps).toBe(8);
	});

	it('handles exercises with no sets', async () => {
		const db = getDb();
		await seedUser();
		await seedRoutine({ id: 1, userId: 1 });

		await seedExercise({ id: 6, userId: 1, name: 'Squat' });
		await seedRoutineExercise({ id: 30, routineId: 1, exerciseId: 6, sortOrder: 1 });

		const exercisesInput: RoutineExercise[] = [routineExerciseInput({ id: 30, exerciseId: 6 })];

		const result = await getMappedRoutineExercises(db, exercisesInput);

		expect(Object.keys(result)).toHaveLength(1);
		expect(result[30].exercise?.name).toBe('Squat');
		expect(result[30].sets).toEqual([]);
	});

	it('handles no routine_exercise', async () => {
		const db = getDb();
		await seedUser();
		await seedRoutine({ id: 1, userId: 1 });

		await seedExercise({ id: 6, userId: 1, name: 'Squat' });

		const exercisesInput: RoutineExercise[] = [routineExerciseInput({ id: 30, exerciseId: 6 })];

		const result = await getMappedRoutineExercises(db, exercisesInput);

		expect(Object.keys(result)).toHaveLength(1);
		expect(result[30].exercise?.name).toBe('Squat');
		expect(result[30].sets).toEqual([]);
	});
});

// Port of tests/integration/mapped_exercises_test.php (workout half)
function workoutExerciseInput(
	overrides: Partial<WorkoutExercise> & Pick<WorkoutExercise, 'id' | 'workoutId' | 'exerciseId'>
): WorkoutExercise {
	return {
		sortOrder: 1,
		notes: null,
		createdAt: null,
		modifiedAt: null,
		targetRest: null,
		isDeleted: 0,
		...overrides
	};
}

describe('getWorkoutExercisesAndSetsArray', () => {
	it('maps several exercises and their active sets', async () => {
		const db = getDb();
		await seedUser({ id: 1 });
		await seedWorkout({ id: 1, userId: 1 });
		await seedExercise({ id: 5, userId: 1, name: 'Bench Press' });
		await seedExercise({ id: 6, userId: 1, name: 'Squat' });
		await seedWorkoutExercise({ id: 20, workoutId: 1, exerciseId: 5, sortOrder: 1 });
		await seedWorkoutExercise({ id: 30, workoutId: 1, exerciseId: 6, sortOrder: 2 });

		// Inserted out of order to prove the mapper's ORDER BY, plus a soft-deleted row to ignore.
		await seedWorkoutSet({ id: 101, workoutExerciseId: 20, setNumber: 2, actualReps: 8 });
		await seedWorkoutSet({ id: 100, workoutExerciseId: 20, setNumber: 1, actualReps: 10 });
		await seedWorkoutSet({ id: 102, workoutExerciseId: 20, setNumber: 3, isDeleted: 1 });
		await seedWorkoutSet({ id: 103, workoutExerciseId: 30, setNumber: 1, actualReps: 5 });

		const result = await getWorkoutExercisesAndSetsArray(db, [
			workoutExerciseInput({ id: 20, workoutId: 1, exerciseId: 5 }),
			workoutExerciseInput({ id: 30, workoutId: 1, exerciseId: 6 }),
			workoutExerciseInput({ id: 40, workoutId: 1, exerciseId: 99 })
		]);

		expect(Object.keys(result)).toHaveLength(3);
		expect(result[20].exercise?.name).toBe('Bench Press');
		expect(result[20].sets.map((set) => set.setNumber)).toEqual([1, 2]);
		expect(result[30].exercise?.name).toBe('Squat');
		expect(result[30].sets.map((set) => set.id)).toEqual([103]);
		expect(result[40].exercise).toBeNull();
		expect(result[40].sets).toEqual([]);
	});
});
