import { redirect } from '@sveltejs/kit';
import {
	base64UrlEncode,
	buildGoogleAuthorizationUrl,
	generateCodeVerifier,
	isGoogleConfigured,
	safeNextPath
} from '$lib/server/auth';
import {
	OAUTH_NEXT_COOKIE,
	OAUTH_STATE_COOKIE,
	OAUTH_VERIFIER_COOKIE,
	oauthCookieOptions
} from '$lib/server/oauth';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, url, cookies }) => {
	if (!isGoogleConfigured(locals.env ?? {})) {
		throw redirect(303, '/login?error=oauth');
	}

	const next = safeNextPath(url.searchParams.get('next'));
	const state = base64UrlEncode(crypto.getRandomValues(new Uint8Array(16)));
	const verifier = generateCodeVerifier();

	const options = oauthCookieOptions(url);
	cookies.set(OAUTH_STATE_COOKIE, state, options);
	cookies.set(OAUTH_VERIFIER_COOKIE, verifier, options);
	cookies.set(OAUTH_NEXT_COOKIE, next, options);

	const authorizationUrl = await buildGoogleAuthorizationUrl(locals.env, url, state, verifier);
	throw redirect(302, authorizationUrl);
};
