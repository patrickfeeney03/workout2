import { error, redirect } from '@sveltejs/kit';
import { requireUser } from '$lib/server/guards';
import { optStr, str } from '$lib/server/forms';
import {
	deleteTrainingBlock,
	getBlockWeeksForBlockDesc,
	getTrainingBlock,
	updateBlockEndDate,
	updateBlockName,
	updateBlockNotes,
	updateBlockStartDate,
	updateTrainingBlock
} from '$lib/server/services/blocks';
import { formatDate } from '$lib/server/services/common';
import { getWorkoutsByBlockWeekId } from '$lib/server/services/workouts';
import type { Actions, PageServerLoad } from './$types';

/** Resolves `[id]` to an owned block or throws a 404. */
async function ownedBlock(locals: App.Locals, url: URL, params: { id: string }) {
	const user = requireUser(locals, url);
	const blockId = Number(params.id);
	if (!Number.isFinite(blockId) || blockId <= 0) {
		error(404, 'Not found');
	}

	const block = await getTrainingBlock(locals.db, blockId, user.id);
	if (!block) {
		error(404, 'Not found');
	}

	return { user, blockId, block };
}

export const load: PageServerLoad = async ({ locals, url, params }) => {
	const { user, blockId, block } = await ownedBlock(locals, url, params);

	const weeks = await getBlockWeeksForBlockDesc(locals.db, blockId, user.id);
	const weeksData = await Promise.all(
		weeks.map(async (week) => ({
			...week,
			weekTypeLabel: week.weekType || 'Standard',
			startsOnLabel: formatDate(week.startsOn),
			endsOnLabel: formatDate(week.endsOn),
			workouts: await getWorkoutsByBlockWeekId(locals.db, week.id, user.id)
		}))
	);

	return { block, weeks: weeksData };
};

export const actions: Actions = {
	// PHP `update_block_name`
	update_name: async ({ request, locals, url, params }) => {
		const { user, blockId } = await ownedBlock(locals, url, params);
		const form = await request.formData();

		await updateBlockName(locals.db, user.id, blockId, str(form, 'name'));

		throw redirect(303, `/blocks/${blockId}`);
	},

	// PHP `update_block_start_date`
	update_start_date: async ({ request, locals, url, params }) => {
		const { user, blockId, block } = await ownedBlock(locals, url, params);
		const form = await request.formData();

		await updateBlockStartDate(locals.db, user.id, block, optStr(form, 'start_date'));

		throw redirect(303, `/blocks/${blockId}`);
	},

	// PHP `update_block_end_date`
	update_end_date: async ({ request, locals, url, params }) => {
		const { user, blockId, block } = await ownedBlock(locals, url, params);
		const form = await request.formData();

		await updateBlockEndDate(locals.db, user.id, block, optStr(form, 'end_date'));

		throw redirect(303, `/blocks/${blockId}`);
	},

	// PHP `update_block_notes`
	update_notes: async ({ request, locals, url, params }) => {
		const { user, blockId, block } = await ownedBlock(locals, url, params);
		const form = await request.formData();

		await updateBlockNotes(locals.db, user.id, block, optStr(form, 'notes'));

		throw redirect(303, `/blocks/${blockId}`);
	},

	// PHP `edit_block`
	update: async ({ request, locals, url, params }) => {
		const { user, blockId } = await ownedBlock(locals, url, params);
		const form = await request.formData();

		await updateTrainingBlock(locals.db, user.id, blockId, {
			name: str(form, 'name'),
			startDate: optStr(form, 'start_date'),
			endDate: optStr(form, 'end_date'),
			notes: optStr(form, 'notes')
		});

		throw redirect(303, `/blocks/${blockId}`);
	},

	// PHP `delete_block`
	delete: async ({ locals, url, params }) => {
		const { user, blockId } = await ownedBlock(locals, url, params);

		await deleteTrainingBlock(locals.db, user.id, blockId);

		throw redirect(303, '/blocks');
	}
};
