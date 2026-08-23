import { describe, expect, it } from 'vitest';
import { parseRelays, validateZapAmount } from './zap-parameters';

describe('validateZapAmount', () => {
	const validate = (input: string) => validateZapAmount(input, 1000, 100000);
	it.each([
		['minimum', '1000'],
		['maximum', '100000']
	])('accepts the exact %s', (_, input) => expect(validate(input).valid).toBe(true));
	it.each([
		['below minimum', '999'],
		['above maximum', '100001'],
		['zero', '0'],
		['negative', '-1'],
		['decimal', '1000.5'],
		['non-numeric', 'abc']
	])('rejects %s', (_, input) => expect(validate(input).valid).toBe(false));
});

describe('parseRelays', () => {
	it('accepts one WebSocket relay', () =>
		expect(parseRelays('wss://relay.example').valid).toBe(true));
	it('accepts multiple WebSocket relays', () =>
		expect(parseRelays('wss://one.example\nws://two.example:8080').relays).toEqual([
			'wss://one.example',
			'ws://two.example:8080'
		]));
	it('rejects invalid URLs', () => expect(parseRelays('not a url').valid).toBe(false));
	it('rejects non-WebSocket schemes', () =>
		expect(parseRelays('https://relay.example').valid).toBe(false));
	it('rejects an empty list', () => expect(parseRelays('\n ').valid).toBe(false));
});
