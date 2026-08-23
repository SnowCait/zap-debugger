import { describe, expect, it } from 'vitest';
import { decodeLnurl, encodeLnurl } from './lnurl-bech32';

describe('LNURL bech32 encoding', () => {
	const url = 'https://example.com/.well-known/lnurlp/alice';
	it('uses the lnurl prefix', () => expect(encodeLnurl(url).startsWith('lnurl1')).toBe(true));
	it('is deterministic', () => expect(encodeLnurl(url)).toBe(encodeLnurl(url)));
	it('round-trips the original URL', () => expect(decodeLnurl(encodeLnurl(url))).toBe(url));
});
