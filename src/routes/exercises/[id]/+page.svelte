<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const exercise = $derived(data.exercise);
	const history = $derived(data.history);

	function submitOnChange(event: Event) {
		const target = event.currentTarget as HTMLElement;
		(target.closest('form') as HTMLFormElement | null)?.requestSubmit();
	}
</script>

<svelte:head>
	<title>{exercise.name} · Gym Tracker</title>
</svelte:head>

<main class="page">
	<div class="breadcrumbs">
		<a href="/exercises">Exercises</a>
		<span class="faint">/</span>
		<span>{exercise.name}</span>
	</div>

	{#if form?.error}
		<p class="alert alert-danger">{form.error}</p>
	{:else if form?.saved}
		<p class="alert small">Saved</p>
	{/if}

	<section class="card">
		<form method="POST" action="?/update" use:enhance class="stack-sm">
			<div class="field">
				<label for="name">Name</label>
				<input
					id="name"
					name="name"
					value={exercise.name}
					required
					autocomplete="off"
					onchange={submitOnChange}
				/>
			</div>
			<div class="two-col">
				<div class="field">
					<label for="primary_muscle">Primary muscle</label>
					<input
						id="primary_muscle"
						name="primary_muscle"
						value={exercise.primaryMuscle ?? ''}
						onchange={submitOnChange}
					/>
				</div>
				<div class="field">
					<label for="equipment">Equipment</label>
					<input
						id="equipment"
						name="equipment"
						value={exercise.equipment ?? ''}
						onchange={submitOnChange}
					/>
				</div>
			</div>
			<div class="field">
				<label for="movement_pattern_id">Movement pattern</label>
				<select
					id="movement_pattern_id"
					name="movement_pattern_id"
					value={exercise.movementPatternId === null ? '' : String(exercise.movementPatternId)}
					onchange={submitOnChange}
				>
					<option value="">Uncategorized</option>
					{#each data.movementPatterns as pattern (pattern.id)}
						<option value={pattern.id}>{pattern.name}</option>
					{/each}
				</select>
			</div>
			<div class="field">
				<label for="description">Description</label>
				<textarea id="description" name="description" rows="2" onchange={submitOnChange}
					>{exercise.description ?? ''}</textarea
				>
			</div>
			<div class="field">
				<label for="notes">Notes</label>
				<textarea id="notes" name="notes" rows="2" onchange={submitOnChange}>{exercise.notes ?? ''}</textarea
				>
			</div>
			<div class="row">
				<button class="btn-primary btn-sm" type="submit">Save</button>
				{#if data.pattern}
					<span class="chip">{data.pattern.name}</span>
				{/if}
			</div>
		</form>
	</section>

	<section class="card">
		<h2 class="section-title">Reference images</h2>
		<div class="image-grid">
			{#each data.images as image (image.id)}
				<div class="image-wrap">
					<img class="thumb" src="/media/exercise_image/{image.id}" alt="Exercise reference" loading="lazy" />
					<form method="POST" action="?/delete_image" use:enhance class="image-delete">
						<input type="hidden" name="image_id" value={image.id} />
						<button class="btn btn-danger btn-sm" type="submit" aria-label="Delete image">×</button>
					</form>
				</div>
			{/each}
			{#if data.images.length === 0}
				<p class="muted small" style="grid-column: 1 / -1">No images added yet.</p>
			{/if}
		</div>

		<form method="POST" action="?/upload_image" enctype="multipart/form-data" use:enhance class="row upload-row">
			<input type="file" name="image" accept="image/*" required />
			<button class="btn btn-sm" type="submit">Upload</button>
		</form>
	</section>

	<section class="card">
		<h2 class="section-title">History</h2>
		{#if history.length === 0}
			<p class="muted small">No sets logged for this exercise yet.</p>
		{:else}
			<div class="stack-sm">
				{#each history as entry (entry.workoutExercise.id)}
					<div class="inset">
						<div class="row-between">
							<strong>{entry.workout?.title ?? 'Workout'}</strong>
							<span class="faint small num">
								{entry.workout?.performedOn ?? entry.workout?.plannedOn ?? ''}
							</span>
						</div>
						<table class="num">
							<thead>
								<tr>
									<th>Set</th>
									<th>Reps</th>
									<th>Weight</th>
									<th>Type</th>
									<th>Notes</th>
								</tr>
							</thead>
							<tbody>
								{#each entry.sets as set (set.id)}
									<tr>
										<td>{set.setNumber}</td>
										<td>{set.actualReps ?? set.targetReps ?? '—'}</td>
										<td>{set.actualWeight ?? set.targetWeight ?? '—'}</td>
										<td class="faint small">{set.setType}</td>
										<td class="faint small">{set.notes ?? ''}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/each}
			</div>
		{/if}
	</section>

	<section class="row">
		<form
			method="POST"
			action="?/delete"
			use:enhance
			onsubmit={(event) => {
				if (!confirm('Delete this exercise? This cannot be undone.')) event.preventDefault();
			}}
		>
			<button class="btn btn-danger btn-sm" type="submit">Delete exercise</button>
		</form>
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
		grid-template-columns: 1fr;
		gap: 0.5rem;
	}

	@media (min-width: 40rem) {
		.two-col {
			grid-template-columns: 1fr 1fr;
		}
	}

	.section-title {
		font-size: 0.95rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--text-faint);
		margin-bottom: 0.6rem;
	}

	.image-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(8rem, 1fr));
		gap: 0.6rem;
	}

	.image-wrap {
		position: relative;
	}

	.image-delete {
		position: absolute;
		top: 0.35rem;
		right: 0.35rem;
		margin: 0;
	}

	.image-delete button {
		min-width: 2rem;
		min-height: 2rem;
		padding: 0.1rem 0.4rem;
	}

	.upload-row {
		margin-top: 0.75rem;
		align-items: center;
	}

	.upload-row input[type='file'] {
		min-height: auto;
		width: auto;
		max-width: 100%;
	}
</style>
