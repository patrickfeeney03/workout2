import { describe, expect, it } from 'vitest';
import {
	EmailNotAllowedException,
	STUB_ADMIN_EMAIL,
	authenticatePassword,
	findOrCreateGoogleUser,
	getAllowedEmails,
	isEmailAllowed,
	safeNextPath,
	verifyPassword
} from '$lib/server/auth';
import { getDb, queryOne, seedUser } from '../support/fixtures';

/**
 * Valid PHP-style bcrypt hash (cost 12, `$2y$`) for "secret-pass". bcryptjs and
 * PHP share the same hash/verify semantics, so `verifyPassword` must accept it.
 */
const PHP_BCRYPT_HASH = '$2y$12$LouUBLy.RajUqphjOJJtvulwF5axBZ5KOEOB96NhMxCMJcZCTY.PG';

// Port of tests/unit/auth_service_test.php
describe('auth service', () => {
	it('getAllowedEmails trims, lowercases, and drops empty values', () => {
		expect(getAllowedEmails({ ALLOWED_EMAILS: ' Alice@Example.com, ,bob@test.com ' })).toEqual([
			'alice@example.com',
			'bob@test.com'
		]);
	});

	it('getAllowedEmails falls back to GOOGLE_ALLOWED_EMAILS', () => {
		expect(getAllowedEmails({ GOOGLE_ALLOWED_EMAILS: 'Pat@Example.com' })).toEqual(['pat@example.com']);
	});

	it('isEmailAllowed matches allowlisted emails case-insensitively', () => {
		const env = { ALLOWED_EMAILS: 'alice@example.com' };
		expect(isEmailAllowed(env, 'Alice@Example.com')).toBe(true);
		expect(isEmailAllowed(env, 'other@example.com')).toBe(false);
	});

	it('safeNextPath rejects protocol-relative and absolute URLs', () => {
		expect(safeNextPath('//evil')).toBe('/');
		expect(safeNextPath('http://evil.example')).toBe('/');
		expect(safeNextPath('/gym/workout.php')).toBe('/gym/workout.php');
	});

	it('safeNextPath rejects control characters, schemes, and non-absolute paths', () => {
		expect(safeNextPath('/gym/\r\nSet-Cookie: x')).toBe('/');
		expect(safeNextPath('/gym/x\ninjected')).toBe('/');
		expect(safeNextPath('javascript:alert(1)')).toBe('/');
		expect(safeNextPath('relative/path')).toBe('/');
		expect(safeNextPath('')).toBe('/');
		expect(safeNextPath(null)).toBe('/');
	});

	it('findOrCreateGoogleUser denies emails that are not allowed', async () => {
		const db = getDb();
		await expect(
			findOrCreateGoogleUser(
				db,
				{ ALLOWED_EMAILS: 'allowed@example.com' },
				'sub-1',
				'denied@example.com',
				'Nope'
			)
		).rejects.toBeInstanceOf(EmailNotAllowedException);
	});

	it('findOrCreateGoogleUser attaches allowlisted email to user 1 stub', async () => {
		const db = getDb();
		await seedUser({ id: 1, name: 'Test User', email: STUB_ADMIN_EMAIL });

		const user = await findOrCreateGoogleUser(
			db,
			{ ALLOWED_EMAILS: 'newuser@example.com' },
			'google-sub-123',
			'NewUser@example.com',
			'New User'
		);
		expect(user.id).toBe(1);
		expect(user.email).toBe('newuser@example.com');
		expect(user.name).toBe('New User');
		expect(user.googleSub).toBe('google-sub-123');
	});

	it('findOrCreateGoogleUser finds by google_sub on second call', async () => {
		const db = getDb();
		await seedUser({ id: 1, name: 'Test User', email: STUB_ADMIN_EMAIL });
		const env = { ALLOWED_EMAILS: 'repeat@example.com' };

		const first = await findOrCreateGoogleUser(db, env, 'sub-repeat', 'repeat@example.com', 'Repeat User');
		const second = await findOrCreateGoogleUser(db, env, 'sub-repeat', 'repeat@example.com', 'Changed Name');
		expect(second.id).toBe(first.id);
		expect(second.googleSub).toBe('sub-repeat');
		expect(second.name).toBe('Repeat User');
	});

	it('authenticatePassword verifies a known bcrypt password hash', async () => {
		const db = getDb();
		await seedUser({ id: 1, name: 'Test User', email: 'login@example.com', passwordHash: PHP_BCRYPT_HASH });

		const verified = await verifyPassword(PHP_BCRYPT_HASH, 'secret-pass');
		expect(verified.ok).toBe(true);
		expect(verified.needsRehash).toBe(true);

		const user = await authenticatePassword(db, 'LOGIN@example.com', 'secret-pass');
		expect(user?.id).toBe(1);
		expect(await authenticatePassword(db, 'login@example.com', 'wrong')).toBeNull();
	});

	it('authenticatePassword upgrades a legacy bcrypt hash to pbkdf2', async () => {
		const db = getDb();
		await seedUser({ id: 1, name: 'Test User', email: 'login@example.com', passwordHash: PHP_BCRYPT_HASH });

		const before = await queryOne<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = 1');
		const user = await authenticatePassword(db, 'login@example.com', 'secret-pass');
		const after = await queryOne<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = 1');

		expect(user).not.toBeNull();
		expect(after?.password_hash).not.toBe(before?.password_hash);
		expect(after?.password_hash?.startsWith('pbkdf2$sha256$')).toBe(true);
		expect((await verifyPassword(after?.password_hash ?? '', 'secret-pass')).ok).toBe(true);
		expect((await verifyPassword(after?.password_hash ?? '', 'wrong')).ok).toBe(false);
	});
});
