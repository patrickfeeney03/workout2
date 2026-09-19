import { error } from '@sveltejs/kit';
import type { Db } from '$lib/server/db';
import * as catalog from '$lib/server/services/catalog';
import * as routines from '$lib/server/services/routines';
import type { Exercise, Routine, RoutineExercise, RoutineSet } from '$lib/types';

/** One routine exercise together with its exercise row, ordered sets and last-touched stamp. */
export interface RoutineExerciseItem {
	readonly routineExercise: RoutineExercise;
	readonly exercise: Exercise | null;
	readonly sets: RoutineSet[];
	/** SQLite `modified_at` (UTC) of the most recently edited set, or null when there are none. */
	readonly lastUpdated: string | null;
}

/** A movement-pattern bucket of exercises for the "add exercise" picker. */
export interface ExerciseGroup {
	readonly patternName: string;
	readonly exercises: catalog.GroupedExercise[];
}

/** Everything the routine builder needs, shared by `/routines/[id]` and `/routines/[id]/edit`. */
export interface RoutinePageData {
	readonly routine: Routine;
	readonly items: RoutineExerciseItem[];
	readonly exerciseGroups: ExerciseGroup[];
}

function latestModifiedAt(sets: RoutineSet[]): string | null {
	let latest: string | null = null;
	for (const set of sets) {
		if (set.modifiedAt !== null && (latest === null || set.modifiedAt > latest)) {
			latest = set.modifiedAt;
		}
	}
	return latest;
}

/** Port of the read half of `routine.php`: routine + exercises + mapped sets + picker groups. */
export async function loadRoutinePageData(
	db: Db,
	userId: number,
	routineId: number
): Promise<RoutinePageData> {
	if (!Number.isFinite(routineId) || routineId <= 0) {
		error(404, 'Not found');
	}

	const routine = await routines.getRoutine(db, routineId, userId);
	if (!routine) {
		error(404, 'Not found');
	}

	const [routineExercises, grouped] = await Promise.all([
		routines.getRoutineExercisesFromRoutine(db, routineId, userId),
		catalog.getExercisesGroupedByMovementPattern(db, userId)
	]);

	const mapped = await routines.getMappedExercisesAndSetsForRoutineExercises(db, routineExercises);

	const items: RoutineExerciseItem[] = routineExercises.map((routineExercise) => {
		const pair = mapped[routineExercise.id];
		const sets = pair?.sets ?? [];
		return {
			routineExercise,
			exercise: pair?.exercise ?? null,
			sets,
			lastUpdated: latestModifiedAt(sets)
		};
	});

	const exerciseGroups: ExerciseGroup[] = Object.entries(grouped).map(
		([patternName, exercises]) => ({ patternName, exercises })
	);

	return { routine, items, exerciseGroups };
}
