import { redirect } from '@sveltejs/kit';
import { requireUser } from '$lib/server/guards';
import { int, optStr, str } from '$lib/server/forms';
import {
	WEEK_NUMBERS,
	WEEK_TYPES,
	createBlockWeek,
	createTrainingBlock,
	deleteTrainingBlock,
	getTrainingBlocks,
	getWeeksByBlock,
	updateTrainingBlock
} from '$lib/server/services/blocks';
import { formatDate } from '$lib/server/services/common';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const user = requireUser(locals, url);

	const [blocks, weeksByBlock] = await Promise.all([
		getTrainingBlocks(locals.db, user.id),
		getWeeksByBlock(locals.db, user.id)
	]);

	return {
		weekNumbers: [...WEEK_NUMBERS],
		weekTypes: [...WEEK_TYPES],
		blocks: blocks.map((block) => ({
			...block,
			startLabel: formatDate(block.startDate),
			endLabel: formatDate(block.endDate),
			weeks: (weeksByBlock[block.id] ?? []).map((week) => ({
				...week,
				weekTypeLabel: week.weekType || 'Standard',
				startsOnLabel: formatDate(week.startsOn),
				endsOnLabel: formatDate(week.endsOn)
			}))
		}))
	};
};

export const actions: Actions = {
	// PHP `training_block`
	create_block: async ({ request, locals, url }) => {
		const user = requireUser(locals, url);
		const form = await request.formData();

		await createTrainingBlock(locals.db, user.id, {
			name: str(form, 'name'),
			startDate: optStr(form, 'start_date'),
			endDate: optStr(form, 'end_date'),
			notes: optStr(form, 'notes')
		});

		throw redirect(303, '/blocks');
	},

	// PHP `block_week`
	create_week: async ({ request, locals, url }) => {
		const user = requireUser(locals, url);
		const form = await request.formData();

		await createBlockWeek(locals.db, user.id, {
			trainingBlockId: int(form, 'training_block_id') ?? 0,
			weekNumber: int(form, 'week_number') ?? 0,
			weekType: optStr(form, 'week_type'),
			startsOn: optStr(form, 'starts_on'),
			endsOn: optStr(form, 'ends_on'),
			notes: optStr(form, 'notes')
		});

		throw redirect(303, '/blocks');
	},

	// PHP `update_block`
	update_block: async ({ request, locals, url }) => {
		const user = requireUser(locals, url);
		const form = await request.formData();

		await updateTrainingBlock(locals.db, user.id, int(form, 'id') ?? 0, {
			name: str(form, 'name'),
			startDate: optStr(form, 'start_date'),
			endDate: optStr(form, 'end_date'),
			notes: optStr(form, 'notes')
		});

		throw redirect(303, '/blocks');
	},

	// PHP `delete_block`
	delete_block: async ({ request, locals, url }) => {
		const user = requireUser(locals, url);
		const form = await request.formData();
		const blockId = int(form, 'delete_id') ?? int(form, 'id') ?? 0;

		await deleteTrainingBlock(locals.db, user.id, blockId);

		throw redirect(303, '/blocks');
	}
};
