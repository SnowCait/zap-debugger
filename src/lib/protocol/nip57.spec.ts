import { describe, expect, it } from 'vitest';
import { validateNip57 } from './nip57';

const generatorX = '79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
describe('NIP-57 validation', () => {
	it('supports a valid BIP-340 public key', () =>
		expect(validateNip57({ allowsNostr: true, nostrPubkey: generatorX }).status).toBe('supported'));
	it('reports missing allowsNostr', () =>
		expect(validateNip57({ nostrPubkey: generatorX })).toMatchObject({
			status: 'not-supported',
			reason: 'allowsNostr is missing'
		}));
	it('reports false allowsNostr', () =>
		expect(validateNip57({ allowsNostr: false, nostrPubkey: generatorX })).toMatchObject({
			status: 'not-supported',
			reason: 'allowsNostr is false'
		}));
	it.each(['true', 1])('reports non-boolean allowsNostr value %j accurately', (allowsNostr) => {
		const result = validateNip57({ allowsNostr, nostrPubkey: generatorX });
		expect(result).toMatchObject({
			status: 'not-supported',
			reason: 'allowsNostr must be boolean true'
		});
		expect(result.reason).not.toBe('allowsNostr is false');
	});
	it('reports a missing key', () =>
		expect(validateNip57({ allowsNostr: true })).toMatchObject({
			status: 'invalid-advertisement',
			reason: 'nostrPubkey is missing'
		}));
	it('rejects malformed hex', () =>
		expect(validateNip57({ allowsNostr: true, nostrPubkey: 'xyz' }).reason).toContain(
			'32-byte hex'
		));
	it('rejects 64 hex characters that are not a curve point', () =>
		expect(validateNip57({ allowsNostr: true, nostrPubkey: 'f'.repeat(64) })).toMatchObject({
			status: 'invalid-advertisement',
			reason: 'nostrPubkey is not a valid BIP-340 public key'
		}));
});
