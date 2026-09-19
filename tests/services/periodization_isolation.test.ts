import { describe, expect, it } from 'vitest';
import {
	createBlockWeek,
	createTrainingBlock,
	deleteTrainingBlock,
	deleteWeek,
	getBlockWeek,
	getBlockWeeks,
	getBlockWeeksForBlockDesc,
	getTrainingBlock,
	getTrainingBlocks,
	getWeeksByBlock,
	updateBlockEndDate,
	updateBlockName,
	updateBlockNotes,
	updateBlockStartDate,
	updateBlockWeek,
	updateTrainingBlock
} from '$lib/server/services/blocks';
import { getDb, seedBlockWeek, seedTrainingBlock, seedUser } from '../support/fixtures';

// Port of tests/integration/periodization_isolation_test.php
describe('PeriodizationService isolation', () => {
	/** Insert a second user and a block (plus optional week) that belong to them. */
	async function seedOtherUserBlock(withWeek = false): Promise<void> {
		await seedUser({ id: 2, name: 'Other User', email: 'other@example.com' });
		await seedTrainingBlock({
			id: 2,
			userId: 2,
			name: 'Theirs',
			startDate: '2023-02-01',
			endDate: '2023-02-28',
			notes: 'private'
		});
		if (withWeek) {
			await seedBlockWeek({ id: 2, trainingBlockId: 2, weekNumber: 1, weekType: 'Base' });
		}
	}

	it('getTrainingBlocks excludes another users block', async () => {
		const db = getDb();
		const userId = await seedUser();
		await seedTrainingBlock({ id: 1, userId, name: 'Mine', endDate: '2023-01-01' });
		await seedOtherUserBlock();

		const blocks = await getTrainingBlocks(db, userId);
		expect(blocks).toHaveLength(1);
		expect(blocks[0].id).toBe(1);
		expect(blocks[0].name).toBe('Mine');
	});

	it('getTrainingBlock returns null for another users block', async () => {
		const db = getDb();
		const userId = await seedUser();
		await seedOtherUserBlock();

		expect(await getTrainingBlock(db, 2, userId)).toBeNull();
	});

	it('updateBlockName does not mutate another users block', async () => {
		const db = getDb();
		const userId = await seedUser();
		await seedOtherUserBlock();

		await updateBlockName(db, userId, 2, 'Hacked');

		const block = await getTrainingBlock(db, 2, 2);
		expect(block?.name).toBe('Theirs');
	});

	it('updateBlockStartDate does not mutate another users block', async () => {
		const db = getDb();
		const userId = await seedUser();
		await seedOtherUserBlock();

		const dto = await getTrainingBlock(db, 2, 2);
		await updateBlockStartDate(db, userId, dto!, '1999-01-01');

		const block = await getTrainingBlock(db, 2, 2);
		expect(block?.startDate).toBe('2023-02-01');
	});

	it('updateBlockEndDate does not mutate another users block', async () => {
		const db = getDb();
		const userId = await seedUser();
		await seedOtherUserBlock();

		const dto = await getTrainingBlock(db, 2, 2);
		await updateBlockEndDate(db, userId, dto!, '1999-12-31');

		const block = await getTrainingBlock(db, 2, 2);
		expect(block?.endDate).toBe('2023-02-28');
	});

	it('updateBlockNotes does not mutate another users block', async () => {
		const db = getDb();
		const userId = await seedUser();
		await seedOtherUserBlock();

		const dto = await getTrainingBlock(db, 2, 2);
		await updateBlockNotes(db, userId, dto!, 'leaked');

		const block = await getTrainingBlock(db, 2, 2);
		expect(block?.notes).toBe('private');
	});

	it('updateTrainingBlock does not mutate another users block', async () => {
		const db = getDb();
		const userId = await seedUser();
		await seedOtherUserBlock();

		await updateTrainingBlock(db, userId, 2, {
			name: 'Hacked',
			startDate: '1999-01-01',
			endDate: '1999-12-31',
			notes: 'leaked'
		});

		const block = await getTrainingBlock(db, 2, 2);
		expect(block?.name).toBe('Theirs');
		expect(block?.startDate).toBe('2023-02-01');
		expect(block?.endDate).toBe('2023-02-28');
		expect(block?.notes).toBe('private');
	});

	it('deleteTrainingBlock does not delete another users block', async () => {
		const db = getDb();
		const userId = await seedUser();
		await seedOtherUserBlock();

		await deleteTrainingBlock(db, userId, 2);

		const block = await getTrainingBlock(db, 2, 2);
		expect(block?.id).toBe(2);
		expect(block?.name).toBe('Theirs');
	});

	it('getBlockWeek returns null for another users week', async () => {
		const db = getDb();
		const userId = await seedUser();
		await seedOtherUserBlock(true);

		expect(await getBlockWeek(db, 2, userId)).toBeNull();
	});

	it('getBlockWeeks excludes another users weeks', async () => {
		const db = getDb();
		const userId = await seedUser();
		await seedTrainingBlock({ id: 1, userId, name: 'Mine' });
		await seedBlockWeek({ id: 1, trainingBlockId: 1, weekNumber: 1, weekType: 'Base' });
		await seedOtherUserBlock(true);

		const weeks = await getBlockWeeks(db, userId);
		expect(weeks).toHaveLength(1);
		expect(weeks[0].id).toBe(1);
	});

	it('getWeeksByBlock excludes another users weeks', async () => {
		const db = getDb();
		const userId = await seedUser();
		await seedTrainingBlock({ id: 1, userId, name: 'Mine' });
		await seedBlockWeek({ id: 1, trainingBlockId: 1, weekNumber: 1, weekType: 'Base' });
		await seedOtherUserBlock(true);

		const groups = await getWeeksByBlock(db, userId);
		expect(Object.keys(groups)).toHaveLength(1);
		expect(Object.prototype.hasOwnProperty.call(groups, 1)).toBe(true);
		expect(Object.prototype.hasOwnProperty.call(groups, 2)).toBe(false);
	});

	it('getBlockWeeksForBlockDesc returns empty for another users block', async () => {
		const db = getDb();
		const userId = await seedUser();
		await seedOtherUserBlock(true);

		const weeks = await getBlockWeeksForBlockDesc(db, 2, userId);
		expect(weeks).toEqual([]);
	});

	it('createBlockWeek returns 0 and does not insert for another users block', async () => {
		const db = getDb();
		const userId = await seedUser();
		await seedOtherUserBlock();

		const weekId = await createBlockWeek(db, userId, {
			trainingBlockId: 2,
			weekNumber: 1,
			weekType: 'Base'
		});
		expect(weekId).toBe(0);

		const weeks = await getBlockWeeksForBlockDesc(db, 2, 2);
		expect(weeks).toHaveLength(0);
	});

	it('updateBlockWeek does not mutate another users week', async () => {
		const db = getDb();
		const userId = await seedUser();
		await seedOtherUserBlock(true);

		await updateBlockWeek(db, userId, 2, {
			week_number: 4,
			week_type: 'Deload'
		});

		const week = await getBlockWeek(db, 2, 2);
		expect(week?.weekNumber).toBe(1);
		expect(week?.weekType).toBe('Base');
	});

	it('deleteWeek does not delete another users week', async () => {
		const db = getDb();
		const userId = await seedUser();
		await seedOtherUserBlock(true);

		await deleteWeek(db, userId, 2);

		const week = await getBlockWeek(db, 2, 2);
		expect(week?.isDeleted).toBe(0);
	});

	it('createTrainingBlock stores the provided userId', async () => {
		const db = getDb();
		await seedUser();
		await seedUser({ id: 2, name: 'Other User', email: 'other@example.com' });

		await createTrainingBlock(db, 2, { name: 'User 2 Block' });

		const blocksForOne = await getTrainingBlocks(db, 1);
		const blocksForTwo = await getTrainingBlocks(db, 2);
		expect(blocksForOne).toHaveLength(0);
		expect(blocksForTwo).toHaveLength(1);
		expect(blocksForTwo[0].userId).toBe(2);
		expect(blocksForTwo[0].name).toBe('User 2 Block');
	});
});
