import type { Handle, RequestEvent } from '@sveltejs/kit';
import { SESSION_COOKIE, getSessionUser } from '$lib/server/session';
import {
	D1_BOOKMARK_COOKIE,
	d1BookmarkCookieOptions,
	serializeD1BookmarkCookie,
	startD1Session
} from '$lib/server/d1';

/**
 * Attach a D1 session to every request, then persist its bookmark in a cookie so the next request
 * may read from any replica that is at least as fresh as everything this browser has seen. A write
 * advances the bookmark past the write on the primary; the following page load can use a replica
 * without losing read-after-write consistency. See `$lib/server/d1`.
 */
export const handle: Handle = async ({ event, resolve }) => {
	const env = event.platform?.env;
	event.locals.user = null;

	if (!env?.DB) {
		return resolve(event);
	}

	const previousBookmark = event.cookies.get(D1_BOOKMARK_COOKIE);
	const session = startD1Session(env.DB, previousBookmark);
	event.locals.db = session;
	event.locals.env = env;

	const sessionId = event.cookies.get(SESSION_COOKIE);
	if (sessionId) {
		const user = await getSessionUser(session, sessionId);
		if (user) {
			event.locals.user = user;
		} else {
			event.cookies.delete(SESSION_COOKIE, { path: '/' });
		}
	}

	try {
		const response = await resolve(event);
		persistBookmark(event, session, previousBookmark, response);
		return response;
	} catch (error) {
		// Redirects thrown by actions/endpoints surface here. SvelteKit serializes the cookies
		// queued through `event.cookies` when it turns the throw into a response, so queue the
		// bookmark before rethrowing; the success path appends it to the response directly instead.
		persistBookmark(event, session, previousBookmark);
		throw error;
	}
};

function persistBookmark(
	event: RequestEvent,
	session: D1DatabaseSession,
	previousBookmark: string | undefined,
	response?: Response
): void {
	const bookmark = session.getBookmark();
	if (!bookmark || bookmark === previousBookmark) return;
	if (response) {
		response.headers.append('set-cookie', serializeD1BookmarkCookie(bookmark, event.url));
	} else {
		event.cookies.set(D1_BOOKMARK_COOKIE, bookmark, d1BookmarkCookieOptions(event.url));
	}
}
