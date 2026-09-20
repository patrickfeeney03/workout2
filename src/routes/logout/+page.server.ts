import { redirect } from '@sveltejs/kit';
import { SESSION_COOKIE, deleteSession } from '$lib/server/session';
import { invalidateSessionCache } from '$lib/server/sessionCache';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	throw redirect(303, '/');
};

export const actions: Actions = {
	default: async ({ locals, cookies, platform }) => {
		const sessionId = cookies.get(SESSION_COOKIE);
		if (sessionId) {
			await deleteSession(locals.db, sessionId);
			// Best effort: other colos expire on their own within the cache TTL.
			await invalidateSessionCache(platform?.caches, sessionId);
		}
		cookies.delete(SESSION_COOKIE, { path: '/' });
		throw redirect(303, '/login');
	}
};
