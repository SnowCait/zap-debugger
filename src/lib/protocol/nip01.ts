import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type { SignedNostrEvent, UnsignedNostrEvent } from './nostr-event';

export function serializeEvent(pubkey: string, event: UnsignedNostrEvent): string {
	return JSON.stringify([0, pubkey, event.created_at, event.kind, event.tags, event.content]);
}

export function calculateEventId(pubkey: string, event: UnsignedNostrEvent): string {
	return bytesToHex(sha256(new TextEncoder().encode(serializeEvent(pubkey, event))));
}

export function eventSigningInput(event: SignedNostrEvent): UnsignedNostrEvent {
	return {
		created_at: event.created_at,
		kind: event.kind,
		tags: event.tags,
		content: event.content
	};
}
