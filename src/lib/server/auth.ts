import * as bcrypt from 'bcryptjs';
import type { User } from '$lib/types';
import { userFromRow } from '$lib/types';
import { bind, first, insertId, type Db } from './db';

export const STUB_ADMIN_EMAIL = 'admin@example.com';

const PBKDF2_ITERATIONS = 600_000;
const PBKDF2_SALT_BYTES = 16;
const PBKDF2_KEY_BYTES = 32;
const PBKDF2_PREFIX = 'pbkdf2$sha256$';

export class EmailNotAllowedException extends Error {
	constructor(message = 'Email is not allowed') {
		super(message);
		this.name = 'EmailNotAllowedException';
	}
}

// ---------------------------------------------------------------------------
// Base64url helpers
// ---------------------------------------------------------------------------

export function base64UrlEncode(bytes: Uint8Array | ArrayBuffer): string {
	const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
	let str = '';
	for (const byte of view) str += String.fromCharCode(byte);
	return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(value: string): Uint8Array {
	const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
	const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
	const raw = atob(padded);
	const bytes = new Uint8Array(raw.length);
	for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
	return bytes;
}

// ---------------------------------------------------------------------------
// Passwords
// ---------------------------------------------------------------------------

/** PBKDF2-SHA256 hash with format: pbkdf2$sha256$<iterations>$<salt>$<hash> */
export async function hashPassword(password: string): Promise<string> {
	const salt = crypto.getRandomValues(new Uint8Array(PBKDF2_SALT_BYTES));
	const key = await deriveKey(password, salt, PBKDF2_ITERATIONS);
	return `${PBKDF2_PREFIX}${PBKDF2_ITERATIONS}$${base64UrlEncode(salt)}$${base64UrlEncode(key)}`;
}

async function deriveKey(
	password: string,
	salt: Uint8Array,
	iterations: number
): Promise<Uint8Array> {
	const material = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(password),
		'PBKDF2',
		false,
		['deriveBits']
	);
	const bits = await crypto.subtle.deriveBits(
		{ name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
		material,
		PBKDF2_KEY_BYTES * 8
	);
	return new Uint8Array(bits);
}

export interface VerifyResult {
	ok: boolean;
	needsRehash: boolean;
}

/** Verify a stored password hash, supporting legacy PHP bcrypt hashes. */
export async function verifyPassword(stored: string, password: string): Promise<VerifyResult> {
	if (stored === '' || password === '') return { ok: false, needsRehash: false };

	if (stored.startsWith(PBKDF2_PREFIX)) {
		const parts = stored.split('$');
		if (parts.length !== 5) return { ok: false, needsRehash: false };
		const iterations = Number(parts[2]);
		if (!Number.isFinite(iterations) || iterations <= 0) {
			return { ok: false, needsRehash: false };
		}
		const salt = base64UrlDecode(parts[3]);
		const expected = base64UrlDecode(parts[4]);
		const actual = await deriveKey(password, salt, iterations);
		const ok = timingSafeEqual(actual, expected);
		return { ok, needsRehash: ok && iterations < PBKDF2_ITERATIONS };
	}

	if (stored.startsWith('$2a$') || stored.startsWith('$2b$') || stored.startsWith('$2y$')) {
		let ok = false;
		try {
			ok = bcrypt.compareSync(password, stored);
		} catch {
			ok = false;
		}
		return { ok, needsRehash: ok };
	}

	return { ok: false, needsRehash: false };
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
	return diff === 0;
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

/** Bindings needed for the email allowlist. The Google keys are included so
 * the generated Cloudflare.Env interface stays structurally assignable. */
export interface AllowlistEnv {
	ALLOWED_EMAILS?: string;
	GOOGLE_ALLOWED_EMAILS?: string;
	GOOGLE_CLIENT_ID?: string;
	GOOGLE_CLIENT_SECRET?: string;
	GOOGLE_REDIRECT_URI?: string;
}

export function getAllowedEmails(env: AllowlistEnv): string[] {
	const raw = (env.ALLOWED_EMAILS?.trim() || env.GOOGLE_ALLOWED_EMAILS?.trim() || '');
	if (raw === '') return [];
	return raw
		.split(',')
		.map((email) => email.trim().toLowerCase())
		.filter((email) => email !== '');
}

export function isEmailAllowed(env: AllowlistEnv, email: string): boolean {
	return getAllowedEmails(env).includes(email.trim().toLowerCase());
}

export async function findUserById(db: Db, id: number): Promise<User | null> {
	const row = await first<Record<string, unknown>>(bind(db, 'SELECT * FROM users WHERE id = ?', [id]));
	return row ? userFromRow(row) : null;
}

export async function findUserByEmail(db: Db, email: string): Promise<User | null> {
	const normalized = email.trim().toLowerCase();
	if (normalized === '') return null;
	const row = await first<Record<string, unknown>>(
		bind(db, 'SELECT * FROM users WHERE lower(email) = ?', [normalized])
	);
	return row ? userFromRow(row) : null;
}

export async function findUserByGoogleSub(db: Db, googleSub: string): Promise<User | null> {
	if (googleSub === '') return null;
	const row = await first<Record<string, unknown>>(
		bind(db, 'SELECT * FROM users WHERE google_sub = ?', [googleSub])
	);
	return row ? userFromRow(row) : null;
}

export async function authenticatePassword(
	db: Db,
	email: string,
	password: string,
	options: { allowUserIdOne?: boolean } = {}
): Promise<User | null> {
	const normalized = email.trim().toLowerCase();
	let user: User | null = null;

	if (normalized !== '') {
		user = await findUserByEmail(db, normalized);
	} else if (options.allowUserIdOne) {
		user = await findUserById(db, 1);
	}

	if (user === null || user.passwordHash === null) return null;

	const result = await verifyPassword(user.passwordHash, password);
	if (!result.ok) return null;

	if (result.needsRehash) {
		const rehashed = await hashPassword(password);
		await bind(db, 'UPDATE users SET password_hash = ? WHERE id = ?', [rehashed, user.id]).run();
		user = { ...user, passwordHash: rehashed };
	}

	return user;
}

export async function findOrCreateGoogleUser(
	db: Db,
	env: AllowlistEnv,
	googleSub: string,
	email: string,
	name: string
): Promise<User> {
	const normalizedEmail = email.trim().toLowerCase();
	let normalizedName = name.trim();
	if (normalizedName === '') normalizedName = normalizedEmail !== '' ? normalizedEmail : 'User';

	if (!isEmailAllowed(env, normalizedEmail)) {
		throw new EmailNotAllowedException('Email is not allowed');
	}

	const bySub = await findUserByGoogleSub(db, googleSub);
	if (bySub !== null) return bySub;

	const byEmail = await findUserByEmail(db, normalizedEmail);
	if (byEmail !== null) {
		await bind(db, 'UPDATE users SET google_sub = ? WHERE id = ?', [googleSub, byEmail.id]).run();
		return requireUserById(db, byEmail.id);
	}

	const user1 = await findUserById(db, 1);
	if (user1 !== null) {
		const user1Email = (user1.email ?? '').trim().toLowerCase();
		const isStub =
			user1Email === '' ||
			user1Email === STUB_ADMIN_EMAIL ||
			user1Email === normalizedEmail;
		if (isStub) {
			await bind(db, 'UPDATE users SET email = ?, name = ?, google_sub = ? WHERE id = 1', [
				normalizedEmail,
				normalizedName,
				googleSub
			]).run();
			return requireUserById(db, 1);
		}
	}

	const id = await insertId(
		bind(db, 'INSERT INTO users (name, email, google_sub) VALUES (?, ?, ?)', [
			normalizedName,
			normalizedEmail,
			googleSub
		])
	);

	return requireUserById(db, id);
}

async function requireUserById(db: Db, id: number): Promise<User> {
	const user = await findUserById(db, id);
	if (user === null) throw new Error('User not found after write');
	return user;
}

// ---------------------------------------------------------------------------
// Google OAuth (PKCE)
// ---------------------------------------------------------------------------

export function isGoogleConfigured(env: {
	GOOGLE_CLIENT_ID?: string;
	GOOGLE_CLIENT_SECRET?: string;
}): boolean {
	return (env.GOOGLE_CLIENT_ID ?? '').trim() !== '' && (env.GOOGLE_CLIENT_SECRET ?? '').trim() !== '';
}

export function googleRedirectUri(env: { GOOGLE_REDIRECT_URI?: string }, url: URL): string {
	const configured = (env.GOOGLE_REDIRECT_URI ?? '').trim();
	if (configured !== '') return configured;
	return `${url.origin}/auth/google/callback`;
}

export function generateCodeVerifier(): string {
	return base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)));
}

export async function codeChallenge(verifier: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
	return base64UrlEncode(digest);
}

export async function buildGoogleAuthorizationUrl(
	env: { GOOGLE_CLIENT_ID?: string; GOOGLE_REDIRECT_URI?: string },
	url: URL,
	state: string,
	verifier: string
): Promise<string> {
	const params = new URLSearchParams({
		client_id: (env.GOOGLE_CLIENT_ID ?? '').trim(),
		redirect_uri: googleRedirectUri(env, url),
		response_type: 'code',
		scope: 'openid email profile',
		state,
		code_challenge: await codeChallenge(verifier),
		code_challenge_method: 'S256'
	});
	return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export interface GoogleUserInfo {
	sub: string;
	email: string;
	name: string;
}

export async function exchangeGoogleAuthorizationCode(
	env: { GOOGLE_CLIENT_ID?: string; GOOGLE_CLIENT_SECRET?: string; GOOGLE_REDIRECT_URI?: string },
	url: URL,
	code: string,
	verifier: string
): Promise<GoogleUserInfo> {
	const tokenPayload = new URLSearchParams({
		code,
		client_id: (env.GOOGLE_CLIENT_ID ?? '').trim(),
		client_secret: (env.GOOGLE_CLIENT_SECRET ?? '').trim(),
		redirect_uri: googleRedirectUri(env, url),
		grant_type: 'authorization_code',
		code_verifier: verifier
	});

	const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: tokenPayload.toString()
	});
	const token = (await tokenResponse.json().catch(() => null)) as {
		access_token?: string;
	} | null;
	if (!tokenResponse.ok || !token?.access_token) {
		throw new Error('Failed to exchange authorization code');
	}

	const userinfoResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
		headers: { Authorization: `Bearer ${token.access_token}` }
	});
	const userinfo = (await userinfoResponse.json().catch(() => null)) as {
		sub?: string;
		email?: string;
		name?: string;
	} | null;
	if (!userinfoResponse.ok || !userinfo?.sub || !userinfo?.email) {
		throw new Error('Failed to fetch Google user info');
	}

	return {
		sub: String(userinfo.sub),
		email: String(userinfo.email),
		name: String(userinfo.name ?? '')
	};
}

/**
 * Sanitize the post-login redirect. Only same-origin paths are allowed;
 * anything else (empty, off-site, header injection) becomes /.
 */
export function safeNextPath(next: string | null | undefined): string {
	const fallback = '/';
	if (next === null || next === undefined || next === '') return fallback;
	if (next.includes('\r') || next.includes('\n')) return fallback;
	if (next.startsWith('//')) return fallback;
	if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(next)) return fallback;
	if (!next.startsWith('/')) return fallback;
	if (next.startsWith('/login') || next.startsWith('/logout') || next.startsWith('/auth/')) {
		return fallback;
	}
	return next;
}
