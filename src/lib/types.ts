// Domain types mirroring the PHP DTOs in src/DTO.
// Every object returned by the data layer is a plain, frozen-friendly readonly shape.

export type Row = Record<string, unknown>;

export interface User {
	readonly id: number;
	readonly name: string;
	readonly email: string | null;
	readonly passwordHash: string | null;
	readonly googleSub: string | null;
	readonly createdAt: string | null;
	readonly modifiedAt: string | null;
}

export interface MovementPattern {
	readonly id: number;
	readonly name: string;
	readonly notes: string | null;
	readonly createdAt: string | null;
	readonly modifiedAt: string | null;
}

export interface Exercise {
	readonly id: number;
	readonly userId: number;
	readonly name: string;
	readonly description: string | null;
	readonly equipment: string | null;
	readonly primaryMuscle: string | null;
	readonly movementPatternId: number | null;
	readonly notes: string | null;
	readonly createdAt: string | null;
	readonly modifiedAt: string | null;
	/** Present on rows from queries that join movement_patterns (see CatalogService::getExercises). */
	readonly movementPatternName?: string | null;
}

export interface Routine {
	readonly id: number;
	readonly userId: number;
	readonly name: string;
	readonly description: string | null;
	readonly splitName: string | null;
	readonly splitDay: string | null;
	readonly notes: string | null;
	readonly createdAt: string | null;
	readonly modifiedAt: string | null;
	readonly isDeleted: number;
}

/** Shared shape of routines_exercises / workout_exercises rows. */
export interface ExerciseAssociation {
	readonly id: number;
	readonly exerciseId: number;
	readonly sortOrder: number | null;
	readonly notes: string | null;
	readonly createdAt: string | null;
	readonly modifiedAt: string | null;
	readonly targetRest: string | null;
	readonly isDeleted: number;
}

export interface RoutineExercise extends ExerciseAssociation {
	readonly routineId: number;
}

export interface WorkoutExercise extends ExerciseAssociation {
	readonly workoutId: number;
}

export interface RoutineSet {
	readonly id: number;
	readonly routineExerciseId: number;
	readonly setNumber: number;
	readonly targetReps: number | null;
	readonly targetWeight: number | null;
	readonly setType: string;
	readonly notes: string | null;
	readonly createdAt: string | null;
	readonly modifiedAt: string | null;
	readonly targetRest: string | null;
	readonly isDeleted: number;
}

export interface WorkoutSet {
	readonly id: number;
	readonly workoutExerciseId: number;
	readonly setNumber: number | null;
	readonly targetReps: number | null;
	readonly targetWeight: number | null;
	readonly actualReps: number | null;
	readonly actualWeight: number | null;
	readonly durationSeconds: number | null;
	readonly distance: number | null;
	readonly notes: string | null;
	readonly createdAt: string | null;
	readonly modifiedAt: string | null;
	readonly setType: string;
	readonly targetRest: string | null;
	readonly isDeleted: number;
}

export interface TrainingBlock {
	readonly id: number;
	readonly userId: number;
	readonly name: string;
	readonly startDate: string | null;
	readonly endDate: string | null;
	readonly notes: string | null;
	readonly createdAt: string | null;
	readonly modifiedAt: string | null;
}

export interface BlockWeek {
	readonly id: number;
	readonly trainingBlockId: number | null;
	readonly weekNumber: number | null;
	readonly weekType: string | null;
	readonly startsOn: string | null;
	readonly endsOn: string | null;
	readonly notes: string | null;
	readonly isDeleted: number;
	readonly createdAt: string | null;
	readonly modifiedAt: string | null;
}

export interface Workout {
	readonly id: number;
	readonly userId: number;
	readonly routineId: number | null;
	readonly blockWeekId: number | null;
	readonly title: string | null;
	readonly plannedOn: string | null;
	readonly performedOn: string | null;
	readonly status: string | null;
	readonly durationSeconds: number | null;
	readonly bodyWeight: number | null;
	readonly notes: string | null;
	readonly clonedFromWorkoutId: number | null;
	readonly createdAt: string | null;
	readonly modifiedAt: string | null;
	readonly isDeleted: number;
}

export interface ExerciseImage {
	readonly id: number;
	readonly exerciseId: number;
	readonly filePath: string;
	readonly createdAt: string | null;
}

export interface WorkoutSetMedia {
	readonly id: number;
	readonly workoutSetId: number;
	readonly filePath: string;
	readonly mediaType: string;
	readonly createdAt: string | null;
}

/** An exercise association together with its exercise row and ordered sets. */
export interface ExerciseWithSets<T extends ExerciseAssociation, S> {
	readonly exercise: Exercise | null;
	readonly sets: S[];
	readonly association: T;
}

export type ExerciseWithRoutineSets = ExerciseWithSets<RoutineExercise, RoutineSet>;
export type ExerciseWithWorkoutSets = ExerciseWithSets<WorkoutExercise, WorkoutSet>;

export type SetType = 'working' | 'warmup' | 'dropset' | 'failure' | 'amrap' | 'backoff' | 'myorep';

export type WorkoutStatus = 'planned' | 'completed' | 'skipped';

// ---------------------------------------------------------------------------
// Row mapping helpers
// ---------------------------------------------------------------------------

export function optInt(value: unknown): number | null {
	if (value === null || value === undefined || value === '') return null;
	const num = Number(value);
	return Number.isFinite(num) ? Math.trunc(num) : null;
}

export function reqInt(value: unknown, fallback = 0): number {
	return optInt(value) ?? fallback;
}

export function optFloat(value: unknown): number | null {
	if (value === null || value === undefined || value === '') return null;
	const num = Number(value);
	return Number.isFinite(num) ? num : null;
}

export function optStr(value: unknown): string | null {
	if (value === null || value === undefined) return null;
	const str = String(value);
	return str === '' ? null : str;
}

export function reqStr(value: unknown, fallback = ''): string {
	const str = optStr(value);
	return str ?? fallback;
}

export function toBool(value: unknown): boolean {
	return value === true || value === 1 || value === '1';
}

export function userFromRow(row: Row): User {
	return {
		id: reqInt(row.id),
		name: reqStr(row.name).trim(),
		email: optStr(row.email),
		passwordHash: optStr(row.password_hash),
		googleSub: optStr(row.google_sub),
		createdAt: optStr(row.created_at),
		modifiedAt: optStr(row.modified_at)
	};
}

export function movementPatternFromRow(row: Row): MovementPattern {
	return {
		id: reqInt(row.id),
		name: reqStr(row.name).trim(),
		notes: optStr(row.notes),
		createdAt: optStr(row.created_at),
		modifiedAt: optStr(row.modified_at)
	};
}

export function exerciseFromRow(row: Row): Exercise {
	return {
		id: reqInt(row.id),
		userId: reqInt(row.user_id),
		name: reqStr(row.name).trim(),
		description: optStr(row.description),
		equipment: optStr(row.equipment),
		primaryMuscle: optStr(row.primary_muscle),
		movementPatternId: optInt(row.movement_pattern_id),
		notes: optStr(row.notes),
		createdAt: optStr(row.created_at),
		modifiedAt: optStr(row.modified_at),
		movementPatternName: optStr(row.movement_pattern_name)
	};
}

export function routineFromRow(row: Row): Routine {
	return {
		id: reqInt(row.id),
		userId: reqInt(row.user_id),
		name: reqStr(row.name).trim(),
		description: optStr(row.description),
		splitName: optStr(row.split_name),
		splitDay: optStr(row.split_day),
		notes: optStr(row.notes),
		createdAt: optStr(row.created_at),
		modifiedAt: optStr(row.modified_at),
		isDeleted: reqInt(row.is_deleted)
	};
}

function associationBase(row: Row): ExerciseAssociation {
	return {
		id: reqInt(row.id),
		exerciseId: reqInt(row.exercise_id),
		sortOrder: optInt(row.sort_order),
		notes: optStr(row.notes),
		createdAt: optStr(row.created_at),
		modifiedAt: optStr(row.modified_at),
		targetRest: optStr(row.target_rest),
		isDeleted: reqInt(row.is_deleted)
	};
}

export function routineExerciseFromRow(row: Row): RoutineExercise {
	return { ...associationBase(row), routineId: reqInt(row.routine_id) };
}

export function workoutExerciseFromRow(row: Row): WorkoutExercise {
	return { ...associationBase(row), workoutId: reqInt(row.workout_id) };
}

export function routineSetFromRow(row: Row): RoutineSet {
	return {
		id: reqInt(row.id),
		routineExerciseId: reqInt(row.routine_exercise_id),
		setNumber: reqInt(row.set_number),
		targetReps: optFloat(row.target_reps),
		targetWeight: optFloat(row.target_weight),
		setType: reqStr(row.set_type, 'working').trim() || 'working',
		notes: optStr(row.notes),
		createdAt: optStr(row.created_at),
		modifiedAt: optStr(row.modified_at),
		targetRest: optStr(row.target_rest),
		isDeleted: reqInt(row.is_deleted)
	};
}

export function workoutSetFromRow(row: Row): WorkoutSet {
	return {
		id: reqInt(row.id),
		workoutExerciseId: reqInt(row.workout_exercise_id),
		setNumber: optInt(row.set_number),
		targetReps: optFloat(row.target_reps),
		targetWeight: optFloat(row.target_weight),
		actualReps: optFloat(row.actual_reps),
		actualWeight: optFloat(row.actual_weight),
		durationSeconds: optInt(row.duration_seconds),
		distance: optFloat(row.distance),
		notes: optStr(row.notes),
		createdAt: optStr(row.created_at),
		modifiedAt: optStr(row.modified_at),
		setType: reqStr(row.set_type, 'working').trim() || 'working',
		targetRest: optStr(row.target_rest),
		isDeleted: reqInt(row.is_deleted)
	};
}

export function trainingBlockFromRow(row: Row): TrainingBlock {
	return {
		id: reqInt(row.id),
		userId: reqInt(row.user_id),
		name: reqStr(row.name).trim(),
		startDate: optStr(row.start_date),
		endDate: optStr(row.end_date),
		notes: optStr(row.notes),
		createdAt: optStr(row.created_at),
		modifiedAt: optStr(row.modified_at)
	};
}

export function blockWeekFromRow(row: Row): BlockWeek {
	return {
		id: reqInt(row.id),
		trainingBlockId: optInt(row.training_block_id),
		weekNumber: optInt(row.week_number),
		weekType: optStr(row.week_type),
		startsOn: optStr(row.starts_on),
		endsOn: optStr(row.ends_on),
		notes: optStr(row.notes),
		isDeleted: reqInt(row.is_deleted),
		createdAt: optStr(row.created_at),
		modifiedAt: optStr(row.modified_at)
	};
}

export function workoutFromRow(row: Row): Workout {
	return {
		id: reqInt(row.id),
		userId: reqInt(row.user_id),
		routineId: optInt(row.routine_id),
		blockWeekId: optInt(row.block_week_id),
		title: optStr(row.title),
		plannedOn: optStr(row.planned_on),
		performedOn: optStr(row.performed_on),
		status: optStr(row.status),
		durationSeconds: optInt(row.duration_seconds),
		bodyWeight: optFloat(row.body_weight),
		notes: optStr(row.notes),
		clonedFromWorkoutId: optInt(row.cloned_from_workout_id),
		createdAt: optStr(row.created_at),
		modifiedAt: optStr(row.modified_at),
		isDeleted: reqInt(row.is_deleted)
	};
}

export function exerciseImageFromRow(row: Row): ExerciseImage {
	return {
		id: reqInt(row.id),
		exerciseId: reqInt(row.exercise_id),
		filePath: reqStr(row.file_path).trim(),
		createdAt: optStr(row.created_at)
	};
}

export function workoutSetMediaFromRow(row: Row): WorkoutSetMedia {
	return {
		id: reqInt(row.id),
		workoutSetId: reqInt(row.workout_set_id),
		filePath: reqStr(row.file_path).trim(),
		mediaType: reqStr(row.media_type, 'video').trim() || 'video',
		createdAt: optStr(row.created_at)
	};
}
