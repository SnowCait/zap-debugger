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

export type Bolt11PaymentHashResult =
	| { status: 'failure'; reason: string }
	| { status: 'missing'; reason: string }
	| { status: 'available'; paymentHashHex: string };

// The BOLT11 data part is expressed as 5-bit words.
const TIMESTAMP_WORDS = 7; // 35 bits
const SIGNATURE_WORDS = 104; // 520 bits
const TAG_HEADER_WORDS = 3; // type (5 bits) + length (10 bits)
const DESCRIPTION_HASH_TYPE = 23;
const DESCRIPTION_TYPE = 13;
const PAYMENT_HASH_TYPE = 1;
const DESCRIPTION_HASH_WORDS = 52; // padded representation of 256 bits

type TaggedFieldScan = { fields: Map<number, number[][]> } | { failure: string };

function scanTaggedFields(invoice: string): TaggedFieldScan {
	try {
		const { words } = bech32.decode(invoice, false);
		if (words.length < TIMESTAMP_WORDS + SIGNATURE_WORDS)
			return { failure: 'BOLT11 data part is too short' };
		const end = words.length - SIGNATURE_WORDS;
		const fields = new Map<number, number[][]>();
		let offset = TIMESTAMP_WORDS;
		while (offset < end) {
			if (offset + TAG_HEADER_WORDS > end)
				return { failure: 'Malformed BOLT11 tagged field header' };
			const type = words[offset];
			const length = words[offset + 1] * 32 + words[offset + 2];
			offset += TAG_HEADER_WORDS;
			if (offset + length > end)
				return { failure: 'BOLT11 tagged field exceeds the data boundary' };
			const values = fields.get(type) ?? [];
			values.push(words.slice(offset, offset + length));
			fields.set(type, values);
			offset += length;
		}
		return { fields };
	} catch (error) {
		return {
			failure: error instanceof Error ? error.message : 'BOLT11 tagged field decoding failed'
		};
	}
}

function decodeSingleHashField(
	scan: TaggedFieldScan,
	type: number,
	name: string,
	pluralName = `${name}s`
): Bolt11PaymentHashResult {
	if ('failure' in scan) return { status: 'failure', reason: scan.failure };
	const values = scan.fields.get(type) ?? [];
	if (values.length === 0)
		return { status: 'missing', reason: `Invoice does not contain a ${name}` };
	if (values.length > 1)
		return { status: 'failure', reason: `Invoice contains multiple ${pluralName}` };
	if (values[0].length !== DESCRIPTION_HASH_WORDS)
		return { status: 'failure', reason: `Invoice ${name} has an invalid length` };
	const bytes = bech32.fromWords(values[0]);
	if (bytes.length !== 32) return { status: 'failure', reason: `Invoice ${name} is not 256 bits` };
	return { status: 'available', paymentHashHex: bytesToHex(bytes) };
}

const bytesToHex = (bytes: Uint8Array) =>
	Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

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
		const scan = scanTaggedFields(invoice);
		if ('failure' in scan) return { status: 'failure', reason: scan.failure };
		const hashes = scan.fields.get(DESCRIPTION_HASH_TYPE) ?? [];
		const hasDirectDescription = (scan.fields.get(DESCRIPTION_TYPE)?.length ?? 0) > 0;

		if (hasDirectDescription && hashes.length > 0) {
			return {
				status: 'failure',
				reason: 'Invoice contains both a direct description and a description hash'
			};
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

export function inspectBolt11PaymentHash(invoice: string): Bolt11PaymentHashResult {
	const result = decodeSingleHashField(
		scanTaggedFields(invoice),
		PAYMENT_HASH_TYPE,
		'payment hash',
		'payment hashes'
	);
	if (result.status !== 'available') return result;
	return { status: 'available', paymentHashHex: result.paymentHashHex };
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
