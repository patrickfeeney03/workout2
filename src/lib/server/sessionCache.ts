/**
 * Short-lived edge cache for the session → user lookup.
 *
 * Every request authenticates in `hooks.server.ts` before its route runs. That lookup is one D1
 * round trip; for a phone far from the primary it is a meaningful share of page latency, and each
 * navigation issues more than one request. The mapping changes rarely, so cache it per colo for a
 * minute instead of hitting D1 every time.
 *
 * Logout deletes the entry (see `routes/logout/+page.server.ts`); other colos expire within the
 * TTL, so a revoked session can be served for at most `SESSION_CACHE_TTL_SECONDS`. Invalid
 * sessions are never cached.
 *
 * `caches` and `ctx` are narrowed at runtime rather than typed: the Cloudflare adapter carries its
 * own copy of `@cloudflare/workers-types`, which is not nominally compatible with the root copy.
 */

import type { User } from '$lib/types';
import type { Db } from './db';
import { getSessionUser } from './session';

export const SESSION_CACHE_TTL_SECONDS = 60;

interface EdgeCache {
	match(key: Request): Promise<Response | undefined>;
	put(key: Request, response: Response): Promise<void>;
	delete(key: Request): Promise<boolean>;
}

function resolveCache(caches: unknown): EdgeCache | undefined {
	const candidate = (caches as { default?: unknown } | undefined)?.default;
	if (
		candidate &&
		typeof (candidate as EdgeCache).match === 'function' &&
		typeof (candidate as EdgeCache).put === 'function'
	) {
		return candidate as EdgeCache;
	}
	return undefined;
}

function resolveWaitUntil(ctx: unknown): ((promise: Promise<unknown>) => void) | undefined {
	const waitUntil = (ctx as { waitUntil?: unknown } | undefined)?.waitUntil;
	return typeof waitUntil === 'function'
		? (waitUntil as (promise: Promise<unknown>) => void).bind(ctx)
		: undefined;
}

export function sessionCacheKey(sessionId: string): Request {
	return new Request(
		`https://session-cache.gym-tracker.invalid/${encodeURIComponent(sessionId)}`
	);
}

export async function getCachedSessionUser(
	db: Db,
	caches: unknown,
	ctx: unknown,
	sessionId: string
): Promise<User | null> {
	const cache = resolveCache(caches);
	if (!cache) {
		return getSessionUser(db, sessionId);
	}

	const key = sessionCacheKey(sessionId);
	const hit = await cache.match(key);
	if (hit) {
		return (await hit.json()) as User;
	}

	const user = await getSessionUser(db, sessionId);
	if (user) {
		const response = new Response(JSON.stringify(user), {
			headers: {
				'content-type': 'application/json',
				'cache-control': `max-age=${SESSION_CACHE_TTL_SECONDS}`
			}
		});
		resolveWaitUntil(ctx)?.call(null, cache.put(key, response));
	}
	return user;
}

export async function invalidateSessionCache(caches: unknown, sessionId: string): Promise<void> {
	await resolveCache(caches)?.delete(sessionCacheKey(sessionId));
}
