import { schnorr } from '@noble/curves/secp256k1.js';
import type { ValidationItem } from './validation';

export type Nip57Result = {
	status: 'supported' | 'not-supported' | 'invalid-advertisement';
	reason?: string;
	items: ValidationItem[];
};

export function validateNip57(value: unknown): Nip57Result {
	const source =
		typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
	const allowsPresent = Object.hasOwn(source, 'allowsNostr');
	const pubkeyPresent = Object.hasOwn(source, 'nostrPubkey');
	const hex =
		typeof source.nostrPubkey === 'string' && /^[0-9a-fA-F]{64}$/.test(source.nostrPubkey);
	let curveValid = false;
	if (hex) {
		try {
			schnorr.utils.lift_x(BigInt(`0x${source.nostrPubkey as string}`));
			curveValid = true;
		} catch {
			// An x coordinate that cannot be lifted is not a BIP-340 public key.
		}
	}
	const items: ValidationItem[] = [
		{ label: 'allowsNostr is present', valid: allowsPresent },
		{ label: 'allowsNostr === true', valid: source.allowsNostr === true },
		{ label: 'nostrPubkey is present', valid: pubkeyPresent },
		{ label: 'nostrPubkey is 32-byte hex', valid: hex },
		{ label: 'nostrPubkey is a valid BIP-340 public key', valid: curveValid }
	];
	if (!allowsPresent) return { status: 'not-supported', reason: 'allowsNostr is missing', items };
	if (source.allowsNostr !== true)
		return { status: 'not-supported', reason: 'allowsNostr is false', items };
	if (!pubkeyPresent)
		return { status: 'invalid-advertisement', reason: 'nostrPubkey is missing', items };
	if (!hex)
		return { status: 'invalid-advertisement', reason: 'nostrPubkey is not 32-byte hex', items };
	if (!curveValid)
		return {
			status: 'invalid-advertisement',
			reason: 'nostrPubkey is not a valid BIP-340 public key',
			items
		};
	return { status: 'supported', items };
}
