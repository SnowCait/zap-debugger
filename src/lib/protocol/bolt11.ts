import { bech32 } from '@scure/base';

export type Bolt11Network = 'bitcoin' | 'testnet' | 'signet' | 'regtest';

export type Bolt11AmountResult =
	| { status: 'failure'; reason: string }
	| { status: 'unspecified'; prefix: string; network: Bolt11Network }
	| { status: 'specified'; prefix: string; network: Bolt11Network; amountMsat: bigint };

const NETWORKS: Record<string, Bolt11Network> = {
	lnbc: 'bitcoin',
	lntb: 'testnet',
	lntbs: 'signet',
	lnbcrt: 'regtest'
};

const MSAT_PER_UNIT: Record<string, bigint> = {
	'': 100_000_000_000n,
	m: 100_000_000n,
	u: 100_000n,
	n: 100n
};

export function parseBolt11Amount(amount: string): bigint {
	const match = /^([1-9][0-9]*)([munp]?)$/.exec(amount);
	if (!match)
		throw new Error('Invoice amount must be a positive decimal integer without leading zeros');

	const value = BigInt(match[1]);
	const multiplier = match[2];
	if (multiplier === 'p') {
		if (value % 10n !== 0n)
			throw new Error('Pico-bitcoin amount does not represent an integer millisatoshi');
		return value / 10n;
	}
	return value * MSAT_PER_UNIT[multiplier];
}

export function inspectBolt11Amount(invoice: string): Bolt11AmountResult {
	try {
		// BOLT11 explicitly permits invoices beyond BIP-173's default 90-character limit.
		const { prefix: humanReadablePart } = bech32.decode(invoice, false);
		const match = /^(lnbcrt|lntbs|lnbc|lntb)(.*)$/.exec(humanReadablePart);
		if (!match) return { status: 'failure', reason: 'Unknown Bitcoin network prefix' };

		const prefix = match[1];
		const network = NETWORKS[prefix];
		const amount = match[2];
		if (amount === '') return { status: 'unspecified', prefix, network };

		return { status: 'specified', prefix, network, amountMsat: parseBolt11Amount(amount) };
	} catch (error) {
		return {
			status: 'failure',
			reason: error instanceof Error ? error.message : 'BOLT11 amount decoding failed'
		};
	}
}
