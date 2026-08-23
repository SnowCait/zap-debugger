import { schnorr } from '@noble/curves/secp256k1.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { describe, expect, it, vi } from 'vitest';
import { calculateEventId } from './nip01';
import { getNip07Signer, requestPublicKey, requestSignature, type Nip07Signer } from './nip07';
import type { SignedNostrEvent, UnsignedNostrEvent } from './nostr-event';
import { validateSignedEvent } from './signed-event';

const secretKey = hexToBytes('0000000000000000000000000000000000000000000000000000000000000003');
const pubkey = bytesToHex(schnorr.getPublicKey(secretKey));

function unsignedEvent(): UnsignedNostrEvent {
	return {
		kind: 9734,
		created_at: 1700000000,
		tags: [['relays', 'wss://relay.example']],
		content: 'Zap!'
	};
}

function sign(event: UnsignedNostrEvent): SignedNostrEvent {
	const id = calculateEventId(pubkey, event);
	return {
		...structuredClone(event),
		pubkey,
		id,
		sig: bytesToHex(schnorr.sign(hexToBytes(id), secretKey, new Uint8Array(32)))
	};
}

function itemValid(validation: ReturnType<typeof validateSignedEvent>, label: string): boolean {
	return validation.items.find((item) => item.label === label)?.valid ?? false;
}

async function requestFromMutatingSigner(mutate: (event: UnsignedNostrEvent) => void): Promise<{
	original: UnsignedNostrEvent;
	expectedUnsigned: UnsignedNostrEvent;
	validation: ReturnType<typeof validateSignedEvent>;
}> {
	const original = unsignedEvent();
	const signer: Nip07Signer = {
		getPublicKey: vi.fn().mockResolvedValue(pubkey),
		signEvent: vi.fn().mockImplementation(async (event: UnsignedNostrEvent) => {
			mutate(event);
			return sign(event);
		})
	};
	const { result, expectedUnsigned } = await requestSignature(signer, original);
	return {
		original,
		expectedUnsigned,
		validation: validateSignedEvent(result, expectedUnsigned, pubkey)
	};
}

describe('NIP-07 adapter', () => {
	it('reports an unavailable signer', async () => {
		expect(getNip07Signer(undefined)).toBeUndefined();
		await expect(requestPublicKey(undefined)).rejects.toThrow('NIP-07 signer is not available');
		await expect(requestSignature(undefined, unsignedEvent())).rejects.toThrow(
			'NIP-07 signer is not available'
		);
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
	it('validates a normal signer without changing the original event', async () => {
		const original = unsignedEvent();
		const signer: Nip07Signer = {
			getPublicKey: vi.fn().mockResolvedValue(pubkey),
			signEvent: vi.fn().mockImplementation(async (event: UnsignedNostrEvent) => sign(event))
		};
		const before = structuredClone(original);
		const { result, expectedUnsigned } = await requestSignature(signer, original);
		const eventForSigner = vi.mocked(signer.signEvent).mock.calls[0]?.[0];
		expect(validateSignedEvent(result, expectedUnsigned, pubkey).valid).toBe(true);
		expect(original).toEqual(before);
		expect(expectedUnsigned).toEqual(before);
		expect(eventForSigner).not.toBe(original);
		expect(eventForSigner).not.toBe(expectedUnsigned);
		expect(eventForSigner?.tags).not.toBe(original.tags);
		expect(eventForSigner?.tags[0]).not.toBe(original.tags[0]);
	});
	it('passes through user rejection and permits retry', async () => {
		const original = unsignedEvent();
		const signer: Nip07Signer = {
			getPublicKey: vi.fn(),
			signEvent: vi.fn().mockRejectedValue(new Error('User rejected'))
		};
		await expect(requestSignature(signer, original)).rejects.toThrow('User rejected');
		expect(original).toEqual(unsignedEvent());
	});
	it('detects an in-place kind mutation even when the mutated event is correctly signed', async () => {
		const { original, expectedUnsigned, validation } = await requestFromMutatingSigner(
			(event) => (event.kind = 1)
		);
		expect(original.kind).toBe(9734);
		expect(expectedUnsigned.kind).toBe(9734);
		expect(validation.valid).toBe(false);
		expect(itemValid(validation, 'kind unchanged')).toBe(false);
		expect(itemValid(validation, 'unsigned fields unchanged')).toBe(false);
	});
	it('detects an in-place created_at mutation', async () => {
		const { original, expectedUnsigned, validation } = await requestFromMutatingSigner(
			(event) => (event.created_at += 1)
		);
		expect(original.created_at).toBe(1700000000);
		expect(expectedUnsigned.created_at).toBe(1700000000);
		expect(validation.valid).toBe(false);
		expect(itemValid(validation, 'created_at unchanged')).toBe(false);
	});
	it('detects a nested in-place tags mutation that a shallow copy would share', async () => {
		const { original, expectedUnsigned, validation } = await requestFromMutatingSigner((event) =>
			event.tags[0]?.push('wss://evil.example')
		);
		expect(original.tags).toEqual([['relays', 'wss://relay.example']]);
		expect(expectedUnsigned.tags).toEqual([['relays', 'wss://relay.example']]);
		expect(validation.valid).toBe(false);
		expect(itemValid(validation, 'tags unchanged')).toBe(false);
		expect(itemValid(validation, 'unsigned fields unchanged')).toBe(false);
	});
	it('detects an in-place content mutation', async () => {
		const { original, expectedUnsigned, validation } = await requestFromMutatingSigner(
			(event) => (event.content = 'changed')
		);
		expect(original.content).toBe('Zap!');
		expect(expectedUnsigned.content).toBe('Zap!');
		expect(validation.valid).toBe(false);
		expect(itemValid(validation, 'content unchanged')).toBe(false);
	});
});
