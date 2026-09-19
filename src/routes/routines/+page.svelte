<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head>
	<title>Routines · Gym Tracker</title>
</svelte:head>

<main class="page page-wide">
	<div class="row-between">
		<h1>Routines</h1>
		<span class="chip">{data.routines.length} total</span>
	</div>

	{#if form?.error}
		<p class="alert alert-danger">{form.error}</p>
	{/if}

	<details class="card add-panel">
		<summary>Add new routine</summary>
		<form method="POST" action="?/handle_routine_exercise" use:enhance class="stack-sm">
			<div class="field">
				<label for="new_routine_name">Name</label>
				<input id="new_routine_name" name="name" placeholder="name for routine" required />
			</div>
			<div class="field">
				<label for="new_routine_description">Description</label>
				<input
					id="new_routine_description"
					name="description"
					placeholder="description for routine"
				/>
			</div>
			<div class="two-col">
				<div class="field">
					<label for="new_routine_split_name">Split name</label>
					<input id="new_routine_split_name" name="split_name" placeholder="name of the split" />
				</div>
				<div class="field">
					<label for="new_routine_split_day">Split day</label>
					<input id="new_routine_split_day" name="split_day" placeholder="split" />
				</div>
			</div>
			<div class="field">
				<label for="new_routine_notes">Notes</label>
				<textarea id="new_routine_notes" name="notes" rows="2" placeholder="any notes"></textarea>
			</div>
			<button class="btn btn-primary" type="submit">Add new routine</button>
		</form>
	</details>

	{#if data.routines.length === 0}
		<p class="card muted">No routines yet.</p>
	{/if}

	<div class="stack routine-list">
		{#each data.routines as routine (routine.id)}
			<article class="card" id="routine-{routine.id}">
				<div class="row-between">
					<a href="/routines/{routine.id}"><strong>{routine.name}</strong></a>
					<a class="btn btn-ghost btn-sm" href="/routines/{routine.id}/edit">Edit</a>
				</div>
				<div class="muted small">
					Day {routine.splitDay ?? '—'} - {routine.description ?? ''}
				</div>
				<div class="faint small">Part of: {routine.splitName ?? '—'}</div>

				{#if (data.exercisesByRoutine[routine.id] ?? []).length > 0}
					<ol class="exercise-list">
						{#each data.exercisesByRoutine[routine.id] ?? [] as exercise (exercise.id)}
							<li>
								<a href="/exercises/{exercise.id}">{exercise.name}</a>
								<span class="faint small">
									{exercise.setCount}
									{exercise.setCount === 1 ? 'set' : 'sets'}
								</span>
							</li>
						{/each}
					</ol>
				{/if}
			</article>
		{/each}
	</div>
</main>

<style>
	.add-panel summary {
		font-weight: 600;
		cursor: pointer;
	}

	.add-panel form {
		margin-top: 0.6rem;
	}

	.two-col {
		display: grid;
		grid-template-columns: 1fr;
		gap: 0.5rem;
	}

	@media (min-width: 40rem) {
		.two-col {
			grid-template-columns: 1fr 1fr;
		}
	}

	.routine-list {
		margin-top: 0.75rem;
	}

	.exercise-list {
		margin: 0.5rem 0 0;
		padding-left: 1.25rem;
	}

	.exercise-list li {
		margin-bottom: 0.15rem;
	}
</style>
