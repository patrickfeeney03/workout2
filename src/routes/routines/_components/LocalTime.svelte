<script lang="ts">
	/** Renders a SQLite UTC timestamp as the visitor's local time (client-only, as `gym.js` did). */
	let { timestamp }: { timestamp: string } = $props();

	let label = $state('');

	$effect(() => {
		if (!timestamp) {
			label = '';
			return;
		}
		const iso = timestamp.includes('T') ? timestamp : `${timestamp.replace(' ', 'T')}Z`;
		const date = new Date(iso);
		label = Number.isNaN(date.getTime())
			? ''
			: date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
	});
</script>

<span class="num small faint">{label}</span>
