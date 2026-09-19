/**
 * Ported from src/Service/CatalogService.php.
 *
 * Exports: getExerciseImages, getExerciseImageById, getExercise, getExercises,
 * getExercisesGroupedByMovementPattern, getExercisesForMovementPattern, getExercisesForRoutine,
 * getMovementPatterns, getMovementPatternById, createExercise, updateExercise, deleteExercise,
 * createMovementPattern, updateMovementPattern, deleteMovementPattern, insertExerciseImage,
 * deleteExerciseImage, ExerciseInput, MovementPatternInput, GroupedExercise,
 * ExerciseGroupsByMovementPattern.
 *
 * `getExercisesGroupedByMovementPattern` mirrors the PHP return shape: an object keyed by movement
 * pattern name (`Other` when `mp.name` is NULL) whose values are projected exercise rows
 * `{ id, name, primaryMuscle, patternName }`, ordered by pattern name then exercise name.
 *
 * `createMovementPattern` returns the new row id, or `0` when the trimmed name is empty (the PHP
 * method returns early without inserting). `deleteExerciseImage` deletes the database row only and
 * reports whether a row was removed; the caller is responsible for any filesystem/R2 cleanup.
 *
 * D1 notes: no interactive transactions are used here. Every function issues at most one write
 * statement, so `db.batch([...])` is unnecessary.
 */

import { allRows, bind, changedRows, first, insertId, run, type Db } from '$lib/server/db';
import {
	exerciseFromRow,
	exerciseImageFromRow,
	movementPatternFromRow,
	optStr,
	reqInt,
	reqStr,
	type Exercise,
	type ExerciseImage,
	type MovementPattern,
	type Row
} from '$lib/types';

/** Form-shaped input for `createExercise` / `updateExercise` (mirrors the PHP `$_POST` keys). */
export interface ExerciseInput {
	/** Only used by `updateExercise` (`$_POST['id']`). */
	readonly id?: number | string | null;
	readonly name?: string | null;
	readonly description?: string | null;
	readonly equipment?: string | null;
	readonly primaryMuscle?: string | null;
	readonly movementPatternId?: number | string | null;
	readonly notes?: string | null;
}

/** Form-shaped input for `createMovementPattern` / `updateMovementPattern`. */
export interface MovementPatternInput {
	/** Only used by `updateMovementPattern` (`$_POST['id']`). */
	readonly id?: number | string | null;
	readonly name?: string | null;
	readonly notes?: string | null;
}

/** A single projected exercise row inside a movement-pattern group. */
export interface GroupedExercise {
	readonly id: number;
	readonly name: string;
	readonly primaryMuscle: string | null;
	readonly patternName: string | null;
}

/** Result of `getExercisesGroupedByMovementPattern`, keyed by movement pattern name. */
export type ExerciseGroupsByMovementPattern = Record<string, GroupedExercise[]>;

// ---------------------------------------------------------------------------
// Coercion helpers (mirror the PHP `trim()` / `(int)` casts)
// ---------------------------------------------------------------------------

/** Mirrors `trim($_POST[$key] ?? '')`: undefined/null become the empty string. */
function trimValue(value: unknown): string {
	if (value === undefined || value === null) return '';
	return String(value).trim();
}

/** Empty movement patterns store NULL so the FK stays valid. */
function movementPatternValue(value: unknown): number | null {
	const trimmed = trimValue(value);
	if (trimmed === '') return null;
	const parsed = Number.parseInt(trimmed, 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/** Mirrors binding a raw `$_POST` value: undefined/null become SQL NULL. */
function rawString(value: unknown): string | null {
	if (value === undefined || value === null) return null;
	return String(value);
}

// ---------------------------------------------------------------------------
// Exercise images
// ---------------------------------------------------------------------------

export async function getExerciseImages(
	db: Db,
	exerciseId: number,
	userId: number
): Promise<ExerciseImage[]> {
	const rows = await allRows<Row>(
		bind(
			db,
			`SELECT ei.*
			FROM exercise_images ei
			JOIN exercises e ON ei.exercise_id = e.id
			WHERE ei.exercise_id = ? AND e.user_id = ?
			ORDER BY ei.created_at ASC`,
			[exerciseId, userId]
		)
	);
	return rows.map(exerciseImageFromRow);
}

export async function getExerciseImageById(
	db: Db,
	imageId: number,
	userId: number
): Promise<ExerciseImage | null> {
	const row = await first<Row>(
		bind(
			db,
			`SELECT ei.*
			FROM exercise_images ei
			JOIN exercises e ON ei.exercise_id = e.id
			WHERE ei.id = ? AND e.user_id = ?`,
			[imageId, userId]
		)
	);
	return row ? exerciseImageFromRow(row) : null;
}

export async function insertExerciseImage(
	db: Db,
	exerciseId: number,
	filePath: string,
	userId: number
): Promise<void> {
	const owner = await first<{ id: number }>(
		bind(db, 'SELECT id FROM exercises WHERE id = ? AND user_id = ?', [exerciseId, userId])
	);
	if (!owner) return;

	await run(
		bind(db, 'INSERT INTO exercise_images (exercise_id, file_path) VALUES (?, ?)', [
			exerciseId,
			filePath
		])
	);
}

/**
 * Deletes the database row only (no filesystem/R2 side effects). Returns `true` when a row was
 * deleted. Ownership is enforced through the owning exercise, matching the PHP JOIN.
 */
export async function deleteExerciseImage(db: Db, imageId: number, userId: number): Promise<boolean> {
	const changes = await changedRows(
		bind(
			db,
			`DELETE FROM exercise_images
			WHERE id = ? AND exercise_id IN (SELECT id FROM exercises WHERE user_id = ?)`,
			[imageId, userId]
		)
	);
	return changes > 0;
}

// ---------------------------------------------------------------------------
// Exercises
// ---------------------------------------------------------------------------

export async function getExercise(
	db: Db,
	exerciseId: number,
	userId: number
): Promise<Exercise | null> {
	const row = await first<Row>(
		bind(db, 'SELECT * FROM exercises WHERE id = ? AND user_id = ?', [exerciseId, userId])
	);
	return row ? exerciseFromRow(row) : null;
}

export async function getExercises(db: Db, userId: number): Promise<Exercise[]> {
	const rows = await allRows<Row>(
		bind(
			db,
			`SELECT exercises.*, movement_patterns.name AS movement_pattern_name
			FROM exercises
			LEFT JOIN movement_patterns ON exercises.movement_pattern_id = movement_patterns.id
			WHERE exercises.user_id = ?
			ORDER BY exercises.name ASC`,
			[userId]
		)
	);
	return rows.map(exerciseFromRow);
}

export async function getExercisesForMovementPattern(
	db: Db,
	movementPatternId: number,
	userId: number
): Promise<Exercise[]> {
	const rows = await allRows<Row>(
		bind(db, 'SELECT * FROM exercises WHERE movement_pattern_id = ? AND user_id = ?', [
			movementPatternId,
			userId
		])
	);
	return rows.map(exerciseFromRow);
}

export async function getExercisesForRoutine(
	db: Db,
	routineId: number,
	userId: number
): Promise<Exercise[]> {
	const rows = await allRows<Row>(
		bind(
			db,
			`SELECT e.*
			FROM exercises e
			JOIN routine_exercises re ON e.id = re.exercise_id
			JOIN routines r ON re.routine_id = r.id AND r.user_id = ?
			WHERE re.routine_id = ? AND re.is_deleted = 0
			ORDER BY re.sort_order ASC`,
			[userId, routineId]
		)
	);
	return rows.map(exerciseFromRow);
}

export async function getExercisesGroupedByMovementPattern(
	db: Db,
	userId: number
): Promise<ExerciseGroupsByMovementPattern> {
	const rows = await allRows<{
		id: unknown;
		name: unknown;
		primary_muscle: unknown;
		pattern_name: unknown;
	}>(
		bind(
			db,
			`SELECT e.id, e.name, e.primary_muscle, mp.name AS pattern_name
			FROM exercises e
			LEFT JOIN movement_patterns mp ON e.movement_pattern_id = mp.id
			WHERE e.user_id = ?
			ORDER BY mp.name, e.name`,
			[userId]
		)
	);

	const grouped: ExerciseGroupsByMovementPattern = {};
	for (const row of rows) {
		const patternName =
			row.pattern_name === null || row.pattern_name === undefined
				? null
				: String(row.pattern_name);
		const key = patternName ?? 'Other';
		(grouped[key] ??= []).push({
			id: reqInt(row.id),
			name: reqStr(row.name).trim(),
			primaryMuscle: optStr(row.primary_muscle),
			patternName
		});
	}
	return grouped;
}

export async function createExercise(db: Db, userId: number, input: ExerciseInput): Promise<number> {
	const stmt = bind(
		db,
		`INSERT INTO exercises
		(name, user_id, description, equipment, primary_muscle, movement_pattern_id, notes)
		VALUES (?, ?, ?, ?, ?, ?, ?)`,
		[
			trimValue(input.name),
			userId,
			trimValue(input.description),
			trimValue(input.equipment),
			trimValue(input.primaryMuscle),
			movementPatternValue(input.movementPatternId),
			trimValue(input.notes)
		]
	);
	return insertId(stmt);
}

export async function updateExercise(db: Db, userId: number, input: ExerciseInput): Promise<void> {
	const stmt = bind(
		db,
		`UPDATE exercises
		SET name = ?,
			description = ?,
			equipment = ?,
			primary_muscle = ?,
			movement_pattern_id = ?,
			notes = ?
		WHERE id = ? AND user_id = ?`,
		[
			rawString(input.name),
			rawString(input.description),
			rawString(input.equipment),
			rawString(input.primaryMuscle),
			movementPatternValue(input.movementPatternId),
			rawString(input.notes),
			reqInt(input.id),
			userId
		]
	);
	await run(stmt);
}

/** Hard delete with an ownership check, matching the PHP implementation. */
export async function deleteExercise(db: Db, userId: number, exerciseId: number): Promise<void> {
	await run(bind(db, 'DELETE FROM exercises WHERE id = ? AND user_id = ?', [exerciseId, userId]));
}

// ---------------------------------------------------------------------------
// Movement patterns
// ---------------------------------------------------------------------------

export async function getMovementPatterns(db: Db): Promise<MovementPattern[]> {
	const rows = await allRows<Row>(bind(db, 'SELECT * FROM movement_patterns ORDER BY name DESC'));
	return rows.map(movementPatternFromRow);
}

export async function getMovementPatternById(
	db: Db,
	id: number
): Promise<MovementPattern | null> {
	const row = await first<Row>(bind(db, 'SELECT * FROM movement_patterns WHERE id = ?', [id]));
	return row ? movementPatternFromRow(row) : null;
}

/** Returns the new row id, or `0` when the trimmed name is empty (PHP returns early). */
export async function createMovementPattern(
	db: Db,
	input: MovementPatternInput
): Promise<number> {
	const name = trimValue(input.name);
	const notes = trimValue(input.notes);
	if (name === '') return 0;

	return insertId(
		bind(db, 'INSERT INTO movement_patterns (name, notes) VALUES (?, ?)', [name, notes])
	);
}

export async function updateMovementPattern(
	db: Db,
	input: MovementPatternInput
): Promise<void> {
	const stmt = bind(
		db,
		`UPDATE movement_patterns
		SET name = ?,
			notes = ?
		WHERE id = ?`,
		[trimValue(input.name), trimValue(input.notes), reqInt(input.id)]
	);
	await run(stmt);
}

export async function deleteMovementPattern(db: Db, id: number): Promise<void> {
	await run(bind(db, 'DELETE FROM movement_patterns WHERE id = ?', [id]));
}
