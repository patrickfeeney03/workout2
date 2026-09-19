<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Blocks · Gym Tracker</title>
</svelte:head>

<main class="page page-wide">
	<div class="row-between">
		<h1>Blocks</h1>
		<span class="chip">{data.blocks.length} total</span>
	</div>
	<p class="muted small">For now each block will be 4 weeks, so the UI won't account for more than that.</p>

	<div class="stack">
		{#each data.blocks as block (block.id)}
			<article class="card">
				<div class="row-between">
					<h2 class="block-title"><a href="/blocks/{block.id}">{block.name}</a></h2>
					<div class="row">
						{#if block.startLabel || block.endLabel}
							<span class="faint small">{block.startLabel} — {block.endLabel}</span>
						{/if}
						<form
							method="POST"
							action="?/delete_block"
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
							<input type="hidden" name="delete_id" value={block.id} />
							<button class="btn btn-danger btn-sm" type="submit">Delete</button>
						</form>
					</div>
				</div>

				<div class="week-strip">
					{#each block.weeks as week (week.id)}
						<a class="week-card" href="/blocks/{block.id}/weeks/{week.id}">
							<strong>Week {week.weekNumber ?? '—'}</strong>
							<span class="chip chip-accent">{week.weekTypeLabel}</span>
							<span class="faint small">
								{week.startsOnLabel}<br />{week.endsOnLabel}
							</span>
						</a>
					{/each}
					{#if block.weeks.length === 0}
						<p class="muted small">No weeks added to this block yet.</p>
					{/if}
				</div>
			</article>
		{/each}

		{#if data.blocks.length === 0}
			<p class="card muted">No training blocks yet.</p>
		{/if}
	</div>

	<section class="card">
		<h2>Add Block</h2>
		<form method="POST" action="?/create_block" use:enhance class="stack-sm">
			<div class="field">
				<label for="new_block_name">Name</label>
				<input id="new_block_name" name="name" placeholder="some name for the block" autocomplete="off" />
			</div>
			<div class="two-col">
				<div class="field">
					<label for="new_block_start">Start date</label>
					<input id="new_block_start" name="start_date" type="date" />
				</div>
				<div class="field">
					<label for="new_block_end">End date</label>
					<input id="new_block_end" name="end_date" type="date" />
				</div>
			</div>
			<div class="field">
				<label for="new_block_notes">Notes</label>
				<input id="new_block_notes" name="notes" placeholder="any notes" />
			</div>
			<button class="btn btn-primary btn-sm" type="submit">Add block</button>
		</form>
	</section>

	<section class="card">
		<h2>Add Week</h2>
		<form method="POST" action="?/create_week" use:enhance class="stack-sm">
			<div class="field">
				<label for="new_week_block">Training block</label>
				<select id="new_week_block" name="training_block_id">
					{#each data.blocks as block (block.id)}
						<option value={block.id}>{block.name}</option>
					{/each}
				</select>
			</div>
			<div class="two-col">
				<div class="field">
					<label for="new_week_number">Week</label>
					<select id="new_week_number" name="week_number">
						{#each data.weekNumbers as weekNumber (weekNumber)}
							<option value={weekNumber}>Week {weekNumber}</option>
						{/each}
					</select>
				</div>
				<div class="field">
					<label for="new_week_type">Type</label>
					<select id="new_week_type" name="week_type">
						{#each data.weekTypes as weekType (weekType)}
							<option value={weekType}>{weekType}</option>
						{/each}
					</select>
				</div>
			</div>
			<div class="two-col">
				<div class="field">
					<label for="new_week_starts">Starts on</label>
					<input id="new_week_starts" name="starts_on" type="date" />
				</div>
				<div class="field">
					<label for="new_week_ends">Ends on</label>
					<input id="new_week_ends" name="ends_on" type="date" />
				</div>
			</div>
			<div class="field">
				<label for="new_week_notes">Notes</label>
				<input id="new_week_notes" name="notes" placeholder="any notes" />
			</div>
			<button class="btn btn-primary btn-sm" type="submit">Add week</button>
		</form>
	</section>
</main>

<style>
	.block-title {
		margin: 0;
		font-size: 1.15rem;
	}

	.week-strip {
		display: flex;
		flex-direction: row;
		gap: 0.6rem;
		overflow-x: auto;
		padding-top: 0.75rem;
	}

	.week-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.25rem;
		min-width: 8.5rem;
		padding: 0.6rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		text-align: center;
		color: var(--text);
	}

	.week-card:hover {
		text-decoration: none;
		border-color: var(--border-strong);
		background: var(--bg-inset);
	}
</style>
