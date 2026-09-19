/** Helpers for reading SvelteKit form data without repeating coercion rules. */

export function str(form: FormData, key: string): string {
	return String(form.get(key) ?? '').trim();
}

export function optStr(form: FormData, key: string): string | null {
	const value = str(form, key);
	return value === '' ? null : value;
}

export function int(form: FormData, key: string): number | null {
	const value = str(form, key);
	if (value === '') return null;
	const parsed = Number.parseInt(value, 10);
	return Number.isFinite(parsed) ? parsed : null;
}

export function intOr(form: FormData, key: string, fallback: number): number {
	return int(form, key) ?? fallback;
}

export function num(form: FormData, key: string): number | null {
	const value = str(form, key);
	if (value === '') return null;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

export function bool(form: FormData, key: string): boolean {
	const value = form.get(key);
	return value === '1' || value === 'on' || value === 'true';
}

/** All values for a repeated field, trimmed and empty-filtered. */
export function strList(form: FormData, key: string): string[] {
	return form
		.getAll(key)
		.map((value) => String(value).trim())
		.filter((value) => value !== '');
}

/**
 * Parse bracket-notation fields like `target_reps[12]=8` into a map keyed by id.
 * Used by the routine/workout set editors.
 */
export function bracketMap(form: FormData, base: string): Record<number, string> {
	const out: Record<number, string> = {};
	const pattern = new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\[(\\d+)\\]$`);
	for (const [key, value] of form.entries()) {
		if (typeof value !== 'string') continue;
		const match = key.match(pattern);
		if (!match) continue;
		out[Number(match[1])] = value;
	}
	return out;
}

/** Same as bracketMap but filters out blank values. */
export function bracketList(form: FormData, base: string): number[] {
	const out: number[] = [];
	const pattern = new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\[(\\d+)\\]$`);
	for (const key of form.keys()) {
		const match = key.match(pattern);
		if (match) out.push(Number(match[1]));
	}
	return out;
}
