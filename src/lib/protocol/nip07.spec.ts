import { describe, expect, it, vi } from 'vitest';
import { getNip07Signer, requestPublicKey, requestSignature, type Nip07Signer } from './nip07';
import type { UnsignedNostrEvent } from './nostr-event';

const unsigned: UnsignedNostrEvent = { kind: 9734, created_at: 1, tags: [], content: '' };

describe('NIP-07 adapter', () => {
	it('reports an unavailable signer', async () => {
		expect(getNip07Signer(undefined)).toBeUndefined();
		await expect(requestPublicKey(undefined)).rejects.toThrow('NIP-07 signer is not available');
	});
	it('returns a public key', async () => {
		const signer = { getPublicKey: vi.fn().mockResolvedValue('abc'), signEvent: vi.fn() };
		await expect(requestPublicKey(signer)).resolves.toBe('abc');
	});
	it('passes through getPublicKey failures', async () => {
		const signer = {
			getPublicKey: vi.fn().mockRejectedValue(new Error('denied')),
			signEvent: vi.fn()
		};
		await expect(requestPublicKey(signer)).rejects.toThrow('denied');
	});
	it('returns signEvent output and passes the unsigned input unchanged', async () => {
		const output = { id: 'signed' };
		const signer: Nip07Signer = {
			getPublicKey: vi.fn(),
			signEvent: vi.fn().mockResolvedValue(output)
		};
		await expect(requestSignature(signer, unsigned)).resolves.toBe(output);
		expect(signer.signEvent).toHaveBeenCalledWith(unsigned);
	});
	it('passes through user rejection and permits retry', async () => {
		const signer: Nip07Signer = {
			getPublicKey: vi.fn(),
			signEvent: vi.fn().mockRejectedValue(new Error('User rejected'))
		};
		await expect(requestSignature(signer, unsigned)).rejects.toThrow('User rejected');
		expect(unsigned).toEqual({ kind: 9734, created_at: 1, tags: [], content: '' });
	});
});
