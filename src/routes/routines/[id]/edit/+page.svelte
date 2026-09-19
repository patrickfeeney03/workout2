<script lang="ts">
	import RoutineEditor from '../../_components/RoutineEditor.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head>
	<title>Edit {data.routine.name} · Gym Tracker</title>
</svelte:head>

<main class="page">
	<div class="row-between breadcrumbs">
		<div class="row">
			<a href="/routines">Routines</a>
			<span class="faint">/</span>
			<a href="/routines/{data.routine.id}">{data.routine.name}</a>
			<span class="faint">/</span>
			<span>Edit</span>
		</div>
	</div>

	<RoutineEditor {data} {form} showMeta />
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
