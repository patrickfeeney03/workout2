import type { Handle } from '@sveltejs/kit';
import { SESSION_COOKIE, getSessionUser } from '$lib/server/session';

export const handle: Handle = async ({ event, resolve }) => {
	const env = event.platform?.env;
	event.locals.user = null;

	if (env?.DB) {
		event.locals.db = env.DB;
		event.locals.env = env;

		const sessionId = event.cookies.get(SESSION_COOKIE);
		if (sessionId) {
			const user = await getSessionUser(env.DB, sessionId);
			if (user) {
				event.locals.user = user;
			} else {
				event.cookies.delete(SESSION_COOKIE, { path: '/' });
			}
		}
	}

	return resolve(event);
};
