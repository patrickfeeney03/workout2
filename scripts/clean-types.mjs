#!/usr/bin/env node
/**
 * Strip the `Cloudflare.GlobalProps` main-module import that `wrangler types`
 * adds to worker-configuration.d.ts once `.svelte-kit/cloudflare/_worker.js`
 * exists. That import makes svelte-check type-check the whole bundled worker
 * (thousands of implicit-any errors); it is only useful for hand-written
 * Workers that consume their own module type.
 *
 * Run via `npm run types` instead of `npx wrangler types` directly.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const target = new URL('../worker-configuration.d.ts', import.meta.url);
const original = readFileSync(target, 'utf8');
const cleaned = original.replace(/[ \t]*interface GlobalProps \{\n(?:.*\n)*?[ \t]*\}\n/, '');

if (cleaned !== original) {
	writeFileSync(target, cleaned);
	console.log('Removed Cloudflare.GlobalProps main-module import from worker-configuration.d.ts');
} else {
	console.log('worker-configuration.d.ts already clean');
}
