import { describe, expect, it } from 'vitest';
import { createPaymentHandoffValues, isPaymentHandoffReady } from './payment-handoff';

describe('Lightning payment handoff values', () => {
	it('preserves the original invoice for clipboard and wallet handoff', () => {
		const invoice = 'lnbc10n1MixedCaseInvoice';
		const values = createPaymentHandoffValues(invoice);

		expect(values.clipboardValue).toBe(invoice);
		expect(values.openWalletUri).toBe(`lightning:${invoice}`);
		expect(values.qrPayload).toBe(`lightning:${invoice.toUpperCase()}`);
	});

	it('uses lightning: without a double slash for wallet and QR values', () => {
		const values = createPaymentHandoffValues('lnbc1invoice');

		expect(values.openWalletUri).toMatch(/^lightning:[^/]/);
		expect(values.qrPayload).toMatch(/^lightning:[^/]/);
		expect(values.openWalletUri).not.toContain('lightning://');
		expect(values.qrPayload).not.toContain('lightning://');
	});
});

describe('payment handoff gating', () => {
	const verified = {
		invoice: 'lnbc1invoice',
		requestedAmountMsat: 1000n,
		decodedAmountMsat: 1000n,
		descriptionHashStatus: 'match' as const
	};

	it.each(['match', 'direct-description'] as const)(
		'allows a matching amount with %s',
		(descriptionHashStatus) => {
			expect(isPaymentHandoffReady({ ...verified, descriptionHashStatus })).toBe(true);
		}
	);

	it.each(['match', 'direct-description'] as const)(
		'rejects an unavailable or mismatching amount with %s',
		(descriptionHashStatus) => {
			for (const decodedAmountMsat of [undefined, 2000n]) {
				expect(
					isPaymentHandoffReady({ ...verified, descriptionHashStatus, decodedAmountMsat })
				).toBe(false);
			}
		}
	);

	it.each([
		['invoice missing', { ...verified, invoice: undefined }],
		['requested amount missing', { ...verified, requestedAmountMsat: undefined }],
		['description hash unverified', { ...verified, descriptionHashStatus: undefined }],
		['description hash failure', { ...verified, descriptionHashStatus: 'failure' as const }],
		['description hash mismatch', { ...verified, descriptionHashStatus: 'mismatch' as const }]
	])('rejects %s', (_name, gate) => {
		expect(isPaymentHandoffReady(gate)).toBe(false);
	});
});
