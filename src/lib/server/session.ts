import type { User } from '$lib/types';
import { userFromRow } from '$lib/types';
import { bind, first, type Db } from './db';

export const SESSION_COOKIE = 'gym_session';
export const SESSION_LIFETIME_SECONDS = 60 * 60 * 24 * 90; // 90 days, matches PHP

function base64Url(bytes: Uint8Array): string {
	let str = '';
	for (const byte of bytes) str += String.fromCharCode(byte);
	return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Create a new session row and return the opaque session id. */
export async function createSession(db: Db, userId: number): Promise<string> {
	const id = base64Url(crypto.getRandomValues(new Uint8Array(32)));
	const expiresAt = new Date(Date.now() + SESSION_LIFETIME_SECONDS * 1000)
		.toISOString()
		.replace('T', ' ')
		.slice(0, 19);

	await bind(db, 'INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)', [
		id,
		userId,
		expiresAt
	]).run();

	return id;
}

/** Load the user for a session id, deleting the session when it has expired. */
export async function getSessionUser(db: Db, sessionId: string): Promise<User | null> {
	if (!sessionId) return null;

	const row = await first<Record<string, unknown>>(
		bind(
			db,
			`SELECT u.*, s.expires_at AS session_expires_at
			 FROM sessions s
			 JOIN users u ON u.id = s.user_id
			 WHERE s.id = ?`,
			[sessionId]
		)
	);

	if (!row) return null;

	const expiresAt = String(row.session_expires_at ?? '');
	if (expiresAt !== '' && Date.parse(expiresAt.replace(' ', 'T') + 'Z') < Date.now()) {
		await deleteSession(db, sessionId);
		return null;
	}

	return userFromRow(row);
}

export async function deleteSession(db: Db, sessionId: string): Promise<void> {
	await bind(db, 'DELETE FROM sessions WHERE id = ?', [sessionId]).run();
}

/** Delete sessions that expired long ago. Best-effort housekeeping. */
export async function pruneExpiredSessions(db: Db): Promise<void> {
	await bind(db, "DELETE FROM sessions WHERE expires_at < datetime('now', '-7 days')").run();
}

export function sessionCookieOptions(url: URL) {
	return {
		path: '/',
		httpOnly: true,
		secure: url.protocol === 'https:',
		sameSite: 'lax' as const,
		maxAge: SESSION_LIFETIME_SECONDS
	};
}
