<script lang="ts">
	import { onMount } from 'svelte';
	import { enhance } from '$app/forms';
	import { preloadData } from '$app/navigation';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// SvelteKit keeps one preloaded navigation at a time, and a phone has no hover: warm the first
	// (most recent) workout while the list is idle so tapping it renders without a data round trip.
	// Other links are preloaded by the router on touchstart, just before the tap.
	onMount(() => {
		const first = document.querySelector<HTMLAnchorElement>('a[href^="/workouts/"]');
		if (first) void preloadData(first.href).catch(() => {});
	});

	function ucfirst(value: string | null): string {
		return value ? value.charAt(0).toUpperCase() + value.slice(1) : '';
	}

	function statusClass(status: string | null): string {
		if (status === 'completed') return 'chip chip-accent';
		if (status === 'skipped') return 'chip chip-danger';
		return 'chip';
	}
</script>

<svelte:head>
	<title>Workouts · Gym Tracker</title>
</svelte:head>

<main class="page">
	<div class="row-between">
		<h1>Workouts</h1>
		<span class="chip">{data.items.length} total</span>
	</div>

	<details class="card">
		<summary><strong>Log a New Workout</strong></summary>
		<form method="POST" action="?/handle_workout" use:enhance class="stack-sm log-form">
			<div class="grid">
				<div class="field">
					<label for="block_week_id">Week</label>
					<select id="block_week_id" name="block_week_id" required>
						<option value="" selected disabled>-- Choose a week --</option>
						<option value="0">No Week</option>
						{#each data.trainingBlocks as block (block.id)}
							<optgroup label={block.name}>
								{#each data.weeksByBlock[block.id] ?? [] as week (week.id)}
									<option value={week.id}>
										Week {week.weekNumber} - {week.weekType ?? ''}
										({data.weekRanges[week.id]})
									</option>
								{/each}
							</optgroup>
						{/each}
					</select>
				</div>
				<div class="field">
					<label for="routine_id">Routine</label>
					<select id="routine_id" name="routine_id" required>
						<option value="" selected disabled>-- Choose a routine --</option>
						<option value="0">No Routine</option>
						{#each data.routines as routine (routine.id)}
							<option value={routine.id}>{routine.name}</option>
						{/each}
					</select>
				</div>
			</div>

			<div class="grid">
				<div class="field">
					<label for="title">Title</label>
					<input id="title" name="title" placeholder="Workout title" required />
				</div>
				<div class="field">
					<label for="planned_on">Date</label>
					<input
						id="planned_on"
						name="planned_on"
						type="date"
						required
						value={data.today}
						onclick={(event) => (event.currentTarget as HTMLInputElement).showPicker?.()}
					/>
				</div>
			</div>

			<button class="btn-primary" type="submit">Create Workout</button>
		</form>
	</details>

	<h3>Recent Workouts</h3>

	{#if data.items.length === 0}
		<p class="card muted">No workouts logged yet.</p>
	{:else}
		<div class="stack">
			{#each data.items as item (item.workout.id)}
				<article class="card">
					<div class="row-between">
						<div class="row">
							<strong>
								<a href={`/workouts/${item.workout.id}`}>{item.workout.title}</a>
							</strong>
							<span class={statusClass(item.workout.status)}>
								{ucfirst(item.workout.status)}
							</span>
						</div>
						<span class="faint small">{item.plannedLabel}</span>
					</div>

					{#if item.routine || item.week}
						<div class="meta stack-sm">
							{#if item.routine}
								<div>
									<strong>Routine:</strong>
									{item.routine.name}
									{#if item.routine.splitName || item.routine.splitDay}
										— <em>{item.routine.splitName ?? ''} (Day {item.routine.splitDay ?? ''})</em>
									{/if}
								</div>
							{/if}
							{#if item.week}
								<div>
									<strong>Block:</strong>
									{item.block?.name ?? 'Unknown Block'}
									— Week {item.week.weekNumber ?? ''}
									({item.week.weekType || 'Standard'})
								</div>
							{/if}
						</div>
					{/if}

					{#if item.performedLabel || item.durationMinutes}
						<div class="meta muted">
							{#if item.performedLabel}
								Performed: {item.performedLabel}
							{/if}
							{#if item.performedLabel && item.durationMinutes}
								•
							{/if}
							{#if item.durationMinutes}
								{item.durationMinutes} mins
							{/if}
						</div>
					{/if}
				</article>
			{/each}
		</div>
	{/if}
</main>

<style>
	details summary {
		cursor: pointer;
		font-size: 1.1rem;
	}

	.log-form {
		padding: 0.5rem 0 0;
	}

	.meta {
		margin-top: 0.5rem;
		font-size: 0.9rem;
	}

	.meta strong {
		font-weight: 600;
	}
</style>
