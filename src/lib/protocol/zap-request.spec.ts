import { describe, expect, it } from 'vitest';
import { buildZapRequest, validateZapRequest, type ZapRequestExpectation } from './zap-request';

const expected: ZapRequestExpectation = {
	recipientPubkey: '7e7e9c42a91bfef19fa929e5fda1b72e0ebc1a4c1141673e2794234d86addf4e',
	amount: 21000,
	relays: ['wss://relay.example'],
	lnurl: 'lnurl1example',
	comment: 'Zap!',
	minSendable: 1000,
	maxSendable: 100000
};
const build = () => buildZapRequest({ ...expected, createdAt: 1700000000 });
const valid = (event = build()) => validateZapRequest(event, expected).every((item) => item.valid);

describe('buildZapRequest', () => {
	it('builds the expected person zap without event tags', () => {
		const event = build();
		expect(event).toEqual({
			kind: 9734,
			created_at: 1700000000,
			content: 'Zap!',
			tags: [
				['relays', 'wss://relay.example'],
				['amount', '21000'],
				['lnurl', 'lnurl1example'],
				['p', expected.recipientPubkey]
			]
		});
		expect(event.tags.some((tag) => ['e', 'a', 'k', 'P'].includes(tag[0] ?? ''))).toBe(false);
	});
});

describe('validateZapRequest', () => {
	it('accepts a valid person zap', () => expect(valid()).toBe(true));
	it('rejects duplicate p tags', () => {
		const event = build();
		event.tags.push(['p', expected.recipientPubkey]);
		expect(valid(event)).toBe(false);
	});
	it('rejects a missing p tag', () => {
		const event = build();
		event.tags = event.tags.filter((tag) => tag[0] !== 'p');
		expect(valid(event)).toBe(false);
	});
	it('rejects missing relays', () => {
		const event = build();
		event.tags = event.tags.filter((tag) => tag[0] !== 'relays');
		expect(valid(event)).toBe(false);
	});
	it('rejects an amount mismatch', () => {
		const event = build();
		event.tags.find((tag) => tag[0] === 'amount')![1] = '22000';
		expect(valid(event)).toBe(false);
	});
	it('rejects an lnurl mismatch', () => {
		const event = build();
		event.tags.find((tag) => tag[0] === 'lnurl')![1] = 'lnurl1other';
		expect(valid(event)).toBe(false);
	});
	it('rejects an unexpected e tag', () => {
		const event = build();
		event.tags.push(['e', '0'.repeat(64)]);
		expect(valid(event)).toBe(false);
	});
});
