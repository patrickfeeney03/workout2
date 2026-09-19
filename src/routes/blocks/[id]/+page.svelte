<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const block = $derived(data.block);

	function submitOnChange(event: Event) {
		const target = event.currentTarget as HTMLElement;
		(target.closest('form') as HTMLFormElement | null)?.requestSubmit();
	}
</script>

<svelte:head>
	<title>{block.name} · Gym Tracker</title>
</svelte:head>

<main class="page page-wide">
	<div class="row-between">
		<div class="breadcrumbs">
			<a href="/blocks">Blocks</a>
			<span class="faint">/</span>
			<span>{block.name}</span>
		</div>
		<form
			method="POST"
			action="?/delete"
			use:enhance
			onsubmit={(event) => {
				if (
					!confirm(
						'Are you sure you want to delete this training block? ' +
							'All weeks inside it will also be permanently deleted.'
					)
				) {
					event.preventDefault();
				}
			}}
		>
			<button class="btn btn-danger btn-sm" type="submit">Delete block</button>
		</form>
	</div>

	<section class="card">
		<form method="POST" action="?/update" use:enhance class="stack-sm">
			<div class="field">
				<label for="name">Name</label>
				<input id="name" name="name" value={block.name} autocomplete="off" onchange={submitOnChange} />
			</div>
			<div class="two-col">
				<div class="field">
					<label for="start_date">Start date</label>
					<input
						id="start_date"
						name="start_date"
						type="date"
						value={block.startDate ?? ''}
						onchange={submitOnChange}
					/>
				</div>
				<div class="field">
					<label for="end_date">End date</label>
					<input
						id="end_date"
						name="end_date"
						type="date"
						value={block.endDate ?? ''}
						onchange={submitOnChange}
					/>
				</div>
			</div>
			<div class="field">
				<label for="notes">Notes</label>
				<textarea id="notes" name="notes" rows="2" onchange={submitOnChange} placeholder="Add note..."
					>{block.notes ?? ''}</textarea
				>
			</div>
			<button class="btn btn-primary btn-sm" type="submit">Save</button>
		</form>
	</section>

	<section class="stack">
		<h2>Weeks &amp; Workouts</h2>

		{#each data.weeks as week (week.id)}
			<article class="card">
				<div class="row-between">
					<h3 class="week-title">
						<a href="/blocks/{block.id}/weeks/{week.id}">
							Week {week.weekNumber ?? '—'} — {week.weekTypeLabel}
						</a>
					</h3>
					<span class="faint small">
						{week.startsOnLabel} to {week.endsOnLabel}
					</span>
				</div>

				{#if week.workouts.length === 0}
					<p class="muted small">No workouts scheduled for this week yet.</p>
				{:else}
					<div class="grid workout-grid">
						{#each week.workouts as workout (workout.id)}
							<a class="workout-card" href="/workouts/{workout.id}">
								<strong>{workout.title || 'Untitled Workout'}</strong>
								<span class="faint small">{workout.plannedOn ?? 'No date'}</span>
								<span class="chip">{workout.status}</span>
							</a>
						{/each}
					</div>
				{/if}
			</article>
		{/each}

		{#if data.weeks.length === 0}
			<p class="card muted">No weeks have been added to this training block yet.</p>
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

	.week-title {
		margin: 0;
		font-size: 1.05rem;
	}

	.workout-grid {
		margin-top: 0.6rem;
	}

	.workout-card {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		padding: 0.6rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		color: inherit;
	}

	.workout-card:hover {
		text-decoration: none;
		border-color: var(--border-strong);
		background: var(--bg-inset);
	}

	.workout-card .chip {
		align-self: flex-start;
		text-transform: uppercase;
	}
</style>
