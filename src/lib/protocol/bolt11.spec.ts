import { bech32 } from '@scure/base';
import { describe, expect, it } from 'vitest';
import { inspectBolt11Amount, parseBolt11Amount } from './bolt11';

const amountlessVector =
	'lnbc1pvjluezsp5zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygspp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdpl2pkx2ctnv5sxxmmwwd5kgetjypeh2ursdae8g6twvus8g6rfwvs8qun0dfjkxaq9qrsgq357wnc5r2ueh7ck6q93dj32dlqnls087fxdwk8qakdyafkq3yap9us6v52vjjsrvywa6rt52cm9r9zqt8r2t7mlcwspyetp5h2tztugp9lfyql';
const officialAmountVector =
	'lnbc2500u1pvjluezsp5zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygspp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdq5xysxxatsyp3k7enxv4jsxqzpu9qrsgquk0rl77nj30yxdy8j9vdx85fkpmdla2087ne0xh8nhedh8w27kyke0lp53ut353s06fv3qfegext0eh0ymjpf39tuven09sam30g4vgpfna3rh';

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
