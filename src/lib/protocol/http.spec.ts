import { describe, expect, it, vi } from 'vitest';
import { fetchLnurlPay } from './http';
import { validateLud06 } from './lud06';

const payRequest = {
	tag: 'payRequest',
	callback: 'https://example.com/callback',
	minSendable: 1,
	maxSendable: 1000,
	metadata: '[["text/plain","Example"]]'
};

describe('LNURL-pay HTTP inspector', () => {
	it('keeps status, raw body, parsed JSON, and unknown fields', async () => {
		const body = '{"tag":"payRequest","unknown":true}';
		const fetcher = vi
			.fn<typeof fetch>()
			.mockResolvedValue(new Response(body, { status: 200, statusText: 'OK' }));
		expect(await fetchLnurlPay('https://example.com/lnurlp/alice', fetcher)).toMatchObject({
			method: 'GET',
			status: 200,
			statusText: 'OK',
			rawBody: body,
			json: { tag: 'payRequest', unknown: true }
		});
		expect(fetcher).toHaveBeenCalledWith('https://example.com/lnurlp/alice', { method: 'GET' });
	});
	it('keeps a non-2xx status without treating it as a protocol error', async () => {
		const body = JSON.stringify(payRequest);
		const fetcher = vi
			.fn<typeof fetch>()
			.mockResolvedValue(new Response(body, { status: 500, statusText: 'Server Error' }));
		const result = await fetchLnurlPay('https://example.com', fetcher);
		expect(result).toMatchObject({ status: 500, rawBody: body, json: payRequest });
		expect(result.error).toBeUndefined();
		expect(validateLud06(result.json)).toMatchObject({ kind: 'payRequest', valid: true });
	});
	it('parses a LUD-06 error response regardless of HTTP status', async () => {
		const fetcher = vi
			.fn<typeof fetch>()
			.mockResolvedValue(
				new Response('{"status":"ERROR","reason":"Unavailable"}', { status: 404 })
			);
		const result = await fetchLnurlPay('https://example.com', fetcher);
		expect(result).toMatchObject({ status: 404 });
		expect(result.error).toBeUndefined();
		expect(validateLud06(result.json)).toEqual({
			kind: 'error',
			valid: false,
			status: 'ERROR',
			reason: 'Unavailable'
		});
	});
	it('keeps a non-2xx status while reporting invalid JSON', async () => {
		const fetcher = vi
			.fn<typeof fetch>()
			.mockResolvedValue(new Response('bad gateway', { status: 502 }));
		const result = await fetchLnurlPay('https://example.com', fetcher);
		expect(result.status).toBe(502);
		expect(result.error).toContain('not valid JSON');
	});
	it('does not guess whether fetch failure is CORS or network', async () => {
		const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch'));
		expect((await fetchLnurlPay('https://example.com', fetcher)).error).toContain(
			'CORS and network failures cannot be distinguished'
		);
	});
});
