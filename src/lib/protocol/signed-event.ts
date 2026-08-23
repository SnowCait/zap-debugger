import { schnorr } from '@noble/curves/secp256k1.js';
import { hexToBytes } from '@noble/hashes/utils.js';
import { calculateEventId, eventSigningInput } from './nip01';
import { isLowercaseHex, isValidXOnlyPubkey } from './nostr-key';
import {
	parseSignedNostrEvent,
	type SignedNostrEvent,
	type UnsignedNostrEvent
} from './nostr-event';
import type { ValidationItem } from './validation';

export type SignedEventValidation = {
	event?: SignedNostrEvent;
	calculatedId?: string;
	items: ValidationItem[];
	valid: boolean;
};

export function validateSignedEvent(
	value: unknown,
	unsigned: UnsignedNostrEvent,
	senderPubkey: string
): SignedEventValidation {
	const event = parseSignedNostrEvent(value);
	const structureValid = event !== undefined;
	const calculatedId = event ? calculateEventId(event.pubkey, eventSigningInput(event)) : undefined;
	let signatureValid = false;
	if (
		event &&
		isLowercaseHex(event.sig, 64) &&
		isLowercaseHex(event.id, 32) &&
		isValidXOnlyPubkey(event.pubkey)
	) {
		try {
			signatureValid = schnorr.verify(
				hexToBytes(event.sig),
				hexToBytes(event.id),
				hexToBytes(event.pubkey)
			);
		} catch {
			// Invalid encoded cryptographic input is reported below.
		}
	}
	const tagsUnchanged =
		event !== undefined && JSON.stringify(event.tags) === JSON.stringify(unsigned.tags);
	const items: ValidationItem[] = [
		{ label: 'signed response has a complete NIP-01 event structure', valid: structureValid },
		{ label: 'kind === 9734', valid: event?.kind === 9734 },
		{ label: 'kind unchanged', valid: event?.kind === unsigned.kind },
		{ label: 'created_at unchanged', valid: event?.created_at === unsigned.created_at },
		{ label: 'tags unchanged', valid: tagsUnchanged },
		{ label: 'content unchanged', valid: event?.content === unsigned.content },
		{
			label: 'pubkey is valid 32-byte lowercase hex',
			valid: event !== undefined && isValidXOnlyPubkey(event.pubkey)
		},
		{ label: 'signer pubkey matches getPublicKey()', valid: event?.pubkey === senderPubkey },
		{
			label: 'id is 32-byte lowercase hex',
			valid: event !== undefined && isLowercaseHex(event.id, 32)
		},
		{
			label: 'sig is 64-byte lowercase hex',
			valid: event !== undefined && isLowercaseHex(event.sig, 64)
		},
		{
			label: 'event id matches independently calculated id',
			valid: event !== undefined && event.id === calculatedId
		},
		{ label: 'Schnorr signature is valid', valid: signatureValid },
		{
			label: 'unsigned fields unchanged',
			valid:
				event !== undefined &&
				event.kind === unsigned.kind &&
				event.created_at === unsigned.created_at &&
				tagsUnchanged &&
				event.content === unsigned.content
		}
	];
	return { event, calculatedId, items, valid: items.every((item) => item.valid) };
}
