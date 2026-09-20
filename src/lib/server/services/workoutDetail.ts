/**
 * Page-shaped loader for the workout detail screen.
 *
 * D1 round trips dominate page latency (each one is a Worker→D1 network call, ~250 ms from a South
 * American Worker to the WEUR primary), so every read the screen needs runs in one `db.batch()`:
 * one ownership read plus one batch, instead of two sequential waves of 2 + 5 queries.
 *
 * The statements address the workout id directly (joins and a subquery) so no statement depends on
 * another statement's result and the whole batch can be prepared up front.
 *
 * The SQL mirrors getWorkout, getWorkoutExercisesForWorkout, getMappedWorkoutExercises (sets and
 * exercises), getExercisesGroupedByMovementPattern, getTrainingBlocks, getWeeksByBlock and
 * getBlockWeek. Keep them in sync if those queries change.
 */

import { bind, type Db } from '$lib/server/db';
import {
	blockWeekFromRow,
	exerciseFromRow,
	optStr,
	reqInt,
	reqStr,
	trainingBlockFromRow,
	workoutExerciseFromRow,
	workoutFromRow,
	workoutSetFromRow,
	type BlockWeek,
	type Exercise,
	type ExerciseWithWorkoutSets,
	type Row,
	type TrainingBlock,
	type Workout,
	type WorkoutSet
} from '$lib/types';
import type { ExerciseGroupsByMovementPattern } from './catalog';

export interface WorkoutDetail {
	readonly workout: Workout;
	readonly exercises: ExerciseWithWorkoutSets[];
	readonly exerciseGroups: ExerciseGroupsByMovementPattern;
	readonly trainingBlocks: TrainingBlock[];
	readonly weeksByBlock: Record<number, BlockWeek[]>;
	readonly week: BlockWeek | null;
}

/** Returns null when the workout does not exist or is not owned by `userId`. */
export async function getWorkoutDetail(
	db: Db,
	userId: number,
	workoutId: number
): Promise<WorkoutDetail | null> {
	const statements = [
		bind(db, 'SELECT * FROM workouts WHERE id = ? AND user_id = ? AND is_deleted = 0', [
			workoutId,
			userId
		]),
		bind(
			db,
			`SELECT we.*
			FROM workout_exercises we
			INNER JOIN workouts w ON w.id = we.workout_id
			WHERE we.workout_id = ? AND we.is_deleted = 0 AND w.user_id = ?
			ORDER BY we.sort_order`,
			[workoutId, userId]
		),
		bind(
			db,
			`SELECT ws.*
			FROM workout_sets ws
			INNER JOIN workout_exercises we ON we.id = ws.workout_exercise_id
			INNER JOIN workouts w ON w.id = we.workout_id
			WHERE we.workout_id = ? AND we.is_deleted = 0 AND ws.is_deleted = 0 AND w.user_id = ?
			ORDER BY ws.workout_exercise_id ASC, ws.set_number ASC`,
			[workoutId, userId]
		),
		bind(
			db,
			`SELECT e.*
			FROM exercises e
			INNER JOIN workout_exercises we ON we.exercise_id = e.id
			INNER JOIN workouts w ON w.id = we.workout_id
			WHERE we.workout_id = ? AND we.is_deleted = 0 AND w.user_id = ?`,
			[workoutId, userId]
		),
		bind(
			db,
			`SELECT e.id, e.name, e.primary_muscle, mp.name AS pattern_name
			FROM exercises e
			LEFT JOIN movement_patterns mp ON e.movement_pattern_id = mp.id
			WHERE e.user_id = ?
			ORDER BY mp.name, e.name`,
			[userId]
		),
		bind(db, 'SELECT * FROM training_blocks WHERE user_id = ? ORDER BY end_date DESC', [userId]),
		bind(
			db,
			`SELECT bw.*
			FROM block_weeks bw
			JOIN training_blocks tb ON tb.id = bw.training_block_id
			WHERE bw.is_deleted = 0 AND tb.user_id = ?
			ORDER BY bw.training_block_id, bw.week_number`,
			[userId]
		),
		bind(
			db,
			`SELECT bw.*
			FROM block_weeks bw
			JOIN training_blocks tb ON tb.id = bw.training_block_id
			WHERE bw.id = (SELECT block_week_id FROM workouts WHERE id = ? AND user_id = ?)
				AND tb.user_id = ?`,
			[workoutId, userId, userId]
		)
	];

	const results = await db.batch<Row>(statements);

	const workoutRow = results[0].results[0];
	if (!workoutRow) {
		return null;
	}
	const workout = workoutFromRow(workoutRow);

	const associations = (results[1].results ?? []).map(workoutExerciseFromRow);

	const setsByAssociation = new Map<number, WorkoutSet[]>();
	for (const row of results[2].results ?? []) {
		const set = workoutSetFromRow(row);
		const sets = setsByAssociation.get(set.workoutExerciseId);
		if (sets) {
			sets.push(set);
		} else {
			setsByAssociation.set(set.workoutExerciseId, [set]);
		}
	}

	const exerciseById = new Map<number, Exercise>();
	for (const row of results[3].results ?? []) {
		const exercise = exerciseFromRow(row);
		exerciseById.set(exercise.id, exercise);
	}

	const exercises: ExerciseWithWorkoutSets[] = associations.map((association) => ({
		association,
		exercise: exerciseById.get(association.exerciseId) ?? null,
		sets: setsByAssociation.get(association.id) ?? []
	}));

	const exerciseGroups: ExerciseGroupsByMovementPattern = {};
	for (const row of results[4].results ?? []) {
		const patternName =
			row.pattern_name === null || row.pattern_name === undefined ? null : String(row.pattern_name);
		const key = patternName ?? 'Other';
		(exerciseGroups[key] ??= []).push({
			id: reqInt(row.id),
			name: reqStr(row.name).trim(),
			primaryMuscle: optStr(row.primary_muscle),
			patternName
		});
	}

	const trainingBlocks = (results[5].results ?? []).map(trainingBlockFromRow);

	const weeksByBlock: Record<number, BlockWeek[]> = {};
	for (const row of results[6].results ?? []) {
		const week = blockWeekFromRow(row);
		// The column is NOT NULL, so the `?? 0` branch is unreachable in practice.
		const blockId = week.trainingBlockId ?? 0;
		(weeksByBlock[blockId] ??= []).push(week);
	}

	const weekRow = results[7].results[0];
	const week = weekRow ? blockWeekFromRow(weekRow) : null;

	return { workout, exercises, exerciseGroups, trainingBlocks, weeksByBlock, week };
}
