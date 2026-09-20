import type { Row } from '$lib/types';

/**
 * Thin helpers around the D1 API. Services accept a `Db` explicitly so tests can inject an isolated
 * database. `Db` is a plain D1Database or a D1DatabaseSession (see `$lib/server/d1`); both expose
 * `prepare()` and `batch()`, and a session adds sequential consistency on top of read replicas.
 */
export type Db = D1Database | D1DatabaseSession;
export type Stmt = D1PreparedStatement;

export function bind(db: Db, sql: string, values: unknown[] = []): D1PreparedStatement {
	const stmt = db.prepare(sql);
	return values.length > 0 ? stmt.bind(...values) : stmt;
}

/** Run a query and return the first row (or null). */
export async function first<T = Row>(stmt: D1PreparedStatement): Promise<T | null> {
	const row = await stmt.first<T>();
	return row ?? null;
}

/** Run a query and return all rows as an array. */
export async function allRows<T = Row>(stmt: D1PreparedStatement): Promise<T[]> {
	const result = await stmt.all<T>();
	return (result.results ?? []) as T[];
}

/** Run a statement, returning its raw result (meta included). */
export async function run(stmt: D1PreparedStatement): Promise<D1Result> {
	return stmt.run();
}

/** Run an insert and return `last_row_id`. */
export async function insertId(stmt: D1PreparedStatement): Promise<number> {
	const result = await stmt.run();
	return Number(result.meta.last_row_id ?? 0);
}

/** Run an update/delete and return the number of changed rows. */
export async function changedRows(stmt: D1PreparedStatement): Promise<number> {
	const result = await stmt.run();
	return Number(result.meta.changes ?? 0);
}

/** Convenience: prepare + return all rows in one call. */
export async function selectAll<T = Row>(
	db: Db,
	sql: string,
	values: unknown[] = []
): Promise<T[]> {
	return allRows<T>(bind(db, sql, values));
}

/** Convenience: prepare + return first row in one call. */
export async function selectOne<T = Row>(
	db: Db,
	sql: string,
	values: unknown[] = []
): Promise<T | null> {
	return first<T>(bind(db, sql, values));
}

/** Split an array into chunks (used to keep D1 statements small). */
export function chunk<T>(items: T[], size: number): T[][] {
	const out: T[][] = [];
	for (let i = 0; i < items.length; i += size) {
		out.push(items.slice(i, i + size));
	}
	return out;
}

/**
 * D1 caps bound parameters per statement (100), so `IN (...)` lists stay below that. Every
 * set-based lookup chunks on this value.
 */
export const IN_CLAUSE_CHUNK = 90;

/** `?, ?, ?` placeholder list for an `IN (...)` clause. */
export function placeholders(count: number): string {
	return new Array(count).fill('?').join(', ');
}

/** ISO timestamp in the shape SQLite CURRENT_TIMESTAMP uses (UTC, seconds). */
export function nowSql(): string {
	return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

/** Current date as YYYY-MM-DD (UTC). */
export function todaySql(): string {
	return new Date().toISOString().slice(0, 10);
}
