import { requireUser } from '$lib/server/guards';
import { RANGES, dashboard } from '$lib/server/services/stats';
import { getWorkouts } from '$lib/server/services/workouts';
import type { PageServerLoad } from './$types';

interface RecentWorkout {
	id: number;
	title: string;
	status: string;
	date: string;
	durationMinutes: number | null;
}

function positiveInt(value: string | null): number | null {
	if (value === null) return null;
	const parsed = Number.parseInt(value, 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/** ISO timestamp -> YYYY-MM-DD; SQLite dates are already YYYY-MM-DD. */
function isoDate(value: string | null): string {
	return value === null ? '' : value.slice(0, 10);
}

function minutesFromSeconds(seconds: number | null): number | null {
	if (seconds === null || seconds <= 0) return null;
	return Math.round((seconds / 60) * 10) / 10;
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const user = requireUser(locals, url);

	const range = url.searchParams.get('range') ?? '12w';
	const exerciseId = positiveInt(url.searchParams.get('exercise_id'));
	const blockId = positiveInt(url.searchParams.get('block_id'));

	const [stats, allWorkouts] = await Promise.all([
		dashboard(locals.db, user.id, { range, exerciseId, blockId }),
		getWorkouts(locals.db, user.id)
	]);

	const recentWorkouts: RecentWorkout[] = allWorkouts
		.filter((workout) => workout.status !== 'skipped')
		.map((workout) => ({
			id: workout.id,
			title: workout.title ?? 'Workout',
			status: workout.status ?? '',
			date: workout.performedOn ?? workout.plannedOn ?? isoDate(workout.createdAt),
			durationMinutes: minutesFromSeconds(workout.durationSeconds)
		}))
		.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
		.slice(0, 6);

	return {
		user,
		stats,
		ranges: RANGES,
		recentWorkouts
	};
};
