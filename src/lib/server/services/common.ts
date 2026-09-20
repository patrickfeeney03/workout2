/**
 * Ported from src/Service/CommonService.php.
 * Exports: formatDate, getNextSequenceValue, getNextSetNumber, getNextSortOrder,
 * moveExercise, moveSet, softDeleteCascade, getMappedRoutineExercises, getMappedWorkoutExercises.
 * (optimizeAndSaveImage is intentionally not ported; GD is unavailable on Workers.)
 */

import {
	allRows,
	bind,
	chunk,
	first,
	IN_CLAUSE_CHUNK,
	placeholders,
	type Db
} from '$lib/server/db';
import {
	optInt,
	exerciseFromRow,
	routineSetFromRow,
	workoutSetFromRow,
	type Exercise,
	type ExerciseAssociation,
	type ExerciseWithRoutineSets,
	type ExerciseWithWorkoutSets,
	type RoutineExercise,
	type RoutineSet,
	type WorkoutExercise,
	type WorkoutSet,
	type Row
} from '$lib/types';

const MONTHS_SHORT = [
	'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];
const MONTHS_FULL = [
	'January', 'February', 'March', 'April', 'May', 'June',
	'July', 'August', 'September', 'October', 'November', 'December'
];
const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAYS_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function pad(value: number, length = 2): string {
	return String(value).padStart(length, '0');
}

function ordinalSuffix(day: number): string {
	if (day % 100 >= 11 && day % 100 <= 13) return 'th';
	switch (day % 10) {
		case 1:
			return 'st';
		case 2:
			return 'nd';
		case 3:
			return 'rd';
		default:
			return 'th';
	}
}

function isLeapYear(year: number): boolean {
	return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Render a parsed date using the PHP `date()` format specifiers the app relies on. */
function formatWithPhpTokens(dt: Date, format: string): string {
	const year = dt.getUTCFullYear();
	const month = dt.getUTCMonth() + 1;
	const day = dt.getUTCDate();
	const dow = dt.getUTCDay();
	const hours = dt.getUTCHours();
	const minutes = dt.getUTCMinutes();
	const seconds = dt.getUTCSeconds();
	const hour12 = hours % 12 === 0 ? 12 : hours % 12;

	let out = '';
	for (let i = 0; i < format.length; i++) {
		const ch = format[i];
		if (ch === '\\') {
			if (i + 1 < format.length) {
				out += format[++i];
			}
			continue;
		}
		switch (ch) {
			case 'd':
				out += pad(day);
				break;
			case 'j':
				out += String(day);
				break;
			case 'D':
				out += DAYS_SHORT[dow];
				break;
			case 'l':
				out += DAYS_FULL[dow];
				break;
			case 'N':
				out += String(dow === 0 ? 7 : dow);
				break;
			case 'w':
				out += String(dow);
				break;
			case 'S':
				out += ordinalSuffix(day);
				break;
			case 'm':
				out += pad(month);
				break;
			case 'n':
				out += String(month);
				break;
			case 'M':
				out += MONTHS_SHORT[month - 1];
				break;
			case 'F':
				out += MONTHS_FULL[month - 1];
				break;
			case 'Y':
				out += String(year);
				break;
			case 'y':
				out += pad(year % 100);
				break;
			case 'L':
				out += isLeapYear(year) ? '1' : '0';
				break;
			case 'H':
				out += pad(hours);
				break;
			case 'G':
				out += String(hours);
				break;
			case 'h':
				out += pad(hour12);
				break;
			case 'g':
				out += String(hour12);
				break;
			case 'i':
				out += pad(minutes);
				break;
			case 's':
				out += pad(seconds);
				break;
			case 'a':
				out += hours < 12 ? 'am' : 'pm';
				break;
			case 'A':
				out += hours < 12 ? 'AM' : 'PM';
				break;
			case 'U':
				out += String(Math.floor(dt.getTime() / 1000));
				break;
			default:
				out += ch;
		}
	}
	return out;
}

/**
 * Mirrors `DateTimeImmutable::createFromFormat('!Y-m-d', $date)` + `format($format)`.
 * Returns '' for an empty date and the original string when it cannot be parsed.
 */
export function formatDate(date: string | null, format = 'M j'): string {
	if (!date) {
		return '';
	}
	const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(date);
	if (!match) {
		return date;
	}
	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	if (month < 1 || month > 12 || day < 1 || day > 31) {
		return date;
	}
	const dt = new Date(Date.UTC(year, month - 1, day));
	return formatWithPhpTokens(dt, format);
}

/** `SELECT COALESCE(MAX(col), 0) ... + 1` for a soft-delete aware child table. */
export async function getNextSequenceValue(
	db: Db,
	table: string,
	column: string,
	parentColumn: string,
	parentId: number
): Promise<number> {
	const row = await first<Row>(
		bind(
			db,
			`SELECT COALESCE(MAX(${column}), 0) FROM ${table} WHERE ${parentColumn} = ? AND is_deleted = 0`,
			[parentId]
		)
	);
	if (!row) {
		return 1;
	}
	return (optInt(Object.values(row)[0]) ?? 0) + 1;
}

export async function getNextSetNumber(
	db: Db,
	table: string,
	parentColumn: string,
	parentId: number
): Promise<number> {
	return getNextSequenceValue(db, table, 'set_number', parentColumn, parentId);
}

export async function getNextSortOrder(
	db: Db,
	table: string,
	parentColumn: string,
	parentId: number
): Promise<number> {
	return getNextSequenceValue(db, table, 'sort_order', parentColumn, parentId);
}

/**
 * Swap the `sort_order` of `current` with its neighbour in `sequenceExercises`.
 * The two updates run as one atomic D1 batch.
 */
export async function moveExercise(
	db: Db,
	current: ExerciseAssociation,
	sequenceExercises: ExerciseAssociation[],
	direction: string,
	tableName: string
): Promise<boolean> {
	let indexOfExerciseToMove = -1;
	for (let index = 0; index < sequenceExercises.length; index++) {
		if (sequenceExercises[index].id === current.id) {
			indexOfExerciseToMove = index;
			break;
		}
	}

	if (indexOfExerciseToMove === -1) {
		return false;
	}

	let targetIndex = -1;
	if (direction === 'up' && indexOfExerciseToMove > 0) {
		targetIndex = indexOfExerciseToMove - 1;
	} else if (direction === 'down' && indexOfExerciseToMove < sequenceExercises.length - 1) {
		targetIndex = indexOfExerciseToMove + 1;
	}

	if (targetIndex === -1) {
		return false;
	}

	const targetExercise = sequenceExercises[targetIndex];
	await db.batch([
		bind(db, `UPDATE ${tableName} SET sort_order = ? WHERE id = ?`, [
			targetExercise.sortOrder,
			current.id
		]),
		bind(db, `UPDATE ${tableName} SET sort_order = ? WHERE id = ?`, [
			current.sortOrder,
			targetExercise.id
		])
	]);
	return true;
}

/** Swap the `set_number` of a set with its neighbour among the non-deleted sets of its parent. */
export async function moveSet(
	db: Db,
	setId: number,
	direction: string,
	table: 'routine_sets' | 'workout_sets',
	parentColumn: string
): Promise<boolean> {
	const currentSet = await first<Row>(
		bind(db, `SELECT * FROM ${table} WHERE id = ? AND is_deleted = 0`, [setId])
	);
	if (!currentSet) {
		return false;
	}

	const sets = await allRows<Row>(
		bind(
			db,
			`SELECT * FROM ${table} WHERE ${parentColumn} = ? AND is_deleted = 0 ORDER BY set_number ASC`,
			[currentSet[parentColumn]]
		)
	);

	let currentIndex = -1;
	for (let index = 0; index < sets.length; index++) {
		if (Number(sets[index].id) === Number(currentSet.id)) {
			currentIndex = index;
			break;
		}
	}

	if (currentIndex === -1) {
		return false;
	}

	let targetIndex = -1;
	if (direction === 'up' && currentIndex > 0) {
		targetIndex = currentIndex - 1;
	} else if (direction === 'down' && currentIndex < sets.length - 1) {
		targetIndex = currentIndex + 1;
	}

	if (targetIndex === -1) {
		return false;
	}

	const targetSet = sets[targetIndex];
	await db.batch([
		bind(db, `UPDATE ${table} SET set_number = ? WHERE id = ?`, [
			currentSet.set_number,
			targetSet.id
		]),
		bind(db, `UPDATE ${table} SET set_number = ? WHERE id = ?`, [
			targetSet.set_number,
			currentSet.id
		])
	]);
	return true;
}

/** Soft delete a parent, its children and its grandchildren in one atomic batch. */
export async function softDeleteCascade(
	db: Db,
	parentTable: string,
	childTable: string,
	grandchildTable: string,
	parentIdColumn: string,
	childIdColumn: string,
	id: number
): Promise<void> {
	await db.batch([
		bind(db, `UPDATE ${parentTable} SET is_deleted = 1 WHERE id = ?`, [id]),
		bind(db, `UPDATE ${childTable} SET is_deleted = 1 WHERE ${parentIdColumn} = ?`, [id]),
		bind(
			db,
			`UPDATE ${grandchildTable} SET is_deleted = 1 WHERE ${childIdColumn} IN ` +
				`(SELECT id FROM ${childTable} WHERE ${parentIdColumn} = ?)`,
			[id]
		)
	]);
}

/**
 * D1 caps bound parameters per statement (100), so `IN (...)` lists are chunked below that.
 * Every mapping below loads all rows in a handful of set-based queries instead of two per
 * association — D1 queries are network round trips, so per-row loops show up as navigation lag.
 */

/** Loads exercises by id with one query per chunk of ids instead of one query per exercise. */
async function loadExercisesByIds(db: Db, exerciseIds: number[]): Promise<Map<number, Exercise>> {
	const uniqueIds = [...new Set(exerciseIds)];
	const rowGroups = await Promise.all(
		chunk(uniqueIds, IN_CLAUSE_CHUNK).map((ids) =>
			allRows<Row>(
				bind(db, `SELECT * FROM exercises WHERE id IN (${placeholders(ids.length)})`, ids)
			)
		)
	);

	const exercises = new Map<number, Exercise>();
	for (const rows of rowGroups) {
		for (const row of rows) {
			const exercise = exerciseFromRow(row);
			exercises.set(exercise.id, exercise);
		}
	}
	return exercises;
}

/** Active sets for many associations, ordered by association and set number. */
async function loadSetsByAssociation(
	db: Db,
	table: 'routine_sets' | 'workout_sets',
	foreignKey: 'routine_exercise_id' | 'workout_exercise_id',
	associationIds: number[]
): Promise<Row[]> {
	const uniqueIds = [...new Set(associationIds)];
	const rowGroups = await Promise.all(
		chunk(uniqueIds, IN_CLAUSE_CHUNK).map((ids) =>
			allRows<Row>(
				bind(
					db,
					`SELECT * FROM ${table}
					WHERE is_deleted = 0 AND ${foreignKey} IN (${placeholders(ids.length)})
					ORDER BY ${foreignKey} ASC, set_number ASC`,
					ids
				)
			)
		)
	);
	return rowGroups.flat();
}

/** Port of `getMappedExercisesAndSets` for routine exercises (batched, not two queries per row). */
export async function getMappedRoutineExercises(
	db: Db,
	exercises: RoutineExercise[]
): Promise<Record<number, ExerciseWithRoutineSets>> {
	const mapped: Record<number, ExerciseWithRoutineSets> = {};
	if (exercises.length === 0) {
		return mapped;
	}

	const [setRows, exerciseById] = await Promise.all([
		loadSetsByAssociation(db, 'routine_sets', 'routine_exercise_id', exercises.map((e) => e.id)),
		loadExercisesByIds(db, exercises.map((e) => e.exerciseId))
	]);

	const setsByAssociation = new Map<number, RoutineSet[]>();
	for (const row of setRows) {
		const set = routineSetFromRow(row);
		const sets = setsByAssociation.get(set.routineExerciseId);
		if (sets) {
			sets.push(set);
		} else {
			setsByAssociation.set(set.routineExerciseId, [set]);
		}
	}

	for (const association of exercises) {
		mapped[association.id] = {
			exercise: exerciseById.get(association.exerciseId) ?? null,
			sets: setsByAssociation.get(association.id) ?? [],
			association
		};
	}
	return mapped;
}

/** Port of `getMappedExercisesAndSets` for workout exercises (batched, not two queries per row). */
export async function getMappedWorkoutExercises(
	db: Db,
	exercises: WorkoutExercise[]
): Promise<Record<number, ExerciseWithWorkoutSets>> {
	const mapped: Record<number, ExerciseWithWorkoutSets> = {};
	if (exercises.length === 0) {
		return mapped;
	}

	const [setRows, exerciseById] = await Promise.all([
		loadSetsByAssociation(db, 'workout_sets', 'workout_exercise_id', exercises.map((e) => e.id)),
		loadExercisesByIds(db, exercises.map((e) => e.exerciseId))
	]);

	const setsByAssociation = new Map<number, WorkoutSet[]>();
	for (const row of setRows) {
		const set = workoutSetFromRow(row);
		const sets = setsByAssociation.get(set.workoutExerciseId);
		if (sets) {
			sets.push(set);
		} else {
			setsByAssociation.set(set.workoutExerciseId, [set]);
		}
	}

	for (const association of exercises) {
		mapped[association.id] = {
			exercise: exerciseById.get(association.exerciseId) ?? null,
			sets: setsByAssociation.get(association.id) ?? [],
			association
		};
	}
	return mapped;
}
