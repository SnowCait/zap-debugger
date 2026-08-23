import { bech32 } from '@scure/base';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8', { fatal: true });

export function encodeLnurl(url: string): string {
	return bech32.encode('lnurl', bech32.toWords(textEncoder.encode(url)), 5000);
}

export function decodeLnurl(value: string): string {
	const decoded = bech32.decode(value, 5000);
	if (decoded.prefix !== 'lnurl') throw new Error('Expected an lnurl bech32 prefix');
	return textDecoder.decode(bech32.fromWords(decoded.words));
}
