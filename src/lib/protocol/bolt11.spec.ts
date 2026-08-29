import { bech32 } from '@scure/base';
import { describe, expect, it } from 'vitest';
import {
	inspectBolt11Amount,
	inspectBolt11DescriptionHash,
	parseBolt11Amount,
	sha256Utf8Hex,
	verifyBolt11DescriptionHash
} from './bolt11';

const amountlessVector =
	'lnbc1pvjluezsp5zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygspp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdpl2pkx2ctnv5sxxmmwwd5kgetjypeh2ursdae8g6twvus8g6rfwvs8qun0dfjkxaq9qrsgq357wnc5r2ueh7ck6q93dj32dlqnls087fxdwk8qakdyafkq3yap9us6v52vjjsrvywa6rt52cm9r9zqt8r2t7mlcwspyetp5h2tztugp9lfyql';
const officialAmountVector =
	'lnbc2500u1pvjluezsp5zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygspp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdq5xysxxatsyp3k7enxv4jsxqzpu9qrsgquk0rl77nj30yxdy8j9vdx85fkpmdla2087ne0xh8nhedh8w27kyke0lp53ut353s06fv3qfegext0eh0ymjpf39tuven09sam30g4vgpfna3rh';
const nip57Invoice =
	'lnbc10u1p3unwfusp5t9r3yymhpfqculx78u027lxspgxcr2n2987mx2j55nnfs95nxnzqpp5jmrh92pfld78spqs78v9euf2385t83uvpwk9ldrlvf6ch7tpascqhp5zvkrmemgth3tufcvflmzjzfvjt023nazlhljz2n9hattj4f8jq8qxqyjw5qcqpjrzjqtc4fc44feggv7065fqe5m4ytjarg3repr5j9el35xhmtfexc42yczarjuqqfzqqqqqqqqlgqqqqqqgq9q9qxpqysgq079nkq507a5tw7xgttmj4u990j7wfggtrasah5gd4ywfr2pjcn29383tphp4t48gquelz9z78p4cq7ml3nrrphw5w6eckhjwmhezhnqpy6gyf0';
const nip57Description =
	'{"pubkey":"97c70a44366a6535c145b333f973ea86dfdc2d7a99da618c40c64705ad98e322","content":"","id":"d9cc14d50fcb8c27539aacf776882942c1a11ea4472f8cdec1dea82fab66279d","created_at":1674164539,"sig":"77127f636577e9029276be060332ea565deaf89ff215a494ccff16ae3f757065e2bc59b2e8c113dd407917a010b3abd36c8d7ad84c0e3ab7dab3a0b0caa9835d","kind":9734,"tags":[["e","3624762a1274dd9636e0c552b53086d70bc88c165bc4dc0f9e836a1eaf86c3b8"],["p","32e1827635450ebb3c5a7d12c1f8e7b2b514439ac10a67eef3d9fd9c5c68e245"],["relays","wss://relay.damus.io","wss://nostr-relay.wlvs.space","wss://nostr.fmt.wiz.biz","wss://relay.nostr.bg","wss://nostr.oxtr.dev","wss://nostr.v0l.io","wss://brb.io","wss://nostr.bitcoiner.social","ws://monad.jb55.com:8080","wss://relay.snort.social"]]}';

function invoiceWithFields(fields: number[][]): string {
	return bech32.encode(
		'lnbc10n',
		[0, 0, 0, 0, 0, 0, 0, ...fields.flat(), ...Array(104).fill(0)],
		false
	);
}

function field(type: number, data: number[]): number[] {
	return [type, Math.floor(data.length / 32), data.length % 32, ...data];
}

describe('BOLT11 amount inspection', () => {
	it('checks the official vector checksum and decodes its amount', () => {
		expect(inspectBolt11Amount(officialAmountVector)).toEqual({
			status: 'specified',
			prefix: 'lnbc',
			network: 'bitcoin',
			amountMsat: 250_000_000n
		});
	});

	it.each([
		['2', 200_000_000_000n],
		['2m', 200_000_000n],
		['2u', 200_000n],
		['2n', 200n],
		['10p', 1n]
	])('converts %s exactly with bigint', (amount, expected) => {
		expect(parseBolt11Amount(amount)).toBe(expected);
	});

	it('retains precision beyond Number safe integers', () => {
		expect(parseBolt11Amount('9007199254740993')).toBe(900719925474099300000000000n);
	});

	it('rejects a sub-millisatoshi pico amount', () => {
		expect(() => parseBolt11Amount('1p')).toThrow('integer millisatoshi');
	});

	it('distinguishes an unspecified amount', () => {
		expect(inspectBolt11Amount(amountlessVector)).toEqual({
			status: 'unspecified',
			prefix: 'lnbc',
			network: 'bitcoin'
		});
	});

	it('rejects an invalid checksum', () => {
		const changed = `${officialAmountVector.slice(0, -1)}q`;
		expect(inspectBolt11Amount(changed)).toMatchObject({ status: 'failure' });
	});

	it('accepts uppercase but rejects mixed case', () => {
		expect(inspectBolt11Amount(officialAmountVector.toUpperCase()).status).toBe('specified');
		expect(inspectBolt11Amount(`L${officialAmountVector.slice(1)}`)).toMatchObject({
			status: 'failure'
		});
	});

	it('accepts a checksummed invoice longer than 90 characters', () => {
		expect(officialAmountVector.length).toBeGreaterThan(90);
		expect(inspectBolt11Amount(officialAmountVector).status).toBe('specified');
	});

	it('rejects an unknown network prefix even with a valid checksum', () => {
		const { words } = bech32.decode(officialAmountVector, false);
		const invoice = bech32.encode('lnxyz1m', words, false);
		expect(inspectBolt11Amount(invoice)).toEqual({
			status: 'failure',
			reason: 'Unknown Bitcoin network prefix'
		});
	});

	it.each([
		['lnbc', 'bitcoin'],
		['lntb', 'testnet'],
		['lntbs', 'signet'],
		['lnbcrt', 'regtest']
	])('recognizes the %s network prefix', (prefix, network) => {
		const { words } = bech32.decode(officialAmountVector, false);
		const invoice = bech32.encode(`${prefix}10n`, words, false);
		expect(inspectBolt11Amount(invoice)).toMatchObject({
			status: 'specified',
			prefix,
			network,
			amountMsat: 1_000n
		});
	});
});

describe('BOLT11 description hash inspection', () => {
	it('decodes the NIP-57 Appendix E invoice while documenting its non-matching description', async () => {
		const expected = await sha256Utf8Hex(nip57Description);
		expect(inspectBolt11DescriptionHash(nip57Invoice)).toEqual({
			status: 'available',
			descriptionHashHex: '132c3de7685de2be270c4ff629092c92dea8cfa2fdff212a65bf56b95527900e'
		});
		expect(await verifyBolt11DescriptionHash(nip57Invoice, nip57Description)).toMatchObject({
			status: 'mismatch',
			calculatedHashHex: expected
		});
	});

	it('extracts exactly one 32-byte h field as lowercase hex', () => {
		const bytes = Uint8Array.from({ length: 32 }, (_, index) => index);
		expect(
			inspectBolt11DescriptionHash(invoiceWithFields([field(23, bech32.toWords(bytes))]))
		).toEqual({
			status: 'available',
			descriptionHashHex: Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
		});
	});

	it('distinguishes missing h and a direct d description', () => {
		expect(inspectBolt11DescriptionHash(invoiceWithFields([]))).toMatchObject({
			status: 'missing',
			reason: 'Invoice does not contain a description hash'
		});
		expect(
			inspectBolt11DescriptionHash(
				invoiceWithFields([field(13, bech32.toWords(new TextEncoder().encode('direct')))])
			)
		).toMatchObject({
			status: 'missing',
			reason: 'Invoice contains a direct description instead of a description hash'
		});
	});

	it('rejects multiple and malformed h fields', () => {
		const hash = bech32.toWords(new Uint8Array(32));
		expect(
			inspectBolt11DescriptionHash(invoiceWithFields([field(23, hash), field(23, hash)]))
		).toMatchObject({ status: 'failure', reason: 'Invoice contains multiple description hashes' });
		expect(
			inspectBolt11DescriptionHash(invoiceWithFields([field(23, hash.slice(1))]))
		).toMatchObject({
			status: 'failure',
			reason: 'Invoice description hash has an invalid length'
		});
	});

	it('rejects a tagged field whose declared length crosses into the signature', () => {
		const malformed = invoiceWithFields([[23, 1, 31]]);
		expect(inspectBolt11DescriptionHash(malformed)).toMatchObject({
			status: 'failure',
			reason: 'BOLT11 tagged field exceeds the data boundary'
		});
	});

	it('compares exact UTF-8 JSON bytes, including Unicode and serialization differences', async () => {
		const exact = '{"kind":9734,"content":"こんにちは⚡"}';
		const hash = await sha256Utf8Hex(exact);
		const invoice = invoiceWithFields([
			field(
				23,
				bech32.toWords(Uint8Array.from(hash.match(/../g)!.map((part) => parseInt(part, 16))))
			)
		]);
		expect(await verifyBolt11DescriptionHash(invoice, exact)).toMatchObject({ status: 'match' });
		expect(await verifyBolt11DescriptionHash(invoice, `${exact} `)).toMatchObject({
			status: 'mismatch'
		});
		expect(await sha256Utf8Hex('{"a":1,"b":2}')).not.toBe(
			await sha256Utf8Hex('{ "b": 2, "a": 1 }')
		);
		expect(hash).toBe('597e2e169859fdf1f96700a7f80a584ae4e3a66c79ddb871bca7a04af56912c1');
	});
});
