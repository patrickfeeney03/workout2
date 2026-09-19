<script lang="ts">
	import { onMount } from 'svelte';

	/**
	 * Hold-to-delete button: the destructive action only fires after a deliberate
	 * press (~1.4s). Works with pointer and keyboard (Space/Enter). Submits the
	 * surrounding form with itself as the submitter, so `formaction`/`name`/`value`
	 * on this component keep working with `use:enhance`.
	 *
	 * The button ships disabled and is enabled after hydration, so a click before
	 * the JS is ready (or with JS disabled) can never submit the destructive form.
	 */
	interface Props {
		label?: string;
		duration?: number;
		class?: string;
		[key: string]: string | number | boolean | undefined;
	}

	let {
		label = 'Hold to delete',
		duration = 1400,
		class: className = 'btn btn-danger btn-sm',
		...rest
	}: Props = $props();

	let button = $state<HTMLButtonElement | null>(null);
	let progress = $state(0);
	let holding = $state(false);
	let hydrated = $state(false);
	let completed = false;
	let raf: number | null = null;
	let startTime = 0;

	onMount(() => {
		hydrated = true;
	});

	function tick() {
		const elapsed = performance.now() - startTime;
		progress = Math.min(1, elapsed / duration);
		if (progress >= 1) {
			holding = false;
			completed = true;
			raf = null;
			button?.form?.requestSubmit(button);
			return;
		}
		raf = requestAnimationFrame(tick);
	}

	function startHold() {
		if (raf !== null) return;
		completed = false;
		holding = true;
		startTime = performance.now();
		progress = 0;
		raf = requestAnimationFrame(tick);
	}

	function cancelHold() {
		if (raf !== null) {
			cancelAnimationFrame(raf);
			raf = null;
		}
		holding = false;
		if (!completed) progress = 0;
	}

	function onClick(event: MouseEvent) {
		if (!completed) {
			event.preventDefault();
		}
		completed = false;
	}
</script>

<button
	bind:this={button}
	class={className}
	style="--progress:{progress}"
	class:releasing={!holding}
	disabled={!hydrated}
	onpointerdown={(event) => {
		if (event.button !== 0) return;
		startHold();
	}}
	onpointerup={cancelHold}
	onpointercancel={cancelHold}
	onpointerleave={cancelHold}
	onclick={onClick}
	oncontextmenu={(event) => event.preventDefault()}
	onkeydown={(event) => {
		if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) {
			event.preventDefault();
			startHold();
		}
	}}
	onkeyup={(event) => {
		if (event.key === ' ' || event.key === 'Enter') cancelHold();
	}}
	{...rest}
>
	<span class="hold-fill" aria-hidden="true"></span>
	<span class="hold-label">{label}</span>
</button>

<style>
	button {
		position: relative;
		overflow: hidden;
		touch-action: none;
		user-select: none;
	}

	/* Pre-hydration the button is disabled on purpose; keep it looking normal
	   (app.css dims disabled buttons) so there is no visual flash. */
	button:disabled {
		opacity: 1;
		cursor: default;
	}

	.hold-fill {
		position: absolute;
		inset: 0;
		background: var(--danger);
		transform-origin: left center;
		clip-path: inset(0 calc((1 - var(--progress, 0)) * 100%) 0 0);
	}

	.releasing .hold-fill {
		transition: clip-path 200ms var(--ease-out);
	}

	.hold-label {
		position: relative;
		z-index: 1;
	}

	button :global(svg) {
		position: relative;
		z-index: 1;
	}
</style>
