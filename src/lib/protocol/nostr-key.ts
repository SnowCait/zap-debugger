import { bech32 } from '@scure/base';
import { schnorr } from '@noble/curves/secp256k1.js';

export type RecipientPubkeyResult = {
	input: string;
	normalized?: string;
	format?: 'hex' | 'npub';
	checks: { label: string; valid: boolean }[];
	valid: boolean;
};

export function isLowercaseHex(value: string, bytes: number): boolean {
	return new RegExp(`^[0-9a-f]{${bytes * 2}}$`).test(value);
}

export function isValidXOnlyPubkey(value: string): boolean {
	if (!isLowercaseHex(value, 32)) return false;
	try {
		schnorr.utils.lift_x(BigInt(`0x${value}`));
		return true;
	} catch {
		return false;
	}
}

export function parseRecipientPubkey(input: string): RecipientPubkeyResult {
	let normalized: string | undefined;
	let format: RecipientPubkeyResult['format'];
	let encodingValid = false;
	if (/^[0-9a-f]+$/.test(input)) {
		format = 'hex';
		encodingValid = input.length === 64;
		if (encodingValid) normalized = input;
	} else if (input.toLowerCase().startsWith('npub1')) {
		format = 'npub';
		try {
			const decoded = bech32.decode(input, 5000);
			const bytes = bech32.fromWords(decoded.words);
			encodingValid = decoded.prefix === 'npub' && bytes.length === 32;
			if (encodingValid)
				normalized = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
		} catch {
			// Invalid checksum, characters, casing, or payload length.
		}
	}
	const curveValid = normalized !== undefined && isValidXOnlyPubkey(normalized);
	const checks = [
		{ label: 'input is lowercase 64-character hex or a valid npub', valid: encodingValid },
		{ label: 'recipient pubkey decoded to 32-byte lowercase hex', valid: normalized !== undefined },
		{ label: 'recipient pubkey is a valid BIP-340 x-only public key', valid: curveValid }
	];
	return { input, normalized, format, checks, valid: checks.every((check) => check.valid) };
}
