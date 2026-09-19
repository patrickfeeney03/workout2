import {
	seedBlockWeek,
	seedExercise,
	seedMovementPattern,
	seedRoutine,
	seedTrainingBlock,
	seedUser,
	seedWorkout,
	seedWorkoutExercise,
	seedWorkoutSet
} from './fixtures';

/**
 * Port of tests/support/stats_fixtures.php.
 *
 * D1 always enforces foreign keys, so unlike the PHP original (which relies on
 * `PRAGMA foreign_keys = OFF` for ordering) every parent row is seeded before
 * its children. The PHP fixture also relies on `createTestDb()` seeding user 1,
 * which does not exist here, so user 1 is seeded explicitly.
 */
export async function seedStatsFixtures(): Promise<void> {
	await seedUser({ id: 1, name: 'Test User', email: 'test@example.com' });
	await seedUser({ id: 2, name: 'Other', email: 'other@example.com' });
	await seedMovementPattern({ id: 1, name: 'Squat' });
	await seedExercise({ id: 1, userId: 1, name: 'Back Squat', movementPatternId: 1 });
	await seedExercise({ id: 2, userId: 1, name: 'Bench' });
	await seedExercise({ id: 3, userId: 2, name: 'Secret Lift' });

	await seedTrainingBlock({
		id: 1,
		userId: 1,
		name: 'Summer Block',
		startDate: '2026-07-01',
		endDate: '2026-08-31'
	});
	await seedTrainingBlock({
		id: 2,
		userId: 2,
		name: 'Other Block',
		startDate: '2026-07-01',
		endDate: '2026-08-31'
	});
	await seedBlockWeek({ id: 1, trainingBlockId: 1, weekNumber: 1, weekType: 'Base' });
	await seedBlockWeek({ id: 2, trainingBlockId: 1, weekNumber: 2, weekType: 'Shock' });
	await seedBlockWeek({ id: 3, trainingBlockId: 1, weekNumber: 3, weekType: 'Deload' });

	await seedRoutine({
		id: 1,
		userId: 1,
		name: 'Lower A',
		splitName: 'Upper lower abs',
		splitDay: 'Lower'
	});
	await seedRoutine({
		id: 2,
		userId: 1,
		name: 'Upper B',
		splitName: 'Upper lower abs',
		splitDay: 'Upper'
	});

	await seedWorkout({
		id: 1,
		userId: 1,
		routineId: 1,
		blockWeekId: 1,
		title: 'A',
		status: 'completed',
		performedOn: '2026-08-01',
		bodyWeight: 80,
		durationSeconds: 3600,
		notes: 'felt good'
	});
	await seedWorkoutExercise({
		id: 1,
		workoutId: 1,
		exerciseId: 1,
		sortOrder: 1,
		notes: 'knees a bit cranky'
	});
	await seedWorkoutExercise({ id: 2, workoutId: 1, exerciseId: 2, sortOrder: 2 });
	await seedWorkoutSet({
		id: 1,
		workoutExerciseId: 1,
		setNumber: 1,
		actualReps: 5,
		actualWeight: 100,
		setType: 'working',
		notes: 'grind'
	});
	await seedWorkoutSet({
		id: 2,
		workoutExerciseId: 1,
		setNumber: 2,
		actualReps: 5,
		actualWeight: 110,
		setType: 'working'
	});
	await seedWorkoutSet({
		id: 3,
		workoutExerciseId: 1,
		setNumber: 3,
		actualReps: 10,
		actualWeight: 60,
		setType: 'warmup'
	});
	await seedWorkoutSet({
		id: 4,
		workoutExerciseId: 2,
		setNumber: 1,
		actualReps: 8,
		actualWeight: 80,
		setType: 'working'
	});

	await seedWorkout({
		id: 2,
		userId: 1,
		routineId: 2,
		blockWeekId: 3,
		title: 'B',
		status: 'completed',
		performedOn: '2026-08-10',
		bodyWeight: 81,
		durationSeconds: 2700
	});
	await seedWorkoutExercise({ id: 3, workoutId: 2, exerciseId: 1, sortOrder: 1 });
	await seedWorkoutSet({
		id: 5,
		workoutExerciseId: 3,
		setNumber: 1,
		actualReps: 3,
		actualWeight: 120,
		setType: 'working'
	});

	await seedWorkout({
		id: 3,
		userId: 1,
		title: 'Planned',
		status: 'planned',
		performedOn: '2026-08-11'
	});
	await seedWorkoutExercise({ id: 4, workoutId: 3, exerciseId: 1, sortOrder: 1 });
	await seedWorkoutSet({
		id: 6,
		workoutExerciseId: 4,
		setNumber: 1,
		actualReps: 5,
		actualWeight: 200,
		setType: 'working'
	});

	await seedWorkout({
		id: 4,
		userId: 1,
		title: 'Deleted',
		status: 'completed',
		performedOn: '2026-08-12',
		isDeleted: 1
	});
	await seedWorkoutExercise({ id: 5, workoutId: 4, exerciseId: 1, sortOrder: 1 });
	await seedWorkoutSet({
		id: 7,
		workoutExerciseId: 5,
		setNumber: 1,
		actualReps: 5,
		actualWeight: 210,
		setType: 'working'
	});

	await seedWorkout({
		id: 5,
		userId: 2,
		title: 'Other user',
		status: 'completed',
		performedOn: '2026-08-01'
	});
	await seedWorkoutExercise({ id: 6, workoutId: 5, exerciseId: 3, sortOrder: 1 });
	await seedWorkoutSet({
		id: 8,
		workoutExerciseId: 6,
		setNumber: 1,
		actualReps: 5,
		actualWeight: 400,
		setType: 'working'
	});

	await seedWorkout({
		id: 6,
		userId: 1,
		title: 'Old',
		status: 'completed',
		performedOn: '2026-01-02'
	});
	await seedWorkoutExercise({ id: 7, workoutId: 6, exerciseId: 2, sortOrder: 1 });
	await seedWorkoutSet({
		id: 9,
		workoutExerciseId: 7,
		setNumber: 1,
		actualReps: 5,
		actualWeight: 70,
		setType: 'working'
	});
}
