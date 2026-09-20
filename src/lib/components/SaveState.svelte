<script lang="ts">
	import type { SaveState } from '$lib/types';

	let { state = 'idle' }: { state?: SaveState } = $props();
</script>

<span class="save-state" data-state={state} aria-live="polite">
	{#if state === 'saving'}Saving…{:else if state === 'saved'}Saved{:else if state === 'error'}Not saved{/if}
</span>
