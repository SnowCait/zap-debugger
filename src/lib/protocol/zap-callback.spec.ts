import { describe, expect, it } from 'vitest';
import type { HttpInspection } from './http';
import {
	buildZapCallbackUrl,
	buildZapCallbackRequest,
	interpretZapCallbackResponse,
	type ZapCallbackInput
} from './zap-callback';

const signedZapRequest = {
	kind: 9734,
	content: 'ありがとう & ready?',
	tags: [['amount', '21000']],
	pubkey: 'a'.repeat(64),
	id: 'b'.repeat(64),
	sig: 'c'.repeat(128)
};

const input: ZapCallbackInput = {
	callback: 'https://pay.example/callback?provider=value%20one',
	amount: '21000',
	signedZapRequest,
	encodedLnurl: 'lnurl1example'
};

describe('Zap callback URL', () => {
	it('returns the exact JSON string placed in the nostr query parameter', () => {
		const request = buildZapCallbackRequest(input);
		expect(new URL(request.requestUrl).searchParams.get('nostr')).toBe(request.zapRequestJson);
		expect(request.zapRequestJson).toBe(JSON.stringify(signedZapRequest));
	});

	it('adds NIP-57 parameters and preserves existing callback parameters', () => {
		const url = new URL(buildZapCallbackUrl(input));
		expect(url.searchParams.get('provider')).toBe('value one');
		expect(url.searchParams.get('amount')).toBe('21000');
		expect(url.searchParams.get('nostr')).toBe(JSON.stringify(signedZapRequest));
		expect(url.searchParams.get('lnurl')).toBe('lnurl1example');
	});

	it('round-trips Unicode and URL delimiters without double encoding', () => {
		const requestUrl = buildZapCallbackUrl(input);
		const nostr = new URL(requestUrl).searchParams.get('nostr');
		expect(nostr).toBe(JSON.stringify(signedZapRequest));
		expect(JSON.parse(nostr ?? '')).toEqual(signedZapRequest);
		expect(nostr).not.toContain('%26');
		expect(requestUrl).not.toContain('%2526');
	});
});

function inspection(json: unknown): HttpInspection {
	return { method: 'GET', url: 'https://pay.example/callback', json };
}

describe('Zap callback response interpretation', () => {
	it('extracts a string pr without decoding it', () => {
		expect(interpretZapCallbackResponse(inspection({ pr: 'lnbc1invoice', routes: [] }))).toEqual({
			kind: 'invoice',
			pr: 'lnbc1invoice'
		});
	});

	it('reports a LUD-06 application error and reason', () => {
		expect(
			interpretZapCallbackResponse(inspection({ status: 'ERROR', reason: 'Amount rejected' }))
		).toEqual({ kind: 'error', reason: 'Amount rejected' });
	});

	it.each([{ routes: [] }, { pr: 123 }])('reports a missing or non-string pr for %j', (json) => {
		expect(interpretZapCallbackResponse(inspection(json))).toMatchObject({ kind: 'missing' });
	});

	it('leaves invalid JSON and HTTP/network inspection errors separate', () => {
		expect(
			interpretZapCallbackResponse({
				method: 'GET',
				url: 'https://pay.example/callback',
				rawBody: 'not json',
				error: 'Response body is not valid JSON.'
			})
		).toBeUndefined();
		expect(
			interpretZapCallbackResponse({
				method: 'GET',
				url: 'https://pay.example/callback',
				error: 'Browser fetch failed.'
			})
		).toBeUndefined();
	});
});
