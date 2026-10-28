import { describe, expect, it } from 'vitest';
import { exportTrainingLog, normalizeExportRange } from '$lib/server/services/export';
import {
	getDb,
	seedBlockWeek,
	seedExercise,
	seedRoutine,
	seedTrainingBlock,
	seedUser,
	seedWorkout,
	seedWorkoutExercise,
	seedWorkoutSet
} from '../support/fixtures';

const TODAY = '2026-10-28';

async function seedLog(): Promise<void> {
	await seedUser({ id: 1 });
	await seedUser({ id: 2, name: 'Other', email: 'other@example.com' });
	await seedExercise({ id: 1, userId: 1, name: 'Back Squat', equipment: 'Barbell' });
	await seedExercise({ id: 2, userId: 1, name: 'Plank' });
	await seedTrainingBlock({ id: 1, userId: 1, name: 'Hypertrophy' });
	await seedBlockWeek({ id: 1, trainingBlockId: 1, weekNumber: 3, weekType: 'deload' });
	await seedRoutine({ id: 1, userId: 1, name: 'Legs A' });

	await seedWorkout({
		id: 1,
		userId: 1,
		routineId: 1,
		blockWeekId: 1,
		title: 'Legs',
		plannedOn: '2026-10-20',
		performedOn: '2026-10-21',
		status: 'completed',
		durationSeconds: 3720,
		bodyWeight: 81.5,
		notes: 'Slept badly'
	});
	await seedWorkoutExercise({
		id: 10,
		workoutId: 1,
		exerciseId: 1,
		sortOrder: 1,
		targetRest: '3 min',
		notes: 'Goblet squat\nwarm-up'
	});
	await seedWorkoutSet({ workoutExerciseId: 10, id: 101, setNumber: 1, setType: 'warmup', actualReps: 10, actualWeight: 60 });
	await seedWorkoutSet({
		workoutExerciseId: 10,
		id: 102,
		setNumber: 2,
		targetReps: 8,
		targetWeight: 100,
		actualReps: 7,
		actualWeight: 100,
		notes: 'felt heavy'
	});
	await seedWorkoutSet({ workoutExerciseId: 10, id: 103, setNumber: 3, targetReps: 8, targetWeight: 100 });
	await seedWorkoutSet({ workoutExerciseId: 10, id: 104, setNumber: 4, actualReps: 5, actualWeight: 100, isDeleted: 1 });
	await seedWorkoutExercise({ id: 11, workoutId: 1, exerciseId: 2, sortOrder: 2 });
	await seedWorkoutSet({ workoutExerciseId: 11, id: 111, setNumber: 1, durationSeconds: 60 });

	// Left out: skipped, deleted, too old, in the future, someone else's.
	await seedWorkout({ id: 2, userId: 1, title: 'Skipped day', plannedOn: '2026-10-22', status: 'skipped' });
	await seedWorkout({ id: 3, userId: 1, title: 'Deleted day', plannedOn: '2026-10-23', isDeleted: 1 });
	await seedWorkout({ id: 4, userId: 1, title: 'Old day', plannedOn: '2026-01-05', status: 'completed' });
	await seedWorkout({ id: 5, userId: 1, title: 'Next week', plannedOn: '2026-11-02' });
	await seedWorkout({ id: 6, userId: 2, title: 'Not mine', plannedOn: '2026-10-24', status: 'completed' });
}

describe('exportTrainingLog', () => {
	it('writes the workouts in range as Markdown', async () => {
		await seedLog();

		const log = await exportTrainingLog(getDb(), 1, { range: '12w', today: TODAY });

		expect(log.workoutCount).toBe(1);
		expect(log.markdown).toBe(
			[
				'# Training log',
				'',
				'Last 12 weeks (2026-08-05 to 2026-10-28) · 1 workout',
				'Weights are in kg. Each set is reps × weight; "target" is what was planned for that set.',
				'',
				'## 2026-10-21 · Legs',
				'Hypertrophy, week 3 (deload) · Routine: Legs A · completed · 62 min · body weight 81.5 kg',
				'Notes: Slept badly',
				'',
				'### Back Squat (Barbell)',
				'Rest: 3 min · Notes: Goblet squat warm-up',
				'1. warm-up: 10 × 60 kg',
				'2. 7 × 100 kg (target 8 × 100 kg) — felt heavy',
				'3. not logged (target 8 × 100 kg)',
				'',
				'### Plank',
				'1. not logged, 60 s',
				''
			].join('\n')
		);
	});

	it('covers older workouts with the all-time range', async () => {
		await seedLog();

		const log = await exportTrainingLog(getDb(), 1, { range: 'all', today: TODAY });

		expect(log.workoutCount).toBe(2);
		expect(log.markdown).toContain('All time (up to 2026-10-28) · 2 workouts');
		expect(log.markdown.indexOf('## 2026-01-05 · Old day')).toBeLessThan(
			log.markdown.indexOf('## 2026-10-21 · Legs')
		);
		expect(log.markdown).not.toContain('Not mine');
		expect(log.markdown).not.toContain('Next week');
	});

	it('falls back to 12 weeks for unknown ranges', () => {
		expect(normalizeExportRange('block')).toBe('12w');
		expect(normalizeExportRange(null)).toBe('12w');
		expect(normalizeExportRange('26w')).toBe('26w');
	});
});
