import { schnorr } from '@noble/curves/secp256k1.js';
import { bech32 } from '@scure/base';
import { describe, expect, it } from 'vitest';
import { calculateNostrEventId, validateZapReceipt } from './zap-receipt-validation';

const hex = (value: Uint8Array) =>
	Array.from(value, (byte) => byte.toString(16).padStart(2, '0')).join('');
const raw = (value: string) => Uint8Array.from(value.match(/../g)!, (part) => parseInt(part, 16));
const secretKey = Uint8Array.from({ length: 32 }, (_, index) => (index === 31 ? 1 : 0));
const pubkey = hex(schnorr.getPublicKey(secretKey));
const recipient = '2'.repeat(64);
const sender = '3'.repeat(64);
const lnurl = 'lnurl1example';
const preimage = '00'.repeat(31) + '01';
const field = (type: number, data: number[]) => [
	type,
	Math.floor(data.length / 32),
	data.length % 32,
	...data
];
async function invoice(description: string, amount = '10n') {
	const descriptionHash = new Uint8Array(
		await crypto.subtle.digest('SHA-256', new TextEncoder().encode(description))
	);
	const paymentHash = new Uint8Array(await crypto.subtle.digest('SHA-256', raw(preimage)));
	const words = [
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		...field(23, bech32.toWords(descriptionHash)),
		...field(1, bech32.toWords(paymentHash)),
		...Array(104).fill(0)
	];
	return bech32.encode(`lnbc${amount}`, words, false);
}
function request(amount = '1000') {
	return {
		id: '4'.repeat(64),
		pubkey: sender,
		created_at: 1,
		kind: 9734,
		content: '',
		sig: '5'.repeat(128),
		tags: [
			['p', recipient],
			['amount', amount],
			['lnurl', lnurl],
			['e', '6'.repeat(64)],
			['a', `30023:${recipient}:article`]
		]
	};
}
async function signedReceipt(tags: string[][], overrides: Record<string, unknown> = {}) {
	const event = { pubkey, created_at: 2, kind: 9735, tags, content: '', ...overrides };
	const id = await calculateNostrEventId(event as never);
	return { ...event, id, sig: hex(schnorr.sign(raw(id), secretKey)) };
}
async function fixture() {
	const zapRequest = request();
	const exact = JSON.stringify(zapRequest);
	const bolt11 = await invoice(exact);
	const tags = [
		['p', recipient],
		['e', '6'.repeat(64)],
		['a', `30023:${recipient}:article`],
		['P', sender],
		['bolt11', bolt11],
		['description', exact],
		['preimage', preimage]
	];
	return { zapRequest, exact, bolt11, receipt: await signedReceipt(tags) };
}
async function validate(overrides: Partial<Parameters<typeof validateZapReceipt>[0]> = {}) {
	const value = await fixture();
	return validateZapReceipt({
		candidate: value.receipt,
		signedZapRequest: value.zapRequest,
		exactZapRequestJson: value.exact,
		currentInvoice: value.bolt11,
		providerNostrPubkey: pubkey,
		currentLnurl: lnurl,
		...overrides
	});
}
const check = (result: Awaited<ReturnType<typeof validate>>, id: string) =>
	result.sections.flatMap((section) => section.checks).find((item) => item.id === id)!;

describe('NIP-01 Zap Receipt integrity', () => {
	it('recalculates the canonical ID and verifies a deterministic BIP-340 signature', async () => {
		const result = await validate();
		expect(check(result, 'shape').status).toBe('pass');
		expect(check(result, 'event-id').status).toBe('pass');
		expect(check(result, 'signature').status).toBe('pass');
		expect(check(result, 'kind').status).toBe('pass');
		expect(result.valid).toBe(true);
	});

	it.each([
		['id', 'A'.repeat(64), 'shape'],
		['pubkey', 'x', 'shape'],
		['sig', 'x', 'shape'],
		['tags', [['p', 3]], 'shape'],
		['kind', 1, 'kind']
	])('fails malformed or wrong %s without throwing', async (name, value, failedCheck) => {
		const base = await fixture();
		const candidate = { ...base.receipt, [name]: value };
		const result = await validate({ candidate });
		expect(check(result, failedCheck).status).toBe('fail');
		expect(result.valid).toBe(false);
	});

	it('detects both an ID mismatch and an invalid signature', async () => {
		const base = await fixture();
		const mismatch = await validate({ candidate: { ...base.receipt, id: '0'.repeat(64) } });
		expect(check(mismatch, 'event-id').status).toBe('fail');
		const invalid = await validate({ candidate: { ...base.receipt, sig: '0'.repeat(128) } });
		expect(check(invalid, 'signature').status).toBe('fail');
	});

	it('rejects an empty tag even when the canonical ID and signature are valid', async () => {
		const base = await fixture();
		const candidate = await signedReceipt([[], ...base.receipt.tags]);
		const result = await validate({ candidate });
		expect(check(result, 'shape').status).toBe('fail');
		expect(check(result, 'event-id').status).toBe('pass');
		expect(check(result, 'signature').status).toBe('pass');
		expect(result.valid).toBe(false);
	});

	it('continues to require a lowercase candidate pubkey', async () => {
		const base = await fixture();
		const result = await validate({ candidate: { ...base.receipt, pubkey: pubkey.toUpperCase() } });
		expect(check(result, 'shape').status).toBe('fail');
		expect(result.valid).toBe(false);
	});
});

describe('NIP-57 Appendix E and F checks', () => {
	it('passes required relationships, exact description, authorization, hashes, and raw preimage', async () => {
		const result = await validate();
		for (const id of [
			'p-tag',
			'e-tag',
			'a-tag',
			'P-tag',
			'bolt11',
			'description',
			'author',
			'amount',
			'lnurl',
			'description-hash',
			'preimage'
		])
			expect(check(result, id).status, id).toBe('pass');
		expect(check(result, 'content').status).toBe('pass');
		expect(check(result, 'paid-at').status).toBe('not-checked');
	});

	it.each(['p', 'bolt11', 'description'])('fails a missing required %s tag', async (tagName) => {
		const base = await fixture();
		const candidate = await signedReceipt(base.receipt.tags.filter((tag) => tag[0] !== tagName));
		const result = await validate({ candidate });
		expect(check(result, tagName === 'p' ? 'p-tag' : tagName).status).toBe('fail');
	});

	it('checks optional P only when present and applicable e/a relationships', async () => {
		const base = await fixture();
		let candidate = await signedReceipt(base.receipt.tags.filter((tag) => tag[0] !== 'P'));
		expect(check(await validate({ candidate }), 'P-tag').status).toBe('not-applicable');
		candidate = await signedReceipt(
			base.receipt.tags.map((tag) => (tag[0] === 'P' ? ['P', recipient] : tag))
		);
		expect(check(await validate({ candidate }), 'P-tag').status).toBe('fail');
		candidate = await signedReceipt(base.receipt.tags.filter((tag) => tag[0] !== 'e'));
		expect(check(await validate({ candidate }), 'e-tag').status).toBe('fail');
	});

	it('requires exact description bytes and separately diagnoses invalid JSON and hash mismatch', async () => {
		const base = await fixture();
		const candidate = await signedReceipt(
			base.receipt.tags.map((tag) => (tag[0] === 'description' ? ['description', 'not json'] : tag))
		);
		const result = await validate({ candidate });
		expect(check(result, 'description').status).toBe('fail');
		expect(check(result, 'description-json').status).toBe('fail');
		expect(check(result, 'description-hash').status).toBe('warning');
	});

	it('reports SHOULD deviations as warnings without invalidating the receipt', async () => {
		const base = await fixture();
		const candidate = await signedReceipt(base.receipt.tags, { content: 'wallet note' });
		const result = await validate({ candidate, currentLnurl: 'lnurl1different' });
		expect(check(result, 'content').status).toBe('warning');
		expect(check(result, 'lnurl').status).toBe('warning');
		expect(result.valid).toBe(true);
		expect(result.warningCount).toBe(2);
	});

	it('validates provider author and decodes amount from the receipt invoice', async () => {
		expect(check(await validate(), 'author').status).toBe('pass');
		const uppercaseProvider = await validate({ providerNostrPubkey: pubkey.toUpperCase() });
		expect(check(uppercaseProvider, 'author').status).toBe('pass');
		expect(uppercaseProvider.valid).toBe(true);
		expect(check(await validate({ providerNostrPubkey: recipient }), 'author').status).toBe('fail');
		const base = await fixture();
		expect(check(await validate({ signedZapRequest: request('2000') }), 'amount').status).toBe(
			'fail'
		);
		expect(check(await validate({ signedZapRequest: request('') }), 'amount').status).toBe('fail');
		const noAmount = {
			...base.zapRequest,
			tags: base.zapRequest.tags.filter((tag) => tag[0] !== 'amount')
		};
		expect(check(await validate({ signedZapRequest: noAmount }), 'amount').status).toBe(
			'not-applicable'
		);
	});

	it('handles malformed and amountless receipt invoices and optional LNURL/preimage states', async () => {
		const base = await fixture();
		for (const bolt11 of ['not-an-invoice', await invoice(base.exact, '')]) {
			const candidate = await signedReceipt(
				base.receipt.tags.map((tag) => (tag[0] === 'bolt11' ? ['bolt11', bolt11] : tag))
			);
			expect(check(await validate({ candidate, currentInvoice: bolt11 }), 'amount').status).toBe(
				'fail'
			);
		}
		const noLnurl = {
			...base.zapRequest,
			tags: base.zapRequest.tags.filter((tag) => tag[0] !== 'lnurl')
		};
		expect(check(await validate({ signedZapRequest: noLnurl }), 'lnurl').status).toBe(
			'not-applicable'
		);
		let candidate = await signedReceipt(base.receipt.tags.filter((tag) => tag[0] !== 'preimage'));
		expect(check(await validate({ candidate }), 'preimage').status).toBe('not-applicable');
		candidate = await signedReceipt(
			base.receipt.tags.map((tag) => (tag[0] === 'preimage' ? ['preimage', 'bad'] : tag))
		);
		expect(check(await validate({ candidate }), 'preimage').status).toBe('fail');
		candidate = await signedReceipt(
			base.receipt.tags.map((tag) => (tag[0] === 'preimage' ? ['preimage', '01'.repeat(32)] : tag))
		);
		expect(check(await validate({ candidate }), 'preimage').status).toBe('fail');
	});
});
