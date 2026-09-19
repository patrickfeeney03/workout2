import { describe, expect, it } from 'vitest';
import { formatDate } from '$lib/server/services/common';

// Port of tests/unit/format_date_test.php
describe('formatDate', () => {
	it('with valid date and default format', () => {
		expect(formatDate('2023-10-25')).toBe('Oct 25');
	});

	it('with valid date and custom format', () => {
		expect(formatDate('2023-10-25', 'Y/m/d')).toBe('2023/10/25');
	});

	it('with null', () => {
		expect(formatDate(null)).toBe('');
	});

	it('with empty string', () => {
		expect(formatDate('')).toBe('');
	});

	it('with invalid date string returns the original string', () => {
		expect(formatDate('not-a-date')).toBe('not-a-date');
	});
});
