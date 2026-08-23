import type { UnsignedNostrEvent } from './nostr-event';
import type { ValidationItem } from './validation';

export type ZapRequestInput = {
	recipientPubkey: string;
	amount: number;
	relays: string[];
	lnurl: string;
	comment: string;
	createdAt: number;
};

export function buildZapRequest(input: ZapRequestInput): UnsignedNostrEvent {
	return {
		kind: 9734,
		created_at: input.createdAt,
		tags: [
			['relays', ...input.relays],
			['amount', input.amount.toString()],
			['lnurl', input.lnurl],
			['p', input.recipientPubkey]
		],
		content: input.comment
	};
}

export type ZapRequestExpectation = Omit<ZapRequestInput, 'createdAt'> & {
	minSendable: number;
	maxSendable: number;
};

export function validateZapRequest(
	event: UnsignedNostrEvent,
	expected: ZapRequestExpectation
): ValidationItem[] {
	const tags = (name: string) => event.tags.filter((tag) => tag[0] === name);
	const p = tags('p');
	const relays = tags('relays');
	const amount = tags('amount');
	const lnurl = tags('lnurl');
	const amountValue = amount[0]?.[1];
	const parsedAmount = amountValue === undefined ? Number.NaN : Number(amountValue);
	return [
		{ label: 'kind === 9734', valid: event.kind === 9734 },
		{ label: 'exactly one p tag', valid: p.length === 1 },
		{
			label: 'p tag contains recipient hex pubkey',
			valid: p.length === 1 && p[0]?.[1] === expected.recipientPubkey
		},
		{ label: 'exactly one relays tag', valid: relays.length === 1 },
		{
			label: 'relays tag has at least one relay',
			valid: relays.length === 1 && (relays[0]?.length ?? 0) > 1
		},
		{
			label: 'relays tag matches Step 4 relays',
			valid:
				relays.length === 1 &&
				JSON.stringify(relays[0]?.slice(1)) === JSON.stringify(expected.relays)
		},
		{ label: 'exactly one amount tag', valid: amount.length === 1 },
		{
			label: 'amount tag equals Step 4 amount',
			valid: amount.length === 1 && amountValue === expected.amount.toString()
		},
		{
			label: 'amount is within Step 3 range',
			valid:
				Number.isSafeInteger(parsedAmount) &&
				parsedAmount >= expected.minSendable &&
				parsedAmount <= expected.maxSendable
		},
		{ label: 'exactly one lnurl tag', valid: lnurl.length === 1 },
		{
			label: 'lnurl tag equals encoded LNURL-pay URL',
			valid: lnurl.length === 1 && lnurl[0]?.[1] === expected.lnurl
		},
		{ label: 'no e tag for this person zap', valid: tags('e').length === 0 },
		{ label: 'no a tag', valid: tags('a').length === 0 },
		{ label: 'no k tag', valid: tags('k').length === 0 },
		{ label: 'no P tag', valid: tags('P').length === 0 },
		{ label: 'content equals entered comment', valid: event.content === expected.comment },
		{
			label: 'created_at is an integer Unix timestamp',
			valid: Number.isInteger(event.created_at) && event.created_at >= 0
		}
	];
}
