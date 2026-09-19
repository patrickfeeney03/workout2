<script lang="ts">
	import {
		CalendarDays,
		Dna,
		Dumbbell,
		Repeat2,
		Wrench
	} from 'lucide-svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const d = $derived(data.stats);

	const RANGE_LABELS: Record<string, string> = {
		'8w': '8 weeks',
		'12w': '12 weeks',
		'26w': '6 months',
		block: 'Block',
		all: 'All time'
	};

	const MONTHS = [
		'Jan',
		'Feb',
		'Mar',
		'Apr',
		'May',
		'Jun',
		'Jul',
		'Aug',
		'Sep',
		'Oct',
		'Nov',
		'Dec'
	];

	function rangeLabel(range: string): string {
		return RANGE_LABELS[range] ?? range;
	}

	/** Deterministic short date (no Intl) so SSR and hydration always agree. */
	function shortDate(iso: string | null | undefined): string {
		if (!iso) return '—';
		const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
		if (!match) return iso;
		return `${MONTHS[Number(match[2]) - 1]} ${Number(match[3])}`;
	}

	function fmt(value: number | null | undefined, digits = 1): string {
		if (value === null || value === undefined || !Number.isFinite(value)) return '—';
		return String(Number(value.toFixed(digits)));
	}

	function rangeOf(values: number[]): { min: number; max: number } {
		if (values.length === 0) return { min: 0, max: 0 };
		return { min: Math.min(...values), max: Math.max(...values) };
	}

	/** Width percentage for a CSS bar, clamped so the smallest value stays visible. */
	function bar(value: number, min: number, max: number): string {
		const span = max - min;
		const ratio = span <= 0 ? 0.6 : (value - min) / span;
		return `${Math.max(6, Math.min(100, ratio * 100)).toFixed(1)}%`;
	}

	interface Spark {
		points: string;
		lastX: number;
		lastY: number;
	}

	const SPARK_W = 100;
	const SPARK_H = 32;

	function sparkPoints(values: number[]): Spark {
		if (values.length === 0) {
			return { points: '', lastX: SPARK_W / 2, lastY: SPARK_H / 2 };
		}
		const { min, max } = rangeOf(values);
		const span = max - min || 1;
		const pad = 3;
		const step = values.length > 1 ? SPARK_W / (values.length - 1) : 0;
		const coords = values.map((value, index) => {
			const x = values.length > 1 ? index * step : SPARK_W / 2;
			const y = SPARK_H - pad - ((value - min) / span) * (SPARK_H - pad * 2);
			return { x, y };
		});
		const last = coords[coords.length - 1];
		return {
			points: coords.map((c) => `${c.x.toFixed(2)},${c.y.toFixed(2)}`).join(' '),
			lastX: last.x,
			lastY: last.y
		};
	}

	function dotTop(spark: Spark): string {
		return `${((spark.lastY / SPARK_H) * 100).toFixed(1)}%`;
	}

	function dotLeft(spark: Spark): string {
		return `${spark.lastX.toFixed(1)}%`;
	}

	function submitForm(event: Event) {
		const target = event.currentTarget as HTMLElement | null;
		(target?.closest('form') as HTMLFormElement | null)?.requestSubmit();
	}

	function rangeHref(range: string): string {
		const params = new URLSearchParams();
		params.set('range', range);
		if (d.selectedExerciseId !== null) {
			params.set('exercise_id', String(d.selectedExerciseId));
		}
		return `/?${params.toString()}`;
	}

	const bwValues = $derived(d.bodyWeight.map((point) => point.weight));
	const bwRange = $derived(rangeOf(bwValues));
	const bwSpark = $derived(sparkPoints(bwValues));
	const bodyWeightRows = $derived([...d.bodyWeight].reverse().slice(0, 10));

	const lengthValues = $derived(d.workoutLength.map((point) => point.minutes));
	const lengthRange = $derived(rangeOf(lengthValues));
	const lengthSpark = $derived(sparkPoints(lengthValues));
	const workoutLengthRows = $derived([...d.workoutLength].reverse().slice(0, 8));

	const splitMax = $derived(
		Math.max(...d.workoutLengthBySplit.map((split) => split.avgMinutes), 1)
	);
	const splitWorkouts = $derived(
		d.workoutLengthBySplit.reduce((sum, split) => sum + split.count, 0)
	);

	const liftValues = $derived(d.liftProgress.map((point) => point.e1rm ?? point.weight));
	const liftRange = $derived(rangeOf(liftValues));
	const liftSpark = $derived(sparkPoints(liftValues));
	const liftRows = $derived([...d.liftProgress].reverse().slice(0, 8));
	const liftVolume = $derived(
		d.liftProgress.reduce((sum, point) => sum + point.weight * point.reps, 0)
	);
	const liftTopE1rm = $derived(
		d.liftProgress.reduce<number | null>((best, point) => {
			if (point.e1rm === null) return best;
			return best === null || point.e1rm > best ? point.e1rm : best;
		}, null)
	);
</script>

<svelte:head>
	<title>Dashboard · Gym Tracker</title>
</svelte:head>

<main class="page dashboard">
	<div class="row-between">
		<h1>Hey {data.user.name} 💪</h1>
		{#if d.blockName}
			<span class="chip">{d.blockName}</span>
		{/if}
	</div>
	<p class="muted small">
		{rangeLabel(d.range)} ·
		{#if d.start}
			{shortDate(d.start)}–{shortDate(d.end)}
		{:else}
			through {shortDate(d.end)}
		{/if}
	</p>

	<nav class="range-nav" aria-label="Date range">
		{#each data.ranges as range (range)}
			<a
				class="chip"
				class:chip-accent={d.range === range}
				href={rangeHref(range)}
				aria-current={d.range === range ? 'true' : undefined}>{rangeLabel(range)}</a
			>
		{/each}
	</nav>

	{#if d.exercises.length > 0 || (d.range === 'block' && d.blocks.length > 0)}
		<form class="card filters" method="GET" action="/">
			<input type="hidden" name="range" value={d.range} />
			{#if d.range === 'block' && d.blocks.length > 0}
				<div class="field">
					<label for="block_id">Block</label>
					<select id="block_id" name="block_id" onchange={submitForm}>
						{#each d.blocks as block (block.id)}
							<option value={block.id} selected={block.id === d.blockId}>{block.name}</option>
						{/each}
					</select>
				</div>
			{/if}
			{#if d.exercises.length > 0}
				<div class="field">
					<label for="exercise_id">Lift</label>
					<select id="exercise_id" name="exercise_id" onchange={submitForm}>
						{#each d.exercises as exercise (exercise.id)}
							<option value={exercise.id} selected={exercise.id === d.selectedExerciseId}>
								{exercise.name}
							</option>
						{/each}
					</select>
				</div>
			{/if}
			<button class="btn btn-sm" type="submit">Apply</button>
		</form>
	{/if}

	<section class="kpis">
		<article class="card kpi">
			<span class="kpi-label">Workouts</span>
			<span class="kpi-value num">{d.kpis.workoutsCompleted}</span>
			<span class="faint small">completed</span>
		</article>
		<article class="card kpi">
			<span class="kpi-label">Avg length</span>
			<span class="kpi-value num">
				{d.kpis.avgDurationMinutes === null ? '—' : `${fmt(d.kpis.avgDurationMinutes)} min`}
			</span>
			<span class="faint small">per workout</span>
		</article>
		<article class="card kpi">
			<span class="kpi-label">Body weight</span>
			<span class="kpi-value num">
				{d.kpis.latestBodyWeight === null ? '—' : `${fmt(d.kpis.latestBodyWeight)} kg`}
			</span>
			<span class="faint small">latest logged</span>
		</article>
	</section>

	{#if !d.hasData && d.kpis.workoutsCompleted === 0}
		<p class="card muted">Complete some workouts to see stats here.</p>
	{/if}

	{#if d.bodyWeight.length > 0}
		<section class="card">
			<div class="row-between">
				<h2 class="section-title">Body weight</h2>
				<span class="faint small num">{fmt(bwRange.min)}–{fmt(bwRange.max)} kg</span>
			</div>
			<div class="spark-wrap">
				<svg viewBox="0 0 100 32" preserveAspectRatio="none" role="img" aria-label="Body weight trend">
					<polyline
						points={bwSpark.points}
						fill="none"
						stroke="var(--accent)"
						stroke-width="2"
						vector-effect="non-scaling-stroke"
					/>
				</svg>
				<span class="spark-dot" style:left={dotLeft(bwSpark)} style:top={dotTop(bwSpark)}></span>
			</div>
			<ul class="bar-list">
				{#each bodyWeightRows as point (point.date)}
					<li>
						<span class="bar-date faint small num">{shortDate(point.date)}</span>
						<span class="bar-track">
							<span class="bar-fill" style:width={bar(point.weight, bwRange.min, bwRange.max)}></span>
						</span>
						<span class="bar-value num small">{fmt(point.weight)} kg</span>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	{#if d.workoutLength.length > 0}
		<section class="card">
			<h2 class="section-title">Workout length</h2>
			<div class="spark-wrap">
				<svg viewBox="0 0 100 32" preserveAspectRatio="none" role="img" aria-label="Workout length trend">
					<polyline
						points={lengthSpark.points}
						fill="none"
						stroke="var(--accent)"
						stroke-width="2"
						vector-effect="non-scaling-stroke"
					/>
				</svg>
				<span class="spark-dot" style:left={dotLeft(lengthSpark)} style:top={dotTop(lengthSpark)}></span>
			</div>
			<ul class="bar-list">
				{#each workoutLengthRows as point (point.workoutId)}
					<li>
						<a class="bar-date faint small num" href={`/workouts/${point.workoutId}`}>
							{shortDate(point.date)}
						</a>
						<span class="bar-track">
							<span
								class="bar-fill"
								style:width={bar(point.minutes, lengthRange.min, lengthRange.max)}
							></span>
						</span>
						<span class="bar-value num small">{fmt(point.minutes)} min</span>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	{#if d.workoutLengthBySplit.length > 0}
		<section class="card">
			<h2 class="section-title">Length per split</h2>
			<ul class="bar-list">
				{#each d.workoutLengthBySplit as split (split.splitDay)}
					<li>
						<span class="bar-date small">{split.splitDay}</span>
						<span class="bar-track">
							<span class="bar-fill" style:width={bar(split.avgMinutes, 0, splitMax)}></span>
						</span>
						<span class="bar-value num small">{fmt(split.avgMinutes)} min</span>
					</li>
				{/each}
			</ul>
			<p class="faint small">Average across {splitWorkouts} workouts in range.</p>
		</section>
	{/if}

	{#if d.liftProgress.length > 0}
		<section class="card">
			<div class="row-between">
				<h2 class="section-title">Lift progress</h2>
				{#if d.selectedExerciseName}
					<span class="chip chip-accent">{d.selectedExerciseName}</span>
				{/if}
			</div>
			<div class="spark-wrap">
				<svg viewBox="0 0 100 32" preserveAspectRatio="none" role="img" aria-label="Lift progress trend">
					<polyline
						points={liftSpark.points}
						fill="none"
						stroke="var(--accent)"
						stroke-width="2"
						vector-effect="non-scaling-stroke"
					/>
				</svg>
				<span class="spark-dot" style:left={dotLeft(liftSpark)} style:top={dotTop(liftSpark)}></span>
			</div>
			<div class="lift-stats">
				<div>
					<span class="faint small">Sets</span>
					<span class="num">{d.liftProgress.length}</span>
				</div>
				<div>
					<span class="faint small">Volume</span>
					<span class="num">{fmt(liftVolume, 0)} kg</span>
				</div>
				<div>
					<span class="faint small">Top e1RM</span>
					<span class="num">{liftTopE1rm === null ? '—' : `${fmt(liftTopE1rm)} kg`}</span>
				</div>
			</div>
			<ul class="bar-list">
				{#each liftRows as point (point.setId)}
					<li>
						<a class="bar-date faint small num" href={`/workouts/${point.workoutId}`}>
							{shortDate(point.date)}
						</a>
						<span class="bar-track">
							<span
								class="bar-fill"
								style:width={bar(point.e1rm ?? point.weight, liftRange.min, liftRange.max)}
							></span>
						</span>
						<span class="bar-value num small">{fmt(point.weight)}×{point.reps}</span>
					</li>
				{/each}
			</ul>
			<p class="faint small">Working sets with logged actuals in range.</p>
		</section>
	{/if}

	{#if data.recentWorkouts.length > 0}
		<section class="card">
			<h2 class="section-title">Recent workouts</h2>
			<ul class="recent-list">
				{#each data.recentWorkouts as workout (workout.id)}
					<li>
						<a href={`/workouts/${workout.id}`}>
							<span class="recent-title">{workout.title}</span>
							<span class="faint small num">{shortDate(workout.date)}</span>
						</a>
						<span class="row">
							{#if workout.status !== ''}
								<span
									class="chip"
									class:chip-accent={workout.status === 'completed'}
									class:chip-warn={workout.status === 'in_progress'}>
									{workout.status.replace('_', ' ')}
								</span>
							{/if}
							{#if workout.durationMinutes !== null}
								<span class="faint small num">{fmt(workout.durationMinutes)} min</span>
							{/if}
						</span>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	<section class="grid">
		<a class="dashboard-card quick" href="/workouts">
			<Dumbbell size={22} strokeWidth={1.75} /> Workouts
		</a>
		<a class="dashboard-card quick" href="/routines">
			<Repeat2 size={22} strokeWidth={1.75} /> Routines
		</a>
		<a class="dashboard-card quick" href="/exercises">
			<Wrench size={22} strokeWidth={1.75} /> Exercises
		</a>
		<a class="dashboard-card quick" href="/blocks">
			<CalendarDays size={22} strokeWidth={1.75} /> Blocks
		</a>
		<a class="dashboard-card quick" href="/movement-patterns">
			<Dna size={22} strokeWidth={1.75} /> Patterns
		</a>
	</section>
</main>

<style>
	.range-nav {
		display: flex;
		gap: 0.35rem;
		overflow-x: auto;
		margin: 0.5rem 0 0.75rem;
		padding-bottom: 0.15rem;
		scrollbar-width: none;
	}

	.range-nav::-webkit-scrollbar {
		display: none;
	}

	.range-nav a {
		flex: 0 0 auto;
	}

	.filters {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
		align-items: end;
		gap: 0.5rem;
		margin-bottom: 0.75rem;
	}

	.filters button {
		width: fit-content;
	}

	.kpis {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(7.5rem, 1fr));
		gap: 0.5rem;
		margin-bottom: 0.75rem;
	}

	.kpi {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		padding: 0.6rem 0.75rem;
	}

	.kpi-label {
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--text-faint);
	}

	.kpi-value {
		font-size: 1.3rem;
		font-weight: 650;
		line-height: 1.2;
	}

	.section-title {
		font-size: 0.95rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--text-faint);
		margin-bottom: 0.6rem;
	}

	.spark-wrap {
		position: relative;
		height: 2.75rem;
		margin-bottom: 0.6rem;
	}

	.spark-wrap svg {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		overflow: visible;
	}

	.spark-dot {
		position: absolute;
		width: 0.5rem;
		height: 0.5rem;
		margin: -0.25rem 0 0 -0.25rem;
		border-radius: 50%;
		background: var(--accent-strong);
	}

	.bar-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.bar-list li {
		display: grid;
		grid-template-columns: minmax(3.2rem, 5.5rem) 1fr auto;
		align-items: center;
		gap: 0.45rem;
	}

	.bar-date {
		color: var(--text-faint);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.bar-track {
		height: 0.6rem;
		background: var(--bg-inset);
		border-radius: 999px;
		overflow: hidden;
		outline: 1px solid var(--border);
		outline-offset: -1px;
	}

	.bar-fill {
		display: block;
		height: 100%;
		background: var(--accent);
		border-radius: 999px;
	}

	.bar-value {
		white-space: nowrap;
	}

	.lift-stats {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.4rem;
		margin-bottom: 0.6rem;
	}

	.lift-stats > div {
		display: flex;
		flex-direction: column;
		background: var(--bg-inset);
		border: 1px solid var(--border);
		border-radius: calc(var(--radius) - 2px);
		padding: 0.35rem 0.5rem;
	}

	.recent-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
	}

	.recent-list li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		border-bottom: 1px solid var(--border);
		padding-bottom: 0.45rem;
	}

	.recent-list li:last-child {
		border-bottom: none;
		padding-bottom: 0;
	}

	.recent-list a {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.recent-title {
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.dashboard-card.quick {
		min-height: 4.75rem;
		padding: 0.6rem;
		font-size: 0.9rem;
	}

	/* Infrequent screen: a short, fast entrance. Movement only, never scale(0). */
	.dashboard > :is(.kpis, .card, .grid) {
		transition:
			opacity 220ms var(--ease-out),
			transform 220ms var(--ease-out);
	}

	@starting-style {
		.dashboard > :is(.kpis, .card, .grid) {
			opacity: 0;
			transform: translateY(6px);
		}
	}

	.dashboard > :is(.kpis, .card, .grid):nth-child(2) {
		transition-delay: 40ms;
	}

	.dashboard > :is(.kpis, .card, .grid):nth-child(3) {
		transition-delay: 80ms;
	}

	.dashboard > :is(.kpis, .card, .grid):nth-child(4) {
		transition-delay: 110ms;
	}

	.dashboard > :is(.kpis, .card, .grid):nth-child(n + 5) {
		transition-delay: 140ms;
	}
</style>
