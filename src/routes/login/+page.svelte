<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head>
	<title>Log in · Gym Tracker</title>
</svelte:head>

<main class="page login-page">
	<h1>Gym Tracker</h1>

	{#if form?.error || data.error}
		<p class="alert alert-danger">{form?.error ?? data.error}</p>
	{/if}

	<form method="POST" use:enhance>
		<input type="hidden" name="next" value={data.next} />
		<div class="stack-sm">
			<div class="field">
				<label for="email">Email</label>
				<input type="email" name="email" id="email" autocomplete="username" value={form?.email ?? ''} />
			</div>
			<div class="field">
				<label for="password">Password</label>
				<input
					type="password"
					name="password"
					id="password"
					autocomplete="current-password"
				/>
			</div>
		</div>
		<button class="btn-primary login-submit" type="submit">Log in</button>
	</form>

	{#if data.googleEnabled}
		<div class="divider"><span>or</span></div>
		<a class="btn google-signin" href="/auth/google?next={encodeURIComponent(data.next)}">
			<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="20" height="20" aria-hidden="true">
				<path
					fill="#EA4335"
					d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
				/>
				<path
					fill="#4285F4"
					d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.16 7.09-10.36 7.09-17.65z"
				/>
				<path
					fill="#FBBC05"
					d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
				/>
				<path
					fill="#34A853"
					d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
				/>
			</svg>
			Continue with Google
		</a>
	{/if}
</main>

<style>
	.login-page {
		max-width: 24rem;
		margin-top: 10vh;
	}

	form {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.login-submit,
	.google-signin {
		width: 100%;
	}

	.divider {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		color: var(--text-faint);
		margin: 1rem 0;
	}

	.divider::before,
	.divider::after {
		content: '';
		flex: 1;
		height: 1px;
		background: var(--border);
	}
</style>
