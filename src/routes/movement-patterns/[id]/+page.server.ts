import { error } from '@sveltejs/kit';
import { requireUser } from '$lib/server/guards';
import * as catalog from '$lib/server/services/catalog';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url, params }) => {
	const user = requireUser(locals, url);

	const patternId = Number(params.id);
	if (!Number.isFinite(patternId) || patternId <= 0) {
		error(404, 'Not found');
	}

	const pattern = await catalog.getMovementPatternById(locals.db, patternId);
	if (!pattern) {
		error(404, 'Not found');
	}

	const exercises = await catalog.getExercisesForMovementPattern(locals.db, patternId, user.id);

	return { pattern, exercises };
};
