import { fail, redirect } from '@sveltejs/kit';
import { requireUser } from '$lib/server/guards';
import { str } from '$lib/server/forms';
import * as routines from '$lib/server/services/routines';
import type { Actions, PageServerLoad } from './$types';

interface RoutineListExercise {
	readonly id: number;
	readonly name: string;
	readonly setCount: number;
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const user = requireUser(locals, url);

	const [routineList, routineExercises] = await Promise.all([
		routines.getRoutines(locals.db, user.id),
		routines.getRoutineExercises(locals.db, user.id)
	]);

	const mapped = await routines.getMappedExercisesAndSetsForRoutineExercises(
		locals.db,
		routineExercises
	);

	const exercisesByRoutine: Record<number, RoutineListExercise[]> = {};
	for (const routineExercise of routineExercises) {
		// `getRoutineExercises` includes soft-deleted rows (as PHP did); skip them so this summary
		// matches what the routine builder shows.
		if (routineExercise.isDeleted === 1) continue;

		const pair = mapped[routineExercise.id];
		(exercisesByRoutine[routineExercise.routineId] ??= []).push({
			id: pair?.exercise?.id ?? routineExercise.exerciseId,
			name: pair?.exercise?.name ?? 'Unknown exercise',
			setCount: pair?.sets.length ?? 0
		});
	}

	return { routines: routineList, exercisesByRoutine };
};

export const actions: Actions = {
	// PHP action name from `match ($_POST['action'])` in routines.php.
	handle_routine_exercise: async ({ request, locals, url }) => {
		const user = requireUser(locals, url);
		const form = await request.formData();

		const name = str(form, 'name');
		if (name === '') {
			return fail(400, { error: 'Name is required' });
		}

		const routine = await routines.createRoutine(locals.db, user.id, {
			name,
			description: str(form, 'description'),
			splitName: str(form, 'split_name'),
			splitDay: str(form, 'split_day'),
			notes: str(form, 'notes')
		});

		// PHP redirects to routine.php?routine_id=<new id>: land on the new routine's builder.
		throw redirect(303, routine ? `/routines/${routine.id}` : '/routines');
	}
};
