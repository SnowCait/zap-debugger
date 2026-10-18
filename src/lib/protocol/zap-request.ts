import { m } from '$lib/paraglide/messages';
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
		{ label: m.diagnostic_request_kind(), valid: event.kind === 9734 },
		{ label: m.diagnostic_request_p_count(), valid: p.length === 1 },
		{
			label: m.diagnostic_request_p_recipient(),
			valid: p.length === 1 && p[0]?.[1] === expected.recipientPubkey
		},
		{ label: m.diagnostic_request_relays_count(), valid: relays.length === 1 },
		{
			label: m.diagnostic_request_relays_present(),
			valid: relays.length === 1 && (relays[0]?.length ?? 0) > 1
		},
		{
			label: m.diagnostic_request_relays_match(),
			valid:
				relays.length === 1 &&
				JSON.stringify(relays[0]?.slice(1)) === JSON.stringify(expected.relays)
		},
		{ label: m.diagnostic_request_amount_count(), valid: amount.length === 1 },
		{
			label: m.diagnostic_request_amount_match(),
			valid: amount.length === 1 && amountValue === expected.amount.toString()
		},
		{
			label: m.diagnostic_request_amount_range(),
			valid:
				Number.isSafeInteger(parsedAmount) &&
				parsedAmount >= expected.minSendable &&
				parsedAmount <= expected.maxSendable
		},
		{ label: m.diagnostic_request_lnurl_count(), valid: lnurl.length === 1 },
		{
			label: m.diagnostic_request_lnurl_match(),
			valid: lnurl.length === 1 && lnurl[0]?.[1] === expected.lnurl
		},
		{ label: m.diagnostic_request_e_absent(), valid: tags('e').length === 0 },
		{ label: m.diagnostic_request_a_absent(), valid: tags('a').length === 0 },
		{ label: m.diagnostic_request_k_absent(), valid: tags('k').length === 0 },
		{ label: m.diagnostic_request_P_absent(), valid: tags('P').length === 0 },
		{ label: m.diagnostic_request_content(), valid: event.content === expected.comment },
		{
			label: m.diagnostic_request_created_at(),
			valid: Number.isInteger(event.created_at) && event.created_at >= 0
		}
	];
}
