export interface PaymentHandoffValues {
	clipboardValue: string;
	openWalletUri: string;
	qrPayload: string;
}

export interface PaymentHandoffGate {
	invoice?: string;
	requestedAmountMsat?: bigint;
	decodedAmountMsat?: bigint;
	descriptionHashStatus?: 'match' | 'mismatch' | 'failure';
}

export function createPaymentHandoffValues(invoice: string): PaymentHandoffValues {
	return {
		clipboardValue: invoice,
		openWalletUri: `lightning:${invoice}`,
		qrPayload: `lightning:${invoice.toUpperCase()}`
	};
}

export function isPaymentHandoffReady(gate: PaymentHandoffGate): boolean {
	return (
		gate.invoice !== undefined &&
		gate.requestedAmountMsat !== undefined &&
		gate.decodedAmountMsat !== undefined &&
		gate.decodedAmountMsat === gate.requestedAmountMsat &&
		gate.descriptionHashStatus === 'match'
	);
}
