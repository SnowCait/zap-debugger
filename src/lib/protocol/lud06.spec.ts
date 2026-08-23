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
	it('rejects a non-string text/plain value', () => {
		expect(invalidLabels({ ...valid, metadata: '[["text/plain",{"foo":"bar"}]]' })).toContain(
			'text/plain value is a string'
		);
	});
	it.each(['image/png;base64', 'image/jpeg;base64'])('accepts a valid %s entry', (type) => {
		expect(
			validateLud06({
				...valid,
				metadata: JSON.stringify([
					['text/plain', 'Example'],
					[type, 'aGVsbG8=']
				])
			})
		).toMatchObject({ kind: 'payRequest', valid: true });
	});
	it('rejects PNG and JPEG entries used together', () => {
		expect(
			invalidLabels({
				...valid,
				metadata: JSON.stringify([
					['text/plain', 'Example'],
					['image/png;base64', 'a'],
					['image/jpeg;base64', 'b']
				])
			})
		).toContain('image metadata uses at most one PNG or JPEG entry');
	});
	it('accepts the image character limit and rejects a value above it', () => {
		const metadata = (length: number) =>
			JSON.stringify([
				['text/plain', 'Example'],
				['image/png;base64', 'a'.repeat(length)]
			]);
		expect(validateLud06({ ...valid, metadata: metadata(136_536) })).toMatchObject({ valid: true });
		expect(invalidLabels({ ...valid, metadata: metadata(136_537) })).toContain(
			'image metadata values are at most 136536 characters'
		);
	});
	it('rejects non-string long descriptions and image values', () => {
		expect(
			invalidLabels({ ...valid, metadata: '[["text/plain","Example"],["text/long-desc",{}]]' })
		).toContain('text/long-desc values are strings when present');
		expect(
			invalidLabels({ ...valid, metadata: '[["text/plain","Example"],["image/png;base64",{}]]' })
		).toContain('image metadata values are strings');
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
			'metadata contains exactly one text/plain entry'
		]
	])('rejects an invalid response', (value, label) =>
		expect(invalidLabels(value).join(' ')).toContain(label)
	);
});
