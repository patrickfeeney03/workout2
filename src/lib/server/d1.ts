/**
 * D1 Sessions API plumbing.
 *
 * With read replication enabled, reads can be served by the database instance nearest the Worker
 * (with targeted placement in `wrangler.jsonc` that is the primary). A replica is asynchronously
 * updated, so a request that just saw a write must not read from a replica that has not caught up.
 * The Sessions API gives every request sequential consistency, and the bookmark returned by a
 * session lets the next request state "start at least this fresh" when it resumes on a replica.
 *
 * The bookmark lives in a cookie. Its name carries a version because bookmarks belong to one
 * database: when the `DB` binding is repointed at a replacement database the old cookie must be
 * ignored, so bump the version (see docs/REGIONAL-PERFORMANCE.md).
 */

export const D1_BOOKMARK_COOKIE = 'gym_d1_bookmark_v1';

/**
 * D1 documents bookmarks as valid for at least 24 hours. Keeping the cookie for a day preserves
 * read-your-writes across a browser session without pinning a stale bookmark indefinitely.
 */
export const D1_BOOKMARK_LIFETIME_SECONDS = 60 * 60 * 24;

/** Bookmarks are opaque, but URL/header-safe; reject anything that does not look like one. */
const BOOKMARK_PATTERN = /^[A-Za-z0-9._~+/=-]{1,256}$/;

export function isD1SessionBookmark(value: unknown): value is string {
	return typeof value === 'string' && BOOKMARK_PATTERN.test(value);
}

/**
 * Start a request-scoped session from the browser's bookmark, or unconstrained when the cookie is
 * absent or invalid. Unconstrained lets D1 pick the nearest instance for the first query — primary
 * or replica, whichever the Worker's location makes closest; the bookmark written back after every
 * request keeps later requests read-your-writes.
 */
export function startD1Session(db: D1Database, bookmark: string | undefined): D1DatabaseSession {
	return db.withSession(isD1SessionBookmark(bookmark) ? bookmark : 'first-unconstrained');
}

export function d1BookmarkCookieOptions(url: URL) {
	return {
		path: '/',
		httpOnly: true,
		secure: url.protocol === 'https:',
		sameSite: 'lax' as const,
		maxAge: D1_BOOKMARK_LIFETIME_SECONDS
	};
}

/**
 * Same cookie as `d1BookmarkCookieOptions`, serialized by hand. Needed on the success path of the
 * `handle` hook, where SvelteKit has already copied the `event.cookies` it knows about onto the
 * response before the hook can inspect the session's final bookmark.
 */
export function serializeD1BookmarkCookie(bookmark: string, url: URL): string {
	const parts = [
		`${D1_BOOKMARK_COOKIE}=${encodeURIComponent(bookmark)}`,
		'Path=/',
		'HttpOnly',
		'SameSite=Lax',
		`Max-Age=${D1_BOOKMARK_LIFETIME_SECONDS}`
	];
	if (url.protocol === 'https:') parts.push('Secure');
	return parts.join('; ');
}
