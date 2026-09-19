/**
 * Ported from src/Service/PeriodizationService.php.
 *
 * Exports: WEEK_TYPES, WEEK_NUMBERS, CreateTrainingBlockInput, TrainingBlockInput,
 * CreateBlockWeekInput, BlockWeekInput, getBlockWeek, createTrainingBlock, updateBlockName,
 * updateBlockStartDate, updateBlockEndDate, updateBlockNotes, createBlockWeek, updateTrainingBlock,
 * deleteWeek, updateBlockWeek, deleteTrainingBlock, getTrainingBlocks, getWeeksByBlock,
 * getTrainingBlock, getBlockWeeks, getBlockWeeksForBlockDesc, getNextWeekNumber, nextWeekNumberFor.
 *
 * Shape notes:
 * - `getWeeksByBlock` mirrors the PHP grouping exactly: an object keyed by `trainingBlockId`
 *   whose values are the (non-deleted, owned) `BlockWeek` rows, i.e. `Record<number, BlockWeek[]>`.
 * - `getBlockWeek` returns `null` where PHP returns `false`; `getBlockWeeksForBlockDesc` maps the
 *   raw PHP assoc rows through `blockWeekFromRow` so callers get typed `BlockWeek[]`.
 * - `createBlockWeek` returns the new week id, or `0` when the target block is not owned by the
 *   user (PHP uses `INSERT ... SELECT ... RETURNING id` for the same ownership guard).
 *
 * D1 notes: `deleteTrainingBlock` replaces the PHP transaction with a single atomic
 * `db.batch([...])`. PHP's `createTrainingBlock` only inserts the block row (it does not create a
 * first week); this port keeps that SQL, but returns `last_row_id` instead of void.
 */

import { allRows, bind, first, insertId, run, type Db } from '$lib/server/db';
import {
	blockWeekFromRow,
	reqInt,
	trainingBlockFromRow,
	type BlockWeek,
	type Row,
	type TrainingBlock
} from '$lib/types';

/** Week type values accepted by the UI (`PeriodizationService::WEEK_TYPES`). */
export const WEEK_TYPES = ['Intro', 'Base', 'Shock', 'Deload'] as const;

/** Week numbers accepted by the UI (`PeriodizationService::WEEK_NUMBERS`). */
export const WEEK_NUMBERS = [1, 2, 3, 4] as const;

/** Form-shaped input for `createTrainingBlock` (mirrors `$_POST` keys `name`, `start_date`, ...). */
export interface CreateTrainingBlockInput {
	readonly name: string;
	readonly startDate?: string | null;
	readonly endDate?: string | null;
	readonly notes?: string | null;
}

/** Form-shaped input for `updateTrainingBlock` (`$_POST['name']`, `start_date`, `end_date`, `notes`). */
export interface TrainingBlockInput {
	readonly name: string;
	readonly startDate?: string | null;
	readonly endDate?: string | null;
	readonly notes?: string | null;
}

/** Form-shaped input for `createBlockWeek` (mirrors `$_POST` keys `training_block_id`, ...). */
export interface CreateBlockWeekInput {
	readonly trainingBlockId: number;
	readonly weekNumber: number;
	readonly weekType?: string | null;
	readonly startsOn?: string | null;
	readonly endsOn?: string | null;
	readonly notes?: string | null;
}

/**
 * Partial row update for `updateBlockWeek`. The keys mirror the PHP `array $data` argument, which
 * is `$_POST` passed wholesale, so they are column names (`week_number`, `starts_on`, ...). Only the
 * keys listed in PHP's `$allowed` array are applied; unknown keys (e.g. `action`, `week_id`) are
 * ignored via the index signature.
 */
export interface BlockWeekInput {
	readonly training_block_id?: number | string | null;
	readonly week_number?: number | string | null;
	readonly week_type?: string | null;
	readonly starts_on?: string | null;
	readonly ends_on?: string | null;
	readonly notes?: string | null;
	readonly [key: string]: unknown;
}

/** Columns the PHP `updateBlockWeek` allows to be updated. */
const BLOCK_WEEK_FIELDS = [
	'training_block_id',
	'week_number',
	'week_type',
	'starts_on',
	'ends_on',
	'notes'
] as const;

// ---------------------------------------------------------------------------
// Coercion helpers (mirror the PHP `trim()` / `(string)` casts)
// ---------------------------------------------------------------------------

/** Mirrors `trim((string) $value)`: null/undefined become the empty string. */
function trimValue(value: unknown): string {
	if (value === undefined || value === null) return '';
	return String(value).trim();
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** PHP returns the raw row or `false`; the port returns `BlockWeek | null`. */
export async function getBlockWeek(db: Db, id: number, userId: number): Promise<BlockWeek | null> {
	const row = await first<Row>(
		bind(
			db,
			`SELECT bw.*
			FROM block_weeks bw
			JOIN training_blocks tb ON tb.id = bw.training_block_id
			WHERE bw.id = ? AND tb.user_id = ?`,
			[id, userId]
		)
	);
	return row ? blockWeekFromRow(row) : null;
}

/** Ordering: `end_date DESC` (NULL last), exactly like the PHP query. */
export async function getTrainingBlocks(db: Db, userId: number): Promise<TrainingBlock[]> {
	const rows = await allRows<Row>(
		bind(db, 'SELECT * FROM training_blocks WHERE user_id = ? ORDER BY end_date DESC', [userId])
	);
	return rows.map(trainingBlockFromRow);
}

export async function getTrainingBlock(
	db: Db,
	id: number,
	userId: number
): Promise<TrainingBlock | null> {
	const row = await first<Row>(
		bind(db, 'SELECT * FROM training_blocks WHERE id = ? AND user_id = ?', [id, userId])
	);
	return row ? trainingBlockFromRow(row) : null;
}

/** Non-deleted weeks for every owned block, ordered by block id then week number. */
export async function getBlockWeeks(db: Db, userId: number): Promise<BlockWeek[]> {
	const rows = await allRows<Row>(
		bind(
			db,
			`SELECT bw.*
			FROM block_weeks bw
			JOIN training_blocks tb ON tb.id = bw.training_block_id
			WHERE bw.is_deleted = 0 AND tb.user_id = ?
			ORDER BY bw.training_block_id, bw.week_number`,
			[userId]
		)
	);
	return rows.map(blockWeekFromRow);
}

/** Non-deleted weeks of one owned block, newest week number first. */
export async function getBlockWeeksForBlockDesc(
	db: Db,
	blockId: number,
	userId: number
): Promise<BlockWeek[]> {
	const rows = await allRows<Row>(
		bind(
			db,
			`SELECT bw.*
			FROM block_weeks bw
			JOIN training_blocks tb ON tb.id = bw.training_block_id
			WHERE bw.training_block_id = ? AND bw.is_deleted = 0 AND tb.user_id = ?
			ORDER BY bw.week_number DESC`,
			[blockId, userId]
		)
	);
	return rows.map(blockWeekFromRow);
}

/** Groups `getBlockWeeks` by `trainingBlockId`, mirroring PHP's `$weeksByBlock[...][] = $week`. */
export async function getWeeksByBlock(
	db: Db,
	userId: number
): Promise<Record<number, BlockWeek[]>> {
	const weeks = await getBlockWeeks(db, userId);
	const weeksByBlock: Record<number, BlockWeek[]> = {};
	for (const week of weeks) {
		// The column is NOT NULL, so the `?? 0` branch is unreachable in practice.
		const blockId = week.trainingBlockId ?? 0;
		(weeksByBlock[blockId] ??= []).push(week);
	}
	return weeksByBlock;
}

/**
 * Next week number for a set of weeks: max existing non-deleted week + 1, or 1 when there are none,
 * capped at the highest entry of `WEEK_NUMBERS`. Pure, so callers that already have the block's
 * weeks can skip a D1 round trip.
 */
export function nextWeekNumberFor(weeks: BlockWeek[]): number {
	const existingNumbers = weeks.map((week) => reqInt(week.weekNumber, 0));
	const maxWeekNumber = Math.max(...WEEK_NUMBERS);
	const nextWeekNumber = existingNumbers.length > 0 ? Math.max(...existingNumbers) + 1 : 1;
	return Math.min(nextWeekNumber, maxWeekNumber);
}

/** Next week number for a block; see `nextWeekNumberFor`. */
export async function getNextWeekNumber(db: Db, blockId: number, userId: number): Promise<number> {
	return nextWeekNumberFor(await getBlockWeeksForBlockDesc(db, blockId, userId));
}

// ---------------------------------------------------------------------------
// Training block writes
// ---------------------------------------------------------------------------

/**
 * Inserts a training block with the PHP `trim((string) ...)` coercion (null dates/notes become an
 * empty string, not NULL). PHP returns void; the port returns the new block id.
 */
export async function createTrainingBlock(
	db: Db,
	userId: number,
	input: CreateTrainingBlockInput
): Promise<number> {
	return insertId(
		bind(
			db,
			`INSERT INTO training_blocks
			(user_id, name, start_date, end_date, notes) VALUES
			(?, ?, ?, ?, ?)`,
			[
				userId,
				trimValue(input.name),
				trimValue(input.startDate),
				trimValue(input.endDate),
				trimValue(input.notes)
			]
		)
	);
}

/** PHP does not trim here; the caller is responsible (mirrors `updateBlockName`). */
export async function updateBlockName(
	db: Db,
	userId: number,
	blockId: number,
	name: string
): Promise<void> {
	await run(
		bind(db, 'UPDATE training_blocks SET name = ? WHERE id = ? AND user_id = ?', [
			name,
			blockId,
			userId
		])
	);
}

export async function updateBlockStartDate(
	db: Db,
	userId: number,
	block: TrainingBlock,
	startDate: string | null
): Promise<void> {
	await run(
		bind(db, 'UPDATE training_blocks SET start_date = ? WHERE id = ? AND user_id = ?', [
			startDate,
			block.id,
			userId
		])
	);
}

export async function updateBlockEndDate(
	db: Db,
	userId: number,
	block: TrainingBlock,
	endDate: string | null
): Promise<void> {
	await run(
		bind(db, 'UPDATE training_blocks SET end_date = ? WHERE id = ? AND user_id = ?', [
			endDate,
			block.id,
			userId
		])
	);
}

export async function updateBlockNotes(
	db: Db,
	userId: number,
	block: TrainingBlock,
	notes: string | null
): Promise<void> {
	await run(
		bind(db, 'UPDATE training_blocks SET notes = ? WHERE id = ? AND user_id = ?', [
			notes,
			block.id,
			userId
		])
	);
}

/** Overwrites name/start_date/end_date/notes, trimming each value like the PHP method. */
export async function updateTrainingBlock(
	db: Db,
	userId: number,
	blockId: number,
	input: TrainingBlockInput
): Promise<void> {
	await run(
		bind(
			db,
			`UPDATE training_blocks
			SET name = ?,
				start_date = ?,
				end_date = ?,
				notes = ?
			WHERE id = ? AND user_id = ?`,
			[
				trimValue(input.name),
				trimValue(input.startDate),
				trimValue(input.endDate),
				trimValue(input.notes),
				blockId,
				userId
			]
		)
	);
}

/**
 * Hard-deletes a block and cascades to its weeks. Replaces PHP's interactive transaction with a
 * single atomic `db.batch`: first detach workouts from the block's weeks, then delete the block.
 */
export async function deleteTrainingBlock(db: Db, userId: number, blockId: number): Promise<void> {
	await db.batch([
		bind(
			db,
			`UPDATE workouts
			SET block_week_id = NULL
			WHERE block_week_id IN (
				SELECT bw.id
				FROM block_weeks bw
				JOIN training_blocks tb ON tb.id = bw.training_block_id
				WHERE tb.id = ? AND tb.user_id = ?
			)`,
			[blockId, userId]
		),
		bind(db, 'DELETE FROM training_blocks WHERE id = ? AND user_id = ?', [blockId, userId])
	]);
}

// ---------------------------------------------------------------------------
// Block week writes
// ---------------------------------------------------------------------------

/**
 * Inserts a week, but only when the block belongs to the user (`INSERT ... SELECT ... RETURNING`).
 * Returns the new id, or `0` when the block is not owned. Text values are trimmed exactly like the
 * PHP method, so null becomes `''`.
 */
export async function createBlockWeek(
	db: Db,
	userId: number,
	input: CreateBlockWeekInput
): Promise<number> {
	const row = await first<{ id: number }>(
		bind(
			db,
			`INSERT INTO block_weeks
			(training_block_id, week_number, week_type, starts_on, ends_on, notes)
			SELECT id, ?, ?, ?, ?, ?
			FROM training_blocks
			WHERE id = ? AND user_id = ?
			RETURNING id`,
			[
				input.weekNumber,
				trimValue(input.weekType),
				trimValue(input.startsOn),
				trimValue(input.endsOn),
				trimValue(input.notes),
				input.trainingBlockId,
				userId
			]
		)
	);
	return row ? Number(row.id) : 0;
}

/**
 * Partial update of a week. Values are bound raw (no trimming), matching PHP. When
 * `training_block_id` is supplied the new parent must belong to the user, otherwise nothing is
 * written. The `EXISTS` clause still enforces ownership of the current parent.
 */
export async function updateBlockWeek(
	db: Db,
	userId: number,
	weekId: number,
	input: BlockWeekInput
): Promise<void> {
	const fields: string[] = [];
	const params: unknown[] = [];

	for (const field of BLOCK_WEEK_FIELDS) {
		if (!Object.prototype.hasOwnProperty.call(input, field)) continue;
		fields.push(`${field} = ?`);
		params.push(input[field] ?? null);
	}

	if (fields.length === 0) return;

	if (Object.prototype.hasOwnProperty.call(input, 'training_block_id')) {
		const newParent = await getTrainingBlock(db, reqInt(input.training_block_id), userId);
		if (newParent === null) return;
	}

	params.push(weekId, userId);

	await run(
		bind(
			db,
			`UPDATE block_weeks SET ${fields.join(', ')}
			WHERE id = ?
			AND EXISTS (
				SELECT 1 FROM training_blocks tb
				WHERE tb.id = block_weeks.training_block_id AND tb.user_id = ?
			)`,
			params
		)
	);
}

/** Soft-deletes a week (`is_deleted = 1`) when its parent block belongs to the user. */
export async function deleteWeek(db: Db, userId: number, weekId: number): Promise<void> {
	await run(
		bind(
			db,
			`UPDATE block_weeks
			SET is_deleted = 1
			WHERE id = ?
			AND EXISTS (
				SELECT 1 FROM training_blocks tb
				WHERE tb.id = block_weeks.training_block_id AND tb.user_id = ?
			)`,
			[weekId, userId]
		)
	);
}
