<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>{data.pattern.name} · Gym Tracker</title>
</svelte:head>

<main class="page">
	<div class="breadcrumbs">
		<a href="/movement-patterns">Movement patterns</a>
		<span class="faint">/</span>
		<span>{data.pattern.name}</span>
	</div>

	<div class="row-between">
		<h1>{data.pattern.name}</h1>
		<a class="btn btn-sm" href="/movement-patterns?edit_pattern={data.pattern.id}">Edit</a>
	</div>

	{#if data.pattern.notes}
		<p class="card muted">{data.pattern.notes}</p>
	{/if}

	<section class="card">
		<h2 class="section-title">
			Exercises
			<span class="faint small">
				({data.exercises.length}
				{data.exercises.length === 1 ? 'exercise' : 'exercises'})
			</span>
		</h2>
		{#if data.exercises.length === 0}
			<p class="muted small">No exercises use this movement pattern yet.</p>
		{:else}
			<ul class="exercise-list">
				{#each data.exercises as exercise (exercise.id)}
					<li>
						<a href="/exercises/{exercise.id}">{exercise.name}</a>
						{#if exercise.primaryMuscle || exercise.equipment}
							<span class="faint small">
								{[exercise.primaryMuscle, exercise.equipment].filter(Boolean).join(' • ')}
							</span>
						{/if}
					</li>
				{/each}
			</ul>
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

	.section-title {
		font-size: 0.95rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--text-faint);
		margin-bottom: 0.6rem;
	}

	.exercise-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.exercise-list li {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.5rem;
	}

	.exercise-list a {
		font-weight: 600;
	}
</style>
