export const OAUTH_STATE_COOKIE = 'gym_oauth_state';
export const OAUTH_VERIFIER_COOKIE = 'gym_oauth_verifier';
export const OAUTH_NEXT_COOKIE = 'gym_oauth_next';
export const OAUTH_COOKIE_MAX_AGE = 10 * 60;

export function oauthCookieOptions(url: URL) {
	return {
		path: '/',
		httpOnly: true,
		secure: url.protocol === 'https:',
		sameSite: 'lax' as const,
		maxAge: OAUTH_COOKIE_MAX_AGE
	};
}
