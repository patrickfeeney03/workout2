import { redirect } from '@sveltejs/kit';
import type { User } from '$lib/types';

/**
 * Port of PHP `require_user()`: bounce to /login with a `next` param when the
 * request has no valid session.
 */
export function requireUser(locals: App.Locals, url: URL): User {
	if (!locals.user) {
		const next = url.pathname + url.search;
		const suffix = next !== '/' ? `?next=${encodeURIComponent(next)}` : '';
		throw redirect(303, `/login${suffix}`);
	}
	return locals.user;
}
