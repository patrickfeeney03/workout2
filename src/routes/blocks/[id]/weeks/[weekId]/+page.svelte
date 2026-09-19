<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const block = $derived(data.block);
	const week = $derived(data.week);

	const currentWeekNumber = $derived(week.weekNumber ?? 0);
	const currentWeekType = $derived(week.weekType ?? '');
	// PHP keeps a selected option for week numbers/types outside the canonical lists.
	const customWeekNumber = $derived(
		currentWeekNumber !== -1 && !data.weekNumbers.includes(currentWeekNumber)
	);
	const customWeekType = $derived(currentWeekType !== '' && !data.weekTypes.includes(currentWeekType));

	function submitOnChange(event: Event) {
		const target = event.currentTarget as HTMLElement;
		(target.closest('form') as HTMLFormElement | null)?.requestSubmit();
	}
</script>

<svelte:head>
	<title>{block.name} · Week {currentWeekNumber} · Gym Tracker</title>
</svelte:head>

<main class="page page-wide">
	<div class="row-between">
		<div class="breadcrumbs">
			<a href="/blocks">Blocks</a>
			<span class="faint">/</span>
			<a href="/blocks/{block.id}">{block.name}</a>
			<span class="faint">/</span>
			<span>Week {currentWeekNumber}</span>
		</div>
		<form
			method="POST"
			action="?/delete"
			use:enhance
			onsubmit={(event) => {
				if (!confirm('Delete this week?')) event.preventDefault();
			}}
		>
			<button class="btn btn-danger btn-sm" type="submit">Delete week</button>
		</form>
	</div>

	<section class="card">
		<form method="POST" action="?/update_week" use:enhance class="stack-sm">
			<div class="two-col">
				<div class="field">
					<label for="week_number">Week number</label>
					<select
						id="week_number"
						name="week_number"
						value={String(currentWeekNumber)}
						onchange={submitOnChange}
					>
						{#if currentWeekNumber === -1}
							<option value="-1">No Week</option>
						{/if}
						{#each data.weekNumbers as weekNumber (weekNumber)}
							<option value={String(weekNumber)}>Week {weekNumber}</option>
						{/each}
						{#if customWeekNumber}
							<option value={String(currentWeekNumber)}>Week {currentWeekNumber}</option>
						{/if}
					</select>
				</div>
				<div class="field">
					<label for="week_type">Week type</label>
					<select id="week_type" name="week_type" value={currentWeekType} onchange={submitOnChange}>
						<option value="">Standard</option>
						{#each data.weekTypes as weekType (weekType)}
							<option value={weekType}>{weekType}</option>
						{/each}
						{#if customWeekType}
							<option value={currentWeekType}>{currentWeekType}</option>
						{/if}
					</select>
				</div>
			</div>
			<div class="two-col">
				<div class="field">
					<label for="starts_on">Starts on</label>
					<input
						id="starts_on"
						name="starts_on"
						type="date"
						value={week.startsOn ?? ''}
						onchange={submitOnChange}
					/>
				</div>
				<div class="field">
					<label for="ends_on">Ends on</label>
					<input id="ends_on" name="ends_on" type="date" value={week.endsOn ?? ''} onchange={submitOnChange} />
				</div>
			</div>
			<div class="field">
				<label for="notes">Notes</label>
				<input id="notes" name="notes" value={week.notes ?? ''} onchange={submitOnChange} />
			</div>
			<button class="btn btn-primary btn-sm" type="submit">Save</button>
		</form>
	</section>

	<section class="stack">
		<h2>Workouts assigned to this week</h2>

		{#each data.workouts as entry (entry.workout.id)}
			<article class="card">
				<div class="row-between">
					<h3 class="workout-title">
						<a href="/workouts/{entry.workout.id}">{entry.workout.title || 'Untitled Workout'}</a>
					</h3>
					<div class="row">
						<span class="faint small">{entry.dateLabel}</span>
						<span class="chip">{entry.workout.status}</span>
					</div>
				</div>

				{#if entry.exercises.length === 0}
					<p class="muted small">No exercises assigned to this workout yet.</p>
				{:else}
					<ul class="exercise-list">
						{#each entry.exercises as exerciseName, index (index)}
							<li>{exerciseName}</li>
						{/each}
					</ul>
				{/if}
			</article>
		{/each}

		{#if data.workouts.length === 0}
			<p class="card muted">No workouts have been assigned to this week yet.</p>
		{/if}
	</section>
</main>

<style>
	.breadcrumbs {
		display: flex;
		gap: 0.4rem;
		align-items: center;
		margin-bottom: 0.5rem;
		font-size: 0.9rem;
	}

	.two-col {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.5rem;
	}

	.workout-title {
		margin: 0;
		font-size: 1.05rem;
	}

	.exercise-list {
		margin: 0.6rem 0 0;
		padding-left: 1.2rem;
	}

	.exercise-list li {
		margin-bottom: 0.15rem;
	}
</style>
