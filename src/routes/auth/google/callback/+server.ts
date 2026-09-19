import { redirect } from '@sveltejs/kit';
import {
	EmailNotAllowedException,
	exchangeGoogleAuthorizationCode,
	findOrCreateGoogleUser,
	safeNextPath
} from '$lib/server/auth';
import { SESSION_COOKIE, createSession, sessionCookieOptions } from '$lib/server/session';
import {
	OAUTH_NEXT_COOKIE,
	OAUTH_STATE_COOKIE,
	OAUTH_VERIFIER_COOKIE
} from '$lib/server/oauth';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, url, cookies }) => {
	const clearOauthCookies = () => {
		const options = { path: '/' };
		cookies.delete(OAUTH_STATE_COOKIE, options);
		cookies.delete(OAUTH_VERIFIER_COOKIE, options);
		cookies.delete(OAUTH_NEXT_COOKIE, options);
	};

	let sessionId: string | null = null;
	let next = '/';
	let failure: 'access_denied' | 'oauth' | null = null;

	try {
		const state = url.searchParams.get('state') ?? '';
		const expected = cookies.get(OAUTH_STATE_COOKIE) ?? '';
		if (expected === '' || state !== expected) {
			throw new Error('Invalid OAuth state');
		}

		const code = url.searchParams.get('code') ?? '';
		if (code === '') throw new Error('Missing authorization code');

		const verifier = cookies.get(OAUTH_VERIFIER_COOKIE) ?? '';
		next = safeNextPath(cookies.get(OAUTH_NEXT_COOKIE));

		const info = await exchangeGoogleAuthorizationCode(locals.env, url, code, verifier);
		const user = await findOrCreateGoogleUser(
			locals.db,
			locals.env,
			info.sub,
			info.email,
			info.name
		);

		sessionId = await createSession(locals.db, user.id);
	} catch (error) {
		failure =
			error instanceof EmailNotAllowedException
				? 'access_denied'
				: 'oauth';
	}

	if (failure !== null) {
		clearOauthCookies();
		throw redirect(303, `/login?error=${failure}`);
	}

	if (sessionId !== null) {
		cookies.set(SESSION_COOKIE, sessionId, sessionCookieOptions(url));
	}

	clearOauthCookies();
	throw redirect(303, next);
};
