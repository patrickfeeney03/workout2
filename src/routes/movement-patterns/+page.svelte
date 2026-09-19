<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Movement Patterns · Gym Tracker</title>
</svelte:head>

<main class="page">
	<div class="breadcrumbs">
		<a href="/exercises">Exercises</a>
		<span class="faint">/</span>
		<span>Movement patterns</span>
	</div>

	<div class="row-between">
		<h1>Movement patterns</h1>
		<span class="chip">{data.patterns.length} total</span>
	</div>

	<section class="stack-sm">
		{#if data.patterns.length === 0}
			<p class="card muted">No movement patterns yet.</p>
		{/if}

		{#each data.patterns as pattern (pattern.id)}
			{#if pattern.id === data.editPatternId}
				<form method="POST" action="?/update" use:enhance class="card stack-sm">
					<input type="hidden" name="id" value={pattern.id} />
					<div class="field">
						<label for="edit_name_{pattern.id}">Name</label>
						<input
							id="edit_name_{pattern.id}"
							name="name"
							value={pattern.name}
							placeholder="name"
							autocomplete="off"
							required
						/>
					</div>
					<div class="field">
						<label for="edit_notes_{pattern.id}">Notes</label>
						<input
							id="edit_notes_{pattern.id}"
							name="notes"
							value={pattern.notes ?? ''}
							placeholder="notes"
							autocomplete="off"
						/>
					</div>
					<div class="row">
						<button class="btn-primary btn-sm" type="submit">Update</button>
						<a class="btn btn-ghost btn-sm" href="/movement-patterns">Cancel</a>
					</div>
				</form>
			{:else}
				<div class="card pattern-row">
					<div class="pattern-info">
						<a class="pattern-name" href="/movement-patterns/{pattern.id}">{pattern.name}</a>
						{#if pattern.notes}
							<p class="muted small note">{pattern.notes}</p>
						{/if}
					</div>
					<div class="row pattern-actions">
						<a class="btn btn-sm" href="/movement-patterns?edit_pattern={pattern.id}">Edit</a>
						<form
							method="POST"
							action="?/delete"
							use:enhance
							onsubmit={(event) => {
								if (!confirm(`Delete "${pattern.name}"? This cannot be undone.`)) {
									event.preventDefault();
								}
							}}
						>
							<input type="hidden" name="delete_id" value={pattern.id} />
							<button class="btn btn-danger btn-sm" type="submit">Delete</button>
						</form>
					</div>
				</div>
			{/if}
		{/each}
	</section>

	<section class="card add-card">
		<h2 class="section-title">Add movement pattern</h2>
		<form method="POST" action="?/create" use:enhance class="stack-sm">
			<div class="field">
				<label for="new_name">Name</label>
				<input
					id="new_name"
					name="name"
					placeholder="name of movement pattern"
					autocomplete="off"
					required
				/>
			</div>
			<div class="field">
				<label for="new_notes">Notes</label>
				<input id="new_notes" name="notes" placeholder="any extra info" autocomplete="off" />
			</div>
			<button class="btn-primary btn-sm" type="submit">Add</button>
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

	.pattern-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.pattern-name {
		font-weight: 600;
	}

	.note {
		margin: 0.15rem 0 0;
	}

	.pattern-actions {
		flex-wrap: nowrap;
	}

	.pattern-actions form {
		margin: 0;
	}

	.add-card {
		margin-top: 0.75rem;
	}

	.section-title {
		font-size: 0.95rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--text-faint);
		margin-bottom: 0.6rem;
	}
</style>
