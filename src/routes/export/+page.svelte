<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const log = $derived(data.log);

	const RANGE_LABELS: Record<string, string> = {
		'8w': '8 weeks',
		'12w': '12 weeks',
		'26w': '6 months',
		all: 'All time'
	};

	let copied = $state(false);
	let copyTimer: ReturnType<typeof setTimeout> | undefined;
	let preview = $state<HTMLTextAreaElement | null>(null);

	async function copy() {
		try {
			await navigator.clipboard.writeText(log.markdown);
		} catch {
			// No clipboard access (e.g. plain http): select the text so it can be copied by hand.
			preview?.select();
			return;
		}
		copied = true;
		clearTimeout(copyTimer);
		copyTimer = setTimeout(() => (copied = false), 2000);
	}

	function download() {
		const blob = new Blob([log.markdown], { type: 'text/markdown' });
		const link = document.createElement('a');
		link.href = URL.createObjectURL(blob);
		link.download = `training-log-${log.range === 'all' ? 'all' : log.start}-to-${log.end}.md`;
		link.click();
		setTimeout(() => URL.revokeObjectURL(link.href), 1000);
	}
</script>

<svelte:head>
	<title>Export · Gym Tracker</title>
</svelte:head>

<main class="page">
	<h1>Export</h1>
	<p class="muted small">
		Your training log as Markdown: copy it into an AI chat, or download the file and attach it.
	</p>

	<nav class="range-nav" aria-label="Date range">
		{#each data.ranges as range (range)}
			<a
				class="chip"
				class:chip-accent={log.range === range}
				href={`/export?range=${range}`}
				aria-current={log.range === range ? 'true' : undefined}>{RANGE_LABELS[range] ?? range}</a
			>
		{/each}
	</nav>

	<section class="card stack-sm">
		<div class="row-between">
			<span class="small">
				{log.workoutCount === 1 ? '1 workout' : `${log.workoutCount} workouts`}
				<span class="faint">· {log.markdown.length.toLocaleString('en-US')} characters</span>
			</span>
			<div class="row">
				<button class="btn btn-sm btn-primary" type="button" onclick={copy}>
					{copied ? 'Copied' : 'Copy'}
				</button>
				<button class="btn btn-sm" type="button" onclick={download}>Download .md</button>
			</div>
		</div>
		<textarea bind:this={preview} class="preview" readonly rows="18" aria-label="Export preview">{log.markdown}</textarea>
	</section>
</main>

<style>
	.range-nav {
		display: flex;
		gap: 0.35rem;
		overflow-x: auto;
		margin: 0.5rem 0 0.75rem;
		scrollbar-width: none;
	}

	.range-nav a {
		flex: 0 0 auto;
	}

	.preview {
		width: 100%;
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.8rem;
		line-height: 1.45;
		resize: vertical;
	}
</style>
