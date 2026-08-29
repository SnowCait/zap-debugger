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

	it('allows a matching amount and description hash', () => {
		expect(isPaymentHandoffReady(verified)).toBe(true);
	});

	it.each([
		['invoice missing', { ...verified, invoice: undefined }],
		['amount decode failure', { ...verified, decodedAmountMsat: undefined }],
		['amount mismatch', { ...verified, decodedAmountMsat: 2000n }],
		['description hash failure', { ...verified, descriptionHashStatus: 'failure' as const }],
		['description hash mismatch', { ...verified, descriptionHashStatus: 'mismatch' as const }]
	])('rejects %s', (_name, gate) => {
		expect(isPaymentHandoffReady(gate)).toBe(false);
	});
});
