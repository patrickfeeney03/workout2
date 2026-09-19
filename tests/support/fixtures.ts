import { env } from 'cloudflare:test';

/** Shared D1 handle for tests. Isolated per test by vitest-pool-workers. */
export function getDb(): D1Database {
	return env.DB;
}

export async function run(sql: string, values: unknown[] = []): Promise<void> {
	await env.DB.prepare(sql)
		.bind(...values)
		.run();
}

export async function queryAll<T = Record<string, unknown>>(
	sql: string,
	values: unknown[] = []
): Promise<T[]> {
	const result = await env.DB.prepare(sql)
		.bind(...values)
		.all<T>();
	return (result.results ?? []) as T[];
}

export async function queryOne<T = Record<string, unknown>>(
	sql: string,
	values: unknown[] = []
): Promise<T | null> {
	return env.DB.prepare(sql)
		.bind(...values)
		.first<T>();
}

// ---------------------------------------------------------------------------
// Seed helpers. Foreign keys are always enforced in D1, so every helper seeds
// (or accepts) its parent ids.
// ---------------------------------------------------------------------------

export interface UserSeed {
	id?: number;
	name?: string;
	email?: string | null;
	passwordHash?: string | null;
	googleSub?: string | null;
}

export async function seedUser(seed: UserSeed = {}): Promise<number> {
	const id = seed.id ?? 1;
	await run(
		`INSERT INTO users (id, name, email, password_hash, google_sub) VALUES (?, ?, ?, ?, ?)`,
		[
			id,
			seed.name ?? 'Test User',
			seed.email ?? `user${id}@example.com`,
			seed.passwordHash ?? null,
			seed.googleSub ?? null
		]
	);
	return id;
}

export interface MovementPatternSeed {
	id?: number;
	name?: string;
	notes?: string | null;
}

export async function seedMovementPattern(seed: MovementPatternSeed = {}): Promise<number> {
	const id = seed.id ?? 1;
	await run(`INSERT INTO movement_patterns (id, name, notes) VALUES (?, ?, ?)`, [
		id,
		seed.name ?? 'Squat',
		seed.notes ?? null
	]);
	return id;
}

export interface ExerciseSeed {
	id?: number;
	userId?: number;
	name?: string;
	description?: string | null;
	equipment?: string | null;
	primaryMuscle?: string | null;
	movementPatternId?: number | null;
	notes?: string | null;
}

export async function seedExercise(seed: ExerciseSeed = {}): Promise<number> {
	const id = seed.id ?? 1;
	await run(
		`INSERT INTO exercises
		 (id, user_id, name, description, equipment, primary_muscle, movement_pattern_id, notes)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		[
			id,
			seed.userId ?? 1,
			seed.name ?? `Exercise ${id}`,
			seed.description ?? null,
			seed.equipment ?? null,
			seed.primaryMuscle ?? null,
			seed.movementPatternId ?? null,
			seed.notes ?? null
		]
	);
	return id;
}

export interface RoutineSeed {
	id?: number;
	userId?: number;
	name?: string;
	description?: string | null;
	splitName?: string | null;
	splitDay?: string | null;
	notes?: string | null;
	isDeleted?: number;
}

export async function seedRoutine(seed: RoutineSeed = {}): Promise<number> {
	const id = seed.id ?? 1;
	await run(
		`INSERT INTO routines
		 (id, user_id, name, description, split_name, split_day, notes, is_deleted)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		[
			id,
			seed.userId ?? 1,
			seed.name ?? `Routine ${id}`,
			seed.description ?? null,
			seed.splitName ?? null,
			seed.splitDay ?? null,
			seed.notes ?? null,
			seed.isDeleted ?? 0
		]
	);
	return id;
}

export interface RoutineExerciseSeed {
	id?: number;
	routineId: number;
	exerciseId: number;
	sortOrder?: number | null;
	notes?: string | null;
	targetRest?: string | null;
	isDeleted?: number;
}

export async function seedRoutineExercise(seed: RoutineExerciseSeed): Promise<number> {
	const id = seed.id ?? 1;
	await run(
		`INSERT INTO routine_exercises
		 (id, routine_id, exercise_id, sort_order, notes, target_rest, is_deleted)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		[
			id,
			seed.routineId,
			seed.exerciseId,
			seed.sortOrder ?? 1,
			seed.notes ?? null,
			seed.targetRest ?? null,
			seed.isDeleted ?? 0
		]
	);
	return id;
}

export interface RoutineSetSeed {
	id?: number;
	routineExerciseId: number;
	setNumber: number;
	targetReps?: number | null;
	targetWeight?: number | null;
	setType?: string;
	notes?: string | null;
	targetRest?: string | null;
	isDeleted?: number;
}

export async function seedRoutineSet(seed: RoutineSetSeed): Promise<number> {
	const id = seed.id ?? 1;
	await run(
		`INSERT INTO routine_sets
		 (id, routine_exercise_id, set_number, target_reps, target_weight, set_type, notes, target_rest, is_deleted)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		[
			id,
			seed.routineExerciseId,
			seed.setNumber,
			seed.targetReps ?? null,
			seed.targetWeight ?? null,
			seed.setType ?? 'working',
			seed.notes ?? null,
			seed.targetRest ?? null,
			seed.isDeleted ?? 0
		]
	);
	return id;
}

export interface TrainingBlockSeed {
	id?: number;
	userId?: number;
	name?: string;
	startDate?: string | null;
	endDate?: string | null;
	notes?: string | null;
}

export async function seedTrainingBlock(seed: TrainingBlockSeed = {}): Promise<number> {
	const id = seed.id ?? 1;
	await run(
		`INSERT INTO training_blocks (id, user_id, name, start_date, end_date, notes)
		 VALUES (?, ?, ?, ?, ?, ?)`,
		[
			id,
			seed.userId ?? 1,
			seed.name ?? `Block ${id}`,
			seed.startDate ?? null,
			seed.endDate ?? null,
			seed.notes ?? null
		]
	);
	return id;
}

export interface BlockWeekSeed {
	id?: number;
	trainingBlockId: number;
	weekNumber?: number | null;
	weekType?: string | null;
	startsOn?: string | null;
	endsOn?: string | null;
	notes?: string | null;
	isDeleted?: number;
}

export async function seedBlockWeek(seed: BlockWeekSeed): Promise<number> {
	const id = seed.id ?? 1;
	await run(
		`INSERT INTO block_weeks
		 (id, training_block_id, week_number, week_type, starts_on, ends_on, notes, is_deleted)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		[
			id,
			seed.trainingBlockId,
			seed.weekNumber ?? 1,
			seed.weekType ?? null,
			seed.startsOn ?? null,
			seed.endsOn ?? null,
			seed.notes ?? null,
			seed.isDeleted ?? 0
		]
	);
	return id;
}

export interface WorkoutSeed {
	id?: number;
	userId?: number;
	routineId?: number | null;
	blockWeekId?: number | null;
	title?: string;
	plannedOn?: string | null;
	performedOn?: string | null;
	status?: string;
	durationSeconds?: number | null;
	bodyWeight?: number | null;
	notes?: string | null;
	clonedFromWorkoutId?: number | null;
	isDeleted?: number;
}

export async function seedWorkout(seed: WorkoutSeed = {}): Promise<number> {
	const id = seed.id ?? 1;
	await run(
		`INSERT INTO workouts
		 (id, user_id, routine_id, block_week_id, title, planned_on, performed_on, status,
		  duration_seconds, body_weight, notes, cloned_from_workout_id, is_deleted)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		[
			id,
			seed.userId ?? 1,
			seed.routineId ?? null,
			seed.blockWeekId ?? null,
			seed.title ?? `Workout ${id}`,
			seed.plannedOn ?? null,
			seed.performedOn ?? null,
			seed.status ?? 'planned',
			seed.durationSeconds ?? null,
			seed.bodyWeight ?? null,
			seed.notes ?? null,
			seed.clonedFromWorkoutId ?? null,
			seed.isDeleted ?? 0
		]
	);
	return id;
}

export interface WorkoutExerciseSeed {
	id?: number;
	workoutId: number;
	exerciseId: number;
	sortOrder?: number | null;
	notes?: string | null;
	targetRest?: string | null;
	isDeleted?: number;
}

export async function seedWorkoutExercise(seed: WorkoutExerciseSeed): Promise<number> {
	const id = seed.id ?? 1;
	await run(
		`INSERT INTO workout_exercises
		 (id, workout_id, exercise_id, sort_order, notes, target_rest, is_deleted)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		[
			id,
			seed.workoutId,
			seed.exerciseId,
			seed.sortOrder ?? 1,
			seed.notes ?? null,
			seed.targetRest ?? null,
			seed.isDeleted ?? 0
		]
	);
	return id;
}

export interface WorkoutSetSeed {
	id?: number;
	workoutExerciseId: number;
	setNumber?: number | null;
	targetReps?: number | null;
	targetWeight?: number | null;
	actualReps?: number | null;
	actualWeight?: number | null;
	durationSeconds?: number | null;
	distance?: number | null;
	setType?: string;
	notes?: string | null;
	targetRest?: string | null;
	isDeleted?: number;
}

export async function seedWorkoutSet(seed: WorkoutSetSeed): Promise<number> {
	const id = seed.id ?? 1;
	await run(
		`INSERT INTO workout_sets
		 (id, workout_exercise_id, set_number, target_reps, target_weight, actual_reps, actual_weight,
		  duration_seconds, distance, set_type, notes, target_rest, is_deleted)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		[
			id,
			seed.workoutExerciseId,
			seed.setNumber ?? 1,
			seed.targetReps ?? null,
			seed.targetWeight ?? null,
			seed.actualReps ?? null,
			seed.actualWeight ?? null,
			seed.durationSeconds ?? null,
			seed.distance ?? null,
			seed.setType ?? 'working',
			seed.notes ?? null,
			seed.targetRest ?? null,
			seed.isDeleted ?? 0
		]
	);
	return id;
}

/** Convenience: user + one exercise, the most common starting point. */
export async function seedBase(): Promise<{ userId: number; exerciseId: number }> {
	const userId = await seedUser();
	const exerciseId = await seedExercise({ userId });
	return { userId, exerciseId };
}
