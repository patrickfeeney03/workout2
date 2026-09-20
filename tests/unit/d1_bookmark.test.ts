import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import {
	D1_BOOKMARK_COOKIE,
	D1_BOOKMARK_LIFETIME_SECONDS,
	isD1SessionBookmark,
	serializeD1BookmarkCookie,
	startD1Session
} from '$lib/server/d1';

describe('D1 bookmark cookie', () => {
	it('accepts bookmark-shaped strings and rejects the rest', () => {
		expect(isD1SessionBookmark('0000002c-00000000-00000000-00000000')).toBe(true);
		expect(isD1SessionBookmark('a+b/c=d')).toBe(true);
		expect(isD1SessionBookmark('')).toBe(false);
		expect(isD1SessionBookmark('has space')).toBe(false);
		expect(isD1SessionBookmark('has;semicolon')).toBe(false);
		expect(isD1SessionBookmark('x'.repeat(257))).toBe(false);
		expect(isD1SessionBookmark(undefined)).toBe(false);
		expect(isD1SessionBookmark(42)).toBe(false);
	});

	it('serializes a Secure cookie on https', () => {
		expect(serializeD1BookmarkCookie('abc-123', new URL('https://gym.example.com/workouts'))).toBe(
			`${D1_BOOKMARK_COOKIE}=abc-123; Path=/; HttpOnly; SameSite=Lax; Max-Age=${D1_BOOKMARK_LIFETIME_SECONDS}; Secure`
		);
	});

	it('omits Secure on plain http (local dev)', () => {
		expect(serializeD1BookmarkCookie('abc-123', new URL('http://localhost:5173/'))).toBe(
			`${D1_BOOKMARK_COOKIE}=abc-123; Path=/; HttpOnly; SameSite=Lax; Max-Age=${D1_BOOKMARK_LIFETIME_SECONDS}`
		);
	});

	it('encodes values so the cookie matches what SvelteKit would set', () => {
		expect(serializeD1BookmarkCookie('a+b/c=', new URL('https://gym.example.com/'))).toContain(
			`${D1_BOOKMARK_COOKIE}=a%2Bb%2Fc%3D;`
		);
	});

	it('round-trips a bookmark through a real D1 session', async () => {
		const session = startD1Session(env.DB, undefined);
		const first = await session.prepare('SELECT 1 AS one').first<{ one: number }>();
		expect(first?.one).toBe(1);

		const bookmark = session.getBookmark();
		expect(isD1SessionBookmark(bookmark)).toBe(true);

		const resumed = startD1Session(env.DB, bookmark ?? undefined);
		const second = await resumed.prepare('SELECT 2 AS two').first<{ two: number }>();
		expect(second?.two).toBe(2);
		expect(isD1SessionBookmark(resumed.getBookmark())).toBe(true);
	});
});
