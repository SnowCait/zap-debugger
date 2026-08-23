import { schnorr } from '@noble/curves/secp256k1.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { describe, expect, it } from 'vitest';
import { calculateEventId } from './nip01';
import type { SignedNostrEvent } from './nostr-event';
import { validateSignedEvent } from './signed-event';
import { buildZapRequest } from './zap-request';

const secretKey = hexToBytes('0000000000000000000000000000000000000000000000000000000000000003');
const pubkey = bytesToHex(schnorr.getPublicKey(secretKey));
const unsigned = buildZapRequest({
	recipientPubkey: pubkey,
	amount: 21000,
	relays: ['wss://relay.example'],
	lnurl: 'lnurl1example',
	comment: 'Zap!',
	createdAt: 1700000000
});

function signed(): SignedNostrEvent {
	const id = calculateEventId(pubkey, unsigned);
	return {
		...structuredClone(unsigned),
		pubkey,
		id,
		sig: bytesToHex(schnorr.sign(hexToBytes(id), secretKey, new Uint8Array(32)))
	};
}

describe('validateSignedEvent', () => {
	it('accepts a valid event id and Schnorr signature', () =>
		expect(validateSignedEvent(signed(), unsigned, pubkey).valid).toBe(true));
	it('rejects an invalid id', () => {
		const event = signed();
		event.id = '0'.repeat(64);
		expect(validateSignedEvent(event, unsigned, pubkey).valid).toBe(false);
	});
	it('rejects an invalid signature', () => {
		const event = signed();
		event.sig = '0'.repeat(128);
		expect(validateSignedEvent(event, unsigned, pubkey).valid).toBe(false);
	});
	it('rejects a pubkey mismatch', () =>
		expect(validateSignedEvent(signed(), unsigned, 'f'.repeat(64)).valid).toBe(false));
	it.each(['kind', 'created_at', 'tags', 'content'] as const)('rejects modified %s', (field) => {
		const event = signed();
		if (field === 'kind') event.kind += 1;
		if (field === 'created_at') event.created_at += 1;
		if (field === 'tags') event.tags = [...event.tags, ['e', '0'.repeat(64)]];
		if (field === 'content') event.content = 'changed';
		const id = calculateEventId(event.pubkey, event);
		event.id = id;
		event.sig = bytesToHex(schnorr.sign(hexToBytes(id), secretKey, new Uint8Array(32)));
		expect(validateSignedEvent(event, unsigned, pubkey).valid).toBe(false);
	});
});
