import { describe, expect, it, vi } from 'vitest';
import { fetchLnurlPay } from './http';

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
	it('reports non-2xx and invalid JSON independently', async () => {
		const fetcher = vi
			.fn<typeof fetch>()
			.mockResolvedValue(new Response('bad gateway', { status: 502 }));
		const result = await fetchLnurlPay('https://example.com', fetcher);
		expect(result.error).toContain('status 502');
		expect(result.error).toContain('not valid JSON');
	});
	it('does not guess whether fetch failure is CORS or network', async () => {
		const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch'));
		expect((await fetchLnurlPay('https://example.com', fetcher)).error).toContain(
			'CORS and network failures cannot be distinguished'
		);
	});
});
