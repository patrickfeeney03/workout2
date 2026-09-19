import { requireUser } from '$lib/server/guards';
import { loadRoutinePageData } from '../_server/routineData';
import { routineActions } from '../_server/routineActions';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url, params }) => {
	const user = requireUser(locals, url);
	return loadRoutinePageData(locals.db, user.id, Number(params.id));
};

export const actions: Actions = { ...routineActions };
