/**
 * Markdown export of the training log, meant to be pasted into (or uploaded to) an AI chat.
 *
 * Everything in the date window is read in one `db.batch()`. Every statement repeats the same
 * workout filter, so no statement depends on another's result. Skipped and deleted workouts are
 * left out; workouts are listed oldest first so the log reads chronologically.
 */

import { bind, type Db } from '$lib/server/db';
import { optFloat, optStr, reqInt, type Row } from '$lib/types';
import { resolveDateRange } from './stats';

export const EXPORT_RANGES = ['8w', '12w', '26w', 'all'] as const;
export type ExportRange = (typeof EXPORT_RANGES)[number];

export interface TrainingLogExport {
	readonly range: ExportRange;
	readonly label: string;
	readonly start: string;
	readonly end: string;
	readonly workoutCount: number;
	readonly markdown: string;
}

/** Same date the dashboard stats use for a workout. */
const WORKOUT_DATE = `DATE(COALESCE(NULLIF(TRIM(w.performed_on), ''), NULLIF(TRIM(w.planned_on), ''), w.created_at))`;

const WORKOUT_FILTER = `w.user_id = ? AND w.is_deleted = 0 AND w.status != 'skipped'
	AND ${WORKOUT_DATE} BETWEEN ? AND ?`;

export function normalizeExportRange(range: string | null | undefined): ExportRange {
	return (EXPORT_RANGES as readonly string[]).includes(range ?? '') ? (range as ExportRange) : '12w';
}

export async function exportTrainingLog(
	db: Db,
	userId: number,
	params: { range?: string | null; today: string }
): Promise<TrainingLogExport> {
	const range = normalizeExportRange(params.range);
	const { start, end, label } = resolveDateRange({ range }, params.today);
	const filter = [userId, start, end];

	const [workouts, exercises, sets] = await db.batch<Row>([
		bind(
			db,
			`SELECT w.id, w.title, w.status, w.duration_seconds, w.body_weight, w.notes,
				${WORKOUT_DATE} AS workout_date,
				tb.name AS block_name, bw.week_number, bw.week_type, r.name AS routine_name
			FROM workouts w
			LEFT JOIN block_weeks bw ON bw.id = w.block_week_id
			LEFT JOIN training_blocks tb ON tb.id = bw.training_block_id AND tb.user_id = w.user_id
			LEFT JOIN routines r ON r.id = w.routine_id AND r.user_id = w.user_id
			WHERE ${WORKOUT_FILTER}
			ORDER BY workout_date ASC, w.id ASC`,
			filter
		),
		bind(
			db,
			`SELECT we.id, we.workout_id, we.notes, we.target_rest, e.name, e.equipment
			FROM workout_exercises we
			INNER JOIN workouts w ON w.id = we.workout_id
			LEFT JOIN exercises e ON e.id = we.exercise_id
			WHERE we.is_deleted = 0 AND ${WORKOUT_FILTER}
			ORDER BY we.workout_id, we.sort_order, we.id`,
			filter
		),
		bind(
			db,
			`SELECT ws.workout_exercise_id, ws.set_type, ws.target_reps, ws.target_weight,
				ws.actual_reps, ws.actual_weight, ws.duration_seconds, ws.distance, ws.notes
			FROM workout_sets ws
			INNER JOIN workout_exercises we ON we.id = ws.workout_exercise_id
			INNER JOIN workouts w ON w.id = we.workout_id
			WHERE ws.is_deleted = 0 AND we.is_deleted = 0 AND ${WORKOUT_FILTER}
			ORDER BY ws.workout_exercise_id, ws.set_number, ws.id`,
			filter
		)
	]);

	const setsByExercise = groupBy(sets.results ?? [], (row) => reqInt(row.workout_exercise_id));
	const exercisesByWorkout = groupBy(exercises.results ?? [], (row) => reqInt(row.workout_id));
	const workoutRows = workouts.results ?? [];

	const lines = [
		'# Training log',
		'',
		`${label} (${range === 'all' ? `up to ${end}` : `${start} to ${end}`}) · ${workoutCount(workoutRows.length)}`,
		'Weights are in kg. Each set is reps × weight; "target" is what was planned for that set.'
	];

	for (const workout of workoutRows) {
		lines.push('', `## ${optStr(workout.workout_date) ?? 'Undated'} · ${optStr(workout.title) ?? 'Workout'}`);
		const meta = workoutMeta(workout);
		if (meta) lines.push(meta);
		const notes = oneLine(workout.notes);
		if (notes) lines.push(`Notes: ${notes}`);

		for (const exercise of exercisesByWorkout.get(reqInt(workout.id)) ?? []) {
			const equipment = optStr(exercise.equipment);
			const name = optStr(exercise.name) ?? 'Unknown exercise';
			lines.push('', `### ${equipment ? `${name} (${equipment})` : name}`);

			const details = [
				optStr(exercise.target_rest) && `Rest: ${optStr(exercise.target_rest)}`,
				oneLine(exercise.notes) && `Notes: ${oneLine(exercise.notes)}`
			].filter(Boolean);
			if (details.length > 0) lines.push(details.join(' · '));

			const exerciseSets = setsByExercise.get(reqInt(exercise.id)) ?? [];
			if (exerciseSets.length === 0) lines.push('No sets.');
			exerciseSets.forEach((set, index) => lines.push(`${index + 1}. ${setLine(set)}`));
		}
	}

	return {
		range,
		label,
		start,
		end,
		workoutCount: workoutRows.length,
		markdown: `${lines.join('\n')}\n`
	};
}

function workoutMeta(row: Row): string {
	const parts: string[] = [];
	const block = optStr(row.block_name);
	const weekNumber = optFloat(row.week_number);
	if (block || weekNumber !== null) {
		const week = weekNumber === null ? '' : `, week ${weekNumber}`;
		const weekType = optStr(row.week_type);
		parts.push(`${block ?? 'Block'}${week}${weekType ? ` (${weekType})` : ''}`);
	}
	const routine = optStr(row.routine_name);
	if (routine) parts.push(`Routine: ${routine}`);
	const status = optStr(row.status);
	if (status) parts.push(status);
	const duration = optFloat(row.duration_seconds);
	if (duration !== null && duration > 0) parts.push(`${Math.round(duration / 60)} min`);
	const bodyWeight = optFloat(row.body_weight);
	if (bodyWeight !== null) parts.push(`body weight ${fmt(bodyWeight)} kg`);
	return parts.join(' · ');
}

function setLine(row: Row): string {
	const setType = optStr(row.set_type);
	const prefix = setType && setType !== 'working' ? `${setType === 'warmup' ? 'warm-up' : setType}: ` : '';

	const actual = repsAndWeight(optFloat(row.actual_reps), optFloat(row.actual_weight));
	const target = repsAndWeight(optFloat(row.target_reps), optFloat(row.target_weight));
	let text = actual ?? 'not logged';
	if (target) text += ` (target ${target})`;

	const duration = optFloat(row.duration_seconds);
	if (duration !== null && duration > 0) text += `, ${fmt(duration)} s`;
	const distance = optFloat(row.distance);
	if (distance !== null) text += `, distance ${fmt(distance)}`;
	const notes = oneLine(row.notes);
	if (notes) text += ` — ${notes}`;

	return prefix + text;
}

function repsAndWeight(reps: number | null, weight: number | null): string | null {
	if (reps === null && weight === null) return null;
	if (weight === null) return `${fmt(reps as number)} reps`;
	return `${reps === null ? '?' : fmt(reps)} × ${fmt(weight)} kg`;
}

function workoutCount(count: number): string {
	return count === 1 ? '1 workout' : `${count} workouts`;
}

/** Drops float noise such as 82.50000001 and trailing zeros. */
function fmt(value: number): string {
	return String(Number(value.toFixed(2)));
}

/** Collapses newlines so a multi-line note stays on its set's line. */
function oneLine(value: unknown): string | null {
	const text = optStr(value)?.replace(/\s+/g, ' ').trim();
	return text ? text : null;
}

function groupBy(rows: Row[], key: (row: Row) => number): Map<number, Row[]> {
	const groups = new Map<number, Row[]>();
	for (const row of rows) {
		const id = key(row);
		const group = groups.get(id);
		if (group) group.push(row);
		else groups.set(id, [row]);
	}
	return groups;
}
