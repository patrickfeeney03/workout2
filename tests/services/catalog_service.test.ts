import { describe, expect, it } from 'vitest';
import {
	createExercise,
	createMovementPattern,
	deleteExercise,
	deleteExerciseImage,
	deleteMovementPattern,
	getExercise,
	getExerciseImageById,
	getExerciseImages,
	getExercises,
	getExercisesForMovementPattern,
	getExercisesForRoutine,
	getExercisesGroupedByMovementPattern,
	getMovementPatternById,
	getMovementPatterns,
	insertExerciseImage,
	updateExercise,
	updateMovementPattern
} from '$lib/server/services/catalog';
import {
	getDb,
	queryAll,
	queryOne,
	run,
	seedExercise,
	seedMovementPattern,
	seedRoutine,
	seedRoutineExercise,
	seedUser
} from '../support/fixtures';

// Port of tests/integration/catalog_service_test.php
describe('CatalogService', () => {
	it('getExerciseImages returns ordered images', async () => {
		const db = getDb();
		await seedUser({ id: 1 });
		await seedExercise({ id: 1, userId: 1, name: 'Squat' });
		await seedExercise({ id: 2, userId: 1, name: 'Bench' });

		await run(
			`INSERT INTO exercise_images (id, exercise_id, file_path, created_at) VALUES (?, ?, ?, ?)`,
			[1, 1, 'img2.jpg', '2023-01-02 10:00:00']
		);
		await run(
			`INSERT INTO exercise_images (id, exercise_id, file_path, created_at) VALUES (?, ?, ?, ?)`,
			[2, 1, 'img1.jpg', '2023-01-01 10:00:00']
		);
		await run(
			`INSERT INTO exercise_images (id, exercise_id, file_path, created_at) VALUES (?, ?, ?, ?)`,
			[3, 2, 'other.jpg', '2023-01-01 10:00:00']
		);

		const images = await getExerciseImages(db, 1, 1);

		expect(images).toHaveLength(2);
		expect(images[0].filePath).toBe('img1.jpg');
		expect(images[1].filePath).toBe('img2.jpg');
	});

	it('getExerciseImageById', async () => {
		const db = getDb();
		await seedUser({ id: 1 });
		await seedExercise({ id: 1, userId: 1, name: 'Squat' });
		await run(`INSERT INTO exercise_images (id, exercise_id, file_path) VALUES (?, ?, ?)`, [
			10,
			1,
			'img1.jpg'
		]);

		const image = await getExerciseImageById(db, 10, 1);
		expect(image?.filePath).toBe('img1.jpg');

		expect(await getExerciseImageById(db, 99, 1)).toBeNull();
	});

	it('getExercise', async () => {
		const db = getDb();
		await seedUser({ id: 1 });
		await seedExercise({ id: 10, userId: 1, name: 'Squat' });

		const exercise = await getExercise(db, 10, 1);
		expect(exercise?.name).toBe('Squat');

		expect(await getExercise(db, 99, 1)).toBeNull();
	});

	it('getExercisesGroupedByMovementPattern', async () => {
		const db = getDb();
		await seedUser({ id: 1 });
		await seedMovementPattern({ id: 1, name: 'Squat Pattern' });
		await seedMovementPattern({ id: 2, name: 'Push Pattern' });
		await seedExercise({ id: 10, userId: 1, name: 'A Squat', movementPatternId: 1 });
		await seedExercise({ id: 11, userId: 1, name: 'B Push', movementPatternId: 2 });
		await seedExercise({ id: 12, userId: 1, name: 'Z Unknown', movementPatternId: null });

		const grouped = await getExercisesGroupedByMovementPattern(db, 1);

		expect(grouped['Squat Pattern']).toBeDefined();
		expect(grouped['Push Pattern']).toBeDefined();
		expect(grouped['Other']).toBeDefined();

		expect(grouped['Squat Pattern'][0].name).toBe('A Squat');
		expect(grouped['Push Pattern'][0].name).toBe('B Push');
		expect(grouped['Other'][0].name).toBe('Z Unknown');
	});

	it('getExercisesForMovementPattern', async () => {
		const db = getDb();
		await seedUser({ id: 1 });
		await seedMovementPattern({ id: 1, name: 'Squat Pattern' });
		await seedExercise({ id: 10, userId: 1, name: 'Squat 1', movementPatternId: 1 });
		await seedExercise({ id: 11, userId: 1, name: 'Squat 2', movementPatternId: 1 });

		const exercises = await getExercisesForMovementPattern(db, 1, 1);
		expect(exercises).toHaveLength(2);
		expect(exercises[0].name).toBe('Squat 1');

		expect(await getExercisesForMovementPattern(db, 99, 1)).toHaveLength(0);
	});

	it('getExercisesForRoutine skips deleted and honors sort_order', async () => {
		const db = getDb();
		await seedUser({ id: 1 });
		await seedRoutine({ id: 100, userId: 1, name: 'My Routine' });
		await seedExercise({ id: 10, userId: 1, name: 'Exercise 1' });
		await seedExercise({ id: 11, userId: 1, name: 'Exercise 2' });

		await seedRoutineExercise({ id: 1, routineId: 100, exerciseId: 10, sortOrder: 2, isDeleted: 0 });
		await seedRoutineExercise({ id: 2, routineId: 100, exerciseId: 10, sortOrder: 1, isDeleted: 1 });
		await seedRoutineExercise({ id: 3, routineId: 100, exerciseId: 11, sortOrder: 1, isDeleted: 0 });

		const exercises = await getExercisesForRoutine(db, 100, 1);

		expect(exercises).toHaveLength(2);
		expect(exercises[0].name).toBe('Exercise 2');
		expect(exercises[1].name).toBe('Exercise 1');
	});

	it('getExercises returns all with pattern name ordered by exercise name', async () => {
		const db = getDb();
		await seedUser({ id: 1 });
		await seedMovementPattern({ id: 1, name: 'Pattern A' });
		await seedExercise({ id: 10, userId: 1, name: 'Z Exercise', movementPatternId: 1 });
		await seedExercise({ id: 11, userId: 1, name: 'A Exercise', movementPatternId: null });

		const exercises = await getExercises(db, 1);
		expect(exercises).toHaveLength(2);
		expect(exercises[0].name).toBe('A Exercise');
		expect((exercises[0] as unknown as Record<string, unknown>).movementPatternName).toBeNull();
		expect(exercises[1].name).toBe('Z Exercise');
		expect((exercises[1] as unknown as Record<string, unknown>).movementPatternName).toBe(
			'Pattern A'
		);
	});

	it('getMovementPatternById and getMovementPatterns', async () => {
		const db = getDb();
		await seedMovementPattern({ id: 1, name: 'B Pattern' });
		await seedMovementPattern({ id: 2, name: 'A Pattern' });

		const pattern = await getMovementPatternById(db, 1);
		expect(pattern?.name).toBe('B Pattern');

		const patterns = await getMovementPatterns(db);
		expect(patterns).toHaveLength(2);
		expect(patterns[0].name).toBe('B Pattern');
		expect(patterns[1].name).toBe('A Pattern');
	});

	it('create, update, delete Exercise', async () => {
		const db = getDb();
		await seedUser({ id: 1 });
		await seedMovementPattern({ id: 1, name: 'Pattern' });

		await createExercise(db, 1, {
			name: 'New Squat',
			description: 'A description',
			equipment: 'Barbell',
			primaryMuscle: 'Quads',
			movementPatternId: '1',
			notes: 'Some notes'
		});

		const exercise = await queryOne<Record<string, unknown>>(
			"SELECT * FROM exercises WHERE name = 'New Squat'"
		);
		expect(exercise?.description).toBe('A description');
		const exerciseId = Number(exercise?.id);

		await updateExercise(db, 1, {
			id: exerciseId,
			name: 'Updated Squat',
			description: 'Updated description',
			equipment: 'Dumbbell',
			primaryMuscle: 'Glutes',
			movementPatternId: '1',
			notes: 'Updated notes'
		});

		const updated = await getExercise(db, exerciseId, 1);
		expect(updated?.name).toBe('Updated Squat');
		expect(updated?.description).toBe('Updated description');
		expect(updated?.equipment).toBe('Dumbbell');

		await deleteExercise(db, 1, exerciseId);

		expect(await getExercise(db, exerciseId, 1)).toBeNull();
	});

	it('create, update, delete MovementPattern', async () => {
		const db = getDb();

		await createMovementPattern(db, { name: 'New Pattern', notes: 'Pattern notes' });

		expect(await createMovementPattern(db, { name: '' })).toBe(0);

		const patterns = await queryAll<Record<string, unknown>>('SELECT * FROM movement_patterns');
		expect(patterns).toHaveLength(1);
		expect(patterns[0].name).toBe('New Pattern');
		const patternId = Number(patterns[0].id);

		await updateMovementPattern(db, {
			id: patternId,
			name: 'Updated Pattern',
			notes: 'Updated notes'
		});

		const updated = await getMovementPatternById(db, patternId);
		expect(updated?.name).toBe('Updated Pattern');
		expect(updated?.notes).toBe('Updated notes');

		await deleteMovementPattern(db, patternId);

		expect(await getMovementPatternById(db, patternId)).toBeNull();
	});

	it('insert and delete exercise image', async () => {
		const db = getDb();
		await seedUser({ id: 1 });
		await seedExercise({ id: 1, userId: 1, name: 'Squat' });

		await insertExerciseImage(db, 1, 'test_path.jpg', 1);

		const images = await getExerciseImages(db, 1, 1);
		expect(images).toHaveLength(1);
		const imageId = images[0].id;
		expect(images[0].filePath).toBe('test_path.jpg');

		expect(await deleteExerciseImage(db, imageId, 1)).toBe(true);

		expect(await getExerciseImages(db, 1, 1)).toHaveLength(0);
	});
});
