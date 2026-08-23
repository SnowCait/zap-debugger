import { describe, expect, it } from 'vitest';
import { parseLightningAddress } from './lightning-address';
import { resolveLnurlPayEndpoint } from './lud16';

describe('LUD-16 Lightning Address', () => {
	it.each([
		['alice@example.com', 'alice'],
		['first-last@example.com', 'first-last'],
		['first_last@example.com', 'first_last'],
		['first.last@example.com', 'first.last'],
		['alice+donation@example.com', 'alice+donation']
	])('accepts %s', (input, username) => {
		expect(parseLightningAddress(input)).toEqual({
			valid: true,
			value: { address: input, username, domain: 'example.com' }
		});
	});
	it.each([
		['@example.com', 'Username is required'],
		['alice@', 'Domain is required'],
		['alice.example.com', 'must contain @'],
		['ali!ce@example.com', 'may contain only'],
		['Alice@example.com', 'may contain only']
	])('rejects %s with a useful reason', (input, reason) => {
		const result = parseLightningAddress(input);
		expect(result.valid).toBe(false);
		if (!result.valid) expect(result.errors.join(' ')).toContain(reason);
	});
});

describe('LUD-16 endpoint resolution', () => {
	it('resolves clearnet over HTTPS and includes supported username characters', () => {
		const address = {
			address: 'alice+tip@example.com',
			username: 'alice+tip',
			domain: 'example.com'
		};
		expect(resolveLnurlPayEndpoint(address)).toMatchObject({
			scheme: 'https',
			url: 'https://example.com/.well-known/lnurlp/alice+tip'
		});
	});
	it('resolves onion domains over HTTP', () => {
		const address = { address: 'alice@service.onion', username: 'alice', domain: 'service.onion' };
		expect(resolveLnurlPayEndpoint(address).url).toBe(
			'http://service.onion/.well-known/lnurlp/alice'
		);
	});
	it('does not resolve invalid parsed input', () => {
		expect(parseLightningAddress('Alice@example.com').valid).toBe(false);
		expect(() => resolveLnurlPayEndpoint({ address: 'x', username: '', domain: '' })).toThrow();
	});
});
