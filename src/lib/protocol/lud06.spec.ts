import { describe, expect, it } from 'vitest';
import { validateLud06 } from './lud06';

const valid = {
	tag: 'payRequest',
	callback: 'https://example.com/callback',
	minSendable: 1,
	maxSendable: 1000,
	metadata: '[["text/plain","Example"],["custom/type",{"kept":true}]]'
};
const invalidLabels = (value: unknown) => {
	const result = validateLud06(value);
	expect(result.kind).toBe('payRequest');
	return result.kind === 'payRequest'
		? result.items.filter((item) => !item.valid).map((item) => item.label)
		: [];
};

describe('LUD-06 validation', () => {
	it('accepts a basic payRequest and preserves unknown metadata', () => {
		const result = validateLud06(valid);
		expect(result).toMatchObject({ kind: 'payRequest', valid: true });
		if (result.kind === 'payRequest')
			expect(result.data.parsedMetadata).toEqual([
				['text/plain', 'Example'],
				['custom/type', { kept: true }]
			]);
	});
	it('recognizes an error response without payRequest validation', () => {
		expect(validateLud06({ status: 'ERROR', reason: 'Unavailable' })).toEqual({
			kind: 'error',
			valid: false,
			status: 'ERROR',
			reason: 'Unavailable'
		});
	});
	it.each([
		[{ ...valid, tag: 'withdrawRequest' }, 'tag === "payRequest"'],
		[{ ...valid, callback: undefined }, 'callback is present'],
		[{ ...valid, callback: 'not a url' }, 'callback parses as a URL'],
		[{ ...valid, minSendable: '1' }, 'minSendable is a safe integer number'],
		[{ ...valid, maxSendable: 1.5 }, 'maxSendable is a safe integer number'],
		[{ ...valid, minSendable: 2, maxSendable: 1 }, 'minSendable <= maxSendable'],
		[{ ...valid, metadata: '[' }, 'metadata parses as JSON'],
		[{ ...valid, metadata: '["not-an-entry"]' }, 'every metadata entry'],
		[
			{ ...valid, metadata: '[["text/long-desc","No short description"]]' },
			'metadata contains text/plain'
		]
	])('rejects an invalid response', (value, label) =>
		expect(invalidLabels(value).join(' ')).toContain(label)
	);
});
