import { describe, expect, it } from 'vitest';
import { getWorkoutDetail } from '$lib/server/services/workoutDetail';
import {
	getDb,
	seedBlockWeek,
	seedExercise,
	seedMovementPattern,
	seedTrainingBlock,
	seedUser,
	seedWorkout,
	seedWorkoutExercise,
	seedWorkoutSet
} from '../support/fixtures';

describe('getWorkoutDetail', () => {
	it('returns null for a missing or other user’s workout', async () => {
		const db = getDb();
		await seedUser({ id: 1 });
		await seedUser({ id: 2 });
		await seedExercise({ id: 5, userId: 2 });
		await seedWorkout({ id: 1, userId: 2 });
		await seedWorkoutExercise({ id: 10, workoutId: 1, exerciseId: 5, sortOrder: 1 });

		expect(await getWorkoutDetail(db, 1, 1)).toBeNull();
		expect(await getWorkoutDetail(db, 1, 999)).toBeNull();
	});

	it('loads workout, exercises, sets, blocks, weeks and the picker in one result', async () => {
		const db = getDb();
		await seedUser({ id: 1 });
		await seedMovementPattern({ id: 1, name: 'Squat' });
		await seedExercise({ id: 5, userId: 1, name: 'Back squat', movementPatternId: 1, primaryMuscle: 'Quads' });
		await seedExercise({ id: 6, userId: 1, name: 'Bench press', movementPatternId: null });
		await seedTrainingBlock({ id: 1, userId: 1, name: 'Block A', endDate: '2026-09-01' });
		await seedTrainingBlock({ id: 2, userId: 1, name: 'Block B', endDate: '2026-10-01' });
		await seedBlockWeek({ id: 7, trainingBlockId: 1, weekNumber: 1 });
		await seedBlockWeek({ id: 8, trainingBlockId: 2, weekNumber: 2 });
		await seedWorkout({ id: 1, userId: 1, title: 'Heavy day', blockWeekId: 8 });
		await seedWorkoutExercise({ id: 10, workoutId: 1, exerciseId: 5, sortOrder: 1 });
		await seedWorkoutExercise({ id: 11, workoutId: 1, exerciseId: 6, sortOrder: 2 });
		await seedWorkoutSet({ id: 100, workoutExerciseId: 10, setNumber: 1, actualReps: 5, actualWeight: 100 });
		await seedWorkoutSet({ id: 101, workoutExerciseId: 10, setNumber: 2, actualReps: 5, actualWeight: 105 });
		await seedWorkoutSet({ id: 200, workoutExerciseId: 11, setNumber: 1, targetReps: 8 });

		const detail = await getWorkoutDetail(db, 1, 1);
		expect(detail).not.toBeNull();
		if (!detail) return;

		expect(detail.workout.title).toBe('Heavy day');
		expect(detail.exercises.map((item) => item.association.id)).toEqual([10, 11]);
		expect(detail.exercises[0].exercise?.name).toBe('Back squat');
		expect(detail.exercises[0].sets.map((set) => set.id)).toEqual([100, 101]);
		expect(detail.exercises[0].sets[1].actualWeight).toBe(105);
		expect(detail.exercises[1].exercise?.name).toBe('Bench press');
		expect(detail.exercises[1].sets[0].targetReps).toBe(8);

		// Blocks: end_date DESC. Weeks: block id then week number.
		expect(detail.trainingBlocks.map((block) => block.name)).toEqual(['Block B', 'Block A']);
		expect(Object.keys(detail.weeksByBlock)).toEqual(['1', '2']);
		expect(detail.weeksByBlock[2][0].weekNumber).toBe(2);
		expect(detail.week?.id).toBe(8);

		// Picker: ordered by pattern name then exercise name; NULL pattern ("Other") sorts first in SQLite.
		expect(Object.keys(detail.exerciseGroups)).toEqual(['Other', 'Squat']);
		expect(detail.exerciseGroups['Squat'][0].name).toBe('Back squat');
		expect(detail.exerciseGroups['Other'][0].name).toBe('Bench press');
	});

	it('excludes soft-deleted exercises and sets', async () => {
		const db = getDb();
		await seedUser({ id: 1 });
		await seedExercise({ id: 5, userId: 1 });
		await seedWorkout({ id: 1, userId: 1 });
		await seedWorkoutExercise({ id: 10, workoutId: 1, exerciseId: 5, sortOrder: 1 });
		await seedWorkoutExercise({ id: 11, workoutId: 1, exerciseId: 5, sortOrder: 2, isDeleted: 1 });
		await seedWorkoutSet({ id: 100, workoutExerciseId: 10, setNumber: 1 });
		await seedWorkoutSet({ id: 101, workoutExerciseId: 10, setNumber: 2, isDeleted: 1 });

		const detail = await getWorkoutDetail(db, 1, 1);
		expect(detail?.exercises.map((item) => item.association.id)).toEqual([10]);
		expect(detail?.exercises[0].sets.map((set) => set.id)).toEqual([100]);
	});
});
