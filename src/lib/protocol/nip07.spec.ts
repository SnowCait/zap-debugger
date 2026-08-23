import { describe, expect, it, vi } from 'vitest';
import { getNip07Signer, requestSignature, type Nip07Signer } from './nip07';
import type { SignedNostrEvent, UnsignedNostrEvent } from './nostr-event';

function unsignedEvent(): UnsignedNostrEvent {
	return {
		kind: 9734,
		created_at: 1700000000,
		tags: [['relays', 'wss://relay.example']],
		content: 'Zap!'
	};
}

function signedEvent(event: UnsignedNostrEvent): SignedNostrEvent {
	return { ...event, pubkey: 'a'.repeat(64), id: 'b'.repeat(64), sig: 'c'.repeat(128) };
}

describe('NIP-07 adapter', () => {
	it('requires signEvent capability but not getPublicKey capability', () => {
		expect(getNip07Signer(undefined)).toBeUndefined();
		expect(getNip07Signer({ nostr: {} })).toBeUndefined();
		expect(getNip07Signer({ nostr: { signEvent: vi.fn() } })).toBeDefined();
	});

	it('reports an unavailable signer', async () => {
		await expect(requestSignature(undefined, unsignedEvent())).rejects.toThrow(
			'NIP-07 signer is not available'
		);
	});

	it('passes the unsigned event to signEvent and returns its result', async () => {
		const unsigned = unsignedEvent();
		const signed = signedEvent(unsigned);
		const signer: Nip07Signer = { signEvent: vi.fn().mockResolvedValue(signed) };

		await expect(requestSignature(signer, unsigned)).resolves.toBe(signed);
		expect(signer.signEvent).toHaveBeenCalledWith(unsigned);
	});

	it('passes through user rejection', async () => {
		const signer: Nip07Signer = {
			signEvent: vi.fn().mockRejectedValue(new Error('User rejected'))
		};
		await expect(requestSignature(signer, unsignedEvent())).rejects.toThrow('User rejected');
	});
});
