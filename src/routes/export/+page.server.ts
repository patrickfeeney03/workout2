import { requireUser } from '$lib/server/guards';
import { todaySql } from '$lib/server/db';
import { EXPORT_RANGES, exportTrainingLog } from '$lib/server/services/export';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const user = requireUser(locals, url);

	const log = await exportTrainingLog(locals.db, user.id, {
		range: url.searchParams.get('range'),
		today: todaySql()
	});

	return { log, ranges: [...EXPORT_RANGES] };
};
