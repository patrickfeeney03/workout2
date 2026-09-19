import { error, redirect } from '@sveltejs/kit';
import { requireUser } from '$lib/server/guards';
import { str } from '$lib/server/forms';
import {
	WEEK_NUMBERS,
	WEEK_TYPES,
	deleteWeek,
	getBlockWeek,
	getTrainingBlock,
	updateBlockWeek
} from '$lib/server/services/blocks';
import { getExercise } from '$lib/server/services/catalog';
import { formatDate } from '$lib/server/services/common';
import { getWorkoutExercisesForWorkout, getWorkoutsByBlockWeekId } from '$lib/server/services/workouts';
import type { Actions, PageServerLoad } from './$types';

/** Resolves both route params and verifies the week belongs to the owned block. */
async function ownedWeek(locals: App.Locals, url: URL, params: { id: string; weekId: string }) {
	const user = requireUser(locals, url);

	const blockId = Number(params.id);
	const weekId = Number(params.weekId);
	if (!Number.isFinite(blockId) || blockId <= 0 || !Number.isFinite(weekId) || weekId <= 0) {
		error(404, 'Not found');
	}

	const block = await getTrainingBlock(locals.db, blockId, user.id);
	if (!block) {
		error(404, 'Not found');
	}

	const week = await getBlockWeek(locals.db, weekId, user.id);
	if (!week || week.trainingBlockId !== blockId) {
		error(404, 'Not found');
	}

	return { user, block, blockId, week, weekId };
}

export const load: PageServerLoad = async ({ locals, url, params }) => {
	const { user, block, week, weekId } = await ownedWeek(locals, url, params);

	const workouts = await getWorkoutsByBlockWeekId(locals.db, weekId, user.id);
	const workoutsData = await Promise.all(
		workouts.map(async (workout) => {
			const associations = await getWorkoutExercisesForWorkout(locals.db, workout.id, user.id);
			const exercises: string[] = [];
			for (const association of associations) {
				const exercise = await getExercise(locals.db, association.exerciseId, user.id);
				if (exercise) {
					exercises.push(exercise.name);
				}
			}
			return {
				workout,
				dateLabel: formatDate(workout.performedOn ?? workout.plannedOn),
				exercises
			};
		})
	);

	return {
		block,
		week: {
			...week,
			weekTypeLabel: week.weekType || 'Standard',
			startsOnLabel: formatDate(week.startsOn),
			endsOnLabel: formatDate(week.endsOn)
		},
		workouts: workoutsData,
		weekNumbers: [...WEEK_NUMBERS] as number[],
		weekTypes: [...WEEK_TYPES] as string[]
	};
};

export const actions: Actions = {
	// PHP `update_week` (passes `$_POST` wholesale to updateBlockWeek)
	update_week: async ({ request, locals, url, params }) => {
		const { user, blockId, weekId } = await ownedWeek(locals, url, params);
		const form = await request.formData();

		await updateBlockWeek(locals.db, user.id, weekId, {
			week_number: str(form, 'week_number'),
			week_type: str(form, 'week_type'),
			starts_on: str(form, 'starts_on'),
			ends_on: str(form, 'ends_on'),
			notes: str(form, 'notes')
		});

		throw redirect(303, `/blocks/${blockId}/weeks/${weekId}`);
	},

	// PHP `delete`
	delete: async ({ locals, url, params }) => {
		const { user, weekId } = await ownedWeek(locals, url, params);

		await deleteWeek(locals.db, user.id, weekId);

		throw redirect(303, '/blocks');
	}
};
