import { describe, expect, it } from 'vitest';
import {
	WEEK_NUMBERS,
	WEEK_TYPES,
	createBlockWeek,
	createTrainingBlock,
	deleteTrainingBlock,
	deleteWeek,
	getBlockWeek,
	getBlockWeeks,
	getBlockWeeksForBlockDesc,
	getNextWeekNumber,
	getTrainingBlock,
	getTrainingBlocks,
	getWeeksByBlock,
	updateBlockName,
	updateBlockWeek,
	updateTrainingBlock
} from '$lib/server/services/blocks';
import {
	getDb,
	seedBlockWeek,
	seedTrainingBlock,
	seedUser
} from '../support/fixtures';

// Port of tests/integration/periodization_service_test.php
describe('PeriodizationService', () => {
	it('createTrainingBlock inserts and trims data', async () => {
		const db = getDb();
		const userId = await seedUser();

		await createTrainingBlock(db, userId, {
			name: '  Block 1  ',
			startDate: '  2023-01-01  ',
			endDate: '  2023-01-31  ',
			notes: '  Some notes  '
		});

		const blocks = await getTrainingBlocks(db, userId);
		expect(blocks).toHaveLength(1);
		expect(blocks[0].name).toBe('Block 1');
		expect(blocks[0].startDate).toBe('2023-01-01');
		expect(blocks[0].endDate).toBe('2023-01-31');
		expect(blocks[0].notes).toBe('Some notes');
	});

	it('updateTrainingBlock updates and trims data', async () => {
		const db = getDb();
		const userId = await seedUser();
		await seedTrainingBlock({
			id: 1,
			userId,
			name: 'B1',
			startDate: '2023-01-01',
			endDate: '2023-01-31',
			notes: 'notes'
		});

		await updateTrainingBlock(db, userId, 1, {
			name: '  New B1  ',
			startDate: '  2024-01-01  ',
			endDate: '  2024-01-31  ',
			notes: '  New notes  '
		});

		const block = await getTrainingBlock(db, 1, userId);
		expect(block?.name).toBe('New B1');
		expect(block?.startDate).toBe('2024-01-01');
		expect(block?.endDate).toBe('2024-01-31');
		expect(block?.notes).toBe('New notes');
	});

	it('deleteTrainingBlock removes block', async () => {
		const db = getDb();
		const userId = await seedUser();
		await seedTrainingBlock({
			id: 1,
			userId,
			name: 'B1',
			startDate: '2023-01-01',
			endDate: '2023-01-31',
			notes: 'notes'
		});

		await deleteTrainingBlock(db, userId, 1);

		const block = await getTrainingBlock(db, 1, userId);
		expect(block).toBeNull();
	});

	it('getTrainingBlocks orders by end_date DESC', async () => {
		const db = getDb();
		const userId = await seedUser();
		await seedTrainingBlock({ id: 1, userId, name: 'B1', endDate: '2023-01-01' });
		await seedTrainingBlock({ id: 2, userId, name: 'B2', endDate: '2023-02-01' });

		const blocks = await getTrainingBlocks(db, userId);
		expect(blocks).toHaveLength(2);
		expect(blocks[0].id).toBe(2);
	});

	it('getTrainingBlock returns null for nonexistent id', async () => {
		const db = getDb();
		const userId = await seedUser();
		expect(await getTrainingBlock(db, 999, userId)).toBeNull();
	});

	it('updateBlockName updates name', async () => {
		const db = getDb();
		const userId = await seedUser();
		await seedTrainingBlock({ id: 1, userId, name: 'B1' });

		await updateBlockName(db, userId, 1, 'B1 Updated');
		const block = await getTrainingBlock(db, 1, userId);
		expect(block?.name).toBe('B1 Updated');
	});

	it('createBlockWeek inserts and trims data', async () => {
		const db = getDb();
		const userId = await seedUser();
		await seedTrainingBlock({
			id: 1,
			userId,
			name: 'B1',
			startDate: '2023-01-01',
			endDate: '2023-01-31',
			notes: 'notes'
		});

		await createBlockWeek(db, userId, {
			trainingBlockId: 1,
			weekNumber: 1,
			weekType: '  Development  ',
			startsOn: '  2023-01-01  ',
			endsOn: '  2023-01-07  ',
			notes: '  Week notes  '
		});

		const weeks = await getBlockWeeks(db, userId);
		expect(weeks).toHaveLength(1);
		expect(weeks[0].trainingBlockId).toBe(1);
		expect(weeks[0].weekNumber).toBe(1);
		expect(weeks[0].weekType).toBe('Development');
		expect(weeks[0].startsOn).toBe('2023-01-01');
		expect(weeks[0].endsOn).toBe('2023-01-07');
		expect(weeks[0].notes).toBe('Week notes');
	});

	it('createBlockWeek returns the id of the new week', async () => {
		const db = getDb();
		const userId = await seedUser();
		await seedTrainingBlock({ id: 1, userId, name: 'B1' });

		const weekId = await createBlockWeek(db, userId, {
			trainingBlockId: 1,
			weekNumber: 1,
			weekType: 'Base'
		});

		const week = await getBlockWeek(db, weekId, userId);
		expect(week?.id).toBe(1);
		expect(week?.weekNumber).toBe(1);
		expect(week?.weekType).toBe('Base');
	});

	it('updateBlockWeek updates specific fields and ignores disallowed fields', async () => {
		const db = getDb();
		const userId = await seedUser();
		await seedTrainingBlock({ id: 1, userId, name: 'B1' });
		await seedBlockWeek({ id: 1, trainingBlockId: 1, weekNumber: 1, weekType: 'Base' });

		await updateBlockWeek(db, userId, 1, {
			week_number: 2,
			week_type: 'Deload',
			disallowed_field: 'hax'
		});

		const week = await getBlockWeek(db, 1, userId);
		expect(week?.weekNumber).toBe(2);
		expect(week?.weekType).toBe('Deload');
	});

	it('updateBlockWeek ignores empty array', async () => {
		const db = getDb();
		const userId = await seedUser();
		await seedTrainingBlock({ id: 1, userId, name: 'B1' });
		await seedBlockWeek({ id: 1, trainingBlockId: 1, weekNumber: 1, weekType: 'Base' });

		// Should not crash
		await updateBlockWeek(db, userId, 1, {});

		const week = await getBlockWeek(db, 1, userId);
		expect(week?.weekNumber).toBe(1);
	});

	it('deleteWeek sets is_deleted to 1', async () => {
		const db = getDb();
		const userId = await seedUser();
		await seedTrainingBlock({ id: 1, userId, name: 'B1' });
		await seedBlockWeek({ id: 1, trainingBlockId: 1, weekNumber: 1, weekType: 'Base' });

		await deleteWeek(db, userId, 1);

		const week = await getBlockWeek(db, 1, userId);
		expect(week?.isDeleted).toBe(1);
	});

	it('getBlockWeeks filters deleted and orders properly', async () => {
		const db = getDb();
		const userId = await seedUser();
		await seedTrainingBlock({ id: 1, userId, name: 'B1' });
		await seedTrainingBlock({ id: 2, userId, name: 'B2' });

		await seedBlockWeek({ id: 1, trainingBlockId: 1, weekNumber: 2, weekType: 'Base' });
		await seedBlockWeek({ id: 2, trainingBlockId: 1, weekNumber: 1, weekType: 'Base' });
		await seedBlockWeek({ id: 3, trainingBlockId: 2, weekNumber: 1, weekType: 'Base' });
		await seedBlockWeek({ id: 4, trainingBlockId: 1, weekNumber: 3, weekType: 'Base', isDeleted: 1 });

		const weeks = await getBlockWeeks(db, userId);

		expect(weeks).toHaveLength(3);
		// Order: training_block_id, week_number
		expect(weeks[0].id).toBe(2);
		expect(weeks[1].id).toBe(1);
		expect(weeks[2].id).toBe(3);
	});

	it('getWeeksByBlock groups weeks by block id', async () => {
		const db = getDb();
		const userId = await seedUser();
		await seedTrainingBlock({ id: 1, userId, name: 'B1' });
		await seedTrainingBlock({ id: 2, userId, name: 'B2' });

		await seedBlockWeek({ id: 1, trainingBlockId: 1, weekNumber: 1, weekType: 'Base' });
		await seedBlockWeek({ id: 2, trainingBlockId: 2, weekNumber: 1, weekType: 'Base' });

		const groups = await getWeeksByBlock(db, userId);

		expect(Object.keys(groups)).toHaveLength(2);
		expect(groups[1]).toHaveLength(1);
		expect(groups[2]).toHaveLength(1);
		expect(groups[1][0].id).toBe(1);
		expect(groups[2][0].id).toBe(2);
	});

	it('getBlockWeeksForBlockDesc filters deleted and orders by week_number DESC', async () => {
		const db = getDb();
		const userId = await seedUser();
		await seedTrainingBlock({ id: 1, userId, name: 'B1' });

		await seedBlockWeek({ id: 1, trainingBlockId: 1, weekNumber: 1, weekType: 'Base' });
		await seedBlockWeek({ id: 2, trainingBlockId: 1, weekNumber: 2, weekType: 'Base' });
		await seedBlockWeek({ id: 3, trainingBlockId: 1, weekNumber: 3, weekType: 'Base', isDeleted: 1 });

		const weeks = await getBlockWeeksForBlockDesc(db, 1, userId);

		expect(weeks).toHaveLength(2);
		expect(weeks[0].id).toBe(2); // week 2 first
		expect(weeks[1].id).toBe(1); // week 1 next
	});

	it('getBlockWeek returns null for nonexistent id', async () => {
		const db = getDb();
		const userId = await seedUser();
		expect(await getBlockWeek(db, 999, userId)).toBeNull();
	});

	it('WEEK_TYPES contains the four supported week types', async () => {
		expect(WEEK_TYPES).toEqual(['Intro', 'Base', 'Shock', 'Deload']);
	});

	it('WEEK_NUMBERS contains weeks 1 through 4', async () => {
		expect(WEEK_NUMBERS).toEqual([1, 2, 3, 4]);
	});

	it('getNextWeekNumber returns 1 for a block with no weeks', async () => {
		const db = getDb();
		const userId = await seedUser();
		await seedTrainingBlock({ id: 1, userId, name: 'B1' });

		expect(await getNextWeekNumber(db, 1, userId)).toBe(1);
	});

	it('getNextWeekNumber returns max existing week plus one', async () => {
		const db = getDb();
		const userId = await seedUser();
		await seedTrainingBlock({ id: 1, userId, name: 'B1' });
		await seedBlockWeek({ id: 1, trainingBlockId: 1, weekNumber: 2, isDeleted: 0 });

		expect(await getNextWeekNumber(db, 1, userId)).toBe(3);
	});

	it('getNextWeekNumber caps at the highest WEEK_NUMBERS value', async () => {
		const db = getDb();
		const userId = await seedUser();
		await seedTrainingBlock({ id: 1, userId, name: 'B1' });
		await seedBlockWeek({ id: 1, trainingBlockId: 1, weekNumber: 4, isDeleted: 0 });

		expect(await getNextWeekNumber(db, 1, userId)).toBe(4);
	});

	it('getNextWeekNumber ignores deleted weeks', async () => {
		const db = getDb();
		const userId = await seedUser();
		await seedTrainingBlock({ id: 1, userId, name: 'B1' });
		await seedBlockWeek({ id: 1, trainingBlockId: 1, weekNumber: 3, isDeleted: 1 });

		expect(await getNextWeekNumber(db, 1, userId)).toBe(1);
	});
});
