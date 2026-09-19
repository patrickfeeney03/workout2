import { redirect } from '@sveltejs/kit';
import { requireUser } from '$lib/server/guards';
import { int, str } from '$lib/server/forms';
import { loadRoutinePageData } from '../../_server/routineData';
import { routineActions } from '../../_server/routineActions';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url, params }) => {
	const user = requireUser(locals, url);
	return loadRoutinePageData(locals.db, user.id, Number(params.id));
};

export const actions: Actions = {
	...routineActions,

	/**
	 * Port of `handleUpdateRoutine` in edit_routine.php. The PHP statement was not user-scoped;
	 * the `AND user_id = ?` clause is added here (the load guard already checks ownership).
	 */
	update_routine: async ({ request, locals, url }) => {
		const user = requireUser(locals, url);
		const form = await request.formData();

		const routineId = int(form, 'id') ?? 0;

		await locals.db
			.prepare(
				`UPDATE routines
				 SET name = ?, description = ?, split_name = ?, split_day = ?, notes = ?
				 WHERE id = ? AND user_id = ?`
			)
			.bind(
				str(form, 'name'),
				str(form, 'description'),
				str(form, 'split_name'),
				str(form, 'split_day'),
				str(form, 'notes'),
				routineId,
				user.id
			)
			.run();

		// PHP redirected to /gym/routines.php#routine-<id>.
		throw redirect(303, `/routines#routine-${routineId}`);
	}
};
