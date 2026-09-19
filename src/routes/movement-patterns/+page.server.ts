import { redirect } from '@sveltejs/kit';
import { requireUser } from '$lib/server/guards';
import { int, str } from '$lib/server/forms';
import * as catalog from '$lib/server/services/catalog';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	requireUser(locals, url);

	const patterns = await catalog.getMovementPatterns(locals.db);

	// Mirrors `(int) ($_GET['edit_pattern'] ?? 0)` on movement_patterns.php.
	const rawEdit = Number(url.searchParams.get('edit_pattern') ?? 0);
	const editPatternId = Number.isFinite(rawEdit) ? rawEdit : 0;

	return { patterns, editPatternId };
};

export const actions: Actions = {
	create: async ({ request, locals, url }) => {
		requireUser(locals, url);
		const form = await request.formData();

		// createMovementPattern returns early (no insert) on an empty name, matching the PHP.
		await catalog.createMovementPattern(locals.db, {
			name: str(form, 'name'),
			notes: str(form, 'notes')
		});

		throw redirect(303, '/movement-patterns');
	},

	update: async ({ request, locals, url }) => {
		requireUser(locals, url);
		const form = await request.formData();

		await catalog.updateMovementPattern(locals.db, {
			id: int(form, 'id'),
			name: str(form, 'name'),
			notes: str(form, 'notes')
		});

		throw redirect(303, '/movement-patterns');
	},

	delete: async ({ request, locals, url }) => {
		requireUser(locals, url);
		const form = await request.formData();

		await catalog.deleteMovementPattern(locals.db, int(form, 'delete_id') ?? 0);

		throw redirect(303, '/movement-patterns');
	}
};
