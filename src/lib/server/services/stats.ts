/**
 * Ported from src/Service/StatsService.php.
 * Exports: RANGES, StatsRange, DashboardParams, DashboardData (and nested shapes),
 * epley, resolveDateRange, dashboard, sessionSplitLabel.
 */

import { allRows, bind, todaySql, type Db } from '$lib/server/db';
import { reqInt, reqStr } from '$lib/types';

/** Mirrors StatsService::RANGES. */
export const RANGES = ['8w', '12w', '26w', 'block', 'all'] as const;
export type StatsRange = (typeof RANGES)[number];

const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

/** Lower-bound sentinel used when an `all` range has no explicit start. */
const ALL_TIME_START = '0001-01-01';

const RANGE_LABELS: Record<string, string> = {
	'8w': 'Last 8 weeks',
	'12w': 'Last 12 weeks',
	'26w': 'Last 6 months',
	all: 'All time',
	block: 'Training block'
};

/** HTTP-layer params for `dashboard` (was `$_GET['range']` / `$_GET['exercise_id']`). */
export interface DashboardParams {
	/** Raw range token; invalid or missing falls back to `12w`. */
	range?: string | null;
	/** Selected exercise id; falls back to the most-performed exercise in range. */
	exerciseId?: number | null;
	/** Selected training block id (only used by the `block` range). */
	blockId?: number | null;
	/** Override for "today" (`YYYY-MM-DD`); defaults to the current UTC date. */
	today?: string | null;
}

export interface DashboardBlock {
	id: number;
	name: string;
	startDate: string | null;
	endDate: string | null;
}

export interface DashboardKpis {
	workoutsCompleted: number;
	avgDurationMinutes: number | null;
	latestBodyWeight: number | null;
}

export interface BodyWeightPoint {
	date: string;
	weight: number;
}

export interface WorkoutLengthPoint {
	date: string;
	minutes: number;
	workoutId: number;
}

export interface WorkoutLengthBySplit {
	splitDay: string;
	avgMinutes: number;
	count: number;
}

export interface ExerciseOption {
	id: number;
	name: string;
}

export interface LiftProgressPoint {
	date: string;
	weight: number;
	reps: number;
	e1rm: number | null;
	setNumber: number;
	workoutId: number;
	workoutExerciseId: number;
	setId: number;
	url: string;
	/** Reserved for perceived-effort annotations; PHP always returns null. */
	effort: null;
}

/**
 * Everything `StatsService::dashboard()` returns, with PHP array keys converted to
 * camelCase (`block_id` -> `blockId`, `kpis.workouts_completed` -> `kpis.workoutsCompleted`,
 * `start_date` -> `startDate`, and so on). Array orders and values match PHP exactly.
 */
export interface DashboardData {
	range: string;
	start: string | null;
	end: string;
	blockId: number | null;
	blockName: string | null;
	blocks: DashboardBlock[];
	hasData: boolean;
	kpis: DashboardKpis;
	bodyWeight: BodyWeightPoint[];
	workoutLength: WorkoutLengthPoint[];
	workoutLengthBySplit: WorkoutLengthBySplit[];
	exercises: ExerciseOption[];
	selectedExerciseId: number | null;
	selectedExerciseName: string | null;
	liftProgress: LiftProgressPoint[];
}

interface DateWindow {
	start: string | null;
	end: string;
	blockId: number | null;
	blockName: string | null;
}

interface PerformedSet {
	workoutId: number;
	status: string;
	workoutDate: string;
	workoutExerciseId: number;
	exerciseId: number;
	exerciseName: string;
	setId: number;
	setNumber: number;
	actualReps: number;
	actualWeight: number;
}

interface CompletedWorkout {
	workoutId: number;
	workoutDate: string;
	durationSeconds: number | string | null;
	bodyWeight: number | string | null;
	routineName: string | null;
	splitDay: string | null;
}

interface PerformedSetRow {
	workout_id: number | null;
	status: string | null;
	workout_date: string | null;
	workout_exercise_id: number | null;
	exercise_id: number | null;
	exercise_name: string | null;
	set_id: number | null;
	set_number: number | null;
	actual_reps: number | string | null;
	actual_weight: number | string | null;
}

interface CompletedWorkoutRow {
	workout_id: number | null;
	workout_date: string | null;
	duration_seconds: number | string | null;
	body_weight: number | string | null;
	routine_name: string | null;
	split_day: string | null;
}

interface BlockRow {
	id: number | null;
	name: string | null;
	start_date: string | null;
	end_date: string | null;
}

/**
 * Epley estimated 1RM. Null when reps are outside 1-12 or weight is not positive.
 */
export function epley(weight: number, reps: number): number | null {
	if (weight <= 0 || reps < 1 || reps > 12) {
		return null;
	}

	return roundTo(weight * (1 + reps / 30), 2);
}

/**
 * Pure date-window resolver for the route layer, mirroring the arithmetic (and the
 * fallback order) of `StatsService::resolveDateRange()` without touching the database.
 *
 * Shape: `{ range?, start?, end? }` in, `{ start, end, label }` out.
 * - `range` is validated against RANGES; anything else falls back to `12w`.
 * - `8w`/`12w`/`26w` default to `today - 56/84/182` days through `today`.
 * - `all` has no lower bound in PHP; here it is represented as `0001-01-01` unless an
 *   explicit `start` is given.
 * - `start`/`end` overrides win when supplied; `end` defaults to `today`.
 * - `label` is the UI display label ("Last 12 weeks", "All time", ...).
 * Block-name resolution needs `training_blocks`, so it stays inside `dashboard`.
 */
export function resolveDateRange(
	input: { range?: string; start?: string | null; end?: string | null },
	today: string
): { start: string; end: string; label: string } {
	const range = normalizeRange(input.range);
	const end = optDate(input.end) ?? today;
	const explicitStart = optDate(input.start);

	let start: string;
	if (explicitStart !== null) {
		start = explicitStart;
	} else if (range === '8w') {
		start = addDays(today, -56);
	} else if (range === '12w') {
		start = addDays(today, -84);
	} else if (range === '26w') {
		start = addDays(today, -182);
	} else if (range === 'all') {
		start = ALL_TIME_START;
	} else {
		start = addDays(today, -84);
	}

	return { start, end, label: RANGE_LABELS[range] ?? 'Custom range' };
}

/**
 * Ports `StatsService::dashboard()`. Read-only: all statements are plain SELECTs.
 */
export async function dashboard(
	db: Db,
	userId: number,
	params: DashboardParams = {}
): Promise<DashboardData> {
	const range = normalizeRange(params.range ?? undefined);
	const exerciseId = params.exerciseId ?? null;
	const blockId = params.blockId ?? null;

	const todayStr = parseDate(params.today ?? null) ?? todaySql();

	const blocks = await listBlocks(db, userId);
	const window = await resolveWindow(db, userId, range, blockId, todayStr, blocks);

	const workouts = await fetchCompletedWorkouts(db, userId);
	const inRangeWorkouts = workouts.filter((row) =>
		inWindow(row.workoutDate, window.start, window.end)
	);

	const rows = await fetchPerformedSets(db, userId);
	const completedSets = rows.filter((row) => row.status === 'completed');
	const inRangeSets = completedSets.filter((row) =>
		inWindow(row.workoutDate, window.start, window.end)
	);

	const inRangeExercises = exercisesFromRows(inRangeSets);
	const exercises = exercisesFromRows(rows);

	let selectedId: number | null = exerciseId;
	const exerciseIds = exercises.map((exercise) => exercise.id);
	if (selectedId === null || !exerciseIds.includes(selectedId)) {
		selectedId = inRangeExercises[0]?.id ?? exercises[0]?.id ?? null;
	}

	let selectedName: string | null = null;
	for (const exercise of exercises) {
		if (exercise.id === selectedId) {
			selectedName = exercise.name;
			break;
		}
	}

	const workoutLengthData = workoutLength(inRangeWorkouts);
	const bodyWeight = bodyWeightSeries(inRangeWorkouts);

	return {
		range,
		start: window.start,
		end: window.end,
		blockId: window.blockId,
		blockName: window.blockName,
		blocks,
		hasData: inRangeWorkouts.length > 0 || workoutLengthData.length > 0 || bodyWeight.length > 0,
		kpis: kpis(workouts, inRangeWorkouts),
		bodyWeight,
		workoutLength: workoutLengthData,
		workoutLengthBySplit: workoutLengthBySplit(inRangeWorkouts),
		exercises,
		selectedExerciseId: selectedId,
		selectedExerciseName: selectedName,
		liftProgress: liftProgress(rows, selectedId)
	};
}

/** Public wrapper around the split-label grouping used by insights. */
export function sessionSplitLabel(routineName: unknown, splitDay: unknown): string {
	return splitLabel(routineName, splitDay);
}

async function resolveWindow(
	db: Db,
	userId: number,
	range: string,
	blockId: number | null,
	today: string,
	blocks: DashboardBlock[]
): Promise<DateWindow> {
	if (blocks.length === 0) {
		blocks = await listBlocks(db, userId);
	}

	if (range === '8w') {
		return { start: addDays(today, -56), end: today, blockId: null, blockName: null };
	}
	if (range === '12w') {
		return { start: addDays(today, -84), end: today, blockId: null, blockName: null };
	}
	if (range === '26w') {
		return { start: addDays(today, -182), end: today, blockId: null, blockName: null };
	}
	if (range === 'all') {
		return { start: null, end: today, blockId: null, blockName: null };
	}

	let block: DashboardBlock | null = null;
	if (blockId !== null) {
		for (const candidate of blocks) {
			if (candidate.id === blockId) {
				block = candidate;
				break;
			}
		}
	}
	if (block === null) {
		block = currentBlock(blocks, today);
	}
	if (block === null) {
		return { start: addDays(today, -84), end: today, blockId: null, blockName: null };
	}

	return {
		start: block.startDate,
		end: block.endDate ?? today,
		blockId: block.id,
		blockName: block.name
	};
}

/**
 * Working sets with actuals. Skipped workouts are excluded; planned sessions
 * with logged actuals still count for lift progress.
 */
async function fetchPerformedSets(db: Db, userId: number): Promise<PerformedSet[]> {
	const sql = `
		SELECT
		  w.id AS workout_id,
		  w.status,
		  DATE(
		    COALESCE(
		      NULLIF(TRIM(w.performed_on), ''),
		      NULLIF(TRIM(w.planned_on), ''),
		      w.created_at
		    )
		  ) AS workout_date,
		  we.id AS workout_exercise_id,
		  we.exercise_id,
		  e.name AS exercise_name,
		  ws.id AS set_id,
		  ws.set_number,
		  ws.actual_reps,
		  ws.actual_weight
		FROM workouts w
		INNER JOIN workout_exercises we
		  ON we.workout_id = w.id AND we.is_deleted = 0
		INNER JOIN exercises e
		  ON e.id = we.exercise_id
		INNER JOIN workout_sets ws
		  ON ws.workout_exercise_id = we.id AND ws.is_deleted = 0
		WHERE w.user_id = ?
		  AND w.is_deleted = 0
		  AND w.status != 'skipped'
		  AND ws.set_type = 'working'
		  AND ws.actual_reps IS NOT NULL
		  AND ws.actual_weight IS NOT NULL
		ORDER BY workout_date ASC, w.id ASC, we.sort_order ASC, ws.set_number ASC
	`;
	const rows = await allRows<PerformedSetRow>(bind(db, sql, [userId]));

	const out: PerformedSet[] = [];
	for (const row of rows) {
		const date = row.workout_date;
		if (date === null || date === undefined || date === '') {
			continue;
		}
		out.push({
			workoutId: reqInt(row.workout_id),
			status: reqStr(row.status),
			workoutDate: String(date),
			workoutExerciseId: reqInt(row.workout_exercise_id),
			exerciseId: reqInt(row.exercise_id),
			exerciseName: reqStr(row.exercise_name),
			setId: reqInt(row.set_id),
			setNumber: reqInt(row.set_number),
			actualReps: Number(row.actual_reps ?? 0),
			actualWeight: Number(row.actual_weight ?? 0)
		});
	}

	return out;
}

async function fetchCompletedWorkouts(db: Db, userId: number): Promise<CompletedWorkout[]> {
	const sql = `
		SELECT
		  w.id AS workout_id,
		  DATE(
		    COALESCE(
		      NULLIF(TRIM(w.performed_on), ''),
		      NULLIF(TRIM(w.planned_on), ''),
		      w.created_at
		    )
		  ) AS workout_date,
		  w.duration_seconds,
		  w.body_weight,
		  r.name AS routine_name,
		  r.split_day
		FROM workouts w
		LEFT JOIN routines r ON r.id = w.routine_id
		WHERE w.user_id = ?
		  AND w.is_deleted = 0
		  AND w.status = 'completed'
		ORDER BY workout_date ASC, w.id ASC
	`;
	const rows = await allRows<CompletedWorkoutRow>(bind(db, sql, [userId]));

	const out: CompletedWorkout[] = [];
	for (const row of rows) {
		const date = row.workout_date;
		if (date === null || date === undefined || date === '') {
			continue;
		}
		out.push({
			workoutId: reqInt(row.workout_id),
			workoutDate: String(date),
			durationSeconds: row.duration_seconds ?? null,
			bodyWeight: row.body_weight ?? null,
			routineName: row.routine_name ?? null,
			splitDay: row.split_day ?? null
		});
	}

	return out;
}

async function listBlocks(db: Db, userId: number): Promise<DashboardBlock[]> {
	const sql = `
		SELECT id, name, start_date, end_date
		FROM training_blocks
		WHERE user_id = ? AND name != 'No Block'
		ORDER BY start_date DESC, id DESC
	`;
	const rows = await allRows<BlockRow>(bind(db, sql, [userId]));

	return rows.map((row) => ({
		id: reqInt(row.id),
		name: reqStr(row.name),
		startDate: optDate(row.start_date),
		endDate: optDate(row.end_date)
	}));
}

function currentBlock(blocks: DashboardBlock[], today: string): DashboardBlock | null {
	for (const block of blocks) {
		const start = block.startDate;
		const end = block.endDate;
		if (start !== null && start <= today && (end === null || end >= today)) {
			return block;
		}
	}

	return blocks[0] ?? null;
}

function kpis(allWorkouts: CompletedWorkout[], inRange: CompletedWorkout[]): DashboardKpis {
	const minutes: number[] = [];
	for (const row of inRange) {
		const duration = optDurationMinutes(row.durationSeconds);
		if (duration !== null) {
			minutes.push(duration);
		}
	}

	let latestWeight = latestBodyWeight(inRange);
	if (latestWeight === null) {
		latestWeight = latestBodyWeight(allWorkouts);
	}

	return {
		workoutsCompleted: inRange.length,
		avgDurationMinutes:
			minutes.length === 0
				? null
				: roundTo(minutes.reduce((sum, value) => sum + value, 0) / minutes.length, 1),
		latestBodyWeight: latestWeight
	};
}

function latestBodyWeight(rows: CompletedWorkout[]): number | null {
	for (let i = rows.length - 1; i >= 0; i--) {
		if (rows[i].bodyWeight !== null && rows[i].bodyWeight !== '') {
			return Number(rows[i].bodyWeight);
		}
	}

	return null;
}

function bodyWeightSeries(rows: CompletedWorkout[]): BodyWeightPoint[] {
	const byDate = new Map<string, number>();
	for (const row of rows) {
		if (row.bodyWeight === null || row.bodyWeight === '') {
			continue;
		}
		byDate.set(String(row.workoutDate), Number(row.bodyWeight));
	}

	const dates = [...byDate.keys()].sort(compareStrings);
	return dates.map((date) => ({ date, weight: byDate.get(date) as number }));
}

function workoutLength(rows: CompletedWorkout[]): WorkoutLengthPoint[] {
	const out: WorkoutLengthPoint[] = [];
	for (const row of rows) {
		const minutes = optDurationMinutes(row.durationSeconds);
		if (minutes === null) {
			continue;
		}
		out.push({
			date: String(row.workoutDate),
			minutes,
			workoutId: row.workoutId
		});
	}

	return out;
}

function workoutLengthBySplit(rows: CompletedWorkout[]): WorkoutLengthBySplit[] {
	const bySplit = new Map<string, { total: number; count: number }>();
	for (const row of rows) {
		const minutes = optDurationMinutes(row.durationSeconds);
		if (minutes === null) {
			continue;
		}
		const label = splitLabel(row.routineName, row.splitDay);
		const bucket = bySplit.get(label) ?? { total: 0, count: 0 };
		bucket.total += minutes;
		bucket.count += 1;
		bySplit.set(label, bucket);
	}

	const names = [...bySplit.keys()].sort((a, b) => {
		if (a === 'No split') {
			return 1;
		}
		if (b === 'No split') {
			return -1;
		}

		return compareStrings(a, b);
	});

	return names.map((name) => {
		const bucket = bySplit.get(name) as { total: number; count: number };
		return {
			splitDay: name,
			avgMinutes: roundTo(bucket.total / bucket.count, 1),
			count: bucket.count
		};
	});
}

function exercisesFromRows(rows: PerformedSet[]): ExerciseOption[] {
	const counts = new Map<number, number>();
	const names = new Map<number, string>();
	for (const row of rows) {
		const id = row.exerciseId;
		names.set(id, row.exerciseName);
		counts.set(id, (counts.get(id) ?? 0) + 1);
	}

	// PHP `arsort` is a stable descending sort, so ties keep first-seen order.
	const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);

	return sorted.map(([id]) => ({ id, name: names.get(id) as string }));
}

function liftProgress(rows: PerformedSet[], exerciseId: number | null): LiftProgressPoint[] {
	if (exerciseId === null) {
		return [];
	}

	const out: LiftProgressPoint[] = [];
	for (const row of rows) {
		if (row.exerciseId !== exerciseId) {
			continue;
		}
		const weight = row.actualWeight;
		const reps = row.actualReps;
		out.push({
			date: String(row.workoutDate),
			weight,
			reps,
			e1rm: epley(weight, reps),
			setNumber: row.setNumber,
			workoutId: row.workoutId,
			workoutExerciseId: row.workoutExerciseId,
			setId: row.setId,
			url: `/gym/workout.php?workout_id=${row.workoutId}#we-${row.workoutExerciseId}`,
			effort: null
		});
	}

	return out;
}

/**
 * Group by routine split (abs, upper, lower). Weekday values like Monday are
 * leftover calendar labels, so fall back to the routine name in that case.
 */
function splitLabel(routineName: unknown, splitDay: unknown): string {
	const day = String(splitDay ?? '').trim();
	if (day !== '' && !isWeekday(day)) {
		return day;
	}

	const name = String(routineName ?? '').trim();
	if (name !== '') {
		const matches = /^(.+?)\s+[A-D]$/i.exec(name);
		if (matches !== null) {
			return matches[1];
		}

		return name;
	}

	return 'No split';
}

function isWeekday(value: string): boolean {
	return WEEKDAYS.includes(value.toLowerCase());
}

function optDurationMinutes(value: unknown): number | null {
	if (value === null || value === undefined || value === '') {
		return null;
	}
	if (!isNumeric(value)) {
		return null;
	}
	const seconds = Math.trunc(Number(value));
	if (seconds <= 0) {
		return null;
	}

	return roundTo(seconds / 60, 1);
}

function inWindow(date: string, start: string | null, end: string): boolean {
	if (date > end) {
		return false;
	}
	if (start !== null && date < start) {
		return false;
	}

	return true;
}

function addDays(date: string, days: number): string {
	const dt = new Date(`${date}T00:00:00.000Z`);
	dt.setUTCDate(dt.getUTCDate() + days);

	return formatDate(dt);
}

/** Mirrors `DateTimeImmutable::createFromFormat('!Y-m-d', ...)`, normalised to Y-m-d. */
function parseDate(date: string | null | undefined): string | null {
	if (date === null || date === undefined) {
		return null;
	}
	const trimmed = date.trim();
	const match = /^(\d{1,4})-(\d{1,2})-(\d{1,2})$/.exec(trimmed);
	if (match === null) {
		return null;
	}
	const dt = new Date(0);
	dt.setUTCFullYear(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
	dt.setUTCHours(0, 0, 0, 0);
	if (Number.isNaN(dt.getTime())) {
		return null;
	}

	return formatDate(dt);
}

function optDate(value: unknown): string | null {
	if (value === null || value === undefined) {
		return null;
	}
	const trimmed = String(value).trim();

	return trimmed === '' ? null : trimmed;
}

function formatDate(date: Date): string {
	return date.toISOString().slice(0, 10);
}

function normalizeRange(range: string | null | undefined): string {
	if (typeof range === 'string' && (RANGES as readonly string[]).includes(range)) {
		return range;
	}

	return '12w';
}

function isNumeric(value: unknown): boolean {
	if (typeof value === 'number') {
		return Number.isFinite(value);
	}
	if (typeof value !== 'string') {
		return false;
	}
	const trimmed = value.trim();
	if (trimmed === '') {
		return false;
	}

	return /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(trimmed);
}

/**
 * PHP `round()` semantics: round-half-away-from-zero with the intermediate value
 * pre-rounded to 15 significant digits (so 2.675 -> 2.68, matching PHP 8).
 */
function roundTo(value: number, precision: number): number {
	if (!Number.isFinite(value)) {
		return value;
	}
	const factor = 10 ** precision;
	const scaled = Number((value * factor).toPrecision(15));
	const rounded = scaled < 0 ? -Math.round(-scaled) : Math.round(scaled);

	return rounded / factor;
}

function compareStrings(a: string, b: string): number {
	if (a < b) {
		return -1;
	}
	if (a > b) {
		return 1;
	}

	return 0;
}
