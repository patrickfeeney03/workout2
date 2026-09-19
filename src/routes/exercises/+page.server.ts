import { fail } from '@sveltejs/kit';
import { requireUser } from '$lib/server/guards';
import { optStr, str } from '$lib/server/forms';
import * as catalog from '$lib/server/services/catalog';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const user = requireUser(locals, url);

	const [exercises, movementPatterns] = await Promise.all([
		catalog.getExercises(locals.db, user.id),
		catalog.getMovementPatterns(locals.db)
	]);

	const query = (url.searchParams.get('q') ?? '').trim().toLowerCase();
	const filtered =
		query === ''
			? exercises
			: exercises.filter((exercise) =>
					[
						exercise.name,
						exercise.primaryMuscle,
						exercise.equipment,
						exercise.description,
						exercise.notes,
						exercise.movementPatternName ?? 'Uncategorized'
					]
						.filter(Boolean)
						.join(' ')
						.toLowerCase()
						.includes(query)
				);

	const grouped = new Map<string, typeof filtered>();
	for (const exercise of filtered) {
		const pattern = exercise.movementPatternName ?? 'Uncategorized';
		const list = grouped.get(pattern) ?? [];
		list.push(exercise);
		grouped.set(pattern, list);
	}

	const groups = [...grouped.entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([patternName, items]) => ({ patternName, exercises: items }));

	return { groups, total: filtered.length, exerciseCount: exercises.length, query: url.searchParams.get('q') ?? '', movementPatterns };
};

export const actions: Actions = {
	create: async ({ request, locals, url }) => {
		const user = requireUser(locals, url);
		const form = await request.formData();
		const name = str(form, 'name');
		if (name === '') {
			return fail(400, { error: 'Name is required' });
		}

		await catalog.createExercise(locals.db, user.id, {
			name,
			description: optStr(form, 'description'),
			equipment: optStr(form, 'equipment'),
			primaryMuscle: optStr(form, 'primary_muscle'),
			movementPatternId: optStr(form, 'movement_pattern_id'),
			notes: optStr(form, 'notes')
		});

		return { created: true };
	}
};
