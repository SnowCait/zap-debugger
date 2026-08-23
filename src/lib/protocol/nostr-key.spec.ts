import { describe, expect, it } from 'vitest';
import { parseRecipientPubkey } from './nostr-key';

const hex = '7e7e9c42a91bfef19fa929e5fda1b72e0ebc1a4c1141673e2794234d86addf4e';
const npub = 'npub10elfcs4fr0l0r8af98jlmgdh9c8tcxjvz9qkw038js35mp4dma8qzvjptg';

describe('parseRecipientPubkey', () => {
	it('accepts a valid lowercase hex x-only public key', () => {
		expect(parseRecipientPubkey(hex)).toMatchObject({
			valid: true,
			normalized: hex,
			format: 'hex'
		});
	});
	it('rejects invalid hex length', () => {
		expect(parseRecipientPubkey(hex.slice(2)).valid).toBe(false);
	});
	it('rejects invalid hex characters', () => {
		expect(parseRecipientPubkey(`${hex.slice(0, -1)}z`).valid).toBe(false);
	});
	it('decodes the official NIP-19 npub example to hex', () => {
		expect(parseRecipientPubkey(npub)).toMatchObject({
			valid: true,
			normalized: hex,
			format: 'npub'
		});
	});
	it('rejects an invalid npub checksum', () => {
		expect(parseRecipientPubkey(`${npub.slice(0, -1)}x`).valid).toBe(false);
	});
	it('rejects malformed npub input', () => {
		expect(parseRecipientPubkey('npub1not-valid').valid).toBe(false);
	});
});
