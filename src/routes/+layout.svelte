<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import {
		CalendarDays,
		Dumbbell,
		LogOut,
		Repeat2,
		Wrench
	} from 'lucide-svelte';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<meta name="theme-color" content="#141419" />
	<title>Gym Tracker</title>
</svelte:head>

{#if data.user}
	<header class="app-header">
		<div class="app-header-inner">
			<a class="brand" href="/"><Dumbbell size={20} strokeWidth={2} /> Gym</a>
			<nav class="top-nav">
				<a href="/workouts"><Dumbbell size={16} strokeWidth={1.75} /> Workouts</a>
				<a href="/routines"><Repeat2 size={16} strokeWidth={1.75} /> Routines</a>
				<a href="/exercises"><Wrench size={16} strokeWidth={1.75} /> Exercises</a>
				<a href="/blocks"><CalendarDays size={16} strokeWidth={1.75} /> Blocks</a>
			</nav>
			<form method="POST" action="/logout">
				<button class="btn btn-ghost btn-sm" type="submit">
					<LogOut size={16} strokeWidth={1.75} /> Log out
				</button>
			</form>
		</div>
	</header>
{/if}

{@render children()}

<style>
	.app-header {
		position: sticky;
		top: 0;
		z-index: 40;
		background: color-mix(in oklab, var(--bg) 88%, transparent);
		backdrop-filter: blur(8px);
		border-bottom: 1px solid var(--border);
	}

	.app-header-inner {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: min(72rem, 100%);
		margin: 0 auto;
		padding: 0.35rem 0.75rem;
		min-height: 3.25rem;
	}

	.brand {
		font-weight: 700;
		color: var(--text);
		white-space: nowrap;
	}

	.brand:hover {
		text-decoration: none;
	}

	.top-nav {
		display: flex;
		gap: 0.25rem;
		overflow-x: auto;
		scrollbar-width: none;
		flex: 1;
	}

	.top-nav::-webkit-scrollbar {
		display: none;
	}

	.top-nav a {
		color: var(--text-muted);
		padding: 0.4rem 0.55rem;
		border-radius: var(--radius);
		white-space: nowrap;
		font-size: 0.9rem;
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
	}

	.top-nav a:hover {
		color: var(--text);
		background: var(--bg-elevated);
		text-decoration: none;
	}

	form {
		margin: 0;
	}
</style>
