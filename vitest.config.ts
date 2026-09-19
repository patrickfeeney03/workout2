import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig(async () => {
	const migrations = await readD1Migrations(`${root}migrations`);

	return {
		plugins: [
			cloudflareTest({
				main: './tests/test-worker.ts',
				wrangler: { configPath: './wrangler.jsonc' },
				miniflare: {
					bindings: {
						TEST_MIGRATIONS: migrations,
						ALLOWED_EMAILS: 'test@example.com',
						GOOGLE_CLIENT_ID: '',
						GOOGLE_CLIENT_SECRET: '',
						GOOGLE_REDIRECT_URI: ''
					}
				}
			})
		],
		resolve: {
			alias: {
				$lib: `${root}src/lib`
			}
		},
		test: {
			include: ['tests/**/*.test.ts'],
			setupFiles: ['./tests/apply-migrations.ts']
		}
	};
});
