import { bech32 } from '@scure/base';

export type Bolt11Network = 'bitcoin' | 'testnet' | 'signet' | 'regtest';

export type Bolt11AmountResult =
	| { status: 'failure'; reason: string }
	| { status: 'unspecified'; prefix: string; network: Bolt11Network }
	| { status: 'specified'; prefix: string; network: Bolt11Network; amountMsat: bigint };

export type Bolt11DescriptionHashResult =
	| { status: 'failure'; reason: string }
	| { status: 'missing'; reason: string }
	| { status: 'available'; descriptionHashHex: string };

export type DescriptionHashVerificationResult =
	| { status: 'failure'; reason: string; calculatedHashHex?: string }
	| { status: 'match' | 'mismatch'; invoiceHashHex: string; calculatedHashHex: string };

// The BOLT11 data part is expressed as 5-bit words.
const TIMESTAMP_WORDS = 7; // 35 bits
const SIGNATURE_WORDS = 104; // 520 bits
const TAG_HEADER_WORDS = 3; // type (5 bits) + length (10 bits)
const DESCRIPTION_HASH_TYPE = 23;
const DESCRIPTION_TYPE = 13;
const DESCRIPTION_HASH_WORDS = 52; // padded representation of 256 bits

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

export function inspectBolt11DescriptionHash(invoice: string): Bolt11DescriptionHashResult {
	try {
		const { words } = bech32.decode(invoice, false);
		if (words.length < TIMESTAMP_WORDS + SIGNATURE_WORDS) {
			return { status: 'failure', reason: 'BOLT11 data part is too short' };
		}

		const taggedFieldsEnd = words.length - SIGNATURE_WORDS;
		let offset = TIMESTAMP_WORDS;
		const hashes: number[][] = [];
		let hasDirectDescription = false;
		while (offset < taggedFieldsEnd) {
			if (offset + TAG_HEADER_WORDS > taggedFieldsEnd) {
				return { status: 'failure', reason: 'Malformed BOLT11 tagged field header' };
			}
			const type = words[offset];
			const length = words[offset + 1] * 32 + words[offset + 2];
			offset += TAG_HEADER_WORDS;
			if (offset + length > taggedFieldsEnd) {
				return { status: 'failure', reason: 'BOLT11 tagged field exceeds the data boundary' };
			}
			const data = words.slice(offset, offset + length);
			if (type === DESCRIPTION_HASH_TYPE) hashes.push(data);
			if (type === DESCRIPTION_TYPE) hasDirectDescription = true;
			offset += length;
		}

		if (hashes.length === 0) {
			return {
				status: 'missing',
				reason: hasDirectDescription
					? 'Invoice contains a direct description instead of a description hash'
					: 'Invoice does not contain a description hash'
			};
		}
		if (hashes.length > 1) {
			return { status: 'failure', reason: 'Invoice contains multiple description hashes' };
		}
		if (hashes[0].length !== DESCRIPTION_HASH_WORDS) {
			return { status: 'failure', reason: 'Invoice description hash has an invalid length' };
		}
		const bytes = bech32.fromWords(hashes[0]);
		if (bytes.length !== 32) {
			return { status: 'failure', reason: 'Invoice description hash is not 256 bits' };
		}
		return {
			status: 'available',
			descriptionHashHex: Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
		};
	} catch (error) {
		return {
			status: 'failure',
			reason: error instanceof Error ? error.message : 'BOLT11 description hash decoding failed'
		};
	}
}

export async function sha256Utf8Hex(value: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function verifyBolt11DescriptionHash(
	invoice: string,
	zapRequestJson: string
): Promise<DescriptionHashVerificationResult> {
	const inspection = inspectBolt11DescriptionHash(invoice);
	if (inspection.status !== 'available') return { status: 'failure', reason: inspection.reason };
	const calculatedHashHex = await sha256Utf8Hex(zapRequestJson);
	return {
		status: calculatedHashHex === inspection.descriptionHashHex ? 'match' : 'mismatch',
		invoiceHashHex: inspection.descriptionHashHex,
		calculatedHashHex
	};
}
