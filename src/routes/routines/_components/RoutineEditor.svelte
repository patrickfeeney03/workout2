<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import type { SubmitFunction } from '@sveltejs/kit';
	import LocalTime from './LocalTime.svelte';
	import type { RoutinePageData } from '../_server/routineData';

	let {
		data,
		form = null,
		showMeta = false
	}: {
		data: RoutinePageData;
		form?: { error?: string } | null;
		showMeta?: boolean;
	} = $props();

	const routine = $derived(data.routine);
	/** The PHP set editor only offered these two types. */
	const SET_TYPES = ['working', 'warmup'];

	/**
	 * Autosave refreshes the server data but must not reset the form (the value just typed would snap
	 * back) nor go through the default `update()`, which calls `reset_focus` and would blur the field
	 * the visitor has just tabbed into.
	 */
	const keepValues: SubmitFunction = () => async ({ result, update }) => {
		if (result.type === 'success') {
			await invalidateAll();
			return;
		}
		await update({ reset: false });
	};

	/** Save-on-change: mirrors the PHP form's `hx-trigger="change"` on `update_routine_sets`. */
	function submitOnChange(event: Event) {
		const element = event.currentTarget as HTMLElement;
		(element.closest('form') as HTMLFormElement | null)?.requestSubmit();
	}

	function confirmDeleteRoutine(event: Event) {
		if (!confirm('Are you sure you want to completely delete this routine?')) {
			event.preventDefault();
		}
	}

	function confirmRemoveExercise(event: Event) {
		if (!confirm('Are you sure?')) {
			event.preventDefault();
		}
	}

	function confirmDeleteSet(event: Event) {
		if (!confirm('Delete this set?')) {
			event.preventDefault();
		}
	}
</script>

{#if showMeta}
	<section class="card">
		<h2 class="section-title">Routine settings</h2>
		<form method="POST" action="?/update_routine" use:enhance class="stack-sm">
			<input type="hidden" name="id" value={routine.id} />
			<div class="field">
				<label for="routine_name">Name</label>
				<input id="routine_name" name="name" value={routine.name} placeholder="name" />
			</div>
			<div class="field">
				<label for="routine_description">Description</label>
				<input
					id="routine_description"
					name="description"
					value={routine.description ?? ''}
					placeholder="Description"
				/>
			</div>
			<div class="two-col">
				<div class="field">
					<label for="routine_split_name">Split name</label>
					<input
						id="routine_split_name"
						name="split_name"
						value={routine.splitName ?? ''}
						placeholder="Split name"
					/>
				</div>
				<div class="field">
					<label for="routine_split_day">Split day</label>
					<input
						id="routine_split_day"
						name="split_day"
						value={routine.splitDay ?? ''}
						placeholder="Split day"
					/>
				</div>
			</div>
			<div class="field">
				<label for="routine_notes">Notes</label>
				<input id="routine_notes" name="notes" value={routine.notes ?? ''} placeholder="Notes" />
			</div>
			<div class="row">
				<button class="btn btn-primary btn-sm" type="submit">Update</button>
				<a class="btn btn-ghost btn-sm" href="/routines">Go back to list</a>
			</div>
		</form>
	</section>
{/if}

{#if form?.error}
	<p class="alert alert-danger">{form.error}</p>
{/if}

<div class="row-between routine-head">
	<div class="stack-sm">
		<div class="muted small">
			Day {routine.splitDay ?? '—'} · {routine.description ?? ''}
		</div>
		<div class="faint small">Part of: {routine.splitName ?? '—'}</div>
	</div>
	<form method="POST" action="?/delete_routine" use:enhance onsubmit={confirmDeleteRoutine}>
		<input type="hidden" name="routine_id" value={routine.id} />
		<button class="btn btn-danger btn-sm" type="submit">Delete routine</button>
	</form>
</div>

<h2 class="section-title">Routine exercises</h2>

<div class="stack">
	{#each data.items as item (item.routineExercise.id)}
		{@const re = item.routineExercise}
		<section class="card">
			<div class="exercise-head">
				<div class="move-col">
					<button
						class="btn btn-ghost btn-sm move-btn"
						type="submit"
						form="move-exercise-{re.id}"
						name="direction"
						value="up"
						title="Move up"
						aria-label="Move exercise up">▲</button
					>
					<button
						class="btn btn-ghost btn-sm move-btn"
						type="submit"
						form="move-exercise-{re.id}"
						name="direction"
						value="down"
						title="Move down"
						aria-label="Move exercise down">▼</button
					>
				</div>

				<div class="exercise-title">
					{#if item.exercise}
						<a href="/exercises/{item.exercise.id}"><strong>{item.exercise.name}</strong></a>
						{#if item.exercise.equipment}
							<div class="faint small upper">⚙️ {item.exercise.equipment}</div>
						{/if}
						{#if item.exercise.notes}
							<div class="muted small italic">{item.exercise.notes}</div>
						{/if}
					{:else}
						<strong class="muted">Unknown exercise</strong>
					{/if}
				</div>

				<form
					method="POST"
					action="?/delete_routine_exercise"
					use:enhance
					onsubmit={confirmRemoveExercise}
				>
					<input type="hidden" name="routine_exercise_id" value={re.id} />
					<input type="hidden" name="routine_id" value={routine.id} />
					<button class="btn btn-sm" type="submit">Remove</button>
				</form>
			</div>

			<form method="POST" action="?/update_routine_sets" use:enhance={keepValues} class="stack-sm">
				<input type="hidden" name="routine_exercise_id" value={re.id} />
				<input type="hidden" name="routine_id" value={routine.id} />

				<div class="row rest-row">
					<label for="target_rest-{re.id}">Target rest</label>
					<input
						class="medium-input"
						id="target_rest-{re.id}"
						name="target_rest"
						value={re.targetRest ?? ''}
						placeholder="x mins"
						onchange={submitOnChange}
					/>
				</div>

				<div class="field">
					<label for="exercise_notes-{re.id}">Notes / Warm-up</label>
					<textarea
						id="exercise_notes-{re.id}"
						name="routine_exercise_notes"
						rows="2"
						placeholder="e.g. Any special warmup routine for this exercise"
						onchange={submitOnChange}>{re.notes ?? ''}</textarea
					>
				</div>

				{#if item.lastUpdated}
					<div class="faint small">
						⏱️ Last set updated: <LocalTime timestamp={item.lastUpdated} />
					</div>
				{/if}

				{#if item.sets.length === 0}
					<p class="muted small">No sets yet. Add one below.</p>
				{/if}

				{#each item.sets as set (set.id)}
					<div class="set-row">
						<div class="move-col">
							<button
								class="btn btn-ghost btn-sm move-btn"
								type="submit"
								form="move-set-{set.id}"
								name="direction"
								value="up"
								title="Move up"
								aria-label="Move set up">▲</button
							>
							<button
								class="btn btn-ghost btn-sm move-btn"
								type="submit"
								form="move-set-{set.id}"
								name="direction"
								value="down"
								title="Move down"
								aria-label="Move set down">▼</button
							>
						</div>
						<span class="set-index num faint">{set.setNumber}.</span>
						<input
							class="small-input"
							type="number"
							step="any"
							inputmode="decimal"
							name="target_reps[{set.id}]"
							value={set.targetReps ?? ''}
							aria-label="Target reps"
							onchange={submitOnChange}
						/>
						<input
							class="medium-input"
							type="number"
							step="any"
							inputmode="decimal"
							name="target_weight[{set.id}]"
							value={set.targetWeight ?? ''}
							aria-label="Target weight"
							onchange={submitOnChange}
						/>
						<span class="faint small unit">kg</span>
						<select name="set_type[{set.id}]" aria-label="Set type" onchange={submitOnChange}>
							{#if !SET_TYPES.includes(set.setType)}
								<option value={set.setType} selected>{set.setType}</option>
							{/if}
							{#each SET_TYPES as type}
								<option value={type} selected={set.setType === type}>{type}</option>
							{/each}
						</select>
						<button
							class="btn btn-ghost set-delete"
							type="submit"
							form="delete-set-{set.id}"
							title="Remove set"
							aria-label="Remove set"
							onclick={confirmDeleteSet}>×</button
						>
					</div>
					<textarea
						class="set-note"
						name="notes[{set.id}]"
						rows="1"
						placeholder="Add note…"
						onchange={submitOnChange}>{set.notes ?? ''}</textarea
					>
				{/each}

				<div class="row">
					<button class="btn btn-sm" type="submit" form="add-set-{re.id}">Add set</button>
				</div>
			</form>

			<form id="move-exercise-{re.id}" method="POST" action="?/move_routine_exercise" use:enhance>
				<input type="hidden" name="routine_id" value={routine.id} />
				<input type="hidden" name="routine_exercise_id" value={re.id} />
			</form>
			<form id="add-set-{re.id}" method="POST" action="?/add_blank_set" use:enhance>
				<input type="hidden" name="routine_exercise_id" value={re.id} />
			</form>
			{#each item.sets as set (set.id)}
				<form id="move-set-{set.id}" method="POST" action="?/move_routine_set" use:enhance>
					<input type="hidden" name="set_id" value={set.id} />
					<input type="hidden" name="routine_id" value={routine.id} />
				</form>
				<form id="delete-set-{set.id}" method="POST" action="?/delete_routine_set" use:enhance>
					<input type="hidden" name="set_id" value={set.id} />
				</form>
			{/each}
		</section>
	{/each}
</div>

<details class="card add-exercise" open={data.items.length === 0}>
	<summary>Add exercise</summary>
	<p class="muted small">
		Choose an exercise and add it. Once added you can set the sets, weight, etc.
	</p>
	<form method="POST" action="?/handle_add_exercise" use:enhance class="stack-sm">
		<input type="hidden" name="routine_id" value={routine.id} />

		<div class="field">
			<label for="exercise_id">Existing exercises</label>
			<select id="exercise_id" name="exercise_id">
				<option value="">-- Choose an exercise --</option>
				{#each data.exerciseGroups as group (group.patternName)}
					<optgroup label={group.patternName}>
						{#each group.exercises as exercise (exercise.id)}
							<option value={exercise.id}>
								{exercise.name}{exercise.primaryMuscle ? ` - ${exercise.primaryMuscle}` : ''}
							</option>
						{/each}
					</optgroup>
				{/each}
			</select>
		</div>

		<div class="or">OR</div>

		<div class="field">
			<label for="new_exercise_name">Quick-add an exercise that is not in the database</label>
			<input
				id="new_exercise_name"
				type="text"
				name="new_exercise_name"
				placeholder="e.g. 100m Sprints"
			/>
		</div>
		<p class="faint small">
			Anything added to quick-add is created as an exercise in the exercises database.
		</p>

		<button class="btn btn-primary btn-sm" type="submit">Add exercise</button>
	</form>
</details>

<style>
	.section-title {
		font-size: 0.95rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--text-faint);
		margin-bottom: 0.6rem;
	}

	.routine-head {
		margin-bottom: 0.75rem;
	}

	.exercise-head {
		display: flex;
		align-items: flex-start;
		gap: 0.4rem;
		margin-bottom: 0.5rem;
	}

	.move-col {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
	}

	.move-btn {
		min-height: 1.5rem;
		padding: 0 0.3rem;
		font-size: 0.7rem;
		line-height: 1;
	}

	.exercise-title {
		flex: 1;
		min-width: 0;
	}

	.upper {
		text-transform: uppercase;
		font-weight: 600;
	}

	.italic {
		font-style: italic;
		line-height: 1.3;
	}

	.rest-row {
		gap: 0.35rem;
	}

	.rest-row label {
		margin: 0;
		white-space: nowrap;
	}

	.set-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.35rem;
		padding: 0.3rem 0 0.15rem;
		border-bottom: 1px solid var(--border);
	}

	.set-index {
		min-width: 1.5rem;
	}

	.unit {
		margin-left: -0.2rem;
	}

	.set-row select {
		width: auto;
		min-width: 6.5rem;
		padding: 0.25rem 0.4rem;
		min-height: 2.5rem;
		font-size: 0.85rem;
	}

	.set-delete {
		min-height: 2.5rem;
		min-width: 2.25rem;
		padding: 0 0.4rem;
		font-size: 1.1rem;
		line-height: 1;
		opacity: 0.6;
	}

	.set-note {
		min-height: 2.2rem;
		margin: 0.15rem 0 0.4rem;
		padding: 0.25rem 0.5rem;
		font-size: 0.9rem;
	}

	.add-exercise summary {
		font-weight: 600;
		cursor: pointer;
	}

	.add-exercise p {
		margin: 0.5rem 0;
	}

	.or {
		font-weight: 700;
		color: var(--text-faint);
	}
</style>
