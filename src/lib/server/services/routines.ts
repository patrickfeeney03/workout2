/**
 * Ported from src/Service/RoutineService.php.
 * Exports: getRoutine, getRoutines, getRoutineExercise, getRoutineExercisesFromRoutine, getRoutineExercises,
 * getSetsForRoutineExercise, getRoutineSet, getMappedExercisesAndSetsForRoutineExercises, createRoutine,
 * deleteRoutine, addExerciseToRoutine, handleUpdateRoutineSets, deleteRoutineExercise, deleteRoutineSet,
 * moveRoutineSet, createEmptyRoutineSet, RoutineInput, UpdateRoutineSetsInput.
 */

import { allRows, bind, first, run, type Db } from '$lib/server/db';
import {
	routineExerciseFromRow,
	routineFromRow,
	routineSetFromRow,
	type ExerciseWithRoutineSets,
	type Routine,
	type RoutineExercise,
	type RoutineSet,
	type Row
} from '$lib/types';
import {
	getMappedRoutineExercises,
	getNextSetNumber,
	getNextSortOrder,
	moveSet,
	softDeleteCascade
} from './common';

/** Form payload accepted by `createRoutine` (was `$_POST` in PHP). */
export interface RoutineInput {
	name?: string | null;
	description?: string | null;
	splitName?: string | null;
	splitDay?: string | null;
	notes?: string | null;
}

/**
 * Form payload accepted by `handleUpdateRoutineSets` (was bracket-notation `$_POST` arrays in PHP).
 *
 * `targetReps` keys are the set ids; keys prefixed with `new_` insert instead of update, exactly as
 * `str_starts_with((string) $setId, 'new_')` did in PHP.
 *
 * `setRest` and `deleteSetIds` are accepted for POST-shape parity but intentionally ignored: the PHP
 * method has no per-set rest handling and no delete handling on this path, so porting them would
 * change behaviour. (Per-set deletes go through `deleteRoutineSet` / the `delete_routine_set` action.)
 */
export interface UpdateRoutineSetsInput {
	routineExerciseId: number;
	targetRest?: string | null;
	exerciseNotes?: string | null;
	targetReps?: Record<string, string | number | null | undefined>;
	targetWeight?: Record<string, string | number | null | undefined>;
	setTypes?: Record<string, string | null | undefined>;
	notes?: Record<string, string | null | undefined>;
	setRest?: Record<string, string | null | undefined>;
	deleteSetIds?: number[];
}

/** PHP `trim($value)` where a missing value is treated as the empty string. */
function trimValue(value: string | null | undefined): string {
	return (value ?? '').trim();
}

/** PHP `(float) $value`, returning null for the '' / null / undefined cases the service guards on. */
function toPhpFloat(value: unknown): number | null {
	if (value === '' || value === null || value === undefined) {
		return null;
	}
	const parsed = Number.parseFloat(String(value));
	return Number.isFinite(parsed) ? parsed : 0;
}

/** PHP `(int) $value` for string keys. */
function toPhpInt(value: string | number): number {
	const parsed = Number.parseInt(String(value), 10);
	return Number.isFinite(parsed) ? parsed : 0;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getRoutine(db: Db, routineId: number, userId: number): Promise<Routine | null> {
	const row = await first<Row>(
		bind(db, 'SELECT * FROM routines WHERE id = ? AND user_id = ? AND is_deleted = 0', [
			routineId,
			userId
		])
	);
	return row ? routineFromRow(row) : null;
}

export async function getRoutines(db: Db, userId: number): Promise<Routine[]> {
	const rows = await allRows<Row>(
		bind(db, 'SELECT * FROM routines WHERE user_id = ? AND is_deleted = 0 ORDER BY created_at DESC', [
			userId
		])
	);
	return rows.map(routineFromRow);
}

export async function getRoutineExercisesFromRoutine(
	db: Db,
	routineId: number,
	userId: number
): Promise<RoutineExercise[]> {
	if ((await getRoutine(db, routineId, userId)) === null) {
		return [];
	}

	const rows = await allRows<Row>(
		bind(db, 'SELECT * FROM routine_exercises WHERE routine_id = ? AND is_deleted = 0 ORDER BY sort_order', [
			routineId
		])
	);
	return rows.map(routineExerciseFromRow);
}

export async function getRoutineExercise(
	db: Db,
	routineExerciseId: number,
	userId: number
): Promise<RoutineExercise | null> {
	const row = await first<Row>(
		bind(
			db,
			`SELECT re.* FROM routine_exercises re
			 JOIN routines r ON r.id = re.routine_id
			 WHERE re.id = ? AND re.is_deleted = 0 AND r.user_id = ? AND r.is_deleted = 0`,
			[routineExerciseId, userId]
		)
	);
	return row ? routineExerciseFromRow(row) : null;
}

export async function getRoutineExercises(db: Db, userId: number): Promise<RoutineExercise[]> {
	const rows = await allRows<Row>(
		bind(
			db,
			`SELECT re.* FROM routine_exercises re
			 JOIN routines r ON r.id = re.routine_id
			 WHERE r.user_id = ?
			 ORDER BY re.routine_id, re.sort_order`,
			[userId]
		)
	);
	return rows.map(routineExerciseFromRow);
}

export async function getSetsForRoutineExercise(
	db: Db,
	routineExerciseId: number,
	userId: number
): Promise<RoutineSet[]> {
	const rows = await allRows<Row>(
		bind(
			db,
			`SELECT rs.* FROM routine_sets rs
			 JOIN routine_exercises re ON re.id = rs.routine_exercise_id
			 JOIN routines r ON r.id = re.routine_id
			 WHERE rs.routine_exercise_id = ? AND rs.is_deleted = 0
			   AND r.user_id = ? AND r.is_deleted = 0
			 ORDER BY rs.set_number ASC`,
			[routineExerciseId, userId]
		)
	);
	return rows.map(routineSetFromRow);
}

export async function getRoutineSet(
	db: Db,
	setId: number,
	userId: number
): Promise<RoutineSet | null> {
	const row = await first<Row>(
		bind(
			db,
			`SELECT rs.* FROM routine_sets rs
			 JOIN routine_exercises re ON re.id = rs.routine_exercise_id
			 JOIN routines r ON r.id = re.routine_id
			 WHERE rs.id = ? AND rs.is_deleted = 0
			   AND r.user_id = ? AND r.is_deleted = 0`,
			[setId, userId]
		)
	);
	return row ? routineSetFromRow(row) : null;
}

export async function getMappedExercisesAndSetsForRoutineExercises(
	db: Db,
	routineExercises: RoutineExercise[]
): Promise<Record<number, ExerciseWithRoutineSets>> {
	return getMappedRoutineExercises(db, routineExercises);
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export async function createRoutine(
	db: Db,
	userId: number,
	input: RoutineInput
): Promise<Routine | null> {
	const row = await first<Row>(
		bind(
			db,
			`INSERT INTO routines
			 (user_id, name, description, split_name, split_day, notes)
			 VALUES (?, ?, ?, ?, ?, ?)
			 RETURNING *`,
			[
				userId,
				trimValue(input.name),
				trimValue(input.description),
				trimValue(input.splitName),
				trimValue(input.splitDay),
				trimValue(input.notes)
			]
		)
	);
	return row ? routineFromRow(row) : null;
}

export async function deleteRoutine(db: Db, userId: number, routineId: number): Promise<void> {
	if ((await getRoutine(db, routineId, userId)) === null) {
		return;
	}

	await softDeleteCascade(
		db,
		'routines',
		'routine_exercises',
		'routine_sets',
		'routine_id',
		'routine_exercise_id',
		routineId
	);
}

/**
 * Adds an exercise to a routine. Accepts either the routine id or a loaded `Routine` (the PHP method
 * took the id and re-checked ownership). `newExerciseName` is used verbatim, as in PHP (trimming
 * happens in the HTTP layer).
 */
export async function addExerciseToRoutine(
	db: Db,
	routine: Routine | number,
	exerciseId: number,
	newExerciseName: string,
	userId: number
): Promise<void> {
	const routineId = typeof routine === 'number' ? routine : routine.id;
	if ((await getRoutine(db, routineId, userId)) === null) {
		return;
	}

	if (newExerciseName !== '') {
		const nextNumber = await getNextSortOrder(db, 'routine_exercises', 'routine_id', routineId);
		// One atomic batch: create the exercise, then attach it. `last_insert_rowid()` is evaluated
		// on the batch's single connection/transaction, and the subquery keeps PHP's ownership check.
		await db.batch([
			bind(db, 'INSERT INTO exercises (name, user_id) VALUES (?, ?)', [newExerciseName, userId]),
			bind(
				db,
				`INSERT INTO routine_exercises
				 (routine_id, exercise_id, sort_order)
				 SELECT ?, e.id, ? FROM exercises e
				 WHERE e.id = last_insert_rowid() AND e.user_id = ?`,
				[routineId, nextNumber, userId]
			)
		]);
		return;
	}

	if (exerciseId > 0) {
		const owned = await first<Row>(
			bind(db, 'SELECT id FROM exercises WHERE id = ? AND user_id = ?', [exerciseId, userId])
		);
		if (owned === null) {
			return;
		}

		const nextNumber = await getNextSortOrder(db, 'routine_exercises', 'routine_id', routineId);
		await run(
			bind(db, 'INSERT INTO routine_exercises (routine_id, exercise_id, sort_order) VALUES (?, ?, ?)', [
				routineId,
				exerciseId,
				nextNumber
			])
		);
	}
}

export async function handleUpdateRoutineSets(
	db: Db,
	userId: number,
	input: UpdateRoutineSetsInput
): Promise<void> {
	const routineExerciseId = input.routineExerciseId;
	if ((await getRoutineExercise(db, routineExerciseId, userId)) === null) {
		return;
	}

	const statements: D1PreparedStatement[] = [];

	if (input.targetRest !== undefined && input.targetRest !== null) {
		const rest = input.targetRest.trim();
		statements.push(
			bind(db, 'UPDATE routine_exercises SET target_rest = ? WHERE id = ?', [
				rest === '' ? null : rest,
				routineExerciseId
			])
		);
	}

	if (input.exerciseNotes !== undefined && input.exerciseNotes !== null) {
		const exerciseNotes = input.exerciseNotes.trim();
		statements.push(
			bind(db, 'UPDATE routine_exercises SET notes = ? WHERE id = ?', [
				exerciseNotes === '' ? null : exerciseNotes,
				routineExerciseId
			])
		);
	}

	const targetReps = input.targetReps ?? {};
	const targetWeight = input.targetWeight ?? {};
	const setTypes = input.setTypes ?? {};
	const notes = input.notes ?? {};

	let nextSetNumber = await getNextSetNumber(
		db,
		'routine_sets',
		'routine_exercise_id',
		routineExerciseId
	);

	for (const setKey of Object.keys(targetReps)) {
		const reps = targetReps[setKey];
		const weight = targetWeight[setKey];
		const setType = setTypes[setKey] ?? 'working';
		const setNote = notes[setKey];

		const repsVal = toPhpFloat(reps);
		const weightVal = toPhpFloat(weight);
		const notesVal = setNote === '' || setNote === null || setNote === undefined ? null : String(setNote);

		if (setKey.startsWith('new_')) {
			// PHP: count = getNextSetNumber() - 1, then inserts count + 1. Each inserted set raises
			// the observed max, so mirror that by consuming the running counter.
			const count = nextSetNumber - 1;
			statements.push(
				bind(
					db,
					`INSERT INTO routine_sets
					 (routine_exercise_id, set_number, target_reps, target_weight, set_type, notes)
					 VALUES (?, ?, ?, ?, ?, ?)`,
					[routineExerciseId, count + 1, repsVal, weightVal, setType, notesVal]
				)
			);
			nextSetNumber += 1;
		} else {
			statements.push(
				bind(
					db,
					`UPDATE routine_sets
					 SET target_reps = ?, target_weight = ?, set_type = ?, notes = ?
					 WHERE id = ? AND routine_exercise_id = ?`,
					[repsVal, weightVal, setType, notesVal, toPhpInt(setKey), routineExerciseId]
				)
			);
		}
	}

	if (statements.length > 0) {
		await db.batch(statements);
	}
}

export async function deleteRoutineExercise(
	db: Db,
	userId: number,
	routineExerciseId: number
): Promise<void> {
	if ((await getRoutineExercise(db, routineExerciseId, userId)) === null) {
		return;
	}

	await run(
		bind(db, 'UPDATE routine_exercises SET is_deleted = 1 WHERE id = ? AND is_deleted = 0', [
			routineExerciseId
		])
	);
}

export async function deleteRoutineSet(db: Db, setId: number, userId: number): Promise<void> {
	if ((await getRoutineSet(db, setId, userId)) === null) {
		return;
	}

	await run(bind(db, 'UPDATE routine_sets SET is_deleted = 1 WHERE id = ? AND is_deleted = 0', [setId]));
}

export async function moveRoutineSet(
	db: Db,
	setId: number,
	direction: string,
	userId: number
): Promise<boolean> {
	if ((await getRoutineSet(db, setId, userId)) === null) {
		return false;
	}

	return moveSet(db, setId, direction, 'routine_sets', 'routine_exercise_id');
}

/**
 * Appends an empty ('working') set to a routine exercise.
 *
 * PHP `RoutineService::createEmptyRoutineSet` returns a single `RoutineSet` (or null); only the
 * sibling `WorkoutService` can return an array of sets. The array arm is kept in the signature for
 * parity with that API, but this port always resolves to a single set or null.
 */
export async function createEmptyRoutineSet(
	db: Db,
	routineExerciseId: number,
	userId: number
): Promise<RoutineSet | null | RoutineSet[]> {
	if ((await getRoutineExercise(db, routineExerciseId, userId)) === null) {
		return null;
	}

	const nextNum = await getNextSetNumber(
		db,
		'routine_sets',
		'routine_exercise_id',
		routineExerciseId
	);

	const row = await first<Row>(
		bind(
			db,
			`INSERT INTO routine_sets
			 (routine_exercise_id, set_number, target_reps, target_weight, set_type) VALUES
			 (?, ?, null, null, 'working')
			 RETURNING *`,
			[routineExerciseId, nextNum]
		)
	);

	return row ? routineSetFromRow(row) : null;
}
