import { fail, redirect } from '@sveltejs/kit';
import type { Action } from '@sveltejs/kit';
import { int, str } from '$lib/server/forms';
import { requireUser } from '$lib/server/guards';
import { moveExercise } from '$lib/server/services/common';
import * as routines from '$lib/server/services/routines';

/**
 * Parse bracket-notation fields into a keyed map.
 *
 * `target_reps[12]` -> `{ '12': value }`; the set editor also accepts the PHP `new_*` keys
 * (`target_reps[new_1]`), which `handleUpdateRoutineSets` treats as inserts.
 */
function bracketFormValues(form: FormData, base: string): Record<string, string> {
	const values: Record<string, string> = {};
	const prefix = `${base}[`;
	for (const [key, value] of form.entries()) {
		if (typeof value !== 'string' || !key.startsWith(prefix) || !key.endsWith(']')) continue;
		const inner = key.slice(prefix.length, -1);
		if (inner !== '') {
			values[inner] = value;
		}
	}
	return values;
}

/**
 * Redirect back to the page that submitted the form. The same action surface is used by both
 * `/routines/[id]` and `/routines/[id]/edit`, mirroring `header('Location: routine.php?...')`.
 *
 * Used for the PHP actions that were plain (non-htmx) POSTs and therefore did a full page load;
 * the htmx-driven actions return `{ saved: true }` instead so `use:enhance` refreshes the data
 * in place (no scroll jump) exactly like the partial re-render did before.
 */
function backTo(url: URL): never {
	throw redirect(303, url.pathname);
}

/**
 * Every mutation of `routine.php` except the routine settings update (which only exists on the
 * edit page). Action names are kept identical to the PHP `match ($_POST['action'])` arms.
 */
export const routineActions: Record<string, Action> = {
	update_routine_sets: async ({ request, locals, url }) => {
		const user = requireUser(locals, url);
		const form = await request.formData();

		const routineExerciseId = int(form, 'routine_exercise_id');
		if (routineExerciseId === null) {
			return fail(400, { error: 'Missing routine exercise' });
		}

		await routines.handleUpdateRoutineSets(locals.db, user.id, {
			routineExerciseId,
			targetRest: form.has('target_rest') ? str(form, 'target_rest') : null,
			exerciseNotes: form.has('routine_exercise_notes') ? str(form, 'routine_exercise_notes') : null,
			targetReps: bracketFormValues(form, 'target_reps'),
			targetWeight: bracketFormValues(form, 'target_weight'),
			setTypes: bracketFormValues(form, 'set_type'),
			notes: bracketFormValues(form, 'notes')
		});

		return { saved: true };
	},

	handle_add_exercise: async ({ request, locals, url }) => {
		const user = requireUser(locals, url);
		const form = await request.formData();

		await routines.addExerciseToRoutine(
			locals.db,
			int(form, 'routine_id') ?? 0,
			int(form, 'exercise_id') ?? 0,
			str(form, 'new_exercise_name'),
			user.id
		);

		return backTo(url);
	},

	delete_routine_exercise: async ({ request, locals, url }) => {
		const user = requireUser(locals, url);
		const form = await request.formData();

		const routineExerciseId = int(form, 'routine_exercise_id');
		if (routineExerciseId !== null) {
			await routines.deleteRoutineExercise(locals.db, user.id, routineExerciseId);
		}

		return backTo(url);
	},

	delete_routine_set: async ({ request, locals, url }) => {
		const user = requireUser(locals, url);
		const form = await request.formData();

		const setId = int(form, 'set_id');
		if (setId !== null) {
			await routines.deleteRoutineSet(locals.db, setId, user.id);
		}

		return { saved: true };
	},

	add_blank_set: async ({ request, locals, url }) => {
		const user = requireUser(locals, url);
		const form = await request.formData();

		const routineExerciseId = int(form, 'routine_exercise_id');
		if (routineExerciseId !== null) {
			await routines.createEmptyRoutineSet(locals.db, routineExerciseId, user.id);
		}

		return { saved: true };
	},

	move_routine_set: async ({ request, locals, url }) => {
		const user = requireUser(locals, url);
		const form = await request.formData();

		const setId = int(form, 'set_id');
		if (setId !== null) {
			await routines.moveRoutineSet(locals.db, setId, str(form, 'direction'), user.id);
		}

		return { saved: true };
	},

	move_routine_exercise: async ({ request, locals, url }) => {
		const user = requireUser(locals, url);
		const form = await request.formData();

		const routineId = int(form, 'routine_id') ?? 0;
		const routineExerciseId = int(form, 'routine_exercise_id');
		const direction = str(form, 'direction');

		if (routineExerciseId !== null) {
			const current = await routines.getRoutineExercise(locals.db, routineExerciseId, user.id);
			if (current) {
				const sequence = await routines.getRoutineExercisesFromRoutine(
					locals.db,
					routineId,
					user.id
				);
				await moveExercise(locals.db, current, sequence, direction, 'routine_exercises');
			}
		}

		return { saved: true };
	},

	delete_routine: async ({ request, locals, url }) => {
		const user = requireUser(locals, url);
		const form = await request.formData();

		const routineId = int(form, 'routine_id');
		if (routineId !== null) {
			await routines.deleteRoutine(locals.db, user.id, routineId);
		}

		throw redirect(303, '/routines');
	}
};
