import { error, redirect } from '@sveltejs/kit';
import { requireUser } from '$lib/server/guards';
import { int, intOr, num, optStr, str } from '$lib/server/forms';
import { bind, run } from '$lib/server/db';
import { WEEK_NUMBERS, WEEK_TYPES } from '$lib/server/services/blocks';
import * as blocks from '$lib/server/services/blocks';
import {
	addExerciseToWorkout,
	createEmptyWorkoutSet,
	deleteWorkout,
	deleteWorkoutExercise,
	deleteWorkoutSet,
	duplicateWorkout,
	getWorkout,
	getWorkoutExercise,
	getWorkoutExercisesForWorkout,
	moveWorkoutSet,
	saveWorkoutExercise,
	updateWorkoutPlannedOn,
	updateWorkoutTitle,
	updateWorkoutWeek,
	type WorkoutExerciseUpdate,
	type WorkoutSetUpdate
} from '$lib/server/services/workouts';
import { getWorkoutDetail } from '$lib/server/services/workoutDetail';
import { moveExercise } from '$lib/server/services/common';
import type { Actions, PageServerLoad } from './$types';

/**
 * Port of public/gym/workout.php (the core logging screen) plus the htmx endpoints it posts to
 * (public/gym/workout.js is only leftover commented code).
 *
 * Every `match ($_POST['action'])` branch becomes a named form action. The htmx handlers that
 * returned rendered HTML now simply return `{ saved: true }` (or a 303 redirect for structural
 * changes) and `use:enhance` re-runs this load function.
 */

interface SetFieldValues {
	actual_reps: string;
	actual_weight: string;
	set_type: string;
	notes: string;
}

const SET_FIELD_PATTERN = /^sets\[(\d+)\]\[([a-z_]+)\]$/;

/** Parses `sets[<id>][actual_reps|actual_weight|set_type|notes]` from the exercise form. */
function parseSetFields(form: FormData): Map<number, SetFieldValues> {
	const parsed = new Map<number, SetFieldValues>();
	for (const [key, value] of form.entries()) {
		const match = SET_FIELD_PATTERN.exec(key);
		if (!match) continue;
		const setId = Number(match[1]);
		const field = match[2] as keyof SetFieldValues;
		const entry =
			parsed.get(setId) ?? { actual_reps: '', actual_weight: '', set_type: '', notes: '' };
		if (field in entry) {
			entry[field] = String(value);
		}
		parsed.set(setId, entry);
	}
	return parsed;
}

/** Mirrors DTO\Helper::optFloat: '' and non-numeric values become null. */
function optNum(value: string | undefined): number | null {
	if (value === undefined) return null;
	const trimmed = value.trim();
	if (trimmed === '') return null;
	const parsed = Number(trimmed);
	return Number.isFinite(parsed) ? parsed : null;
}

function requireWorkoutId(params: { id: string }): number {
	const workoutId = Number(params.id);
	if (!Number.isFinite(workoutId) || workoutId <= 0) {
		error(404, 'Not found');
	}
	return workoutId;
}

export const load: PageServerLoad = async ({ locals, url, params }) => {
	const user = requireUser(locals, url);
	const workoutId = requireWorkoutId(params);

	// One ownership read + one batch of every read the page needs, instead of two waves of
	// 2 + 5 separate D1 round trips. See `$lib/server/services/workoutDetail`.
	const detail = await getWorkoutDetail(locals.db, user.id, workoutId);
	if (!detail) {
		error(404, 'Not found');
	}

	const { workout, exercises, exerciseGroups, trainingBlocks, weeksByBlock, week } = detail;

	const currentBlockId = week?.trainingBlockId ?? 0;
	const nextWeekNumber = currentBlockId
		? blocks.nextWeekNumberFor(weeksByBlock[currentBlockId] ?? [])
		: 1;

	return {
		workout,
		exercises,
		exerciseGroups,
		trainingBlocks,
		weeksByBlock,
		week,
		currentBlockId,
		nextWeekNumber,
		weekNumbers: [...WEEK_NUMBERS],
		weekTypes: [...WEEK_TYPES]
	};
};

export const actions: Actions = {
	/** PHP default form action: save every set of one exercise, its rest and notes. */
	update_workout_sets: async ({ request, locals, url, params }) => {
		const user = requireUser(locals, url);
		requireWorkoutId(params);
		const form = await request.formData();

		const workoutExerciseId = int(form, 'workout_exercise_id');
		if (workoutExerciseId === null) {
			return { saved: false };
		}

		const updates: WorkoutSetUpdate[] = [];
		for (const [setId, parsed] of parseSetFields(form)) {
			const setType = parsed.set_type.trim();
			updates.push({
				id: setId,
				actualReps: optNum(parsed.actual_reps),
				actualWeight: optNum(parsed.actual_weight),
				setType: setType === '' ? 'working' : setType,
				notes: parsed.notes.trim() === '' ? null : parsed.notes.trim()
			});
		}

		const fields: WorkoutExerciseUpdate = {};
		if (form.has('target_rest')) {
			fields.targetRest = optStr(form, 'target_rest');
		}
		if (form.has('workout_exercise_notes')) {
			fields.notes = optStr(form, 'workout_exercise_notes');
		}

		const result = await saveWorkoutExercise(locals.db, user.id, workoutExerciseId, updates, fields);
		if (!result.saved) {
			error(404, 'Not found');
		}

		// `status` lets the page show the auto-completed state without re-running the whole load.
		return { saved: true, status: result.status };
	},

	add_exercise: async ({ request, locals, url, params }) => {
		const user = requireUser(locals, url);
		const workoutId = requireWorkoutId(params);
		const form = await request.formData();

		const workout = await getWorkout(locals.db, workoutId, user.id);
		if (workout) {
			await addExerciseToWorkout(
				locals.db,
				workout,
				intOr(form, 'exercise_id', 0),
				str(form, 'new_exercise_name'),
				user.id
			);
		}

		throw redirect(303, `/workouts/${workoutId}`);
	},

	delete_exercise: async ({ request, locals, url, params }) => {
		const user = requireUser(locals, url);
		const workoutId = requireWorkoutId(params);
		const form = await request.formData();

		const workoutExerciseId = int(form, 'workout_exercise_id');
		if (workoutExerciseId !== null) {
			await deleteWorkoutExercise(locals.db, user.id, workoutExerciseId);
		}

		throw redirect(303, `/workouts/${workoutId}`);
	},

	delete_set: async ({ request, locals, url, params }) => {
		const user = requireUser(locals, url);
		const workoutId = requireWorkoutId(params);
		const form = await request.formData();

		const setId = int(form, 'set_id');
		if (setId !== null) {
			await deleteWorkoutSet(locals.db, setId, user.id);
		}

		throw redirect(303, `/workouts/${workoutId}`);
	},

	move_set_up: async ({ request, locals, url, params }) => {
		const user = requireUser(locals, url);
		const workoutId = requireWorkoutId(params);
		const form = await request.formData();

		const setId = int(form, 'set_id');
		if (setId !== null) {
			await moveWorkoutSet(locals.db, setId, 'up', user.id);
		}

		throw redirect(303, `/workouts/${workoutId}`);
	},

	move_set_down: async ({ request, locals, url, params }) => {
		const user = requireUser(locals, url);
		const workoutId = requireWorkoutId(params);
		const form = await request.formData();

		const setId = int(form, 'set_id');
		if (setId !== null) {
			await moveWorkoutSet(locals.db, setId, 'down', user.id);
		}

		throw redirect(303, `/workouts/${workoutId}`);
	},

	move_exercise: async ({ request, locals, url, params }) => {
		const user = requireUser(locals, url);
		const workoutId = requireWorkoutId(params);
		const form = await request.formData();

		const workout = await getWorkout(locals.db, workoutId, user.id);
		if (!workout) {
			error(404, 'Not found');
		}

		const workoutExerciseId = int(form, 'workout_exercise_id');
		if (workoutExerciseId !== null) {
			const current = await getWorkoutExercise(locals.db, workoutExerciseId, user.id);
			if (current) {
				const sequence = await getWorkoutExercisesForWorkout(locals.db, workoutId, user.id);
				await moveExercise(locals.db, current, sequence, str(form, 'direction'), 'workout_exercises');
			}
		}

		throw redirect(303, `/workouts/${workoutId}`);
	},

	add_blank_set: async ({ request, locals, url, params }) => {
		const user = requireUser(locals, url);
		const workoutId = requireWorkoutId(params);
		const form = await request.formData();

		const workoutExerciseId = int(form, 'workout_exercise_id');
		if (workoutExerciseId !== null) {
			await createEmptyWorkoutSet(locals.db, workoutExerciseId, user.id, 'end');
		}

		throw redirect(303, `/workouts/${workoutId}`);
	},

	add_blank_set_start: async ({ request, locals, url, params }) => {
		const user = requireUser(locals, url);
		const workoutId = requireWorkoutId(params);
		const form = await request.formData();

		const workoutExerciseId = int(form, 'workout_exercise_id');
		if (workoutExerciseId !== null) {
			await createEmptyWorkoutSet(locals.db, workoutExerciseId, user.id, 'start');
		}

		throw redirect(303, `/workouts/${workoutId}`);
	},

	update_title: async ({ request, locals, url, params }) => {
		const user = requireUser(locals, url);
		const workoutId = requireWorkoutId(params);
		const form = await request.formData();

		await updateWorkoutTitle(locals.db, workoutId, str(form, 'title'), user.id);
		return { saved: true };
	},

	update_planned_on: async ({ request, locals, url, params }) => {
		const user = requireUser(locals, url);
		const workoutId = requireWorkoutId(params);
		const form = await request.formData();

		await updateWorkoutPlannedOn(locals.db, workoutId, str(form, 'planned_on'), user.id);
		return { saved: true };
	},

	update_status: async ({ request, locals, url, params }) => {
		const user = requireUser(locals, url);
		const workoutId = requireWorkoutId(params);
		const form = await request.formData();

		const status = str(form, 'status');
		if (status === 'planned' || status === 'completed' || status === 'skipped') {
			await run(
				bind(locals.db, 'UPDATE workouts SET status = ? WHERE id = ? AND user_id = ?', [
					status,
					workoutId,
					user.id
				])
			);
			return { saved: true, status };
		}

		return { saved: true };
	},

	update_duration: async ({ request, locals, url, params }) => {
		const user = requireUser(locals, url);
		const workoutId = requireWorkoutId(params);
		const form = await request.formData();

		const hours = str(form, 'duration_hours');
		const minutes = str(form, 'duration_minutes');
		const seconds = str(form, 'duration_secs');

		let durationSeconds: number | null;
		if (hours === '' && minutes === '' && seconds === '') {
			durationSeconds = null;
		} else {
			durationSeconds =
				(intOr(form, 'duration_hours', 0) || 0) * 3600 +
				(intOr(form, 'duration_minutes', 0) || 0) * 60 +
				(intOr(form, 'duration_secs', 0) || 0);
		}

		await run(
			bind(locals.db, 'UPDATE workouts SET duration_seconds = ? WHERE id = ? AND user_id = ?', [
				durationSeconds,
				workoutId,
				user.id
			])
		);

		return { saved: true };
	},

	update_body_weight: async ({ request, locals, url, params }) => {
		const user = requireUser(locals, url);
		const workoutId = requireWorkoutId(params);
		const form = await request.formData();

		await run(
			bind(locals.db, 'UPDATE workouts SET body_weight = ? WHERE id = ? AND user_id = ?', [
				num(form, 'body_weight'),
				workoutId,
				user.id
			])
		);

		return { saved: true };
	},

	update_week: async ({ request, locals, url, params }) => {
		const user = requireUser(locals, url);
		const workoutId = requireWorkoutId(params);
		const form = await request.formData();

		await updateWorkoutWeek(locals.db, workoutId, int(form, 'block_week_id'), user.id);
		return { saved: true };
	},

	create_week: async ({ request, locals, url, params }) => {
		const user = requireUser(locals, url);
		const workoutId = requireWorkoutId(params);
		const form = await request.formData();

		await blocks.createBlockWeek(locals.db, user.id, {
			trainingBlockId: intOr(form, 'training_block_id', 0),
			weekNumber: intOr(form, 'week_number', 1),
			weekType: str(form, 'week_type'),
			startsOn: null,
			endsOn: null,
			notes: null
		});

		throw redirect(303, `/workouts/${workoutId}`);
	},

	duplicate: async ({ locals, url, params }) => {
		const user = requireUser(locals, url);
		const workoutId = requireWorkoutId(params);

		const newId = await duplicateWorkout(locals.db, workoutId, user.id);
		throw redirect(303, `/workouts/${newId}`);
	},

	delete_workout: async ({ locals, url, params }) => {
		const user = requireUser(locals, url);
		const workoutId = requireWorkoutId(params);

		const workout = await getWorkout(locals.db, workoutId, user.id);
		if (workout) {
			await deleteWorkout(locals.db, workout);
		}

		throw redirect(303, '/workouts');
	}
};
