import { redirect } from '@sveltejs/kit';
import { requireUser } from '$lib/server/guards';
import { int, str } from '$lib/server/forms';
import { formatDate } from '$lib/server/services/common';
import * as blocks from '$lib/server/services/blocks';
import * as routines from '$lib/server/services/routines';
import { getWorkouts, handleWorkout } from '$lib/server/services/workouts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const user = requireUser(locals, url);

	const [workouts, weeks, trainingBlocks, allRoutines] = await Promise.all([
		getWorkouts(locals.db, user.id),
		blocks.getBlockWeeks(locals.db, user.id),
		blocks.getTrainingBlocks(locals.db, user.id),
		routines.getRoutines(locals.db, user.id)
	]);

	const weeksByBlock: Record<number, (typeof weeks)[number][]> = {};
	const weeksById = new Map<number, (typeof weeks)[number]>();
	for (const week of weeks) {
		const blockId = week.trainingBlockId ?? 0;
		(weeksByBlock[blockId] ??= []).push(week);
		weeksById.set(week.id, week);
	}

	const blocksById = new Map(trainingBlocks.map((block) => [block.id, block]));
	const routinesById = new Map(allRoutines.map((routine) => [routine.id, routine]));

	const items = workouts.map((workout) => {
		const routine = workout.routineId !== null ? routinesById.get(workout.routineId) ?? null : null;
		const week = workout.blockWeekId !== null ? weeksById.get(workout.blockWeekId) ?? null : null;
		const block = week ? blocksById.get(week.trainingBlockId ?? 0) ?? null : null;

		return {
			workout,
			routine,
			week,
			block,
			plannedLabel: formatDate(workout.plannedOn),
			performedLabel: formatDate(workout.performedOn),
			durationMinutes:
				workout.durationSeconds !== null ? Math.floor(workout.durationSeconds / 60) : null
		};
	});

	return {
		items,
		routines: allRoutines.filter((routine) => routine.name !== 'No Routine'),
		trainingBlocks: trainingBlocks.filter((block) => block.name !== 'No Block'),
		weeksByBlock,
		weekRanges: Object.fromEntries(
			weeks.map((week) => [week.id, `${formatDate(week.startsOn)} to ${formatDate(week.endsOn)}`])
		) as Record<number, string>,
		today: new Date().toISOString().slice(0, 10)
	};
};

export const actions: Actions = {
	handle_workout: async ({ request, locals, url }) => {
		const user = requireUser(locals, url);
		const form = await request.formData();

		const routineId = int(form, 'routine_id');
		const blockWeekId = int(form, 'block_week_id');

		const workoutId = await handleWorkout(locals.db, user.id, {
			routineId: routineId !== null && routineId > 0 ? routineId : null,
			blockWeekId: blockWeekId !== null && blockWeekId > 0 ? blockWeekId : null,
			title: str(form, 'title'),
			plannedOn: str(form, 'planned_on')
		});

		throw redirect(303, `/workouts/${workoutId}`);
	}
};
