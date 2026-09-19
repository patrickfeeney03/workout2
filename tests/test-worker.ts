/**
 * Minimal Worker entry used by the vitest-pool-workers test runner.
 * The SvelteKit worker entry (.svelte-kit/cloudflare/_worker.js) only exists
 * after `npm run build`, and these tests exercise server modules directly.
 */
export default {
	fetch(): Response {
		return new Response('gym-tracker test worker');
	}
};
