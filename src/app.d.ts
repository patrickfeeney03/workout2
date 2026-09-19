// See https://svelte.dev/docs/kit/types#app for information about these interfaces
import type { User } from '$lib/types';

declare global {
	namespace App {
		interface Error {
			message: string;
		}
		interface Locals {
			user: User | null;
			db: D1Database;
			env: Cloudflare.Env;
		}
		interface Platform {
			env: Cloudflare.Env;
		}
	}
}

export {};
