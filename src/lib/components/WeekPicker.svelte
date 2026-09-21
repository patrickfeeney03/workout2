<script lang="ts">
	import { onMount, tick, untrack } from 'svelte';
	import type { BlockWeek, TrainingBlock } from '$lib/types';

	/**
	 * Week picker for the training-block periodization UI.
	 *
	 * A plain `<select>` with `<optgroup>`s (the PHP layout) is awkward on a phone and, in Svelte,
	 * silently renders blank when the option values are numbers and the bound value is a string.
	 * This renders a searchable, block-grouped list with a "current week" marker instead.
	 *
	 * Progressive enhancement: before hydration (and with JS off) a native `<select>` is the
	 * control, so the form still submits. Once mounted the native select becomes the visually
	 * hidden form control that keeps `required` validation and `FormData` working; selecting an
	 * option in the custom list syncs it and dispatches a bubbling `change` so form-level
	 * auto-save handlers fire exactly as they did for the native select.
	 */
	interface Props {
		name: string;
		blocks: TrainingBlock[];
		weeksByBlock: Record<number, BlockWeek[]>;
		value?: string | number | null;
		/** When set, an unselectable first option (value `''`) — e.g. "-- Choose a week --". */
		placeholder?: string;
		/** When set, a selectable "no week" option is shown. */
		noneLabel?: string;
		noneValue?: string | number;
		required?: boolean;
		/** Applied to the custom trigger so an external `<label for>` can point at it. */
		id?: string;
		/** Accessible name for the (visually hidden) native select fallback. */
		label?: string;
		class?: string;
		/** Called with the new raw form value on every selection. */
		onchange?: (value: string) => void;
	}

	let {
		name,
		blocks,
		weeksByBlock,
		value = null,
		placeholder = '',
		noneLabel = '',
		noneValue = '',
		required = false,
		id = '',
		label = '',
		class: className = '',
		onchange
	}: Props = $props();

	interface Choice {
		value: string;
		label: string;
		meta: string;
		block: string;
		kind: 'placeholder' | 'none' | 'week';
		disabled: boolean;
		week: BlockWeek | null;
	}

	const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

	/** `YYYY-MM-DD` -> `Mon D`, without pulling in server-only date helpers. */
	function dayLabel(iso: string | null): string {
		if (!iso) return '';
		const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(iso);
		if (!match) return '';
		const month = Number(match[2]);
		if (month < 1 || month > 12) return '';
		return `${MONTHS[month - 1]} ${Number(match[3])}`;
	}

	function rangeLabel(week: BlockWeek): string {
		const start = dayLabel(week.startsOn);
		const end = dayLabel(week.endsOn);
		if (start && end) return `${start} – ${end}`;
		return start || end;
	}

	function isCurrent(week: BlockWeek): boolean {
		if (!week.startsOn || !week.endsOn) return false;
		const today = new Date().toISOString().slice(0, 10);
		return week.startsOn <= today && today <= week.endsOn;
	}

	function matches(choice: Choice, query: string): boolean {
		const haystack = `${choice.block} ${choice.label} ${choice.meta} week ${choice.week?.weekNumber ?? ''}`;
		return haystack.toLowerCase().includes(query);
	}

	const choices = $derived.by((): Choice[] => {
		const list: Choice[] = [];
		if (placeholder) {
			list.push({
				value: '',
				label: placeholder,
				meta: '',
				block: '',
				kind: 'placeholder',
				disabled: true,
				week: null
			});
		}
		if (noneLabel) {
			list.push({
				value: String(noneValue),
				label: noneLabel,
				meta: '',
				block: '',
				kind: 'none',
				disabled: false,
				week: null
			});
		}
		for (const block of blocks) {
			for (const week of weeksByBlock[block.id] ?? []) {
				list.push({
					value: String(week.id),
					label: `Week ${week.weekNumber ?? '—'}`,
					meta: [week.weekType || 'Standard', rangeLabel(week)].filter(Boolean).join(' · '),
					block: block.name,
					kind: 'week',
					disabled: false,
					week
				});
			}
		}
		return list;
	});

	interface Section {
		label: string;
		items: Choice[];
	}

	const sections = $derived.by((): Section[] => {
		const query = search.trim().toLowerCase();
		const result: Section[] = [];

		const specials = choices.filter((choice) => choice.kind !== 'week');
		if (specials.length > 0) result.push({ label: '', items: specials });

		const byBlock = new Map<string, Choice[]>();
		for (const choice of choices) {
			if (choice.kind !== 'week') continue;
			if (query && !matches(choice, query)) continue;
			const list = byBlock.get(choice.block);
			if (list) list.push(choice);
			else byBlock.set(choice.block, [choice]);
		}
		for (const [label, items] of byBlock) result.push({ label, items });

		return result;
	});

	const flat = $derived(sections.flatMap((section) => section.items));

	let mounted = $state(false);
	onMount(() => {
		mounted = true;
	});

	let selectedValue = $state<string>(untrack(() => (value === null || value === undefined ? '' : String(value))));
	// Track the `value` prop only, so a local selection is not clobbered while the parent value is
	// unchanged (e.g. the create-workout form, which never sets a value).
	$effect(() => {
		const next = value === null || value === undefined ? '' : String(value);
		untrack(() => {
			if (next !== selectedValue) selectedValue = next;
		});
	});

	let open = $state(false);
	let search = $state('');
	let activeIndex = $state(0);
	let root = $state<HTMLDivElement | null>(null);
	let nativeSelect = $state<HTMLSelectElement | null>(null);
	let searchInput = $state<HTMLInputElement | null>(null);

	const selectedChoice = $derived(choices.find((choice) => choice.value === selectedValue) ?? null);

	const triggerLabel = $derived.by(() => {
		const choice = selectedChoice;
		if (!choice || choice.kind === 'placeholder') return placeholder || 'Choose a week';
		if (choice.kind === 'none') return choice.label;
		return `${choice.block} · ${choice.label}${choice.meta ? ` · ${choice.meta}` : ''}`;
	});

	const triggerHint = $derived.by(() => {
		const choice = selectedChoice;
		if (!choice || choice.kind !== 'week' || !choice.week) return '';
		return isCurrent(choice.week) ? 'This week' : '';
	});

	function reset() {
		search = '';
		activeIndex = 0;
	}

	function toggle() {
		open = !open;
		if (open) {
			reset();
			// Focus after the panel renders (and after the click has moved focus to the button).
			void tick().then(() => searchInput?.focus());
		}
	}

	function select(choice: Choice) {
		if (choice.disabled) return;
		selectedValue = choice.value;
		open = false;
		reset();
		if (nativeSelect) nativeSelect.value = choice.value;
		onchange?.(choice.value);
		nativeSelect?.dispatchEvent(new Event('change', { bubbles: true }));
	}

	function move(delta: number) {
		if (flat.length === 0) return;
		activeIndex = (activeIndex + delta + flat.length) % flat.length;
	}

	function onSearchKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.stopPropagation();
			open = false;
			return;
		}
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			move(1);
			return;
		}
		if (event.key === 'ArrowUp') {
			event.preventDefault();
			move(-1);
			return;
		}
		if (event.key === 'Enter') {
			const choice = flat[activeIndex];
			if (choice) {
				event.preventDefault();
				select(choice);
			}
		}
	}

	// Keep the highlighted option in view while arrowing through a long list.
	$effect(() => {
		if (!open) return;
		const active = activeIndex;
		const element = root?.querySelector<HTMLElement>(`[data-index="${active}"]`);
		element?.scrollIntoView({ block: 'nearest' });
	});

	// Close when tapping outside.
	$effect(() => {
		if (!open) return;
		const onPointerDown = (event: PointerEvent) => {
			if (root && !root.contains(event.target as Node)) open = false;
		};
		document.addEventListener('pointerdown', onPointerDown);
		return () => document.removeEventListener('pointerdown', onPointerDown);
	});
</script>

<div class="week-picker {className}" bind:this={root}>
	<select
		{name}
		{required}
		bind:this={nativeSelect}
		class="native"
		class:sr-only={mounted}
		aria-label={label || placeholder || 'Week'}
	>
		{#each choices as choice (choice.value)}
			<option value={choice.value} disabled={choice.disabled} selected={choice.value === selectedValue}>
				{choice.kind === 'week'
					? `${choice.block} — ${choice.label}${choice.meta ? ` (${choice.meta})` : ''}`
					: choice.label}
			</option>
		{/each}
	</select>

	{#if mounted}
		<button
			{id}
			type="button"
			class="trigger"
			aria-haspopup="listbox"
			aria-expanded={open}
			onclick={toggle}
			onkeydown={(event) => {
				if (event.key === 'Escape' && open) {
					event.stopPropagation();
					open = false;
				}
			}}
		>
			<span class="trigger-text" class:placeholder={!selectedChoice || selectedChoice.kind === 'placeholder'}>
				{triggerLabel}
			</span>
			{#if triggerHint}<span class="current-chip">{triggerHint}</span>{/if}
			<svg class="chevron" viewBox="0 0 16 16" aria-hidden="true">
				<path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
			</svg>
		</button>

		{#if open}
			<div class="panel">
				<div class="search-row">
					<input
						bind:this={searchInput}
						bind:value={search}
						class="search"
						type="text"
						placeholder="Search blocks or weeks…"
						autocomplete="off"
						spellcheck="false"
						onkeydown={onSearchKeydown}
						onclick={(event) => event.stopPropagation()}
					/>
				</div>

				<div class="list" role="listbox" aria-label="Weeks">
					{#each sections as section (section.label)}
						{#if section.label}
							<div class="group-label">{section.label}</div>
						{/if}
						{#each section.items as choice (choice.value)}
							{@const index = flat.indexOf(choice)}
							<button
								type="button"
								class="option"
								class:selected={choice.value === selectedValue && choice.kind !== 'placeholder'}
								class:active={index === activeIndex}
								data-index={index}
								disabled={choice.disabled}
								role="option"
								aria-selected={choice.value === selectedValue && choice.kind !== 'placeholder'}
								onclick={() => select(choice)}
							>
								<span class="option-main">
									<span class="option-label">{choice.label}</span>
									{#if choice.week && isCurrent(choice.week)}
										<span class="current-chip">This week</span>
									{/if}
								</span>
								{#if choice.meta}<span class="option-meta">{choice.meta}</span>{/if}
							</button>
						{/each}
					{/each}

					{#if flat.length === 0}
						<p class="empty">No weeks match “{search}”.</p>
					{/if}
				</div>
			</div>
		{/if}
	{/if}
</div>

<style>
	.week-picker {
		position: relative;
		width: 100%;
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	.trigger {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		min-height: 2.75rem;
		padding: 0.4rem 0.6rem;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius);
		background: var(--bg-inset);
		color: var(--text);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}

	.trigger:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
	}

	.trigger-text {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.trigger-text.placeholder {
		color: var(--text-faint);
	}

	.current-chip {
		flex: 0 0 auto;
		padding: 0.05rem 0.4rem;
		border-radius: 999px;
		background: color-mix(in oklch, var(--accent) 22%, transparent);
		color: var(--accent-strong);
		font-size: 0.7rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.02em;
	}

	.chevron {
		flex: 0 0 auto;
		width: 1rem;
		height: 1rem;
		color: var(--text-muted);
	}

	.panel {
		position: absolute;
		z-index: 40;
		top: calc(100% + 0.25rem);
		left: 0;
		display: flex;
		flex-direction: column;
		width: max(100%, min(22rem, calc(100vw - 1.5rem)));
		max-height: min(60vh, 26rem);
		overflow: hidden;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius);
		background: var(--bg-elevated);
		box-shadow: var(--shadow-lg);
	}

	.search-row {
		padding: 0.4rem;
		border-bottom: 1px solid var(--border);
	}

	.search {
		width: 100%;
		min-height: 2.25rem;
		margin: 0;
		padding: 0.3rem 0.5rem;
		border: 1px solid var(--border);
		border-radius: calc(var(--radius) - 2px);
		background: var(--bg-inset);
		color: var(--text);
		font: inherit;
		font-size: 0.9rem;
	}

	.list {
		flex: 1;
		overflow-y: auto;
		padding: 0.25rem;
	}

	.group-label {
		position: sticky;
		top: 0;
		z-index: 1;
		padding: 0.35rem 0.5rem 0.2rem;
		background: var(--bg-elevated);
		color: var(--text-faint);
		font-size: 0.72rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.option {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.5rem;
		width: 100%;
		min-height: 2.5rem;
		padding: 0.4rem 0.5rem;
		border: 0;
		border-radius: calc(var(--radius) - 2px);
		background: transparent;
		color: var(--text);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}

	.option-main {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		min-width: 0;
	}

	.option-label {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.option-meta {
		flex: 0 0 auto;
		color: var(--text-faint);
		font-size: 0.78rem;
	}

	.option:disabled {
		color: var(--text-faint);
		cursor: default;
	}

	.option.active:not(:disabled) {
		background: var(--bg-inset);
	}

	.option.selected {
		color: var(--accent-strong);
		font-weight: 600;
	}

	.empty {
		margin: 0;
		padding: 0.75rem 0.5rem;
		color: var(--text-faint);
		font-size: 0.85rem;
		text-align: center;
	}

	@media (hover: hover) and (pointer: fine) {
		.option:not(:disabled):hover {
			background: var(--bg-inset);
		}
	}
</style>
