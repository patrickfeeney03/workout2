/**
 * Ported from src/Service/WorkoutService.php.
 * Exports: CreateWorkoutInput, getWorkout, getWorkouts, getWorkoutsByBlockWeekId, handleWorkout,
 * addExerciseToWorkout, deleteWorkout, duplicateWorkout, getWorkoutExercise,
 * getWorkoutExercisesForWorkout, getWorkoutExerciseNames, getWorkoutExercisesAndSetsArray,
 * getWorkoutSetsForWorkoutExercise, getWorkoutSet, handleUpdateWorkoutSetsDTO,
 * WorkoutSetUpdate, WorkoutExerciseUpdate, saveWorkoutExercise, deleteWorkoutExercise,
 * deleteWorkoutSet, moveWorkoutSet, normalizeWorkoutSetNumbers, createEmptyWorkoutSet,
 * getPastWorkoutSetsForExercise, updateWorkoutTitle, updateWorkoutPlannedOn, updateWorkoutWeek.
 *
 * D1 strategy (atomicity): Cloudflare D1 has no interactive transactions, so both `handleWorkout`
 * and `duplicateWorkout` run as a single `db.batch([...])` (atomic, sequential). The first statement
 * generates the new workout id explicitly via `(SELECT COALESCE(MAX(id), 0) + 1 FROM workouts)` and
 * returns it with `RETURNING id`; the following statements address that same freshly inserted row via
 * `(SELECT MAX(id) FROM workouts)`. Child workout_exercises are copied with INSERT ... SELECT and the
 * routine_exercise / original workout_exercise they came from is re-matched by (exercise_id, sort_order)
 * because the copied rows do not carry the source FK. That mapping mirrors the PHP loop closely enough;
 * it can only fan out if a parent has duplicate (exercise_id, sort_order) pairs.
 */

import { allRows, bind, chunk, first, IN_CLAUSE_CHUNK, insertId, placeholders, run, type Db } from '$lib/server/db';
import {
	workoutExerciseFromRow,
	workoutFromRow,
	workoutSetFromRow,
	type ExerciseWithWorkoutSets,
	type Row,
	type Workout,
	type WorkoutExercise,
	type WorkoutSet
} from '$lib/types';
import { getMappedWorkoutExercises, moveSet } from './common';

export interface CreateWorkoutInput {
	routineId?: number | null;
	blockWeekId?: number | null;
	title: string;
	plannedOn: string;
}

/** Reads the id returned by a `RETURNING id` statement that ran first in a batch. */
function batchReturnedId(results: D1Result<{ id: number }>[]): number {
	return Number(results[0]?.results?.[0]?.id ?? 0);
}

/**
 * Mirrors CommonService::getNextSequenceValue(): COALESCE(MAX(column), 0) + 1 for the parent,
 * ignoring soft-deleted rows. `table`/`column`/`parentColumn` are internal literals only.
 */
async function nextSequenceValue(
	db: Db,
	table: string,
	column: string,
	parentColumn: string,
	parentId: number
): Promise<number> {
	const row = await first<{ next: number }>(
		bind(
			db,
			`SELECT COALESCE(MAX(${column}), 0) + 1 AS next FROM ${table} WHERE ${parentColumn} = ? AND is_deleted = 0`,
			[parentId]
		)
	);
	return Number(row?.next ?? 1);
}

async function isWorkoutExerciseOwnedByUser(
	db: Db,
	workoutExerciseId: number,
	userId: number
): Promise<boolean> {
	const row = await first<Row>(
		bind(
			db,
			`SELECT 1 AS owned
			FROM workout_exercises we
			INNER JOIN workouts w ON w.id = we.workout_id
			WHERE we.id = ? AND w.user_id = ?`,
			[workoutExerciseId, userId]
		)
	);
	return row !== null;
}

async function isWorkoutSetOwnedByUser(db: Db, workoutSetId: number, userId: number): Promise<boolean> {
	const row = await first<Row>(
		bind(
			db,
			`SELECT 1 AS owned
			FROM workout_sets ws
			INNER JOIN workout_exercises we ON we.id = ws.workout_exercise_id
			INNER JOIN workouts w ON w.id = we.workout_id
			WHERE ws.id = ? AND w.user_id = ?`,
			[workoutSetId, userId]
		)
	);
	return row !== null;
}

export async function getWorkout(db: Db, id: number, userId: number): Promise<Workout | null> {
	const row = await first<Row>(
		bind(db, 'SELECT * FROM workouts WHERE id = ? AND user_id = ? AND is_deleted = 0', [id, userId])
	);
	return row ? workoutFromRow(row) : null;
}

export async function getWorkouts(db: Db, userId: number): Promise<Workout[]> {
	const rows = await allRows<Row>(
		bind(
			db,
			`SELECT * FROM workouts WHERE user_id = ? AND is_deleted = 0
			ORDER BY planned_on DESC, performed_on DESC`,
			[userId]
		)
	);
	return rows.map(workoutFromRow);
}

export async function getWorkoutsByBlockWeekId(
	db: Db,
	blockWeekId: number,
	userId: number
): Promise<Workout[]> {
	const rows = await allRows<Row>(
		bind(
			db,
			`SELECT * FROM workouts WHERE block_week_id = ? AND user_id = ? AND is_deleted = 0
			ORDER BY planned_on DESC, performed_on DESC`,
			[blockWeekId, userId]
		)
	);
	return rows.map(workoutFromRow);
}

/**
 * Creates a workout and, when the referenced routine belongs to the user and is not deleted,
 * copies its active routine_exercises and routine_sets into workout_exercises / workout_sets.
 * Any routine_id / block_week_id <= 0 (or null) is stored as NULL, like the PHP implementation.
 */
export async function handleWorkout(db: Db, userId: number, input: CreateWorkoutInput): Promise<number> {
	const routineId = input.routineId != null && input.routineId > 0 ? input.routineId : null;
	const blockWeekId = input.blockWeekId != null && input.blockWeekId > 0 ? input.blockWeekId : null;

	const insertWorkout = bind(
		db,
		`INSERT INTO workouts (id, user_id, routine_id, block_week_id, title, planned_on, status)
		VALUES ((SELECT COALESCE(MAX(id), 0) + 1 FROM workouts), ?, ?, ?, ?, ?, 'planned')
		RETURNING id`,
		[userId, routineId, blockWeekId, input.title.trim(), input.plannedOn.trim()]
	);

	const copyWorkoutExercises = bind(
		db,
		`INSERT INTO workout_exercises (workout_id, exercise_id, sort_order, target_rest, notes)
		SELECT (SELECT MAX(id) FROM workouts), re.exercise_id, re.sort_order, re.target_rest, re.notes
		FROM routine_exercises re
		INNER JOIN routines r ON r.id = re.routine_id AND r.user_id = ? AND r.is_deleted = 0
		WHERE re.routine_id = ? AND re.is_deleted = 0`,
		[userId, routineId]
	);

	const copyWorkoutSets = bind(
		db,
		`INSERT INTO workout_sets (workout_exercise_id, set_number, target_reps, target_weight, set_type)
		SELECT we.id, rs.set_number, rs.target_reps, rs.target_weight, rs.set_type
		FROM workout_exercises we
		INNER JOIN routine_exercises re
			ON re.routine_id = ?
			AND re.exercise_id = we.exercise_id
			AND re.is_deleted = 0
			AND (re.sort_order = we.sort_order OR (re.sort_order IS NULL AND we.sort_order IS NULL))
		INNER JOIN routine_sets rs ON rs.routine_exercise_id = re.id AND rs.is_deleted = 0
		WHERE we.workout_id = (SELECT MAX(id) FROM workouts)`,
		[routineId]
	);

	const results = await db.batch<{ id: number }>([insertWorkout, copyWorkoutExercises, copyWorkoutSets]);
	const newId = batchReturnedId(results);
	if (!newId) {
		throw new Error('Error. Could not add workout to db');
	}
	return newId;
}

export async function addExerciseToWorkout(
	db: Db,
	workout: Workout,
	exerciseId: number,
	newExerciseName: string,
	userId: number
): Promise<void> {
	if (workout.userId !== userId) {
		return;
	}

	let targetExerciseId = exerciseId;
	if (newExerciseName !== '') {
		targetExerciseId = await insertId(
			bind(db, 'INSERT INTO exercises (name, user_id) VALUES (?, ?)', [newExerciseName, userId])
		);
	}

	if (targetExerciseId > 0) {
		const owned = await first<Row>(
			bind(db, 'SELECT id FROM exercises WHERE id = ? AND user_id = ?', [targetExerciseId, userId])
		);
		if (!owned) {
			return;
		}

		const nextSortOrder = await nextSequenceValue(
			db,
			'workout_exercises',
			'sort_order',
			'workout_id',
			workout.id
		);

		await run(
			bind(db, 'INSERT INTO workout_exercises (workout_id, exercise_id, sort_order) VALUES (?, ?, ?)', [
				workout.id,
				targetExerciseId,
				nextSortOrder
			])
		);
	}
}

/** Soft deletes the workout, its exercises and their sets atomically (CommonService::softDeleteCascade). */
export async function deleteWorkout(db: Db, workout: Workout): Promise<void> {
	await db.batch([
		bind(db, 'UPDATE workouts SET is_deleted = 1 WHERE id = ?', [workout.id]),
		bind(db, 'UPDATE workout_exercises SET is_deleted = 1 WHERE workout_id = ?', [workout.id]),
		bind(
			db,
			`UPDATE workout_sets SET is_deleted = 1
			WHERE workout_exercise_id IN (SELECT id FROM workout_exercises WHERE workout_id = ?)`,
			[workout.id]
		)
	]);
}

/**
 * Clones a workout (owned by userId) plus its active exercises and sets in one atomic batch.
 * Target reps/weight fall back from the logged actuals to the previous targets. planned_on = today.
 */
export async function duplicateWorkout(db: Db, originalId: number, userId: number): Promise<number> {
	const original = await getWorkout(db, originalId, userId);
	if (!original) {
		throw new Error('Unexpected. Tried to clone a non-existent workout');
	}

	const plannedOn = new Date().toISOString().slice(0, 10);

	const insertWorkout = bind(
		db,
		`INSERT INTO workouts
			(id, user_id, routine_id, block_week_id, title, planned_on, status, notes, cloned_from_workout_id)
		VALUES
			((SELECT COALESCE(MAX(id), 0) + 1 FROM workouts), ?, ?, ?, ?, ?, 'planned', ?, ?)
		RETURNING id`,
		[
			userId,
			original.routineId,
			original.blockWeekId,
			'Copy of ' + (original.title ?? ''),
			plannedOn,
			original.notes,
			original.id
		]
	);

	const copyWorkoutExercises = bind(
		db,
		`INSERT INTO workout_exercises (workout_id, exercise_id, sort_order, target_rest, notes)
		SELECT (SELECT MAX(id) FROM workouts), we.exercise_id, we.sort_order, we.target_rest, we.notes
		FROM workout_exercises we
		WHERE we.workout_id = ? AND we.is_deleted = 0`,
		[original.id]
	);

	const copyWorkoutSets = bind(
		db,
		`INSERT INTO workout_sets
			(workout_exercise_id, set_number, target_reps, target_weight, set_type, notes)
		SELECT nwe.id, ws.set_number,
			COALESCE(ws.actual_reps, ws.target_reps),
			COALESCE(ws.actual_weight, ws.target_weight),
			ws.set_type, ws.notes
		FROM workout_exercises nwe
		INNER JOIN workout_exercises owe
			ON owe.workout_id = ?
			AND owe.exercise_id = nwe.exercise_id
			AND owe.is_deleted = 0
			AND (owe.sort_order = nwe.sort_order OR (owe.sort_order IS NULL AND nwe.sort_order IS NULL))
		INNER JOIN workout_sets ws ON ws.workout_exercise_id = owe.id AND ws.is_deleted = 0
		WHERE nwe.workout_id = (SELECT MAX(id) FROM workouts)`,
		[original.id]
	);

	const results = await db.batch<{ id: number }>([insertWorkout, copyWorkoutExercises, copyWorkoutSets]);
	const newId = batchReturnedId(results);
	if (!newId) {
		throw new Error('COULDNT DUPLICATE WORKOUT! FAILED INSERT');
	}
	return newId;
}

export async function getWorkoutExercise(
	db: Db,
	id: number,
	userId: number
): Promise<WorkoutExercise | null> {
	const row = await first<Row>(
		bind(
			db,
			`SELECT we.*
			FROM workout_exercises we
			INNER JOIN workouts w ON w.id = we.workout_id
			WHERE we.id = ? AND w.user_id = ?`,
			[id, userId]
		)
	);
	return row ? workoutExerciseFromRow(row) : null;
}

export async function getWorkoutExercisesForWorkout(
	db: Db,
	workoutId: number,
	userId: number
): Promise<WorkoutExercise[]> {
	const rows = await allRows<Row>(
		bind(
			db,
			`SELECT we.*
			FROM workout_exercises we
			INNER JOIN workouts w ON w.id = we.workout_id
			WHERE we.workout_id = ? AND we.is_deleted = 0 AND w.user_id = ?
			ORDER BY we.sort_order`,
			[workoutId, userId]
		)
	);
	return rows.map(workoutExerciseFromRow);
}

/**
 * Exercise names per workout, in `sort_order`. One (chunked) query for a whole week's list
 * instead of `getExercise` per workout exercise.
 */
export async function getWorkoutExerciseNames(
	db: Db,
	workoutIds: number[],
	userId: number
): Promise<Map<number, string[]>> {
	const names = new Map<number, string[]>();
	const uniqueIds = [...new Set(workoutIds)];

	for (const ids of chunk(uniqueIds, IN_CLAUSE_CHUNK)) {
		const rows = await allRows<{ workout_id: number; name: string }>(
			bind(
				db,
				`SELECT we.workout_id, e.name
				FROM workout_exercises we
				INNER JOIN workouts w ON w.id = we.workout_id
				INNER JOIN exercises e ON e.id = we.exercise_id
				WHERE we.is_deleted = 0 AND w.user_id = ? AND e.user_id = ?
					AND we.workout_id IN (${placeholders(ids.length)})
				ORDER BY we.workout_id ASC, we.sort_order ASC`,
				[userId, userId, ...ids]
			)
		);

		for (const row of rows) {
			const workoutId = Number(row.workout_id);
			const list = names.get(workoutId);
			if (list) {
				list.push(String(row.name));
			} else {
				names.set(workoutId, [String(row.name)]);
			}
		}
	}

	return names;
}

/**
 * Maps each workout exercise to its exercise row and active sets (ordered by set_number),
 * keyed by workout_exercise id. Mirrors CommonService::getMappedExercisesAndSets; the shared
 * implementation batches the two lookups per association into set-based queries.
 */
export async function getWorkoutExercisesAndSetsArray(
	db: Db,
	workoutExercises: WorkoutExercise[]
): Promise<Record<number, ExerciseWithWorkoutSets>> {
	return getMappedWorkoutExercises(db, workoutExercises);
}

export async function getWorkoutSetsForWorkoutExercise(
	db: Db,
	workoutExerciseId: number,
	userId: number
): Promise<WorkoutSet[]> {
	const rows = await allRows<Row>(
		bind(
			db,
			`SELECT ws.*
			FROM workout_sets ws
			INNER JOIN workout_exercises we ON we.id = ws.workout_exercise_id
			INNER JOIN workouts w ON w.id = we.workout_id
			WHERE ws.workout_exercise_id = ? AND ws.is_deleted = 0 AND w.user_id = ?
			ORDER BY ws.set_number ASC`,
			[workoutExerciseId, userId]
		)
	);
	return rows.map(workoutSetFromRow);
}

export async function getWorkoutSet(
	db: Db,
	workoutSetId: number,
	userId: number
): Promise<WorkoutSet | null> {
	const row = await first<Row>(
		bind(
			db,
			`SELECT ws.*
			FROM workout_sets ws
			INNER JOIN workout_exercises we ON we.id = ws.workout_exercise_id
			INNER JOIN workouts w ON w.id = we.workout_id
			WHERE ws.id = ? AND ws.is_deleted = 0 AND w.user_id = ?`,
			[workoutSetId, userId]
		)
	);
	return row ? workoutSetFromRow(row) : null;
}

export async function handleUpdateWorkoutSetsDTO(db: Db, workoutSet: WorkoutSet): Promise<void> {
	const weight = workoutSet.actualWeight ?? null;
	const reps = workoutSet.actualReps ?? null;
	const setType = workoutSet.setType ?? 'working';
	const note = workoutSet.notes ?? null;

	const weightVal = weight === null ? null : Number(weight);
	const repsVal = reps === null ? null : Number(reps);
	const notesVal = note === null || note === '' ? null : String(note);

	await run(
		bind(
			db,
			`UPDATE workout_sets
			SET actual_reps = ?, actual_weight = ?, set_type = ?, notes = ?
			WHERE id = ?`,
			[repsVal, weightVal, setType, notesVal, workoutSet.id]
		)
	);
}

/** One posted set, already parsed from `sets[<id>][...]` form fields. */
export interface WorkoutSetUpdate {
	id: number;
	actualReps: number | null;
	actualWeight: number | null;
	setType: string;
	notes: string | null;
}

/** Exercise-level fields that were present on the form (`form.has(...)` decided this). */
export interface WorkoutExerciseUpdate {
	targetRest?: string | null;
	notes?: string | null;
}

/**
 * Saves every posted set of one workout exercise, plus its rest and notes, as a single atomic
 * `db.batch`, then completes the workout when every active set has both actual reps and weight.
 * The completion statement runs last in the same batch, so it sees the just-updated values.
 *
 * Set updates are scoped to `workout_exercise_id` (and `is_deleted = 0`), so a posted id from
 * another exercise or user is ignored — the same result as the old per-set ownership lookup, but
 * without one read per set. Returns false when the workout exercise is not owned by the user.
 */
export async function saveWorkoutExercise(
	db: Db,
	userId: number,
	workoutExerciseId: number,
	updates: WorkoutSetUpdate[],
	fields: WorkoutExerciseUpdate = {}
): Promise<boolean> {
	const owned = await first<{ workout_id: number }>(
		bind(
			db,
			`SELECT we.workout_id
			FROM workout_exercises we
			INNER JOIN workouts w ON w.id = we.workout_id
			WHERE we.id = ? AND w.user_id = ?`,
			[workoutExerciseId, userId]
		)
	);
	if (!owned) {
		return false;
	}
	const workoutId = Number(owned.workout_id);

	const statements: D1PreparedStatement[] = [];

	if (fields.targetRest !== undefined) {
		statements.push(
			bind(db, 'UPDATE workout_exercises SET target_rest = ? WHERE id = ?', [
				fields.targetRest,
				workoutExerciseId
			])
		);
	}
	if (fields.notes !== undefined) {
		statements.push(
			bind(db, 'UPDATE workout_exercises SET notes = ? WHERE id = ?', [
				fields.notes,
				workoutExerciseId
			])
		);
	}

	for (const update of updates) {
		statements.push(
			bind(
				db,
				`UPDATE workout_sets
				SET actual_reps = ?, actual_weight = ?, set_type = ?, notes = ?
				WHERE id = ? AND workout_exercise_id = ? AND is_deleted = 0`,
				[
					update.actualReps,
					update.actualWeight,
					update.setType,
					update.notes,
					update.id,
					workoutExerciseId
				]
			)
		);
	}

	// Mirrors the old autoCompleteWorkout loop: at least one active set, and no active set missing
	// either actual value. Soft-deleted exercises and sets are excluded, as before.
	statements.push(
		bind(
			db,
			`UPDATE workouts
			SET status = 'completed'
			WHERE id = ? AND user_id = ? AND status != 'completed'
				AND EXISTS (
					SELECT 1
					FROM workout_sets ws
					INNER JOIN workout_exercises we ON we.id = ws.workout_exercise_id
					WHERE we.workout_id = ? AND we.is_deleted = 0 AND ws.is_deleted = 0
				)
				AND NOT EXISTS (
					SELECT 1
					FROM workout_sets ws
					INNER JOIN workout_exercises we ON we.id = ws.workout_exercise_id
					WHERE we.workout_id = ? AND we.is_deleted = 0 AND ws.is_deleted = 0
						AND (ws.actual_reps IS NULL OR ws.actual_weight IS NULL)
				)`,
			[workoutId, userId, workoutId, workoutId]
		)
	);

	await db.batch(statements);
	return true;
}

export async function deleteWorkoutExercise(
	db: Db,
	userId: number,
	workoutExerciseId: number
): Promise<void> {
	if (!(await isWorkoutExerciseOwnedByUser(db, workoutExerciseId, userId))) {
		return;
	}
	await run(
		bind(db, 'UPDATE workout_exercises SET is_deleted = 1 WHERE id = ? AND is_deleted = 0', [
			workoutExerciseId
		])
	);
}

export async function deleteWorkoutSet(db: Db, setId: number, userId: number): Promise<void> {
	if (!(await isWorkoutSetOwnedByUser(db, setId, userId))) {
		return;
	}
	await run(bind(db, 'UPDATE workout_sets SET is_deleted = 1 WHERE id = ? AND is_deleted = 0', [setId]));
}

/** Delegates to CommonService::moveSet (via ./common) after an ownership check. */
export async function moveWorkoutSet(
	db: Db,
	setId: number,
	direction: string,
	userId: number
): Promise<boolean> {
	if (!(await isWorkoutSetOwnedByUser(db, setId, userId))) {
		return false;
	}
	return moveSet(db, setId, direction, 'workout_sets', 'workout_exercise_id');
}

export async function normalizeWorkoutSetNumbers(db: Db, workoutExerciseId: number): Promise<void> {
	await run(
		bind(
			db,
			`UPDATE workout_sets
			SET set_number = new_nums.new_num
			FROM (
				SELECT id, ROW_NUMBER() OVER(ORDER BY set_number ASC) as new_num
				FROM workout_sets
				WHERE workout_exercise_id = ? AND is_deleted = 0
			) AS new_nums
			WHERE workout_sets.id = new_nums.id`,
			[workoutExerciseId]
		)
	);
}

/**
 * Inserts an empty set at the start (set_number 0 then renumber) or end (next set_number) of the
 * exercise. Returns `[]` when the exercise is not owned by the user (matching the PHP `[]` return),
 * a single WorkoutSet otherwise.
 */
export async function createEmptyWorkoutSet(
	db: Db,
	workoutExerciseId: number,
	userId: number,
	pos: 'start' | 'end' = 'end'
): Promise<WorkoutSet | WorkoutSet[]> {
	if (!(await isWorkoutExerciseOwnedByUser(db, workoutExerciseId, userId))) {
		return [];
	}

	if (pos === 'start') {
		await run(
			bind(
				db,
				`INSERT INTO workout_sets
				(workout_exercise_id, set_number, actual_reps, actual_weight, set_type) VALUES
				(?, 0, null, null, 'warmup')`,
				[workoutExerciseId]
			)
		);

		await normalizeWorkoutSetNumbers(db, workoutExerciseId);

		return getWorkoutSetsForWorkoutExercise(db, workoutExerciseId, userId);
	}

	const nextNum = await nextSequenceValue(
		db,
		'workout_sets',
		'set_number',
		'workout_exercise_id',
		workoutExerciseId
	);

	const row = await first<Row>(
		bind(
			db,
			`INSERT INTO workout_sets
			(workout_exercise_id, set_number, actual_reps, actual_weight, set_type) VALUES
			(?, ?, null, null, 'working')
			RETURNING *`,
			[workoutExerciseId, nextNum]
		)
	);
	if (!row) {
		throw new Error('Error. Could not create workout set');
	}
	return workoutSetFromRow(row);
}

export async function getPastWorkoutSetsForExercise(
	db: Db,
	exerciseId: number,
	userId: number
): Promise<Record<number, { workout: Workout | null; workoutExercise: WorkoutExercise; sets: WorkoutSet[] }>> {
	const rows = await allRows<Row>(
		bind(
			db,
			`SELECT we.*
			FROM workout_exercises we
			INNER JOIN workouts w ON w.id = we.workout_id
			WHERE we.exercise_id = ? AND we.is_deleted = 0 AND w.user_id = ?
			ORDER BY we.workout_id DESC`,
			[exerciseId, userId]
		)
	);

	const grouped: Record<
		number,
		{ workout: Workout | null; workoutExercise: WorkoutExercise; sets: WorkoutSet[] }
	> = {};

	for (const wexRow of rows) {
		const workoutExercise = workoutExerciseFromRow(wexRow);
		const sets = await getWorkoutSetsForWorkoutExercise(db, workoutExercise.id, userId);
		const workout = await getWorkout(db, workoutExercise.workoutId, userId);
		grouped[workoutExercise.id] = { workout, workoutExercise, sets };
	}

	return grouped;
}

export async function updateWorkoutTitle(
	db: Db,
	workoutId: number,
	title: string,
	userId: number
): Promise<void> {
	await run(bind(db, 'UPDATE workouts SET title = ? WHERE id = ? AND user_id = ?', [title, workoutId, userId]));
}

export async function updateWorkoutPlannedOn(
	db: Db,
	workoutId: number,
	plannedOn: string,
	userId: number
): Promise<void> {
	await run(
		bind(db, 'UPDATE workouts SET planned_on = ? WHERE id = ? AND user_id = ?', [
			plannedOn,
			workoutId,
			userId
		])
	);
}

export async function updateWorkoutWeek(
	db: Db,
	workoutId: number,
	blockWeekId: number | null,
	userId: number
): Promise<void> {
	await run(
		bind(db, 'UPDATE workouts SET block_week_id = ? WHERE id = ? AND user_id = ?', [
			blockWeekId,
			workoutId,
			userId
		])
	);
}
