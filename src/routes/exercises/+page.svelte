<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head>
	<title>Exercises · Gym Tracker</title>
</svelte:head>

<main class="page page-wide">
	<div class="row-between">
		<h1>Exercises</h1>
		<span class="chip">{data.exerciseCount} total</span>
	</div>

	<form method="GET" action="/exercises" class="search-form">
		<input
			type="search"
			name="q"
			placeholder="Search exercises by name, muscle, equipment…"
			value={data.query}
			autocomplete="off"
		/>
	</form>

	{#if form?.error}
		<p class="alert alert-danger">{form.error}</p>
	{/if}

	<div class="layout">
		<section class="stack">
			{#if data.exerciseCount === 0}
				<p class="card muted">No exercises added yet.</p>
			{:else if data.total === 0}
				<p class="card muted">No exercises match your search.</p>
			{:else}
				{#each data.groups as group (group.patternName)}
					<details class="card" open>
						<summary>
							<strong>{group.patternName}</strong>
							<span class="faint small">
								({group.exercises.length}
								{group.exercises.length === 1 ? 'exercise' : 'exercises'})
							</span>
						</summary>
						<ul class="exercise-list">
							{#each group.exercises as exercise (exercise.id)}
								<li>
									<a class="exercise-name" href="/exercises/{exercise.id}">{exercise.name}</a>
									<span class="faint small">
										{[exercise.primaryMuscle, exercise.equipment].filter(Boolean).join(' • ')}
									</span>
									{#if exercise.description || exercise.notes}
										<p class="muted small clamp">
											{exercise.description ?? ''}{exercise.description && exercise.notes ? ' — ' : ''}{exercise.notes ?? ''}
										</p>
									{/if}
								</li>
							{/each}
						</ul>
					</details>
				{/each}
			{/if}
		</section>

		<aside>
			<details class="card add-panel">
				<summary>Add new exercise</summary>
				<form method="POST" action="?/create" use:enhance class="stack-sm">
					<div class="field">
						<label for="new_name">Name</label>
						<input id="new_name" name="name" placeholder="e.g. Bench Press" required />
					</div>
					<div class="field">
						<label for="new_muscle">Primary muscle</label>
						<input id="new_muscle" name="primary_muscle" placeholder="e.g. Chest" required />
					</div>
					<div class="field">
						<label for="new_equipment">Equipment</label>
						<input id="new_equipment" name="equipment" placeholder="e.g. Barbell, Bench" />
					</div>
					<div class="field">
						<label for="new_pattern">Movement pattern</label>
						<select id="new_pattern" name="movement_pattern_id" required>
							<option value="">-- Select movement pattern --</option>
							{#each data.movementPatterns as pattern (pattern.id)}
								<option value={pattern.id}>{pattern.name}</option>
							{/each}
						</select>
					</div>
					<div class="field">
						<label for="new_description">Description</label>
						<input id="new_description" name="description" placeholder="Short description" />
					</div>
					<div class="field">
						<label for="new_notes">Notes</label>
						<input id="new_notes" name="notes" placeholder="Rest time, form cues…" />
					</div>
					<button class="btn-primary" type="submit">Add exercise</button>
				</form>
			</details>
		</aside>
	</div>
</main>

<style>
	.layout {
		display: grid;
		grid-template-columns: 1fr;
		gap: 1rem;
	}

	/* Grid items default to min-width:auto, which lets the nowrap .clamp text
	   below force the column (and the page) wider than the viewport. */
	.layout > * {
		min-width: 0;
	}

	@media (min-width: 60rem) {
		.layout {
			grid-template-columns: 1.6fr 1fr;
			align-items: start;
		}

		aside {
			position: sticky;
			top: 4rem;
		}
	}

	.search-form {
		margin-bottom: 1rem;
	}

	details summary {
		cursor: pointer;
	}

	.exercise-list {
		list-style: none;
		margin: 0;
		padding: 0.5rem 0 0;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}

	.exercise-name {
		font-weight: 600;
		margin-right: 0.5rem;
	}

	.clamp {
		margin: 0.1rem 0 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 100%;
	}

	.add-panel summary {
		font-weight: 600;
		margin-bottom: 0.5rem;
	}
</style>
