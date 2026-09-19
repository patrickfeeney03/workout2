import { fail, redirect } from '@sveltejs/kit';
import { authenticatePassword, isGoogleConfigured, safeNextPath } from '$lib/server/auth';
import { SESSION_COOKIE, createSession, sessionCookieOptions } from '$lib/server/session';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const next = safeNextPath(url.searchParams.get('next'));
	if (locals.user) throw redirect(303, next);

	const errorParam = url.searchParams.get('error');
	const error =
		errorParam === 'access_denied'
			? 'Access denied'
			: errorParam === 'oauth'
				? 'Google sign-in failed'
				: null;

	return {
		next,
		googleEnabled: isGoogleConfigured(locals.env ?? {}),
		error
	};
};

export const actions: Actions = {
	default: async ({ request, locals, url, cookies }) => {
		const form = await request.formData();
		const next = safeNextPath(String(form.get('next') ?? ''));
		const email = String(form.get('email') ?? '').trim();
		const password = String(form.get('password') ?? '');

		const user = await authenticatePassword(locals.db, email, password);
		if (user === null) {
			return fail(400, { error: 'Invalid credentials', next, email });
		}

		const sessionId = await createSession(locals.db, user.id);
		cookies.set(SESSION_COOKIE, sessionId, sessionCookieOptions(url));
		throw redirect(303, next);
	}
};
