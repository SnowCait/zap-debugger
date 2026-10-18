import { m } from '$lib/paraglide/messages';
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
		{ label: m.diagnostic_nip57_allows_present(), valid: allowsPresent },
		{ label: m.diagnostic_nip57_allows_true(), valid: source.allowsNostr === true },
		{ label: m.diagnostic_nip57_pubkey_present(), valid: pubkeyPresent },
		{ label: m.diagnostic_nip57_pubkey_hex(), valid: hex },
		{ label: m.diagnostic_nip57_pubkey_valid(), valid: curveValid }
	];
	if (!allowsPresent)
		return { status: 'not-supported', reason: m.diagnostic_nip57_allows_missing(), items };
	if (source.allowsNostr === false)
		return { status: 'not-supported', reason: m.diagnostic_nip57_allows_false(), items };
	if (source.allowsNostr !== true)
		return { status: 'not-supported', reason: m.diagnostic_nip57_allows_boolean(), items };
	if (!pubkeyPresent)
		return { status: 'invalid-advertisement', reason: m.diagnostic_nip57_pubkey_missing(), items };
	if (!hex)
		return { status: 'invalid-advertisement', reason: m.diagnostic_nip57_pubkey_not_hex(), items };
	if (!curveValid)
		return {
			status: 'invalid-advertisement',
			reason: m.diagnostic_nip57_pubkey_invalid(),
			items
		};
	return { status: 'supported', items };
}
