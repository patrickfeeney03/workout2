#!/usr/bin/env node
/**
 * Set (or reset) a user's password in the D1 database.
 *
 * Usage:
 *   node scripts/set-password.mjs --email you@example.com [--remote] [--name "Your Name"]
 *   node scripts/set-password.mjs --id 1 [--email you@example.com] [--name "Your Name"] [--remote]
 *
 *   --id targets the row by id and can also set its email/name (handy for the
 *   local stub user 1, which starts with a NULL email).
 *
 * Prompts for the password twice (never pass it as an argument). Writes a
 * PBKDF2-SHA256 hash in the same format as src/lib/server/auth.ts. Uses
 * `wrangler d1 execute`, so run it from the gym-web directory.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';

const PBKDF2_ITERATIONS = 600_000;
const PBKDF2_SALT_BYTES = 16;
const PBKDF2_KEY_BYTES = 32;

const args = process.argv.slice(2);
const getFlag = (name) => {
	const index = args.indexOf(name);
	return index === -1 ? null : (args[index + 1] ?? '');
};
const scoped = args.includes('--remote') ? '--remote' : '--local';
const email = getFlag('--email');
const id = getFlag('--id');
const name = getFlag('--name');

if (!email && !id) {
	console.error(
		'Usage: node scripts/set-password.mjs --email you@example.com [--remote] [--name "Your Name"]' +
			'\n   or: node scripts/set-password.mjs --id 1 [--email you@example.com] [--remote] [--name "Your Name"]'
	);
	process.exit(1);
}

if (id && !/^\d+$/.test(id)) {
	console.error('--id must be a positive integer');
	process.exit(1);
}

// Password input: hidden prompt on a TTY, one line per prompt when piped
// (so it can be scripted: `printf 'pw\npw\n' | node scripts/set-password.mjs ...`).
const pipedLines = process.stdin.isTTY ? null : readFileSync(0, 'utf8').split(/\r?\n/);
let pipedIndex = 0;

function ask(question) {
	if (pipedLines !== null) {
		process.stdout.write(question);
		const answer = (pipedLines[pipedIndex++] ?? '').trim();
		process.stdout.write('\n');
		return Promise.resolve(answer);
	}

	return new Promise((resolve) => {
		process.stdout.write(question);
		process.stdin.setRawMode(true);
		process.stdin.resume();
		const chunks = [];

		const finish = () => {
			process.stdin.removeListener('data', onData);
			process.stdin.setRawMode(false);
			process.stdin.pause();
			process.stdout.write('\n');
			resolve(chunks.join(''));
		};

		const onData = (chunk) => {
			const char = chunk.toString('utf8');
			if (char === '\n' || char === '\r' || char === '\u0004') {
				finish();
			} else if (char === '\u0003') {
				process.stdin.setRawMode(false);
				process.stdout.write('\n');
				process.exit(130);
			} else if (char === '\u007f' || char === '\b') {
				chunks.pop();
			} else {
				chunks.push(char);
			}
		};

		process.stdin.on('data', onData);
	});
}

function base64UrlEncode(bytes) {
	return Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hashPassword(password) {
	const salt = webcrypto.getRandomValues(new Uint8Array(PBKDF2_SALT_BYTES));
	const material = await webcrypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(password),
		'PBKDF2',
		false,
		['deriveBits']
	);
	const bits = await webcrypto.subtle.deriveBits(
		{ name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
		material,
		PBKDF2_KEY_BYTES * 8
	);
	return `pbkdf2$sha256$${PBKDF2_ITERATIONS}$${base64UrlEncode(salt)}$${base64UrlEncode(new Uint8Array(bits))}`;
}

function sqlString(value) {
	return `'${String(value).replace(/'/g, "''")}'`;
}

const password = await ask('Password: ');
const confirmation = await ask('Repeat password: ');

if (password.length < 8) {
	console.error('Password must be at least 8 characters.');
	process.exit(1);
}
if (password !== confirmation) {
	console.error('Passwords do not match.');
	process.exit(1);
}

const normalizedEmail = email ? email.trim().toLowerCase() : null;
const hash = await hashPassword(password);
const setName = name && name.trim() !== '' ? `, name = ${sqlString(name.trim())}` : '';
const setEmail =
	id && email && email.trim() !== '' ? `, email = ${sqlString(email.trim().toLowerCase())}` : '';
const where =
	id !== null && id !== ''
		? `id = ${Number(id)}`
		: `lower(email) = ${sqlString(email.trim().toLowerCase())}`;
const sql = `UPDATE users SET password_hash = ${sqlString(hash)}${setEmail}${setName} WHERE ${where}`;

function runJson(args) {
	const output = execFileSync('npx', args, {
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'inherit']
	});
	const start = output.indexOf('[');
	if (start === -1) {
		throw new Error(`unexpected wrangler output:\n${output}`);
	}
	return JSON.parse(output.slice(start));
}

try {
	runJson([
		'wrangler',
		'd1',
		'execute',
		'gym-tracker-weur',
		scoped,
		'--json',
		'--command',
		sql
	]);
} catch (error) {
	console.error('wrangler d1 execute failed');
	console.error(error.stderr || error.message);
	process.exit(1);
}

// Verify by reading the row back: local D1 omits meta.changes, so a
// post-update SELECT is the only reliable check on both targets.
let updated = null;
try {
	const rows = runJson([
		'wrangler',
		'd1',
		'execute',
		'gym-tracker-weur',
		scoped,
		'--json',
		'--command',
		`SELECT id, email FROM users WHERE ${where}`
	])?.[0]?.results;
	updated = rows?.[0] ?? null;
} catch {
	// Fall through to the not-found error below.
}

if (updated === null) {
	const target = normalizedEmail !== null ? `email ${normalizedEmail}` : `id ${id}`;
	console.error(`\nNo user matched ${target} in the ${scoped.replace('--', '')} database.`);
	console.error('Create/claim the user first, then retry:');
	console.error('  - Google login as the allowlisted email (claims stub user 1 if its email is empty), or');
	console.error('  - claim the stub row directly:');
	console.error(`      node scripts/set-password.mjs --id 1 --email you@example.com ${scoped}`);
	console.error('  - or insert the user row with wrangler d1 execute');
	process.exit(1);
}

const targetLabel = updated.email ?? `user id ${updated.id}`;
console.log(`\nPassword updated for ${targetLabel} (${scoped.replace('--', '')}).`);
