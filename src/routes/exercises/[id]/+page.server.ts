import { error, fail, redirect } from '@sveltejs/kit';
import { requireUser } from '$lib/server/guards';
import { optStr } from '$lib/server/forms';
import { deleteStored, storeUpload } from '$lib/server/media';
import * as catalog from '$lib/server/services/catalog';
import { getPastWorkoutSetsForExercise } from '$lib/server/services/workouts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url, params }) => {
	const user = requireUser(locals, url);
	const exerciseId = Number(params.id);
	if (!Number.isFinite(exerciseId) || exerciseId <= 0) {
		error(404, 'Not found');
	}

	const exercise = await catalog.getExercise(locals.db, exerciseId, user.id);
	if (!exercise) {
		error(404, 'Not found');
	}

	const [movementPatterns, images, history] = await Promise.all([
		catalog.getMovementPatterns(locals.db),
		catalog.getExerciseImages(locals.db, exerciseId, user.id),
		getPastWorkoutSetsForExercise(locals.db, exerciseId, user.id)
	]);

	const pattern = exercise.movementPatternId
		? await catalog.getMovementPatternById(locals.db, exercise.movementPatternId)
		: null;

	return {
		exercise,
		pattern,
		movementPatterns,
		images,
		history: Object.values(history)
	};
};

export const actions: Actions = {
	update: async ({ request, locals, url, params }) => {
		const user = requireUser(locals, url);
		const exerciseId = Number(params.id);
		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();
		if (name === '') {
			return fail(400, { error: 'Name is required' });
		}

		await catalog.updateExercise(locals.db, user.id, {
			id: exerciseId,
			name,
			description: optStr(form, 'description'),
			equipment: optStr(form, 'equipment'),
			primaryMuscle: optStr(form, 'primary_muscle'),
			movementPatternId: optStr(form, 'movement_pattern_id'),
			notes: optStr(form, 'notes')
		});

		return { saved: true };
	},

	delete: async ({ locals, url, params }) => {
		const user = requireUser(locals, url);
		await catalog.deleteExercise(locals.db, user.id, Number(params.id));
		throw redirect(303, '/exercises');
	},

	upload_image: async ({ request, locals, url, params }) => {
		const user = requireUser(locals, url);
		const exerciseId = Number(params.id);
		const form = await request.formData();
		const file = form.get('image');

		if (!(file instanceof File) || file.size === 0) {
			return fail(400, { error: 'Choose an image first' });
		}
		if (!file.type.startsWith('image/')) {
			return fail(400, { error: 'Only images are supported' });
		}

		const filePath = await storeUpload(locals.env.MEDIA, file, 'exercises', exerciseId);
		await catalog.insertExerciseImage(locals.db, exerciseId, filePath, user.id);

		throw redirect(303, `/exercises/${exerciseId}`);
	},

	delete_image: async ({ request, locals, url, params }) => {
		const user = requireUser(locals, url);
		const form = await request.formData();
		const imageId = Number(form.get('image_id'));
		if (Number.isFinite(imageId)) {
			const image = await catalog.getExerciseImageById(locals.db, imageId, user.id);
			if (image && image.exerciseId === Number(params.id)) {
				await catalog.deleteExerciseImage(locals.db, imageId, user.id);
				await deleteStored(locals.env.MEDIA, image.filePath);
			}
		}
		throw redirect(303, `/exercises/${params.id}`);
	}
};
