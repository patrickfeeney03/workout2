import { describe, expect, it } from 'vitest';
import { createExercise, getExercise, getExercises } from '$lib/server/services/catalog';
import { getDb, queryOne, seedExercise, seedMovementPattern, seedUser } from '../support/fixtures';

// Port of tests/integration/catalog_isolation_test.php
describe('CatalogService isolation', () => {
	it('exercises are isolated per user', async () => {
		const db = getDb();
		await seedUser({ id: 1 });
		await seedUser({ id: 2, name: 'User Two', email: 'two@example.com' });
		await seedMovementPattern({ id: 1, name: 'Squat Pattern' });
		await seedExercise({ id: 10, userId: 1, name: 'User 1 Squat' });
		await seedExercise({ id: 11, userId: 2, name: 'User 2 Bench' });

		const exercises = await getExercises(db, 1);
		expect(exercises).toHaveLength(1);
		expect(exercises[0].name).toBe('User 1 Squat');
		expect(exercises[0].id).toBe(10);

		expect(await getExercise(db, 11, 1)).toBeNull();

		await createExercise(db, 1, {
			name: 'Created By User 1',
			description: '',
			equipment: '',
			primaryMuscle: '',
			movementPatternId: '1',
			notes: ''
		});

		const created = await queryOne<Record<string, unknown>>(
			"SELECT * FROM exercises WHERE name = 'Created By User 1'"
		);
		expect(created?.user_id).toBe(1);
	});
});
