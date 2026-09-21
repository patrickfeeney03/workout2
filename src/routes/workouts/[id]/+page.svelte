<script lang="ts">
	import { applyAction, enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import HoldToDelete from '$lib/components/HoldToDelete.svelte';
	import SaveState from '$lib/components/SaveState.svelte';
	import WeekPicker from '$lib/components/WeekPicker.svelte';
	import type { SaveState as SaveStateValue } from '$lib/types';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const workout = $derived(data.workout);
	const allSets = $derived(data.exercises.flatMap((item) => item.sets));
	const overallUpdated = $derived(latestStamp(allSets.map((set) => set.modifiedAt)));

	const durationSeconds = $derived(workout.durationSeconds);
	const durationHours = $derived(
		durationSeconds === null ? '' : String(Math.floor(durationSeconds / 3600))
	);
	const durationMinutes = $derived(
		durationSeconds === null ? '' : String(Math.floor((durationSeconds % 3600) / 60))
	);
	const durationSecs = $derived(durationSeconds === null ? '' : String(durationSeconds % 60));

	/** Last `modified_at` among the given SQLite timestamps, shown as compact UTC. */
	function latestStamp(values: (string | null | undefined)[]): string | null {
		let latest: string | null = null;
		for (const value of values) {
			if (value && (latest === null || value > latest)) latest = value;
		}
		return latest ? `${latest.replace('T', ' ').slice(0, 16)} UTC` : null;
	}

	/** Auto-save on change: submit the enclosing form, keep the values the user just typed. */
	function autoSave(event: Event) {
		const element = event.currentTarget as HTMLFormElement | null;
		element?.requestSubmit();
	}

	// -------------------------------------------------------------------------
	// Per-form save state.
	//
	// Every form saves independently and shows its own saving/saved/error state. Saves are
	// serialized per form: while one request is in flight another change is remembered and
	// resubmitted as soon as the first response lands. The resubmission starts *before* `update()`
	// re-renders the server data, so it captures the newest values the user typed — a slow earlier
	// response can never overwrite a newer edit.
	// -------------------------------------------------------------------------

	const saveStates = $state<Record<string, SaveStateValue>>({});
	const inFlight = new Map<string, boolean>();
	const queued = new Map<string, { form: HTMLFormElement; submitter: HTMLElement | null }>();
	const idleTimers = new Map<string, ReturnType<typeof setTimeout>>();

	/** Status returned by the last save, so set saves do not need a full page reload. */
	let workoutStatus = $state<string | null>(null);

	function setSaveState(name: string, state: SaveStateValue) {
		const timer = idleTimers.get(name);
		if (timer) clearTimeout(timer);
		saveStates[name] = state;
		if (state === 'saved') {
			idleTimers.set(
				name,
				setTimeout(() => {
					if (saveStates[name] === 'saved') saveStates[name] = 'idle';
				}, 2500)
			);
		}
	}

	/**
	 * `use:enhance` handler for one form. `invalidateAll: false` keeps single-field auto-saves from
	 * re-running the whole D1-backed page load (the server stores exactly what was posted, so the
	 * page data would not change anyway). The default keeps the form values instead of resetting
	 * them, so a failed save never loses what the user typed.
	 */
	function enhanceForm(name: string, options: { invalidateAll?: boolean } = {}): SubmitFunction {
		return ({ formElement, submitter, cancel }) => {
			if (inFlight.get(name)) {
				queued.set(name, { form: formElement, submitter });
				cancel();
				return;
			}

			inFlight.set(name, true);
			setSaveState(name, 'saving');

			return async ({ result, update }) => {
				inFlight.delete(name);

				if (result.type === 'success') {
					// The server returns the (possibly auto-completed) status so the page can reflect it
					// without re-running the whole load; any other success falls back to the loaded data.
					const status = (result.data as { status?: unknown } | undefined)?.status;
					workoutStatus = typeof status === 'string' ? status : null;
					const next = queued.get(name);
					queued.delete(name);
					if (next) {
						try {
							// Captures the newest values before `update()` can re-render them over.
							next.form.requestSubmit(next.submitter ?? undefined);
						} catch {
							// The queued button is no longer in the form; the typed values are still there,
							// so a manual save or the next change submits them.
						}
					}
					// SvelteKit's default action update resets focus to the body after success.
					// Capture the control that is focused when the response arrives and restore it
					// only if the update actually stole focus; this never overrides a newer user focus.
					const focusTarget =
						document.activeElement instanceof HTMLElement &&
						document.activeElement !== document.body
							? document.activeElement
							: null;
					await update({ reset: false, invalidateAll: options.invalidateAll ?? true });
					if (
						focusTarget?.isConnected &&
						document.activeElement === document.body
					) {
						focusTarget.focus({ preventScroll: true });
					}
					if (!next) setSaveState(name, 'saved');
					return;
				}

				queued.delete(name);
				if (result.type !== 'redirect') setSaveState(name, 'error');
				await applyAction(result);
			};
		};
	}

	function confirmSubmit(message: string) {
		return (event: Event) => {
			if (!confirm(message)) event.preventDefault();
		};
	}
</script>

<svelte:head>
	<title>{workout.title ?? 'Workout'} · Gym Tracker</title>
</svelte:head>

<main class="page">
	<div class="crumbs">
		<a href="/workouts">Workouts</a>
		<span class="faint">/</span>
		<span class="truncate">{workout.title ?? 'Workout'}</span>
	</div>

	<section class="card">
		<div class="head-grid">
			<form
				method="POST"
				action="?/update_title"
				use:enhance={enhanceForm('title')}
				onchange={autoSave}
				class="field span-2"
			>
				<label for="title">Title</label>
				<div class="row tight">
					<input id="title" name="title" value={workout.title ?? ''} autocomplete="off" class="grow" />
					<button class="btn btn-sm btn-ghost" type="submit">Save</button>
					<SaveState state={saveStates.title ?? 'idle'} />
				</div>
			</form>

			<form method="POST" action="?/update_planned_on" use:enhance={enhanceForm('planned_on', { invalidateAll: false })} onchange={autoSave} class="field">
				<label for="planned_on">Planned date</label>
				<div class="row tight">
					<input
						id="planned_on"
						name="planned_on"
						type="date"
						value={workout.plannedOn ?? ''}
						class="grow"
						onclick={(event) => (event.currentTarget as HTMLInputElement).showPicker?.()}
					/>
					<button class="btn btn-sm btn-ghost" type="submit">Save</button>
					<SaveState state={saveStates.planned_on ?? 'idle'} />
				</div>
			</form>

			<form method="POST" action="?/update_status" use:enhance={enhanceForm('status', { invalidateAll: false })} onchange={autoSave} class="field">
				<label for="status">Status</label>
				<div class="row tight">
					<select id="status" name="status" class="grow" value={workoutStatus ?? workout.status ?? 'planned'}>
						<option value="planned">Planned</option>
						<option value="completed">Completed</option>
						<option value="skipped">Skipped</option>
					</select>
					<button class="btn btn-sm btn-ghost" type="submit">Save</button>
					<SaveState state={saveStates.status ?? 'idle'} />
				</div>
			</form>

			<form method="POST" action="?/update_duration" use:enhance={enhanceForm('duration', { invalidateAll: false })} onchange={autoSave} class="field">
				<label for="duration_hours">Duration</label>
				<div class="row tight">
					<input
						id="duration_hours"
						name="duration_hours"
						type="number"
						min="0"
						class="small-input num"
						placeholder="0"
						value={durationHours}
					/>
					<span class="faint small">h</span>
					<input
						name="duration_minutes"
						type="number"
						min="0"
						max="59"
						class="small-input num"
						placeholder="0"
						value={durationMinutes}
						aria-label="Duration minutes"
					/>
					<span class="faint small">m</span>
					<input
						name="duration_secs"
						type="number"
						min="0"
						max="59"
						class="small-input num"
						placeholder="0"
						value={durationSecs}
						aria-label="Duration seconds"
					/>
					<span class="faint small">s</span>
					<button class="btn btn-sm btn-ghost" type="submit">Save</button>
					<SaveState state={saveStates.duration ?? 'idle'} />
				</div>
			</form>

			<form method="POST" action="?/update_body_weight" use:enhance={enhanceForm('body_weight', { invalidateAll: false })} onchange={autoSave} class="field">
				<label for="body_weight">Body weight</label>
				<div class="row tight">
					<input
						id="body_weight"
						name="body_weight"
						type="number"
						step="any"
						class="medium-input num"
						value={workout.bodyWeight ?? ''}
					/>
					<span class="faint small">kg</span>
					<button class="btn btn-sm btn-ghost" type="submit">Save</button>
					<SaveState state={saveStates.body_weight ?? 'idle'} />
				</div>
			</form>

			<form method="POST" action="?/update_week" use:enhance={enhanceForm('week')} onchange={autoSave} class="field span-2">
				<label for="block_week_id">Week</label>
				<div class="row tight">
					<div class="grow">
						<WeekPicker
							id="block_week_id"
							label="Week"
							name="block_week_id"
							blocks={data.trainingBlocks}
							weeksByBlock={data.weeksByBlock}
							value={workout.blockWeekId}
							noneLabel="-- None --"
						/>
					</div>
					<button class="btn btn-sm btn-ghost" type="submit">Save</button>
					{#if workout.blockWeekId && data.week?.trainingBlockId}
						<a class="small" href={`/blocks/${data.week.trainingBlockId}/weeks/${workout.blockWeekId}`}>View</a>
					{/if}
					<SaveState state={saveStates.week ?? 'idle'} />
				</div>
			</form>

			<form method="POST" action="?/create_week" use:enhance class="field span-2">
				<label for="new_week_block_id">New week</label>
				<div class="row tight">
					<select id="new_week_block_id" name="training_block_id" class="grow">
						{#each data.trainingBlocks as block (block.id)}
							<option value={block.id} selected={block.id === data.currentBlockId}>{block.name}</option>
						{/each}
					</select>
					<select name="week_number" class="grow" aria-label="Week number">
						{#each data.weekNumbers as weekNumber (weekNumber)}
							<option value={weekNumber} selected={weekNumber === data.nextWeekNumber}>
								Week {weekNumber}
							</option>
						{/each}
					</select>
					<select name="week_type" class="grow" aria-label="Week type">
						{#each data.weekTypes as weekType (weekType)}
							<option value={weekType}>{weekType}</option>
						{/each}
					</select>
					<button class="btn btn-sm" type="submit">Create</button>
				</div>
			</form>

			<div class="row span-2 meta">
				{#if workout.routineId}
					<a class="small" href={`/routines/${workout.routineId}`}>Template routine</a>
				{/if}
				{#if overallUpdated}
					<span class="faint small">Last updated: {overallUpdated}</span>
				{/if}
			</div>
		</div>

		<div class="row actions">
			<form method="POST" action="?/duplicate" use:enhance>
				<button class="btn btn-sm" type="submit">Duplicate workout</button>
			</form>
			<form method="POST" action="?/delete_workout" use:enhance>
				<HoldToDelete label="Delete workout" />
			</form>
		</div>
	</section>

	<p class="alert small session-note">
		⏱️ <strong>Note:</strong> Start this session in Google Health (Fitbit) on your watch or phone before
		the first set.
	</p>

	<div class="stack">
		{#each data.exercises as item (item.association.id)}
			{@const wex = item.association}
			{@const exercise = item.exercise}
			{@const updated = latestStamp(item.sets.map((set) => set.modifiedAt))}
			<form
				method="POST"
				action="?/update_workout_sets"
				use:enhance={enhanceForm(`exercise-${wex.id}`, { invalidateAll: false })}
				onchange={autoSave}
				class="card exercise"
			>
				<input type="hidden" name="workout_exercise_id" value={wex.id} />
				<input type="hidden" name="workout_id" value={workout.id} />

				<div class="exercise-head">
					<div class="move-col">
						<button
							type="submit"
							formaction="?/move_exercise"
							name="direction"
							value="up"
							class="icon-btn move-btn"
							title="Move exercise up"
							aria-label="Move exercise up">▲</button
						>
						<button
							type="submit"
							formaction="?/move_exercise"
							name="direction"
							value="down"
							class="icon-btn move-btn"
							title="Move exercise down"
							aria-label="Move exercise down">▼</button
						>
					</div>

					<div class="exercise-title">
						{#if exercise}
							<a href={`/exercises/${exercise.id}`}><h3>{exercise.name}</h3></a>
						{:else}
							<h3>Unknown exercise</h3>
						{/if}
						{#if exercise?.equipment}
							<div class="faint small">⚙️ {exercise.equipment}</div>
						{/if}
						{#if exercise?.notes}
							<div class="muted small italic">{exercise.notes}</div>
						{/if}
						{#if updated}
							<div class="faint small num">Last set: {updated}</div>
						{/if}
					</div>

					<button
						type="submit"
						formaction="?/delete_exercise"
						class="btn btn-danger btn-sm"
						onclick={confirmSubmit('Remove this exercise from the workout?')}>Remove</button
					>
				</div>

				<div class="row tight target-rest">
					<label for={`rest-${wex.id}`}>Target rest</label>
					<input
						id={`rest-${wex.id}`}
						name="target_rest"
						value={wex.targetRest ?? ''}
						placeholder="x mins"
						class="small-input wide"
					/>
				</div>

				<div class="field">
					<label for={`wex-notes-${wex.id}`}>Notes / warm-up</label>
					<textarea
						id={`wex-notes-${wex.id}`}
						name="workout_exercise_notes"
						rows="1"
						placeholder="e.g. any special warm-up routine for this exercise">{wex.notes ?? ''}</textarea
					>
				</div>

				<div class="set-rows">
					{#each item.sets as set (set.id)}
						<div class="set-row">
							<div class="move-col">
								<button
									type="submit"
									formaction="?/move_set_up"
									name="set_id"
									value={set.id}
									class="icon-btn move-btn"
									title="Move set up"
									aria-label="Move set up">▲</button
								>
								<button
									type="submit"
									formaction="?/move_set_down"
									name="set_id"
									value={set.id}
									class="icon-btn move-btn"
									title="Move set down"
									aria-label="Move set down">▼</button
								>
							</div>

							<div class="set-fields">
								<div class="row set-main">
									<span class="set-num num">{set.setNumber}.</span>
									<input
										class="small-input num"
										type="number"
										step="any"
										inputmode="decimal"
										name={`sets[${set.id}][actual_reps]`}
										value={set.actualReps === null ? '' : String(set.actualReps)}
										placeholder={set.targetReps === null ? '' : String(set.targetReps)}
										title={`Target reps: ${set.targetReps ?? '—'}`}
										aria-label="Actual reps"
									/>
									<div class="field-inline">
										<input
											class="medium-input num"
											type="number"
											step="any"
											inputmode="decimal"
											name={`sets[${set.id}][actual_weight]`}
											value={set.actualWeight === null ? '' : String(set.actualWeight)}
											placeholder={set.targetWeight === null ? '' : String(set.targetWeight)}
											title={`Target weight: ${set.targetWeight ?? '—'} kg`}
											aria-label="Actual weight"
										/>
										<span class="faint small">kg</span>
									</div>
									<select
										class="type-select"
										name={`sets[${set.id}][set_type]`}
										value={set.setType}
										aria-label="Set type"
									>
										<option value="working">working</option>
										<option value="warmup">warmup</option>
									</select>
									<HoldToDelete
										label="×"
										class="icon-btn delete-btn"
										formaction="?/delete_set"
										name="set_id"
										value={set.id}
										title="Hold to delete set"
										aria-label="Hold to delete set"
									/>
								</div>
								<textarea
									class="set-notes"
									name={`sets[${set.id}][notes]`}
									rows="1"
									placeholder="Add note...">{set.notes ?? ''}</textarea
								>
							</div>
						</div>
					{/each}
					{#if item.sets.length === 0}
						<p class="muted small">No sets yet. Add a warm-up or working set below.</p>
					{/if}
				</div>

				<div class="row">
					<button type="submit" formaction="?/add_blank_set_start" class="btn btn-sm">
						+ Warm-up set (top)
					</button>
					<button type="submit" formaction="?/add_blank_set" class="btn btn-sm">+ Add set</button>
					<button type="submit" class="btn btn-sm btn-primary">Save sets</button>
					<SaveState state={saveStates[`exercise-${wex.id}`] ?? 'idle'} />
				</div>
			</form>
		{/each}
	</div>

	<details class="card add-exercise">
		<summary>Add exercise to workout</summary>
		<form method="POST" action="?/add_exercise" use:enhance class="stack-sm inner">
			<div class="field">
				<label for="exercise_id">Existing exercises</label>
				<select id="exercise_id" name="exercise_id">
					<option value="">-- Choose an exercise --</option>
					{#each Object.entries(data.exerciseGroups) as [pattern, list] (pattern)}
						<optgroup label={pattern}>
							{#each list as exercise (exercise.id)}
								<option value={exercise.id}>
									{exercise.name}{exercise.primaryMuscle ? ` - ${exercise.primaryMuscle}` : ''}
								</option>
							{/each}
						</optgroup>
					{/each}
				</select>
			</div>
			<div class="field">
				<label for="new_exercise_name">Or quick-add a new exercise</label>
				<input id="new_exercise_name" name="new_exercise_name" placeholder="e.g. 100m Sprints" />
				<small class="faint">Anything quick-added is created in the exercises database.</small>
			</div>
			<button class="btn btn-primary btn-sm" type="submit">Add to workout</button>
		</form>
	</details>
</main>

<style>
	.crumbs {
		display: flex;
		gap: 0.4rem;
		align-items: center;
		margin-bottom: 0.5rem;
		font-size: 0.9rem;
	}

	.truncate {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.head-grid {
		display: grid;
		grid-template-columns: 1fr;
		gap: 0.6rem;
	}

	/* Grid items default to min-width:auto, which lets long inputs / week labels
	   force the column (and the page) wider than the viewport on phones. */
	.head-grid > * {
		min-width: 0;
	}

	.span-2 {
		grid-column: 1 / -1;
	}

	@media (min-width: 40rem) {
		.head-grid {
			grid-template-columns: 1fr 1fr;
		}
	}

	.tight {
		gap: 0.35rem;
		margin: 0;
	}

	.tight input,
	.tight select {
		margin: 0;
	}

	.grow {
		flex: 1 1 8rem;
		width: auto;
		min-width: 0;
	}

	.meta {
		gap: 0.75rem;
	}

	.actions {
		margin-top: 0.75rem;
		gap: 0.5rem;
	}

	.actions form {
		margin: 0;
	}

	.session-note {
		margin: 0.75rem 0;
	}

	.exercise {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}

	.exercise-head {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
	}

	.exercise-head h3 {
		margin: 0;
		font-size: 1.05rem;
	}

	.exercise-title {
		flex: 1;
		min-width: 0;
	}

	.italic {
		font-style: italic;
	}

	.move-col {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		flex: 0 0 auto;
	}

	.move-btn {
		min-width: 2.75rem;
		min-height: 2.75rem;
		padding: 0.2rem;
		font-size: 0.7rem;
		color: var(--text-muted);
	}

	.target-rest {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}

	.target-rest label {
		margin: 0;
		white-space: nowrap;
	}

	.wide {
		width: 9ch;
	}

	.set-rows {
		display: flex;
		flex-direction: column;
		border: 1px solid var(--border);
		border-radius: calc(var(--radius) - 2px);
	}

	.set-row {
		display: flex;
		gap: 0.4rem;
		padding: 0.4rem;
		border-bottom: 1px solid var(--border);
	}

	.set-row:last-child {
		border-bottom: none;
	}

	.set-fields {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		flex: 1;
		min-width: 0;
	}

	.set-main {
		align-items: center;
		flex-wrap: wrap;
		gap: 0.2rem;
	}

	.set-num {
		min-width: 1rem;
		color: var(--text-muted);
		font-size: 0.8rem;
	}

	.set-main .field-inline {
		gap: 0.25rem;
	}

	/* Mobile-first: keep reps / weight compact so the set type stays on the same row. */
	.set-main .small-input,
	.set-main .medium-input {
		width: 5ch;
		min-width: 3.5ch;
	}

	.type-select {
		width: auto;
		min-width: 4.5rem;
		min-height: 2.5rem;
		padding: 0.25rem;
		font-size: 0.8rem;
	}

	/* Match the numeric inputs, which grow to 2.75rem on touch devices. */
	@media (pointer: coarse) {
		.type-select {
			min-height: 2.75rem;
		}
	}

	@media (min-width: 40rem) {
		.set-main {
			gap: 0.35rem;
		}

		.set-main .small-input {
			width: 5.5ch;
		}

		.set-main .medium-input {
			width: 8ch;
		}

		.type-select {
			min-width: 6.5rem;
		}
	}

	:global(.delete-btn) {
		color: var(--text-faint);
		border-color: transparent;
		background: transparent;
		font-size: 1.25rem;
		line-height: 1;
		min-width: 2rem;
	}

	@media (hover: hover) and (pointer: fine) {
		:global(.delete-btn):hover {
			color: var(--danger);
			border-color: transparent;
		}
	}

	.set-notes {
		min-height: 2.25rem;
		padding: 0.35rem 0.5rem;
		font-size: 0.85rem;
		resize: vertical;
		field-sizing: content;
	}

	.add-exercise {
		margin-top: 0.75rem;
	}

	.add-exercise summary {
		cursor: pointer;
		font-weight: 600;
		min-height: 2.75rem;
		display: flex;
		align-items: center;
	}

	.add-exercise .inner {
		margin-top: 0.6rem;
	}
</style>
