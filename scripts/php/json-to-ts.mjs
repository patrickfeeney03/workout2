#!/usr/bin/env node
/**
 * Converts the PHP golden JSON into a committable TypeScript module.
 *
 * workerd has no filesystem, so the golden fixture must be a module the test
 * can import. This script is the only bridge:
 *
 *   php scripts/php/dump-stats.php > /tmp/stats.json
 *   node scripts/php/json-to-ts.mjs /tmp/stats.json tests/golden/stats.golden.ts
 *
 * Both arguments are optional; they default to the paths shown above.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const inputPath = resolve(process.argv[2] ?? '/tmp/stats.json');
const outputPath = resolve(process.argv[3] ?? 'tests/golden/stats.golden.ts');

let raw;
try {
	raw = readFileSync(inputPath, 'utf8');
} catch (error) {
	console.error(`json-to-ts: cannot read ${inputPath}: ${error.message}`);
	process.exit(1);
}

let data;
try {
	data = JSON.parse(raw);
} catch (error) {
	console.error(`json-to-ts: ${inputPath} is not valid JSON: ${error.message}`);
	process.exit(1);
}

if (data === null || typeof data !== 'object' || !Array.isArray(data.cases)) {
	console.error('json-to-ts: expected an object with a "cases" array from dump-stats.php');
	process.exit(1);
}

const generatedAt = typeof data.generatedAt === 'string' ? data.generatedAt : 'unknown';
const phpVersion = typeof data.phpVersion === 'string' ? data.phpVersion : 'unknown';
const caseCount = data.cases.length;

const banner = [
	'// AUTO-GENERATED - do not edit by hand.',
	`// Source: dump-stats.php (PHP ${phpVersion}) on ${generatedAt}.`,
	`// ${caseCount} case(s). Regenerate with scripts/php/README.md.`,
	''
].join('\n');

const body = `export const statsGolden = ${JSON.stringify(data, null, '\t')};\n\nexport default statsGolden;\n`;

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${banner}${body}`, 'utf8');

console.log(`json-to-ts: wrote ${caseCount} case(s) to ${outputPath}`);
