<script lang="ts">
	import RoutineEditor from '../_components/RoutineEditor.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head>
	<title>{data.routine.name} · Gym Tracker</title>
</svelte:head>

<main class="page">
	<div class="row-between breadcrumbs">
		<div class="row">
			<a href="/routines">Routines</a>
			<span class="faint">/</span>
			<span>{data.routine.name}</span>
		</div>
		<a class="btn btn-ghost btn-sm" href="/routines/{data.routine.id}/edit">Edit settings</a>
	</div>

	<RoutineEditor {data} {form} />
</main>

<style>
	.breadcrumbs {
		display: flex;
		gap: 0.4rem;
		align-items: center;
		margin-bottom: 0.5rem;
		font-size: 0.9rem;
	}
</style>
