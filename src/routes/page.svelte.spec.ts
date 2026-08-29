import { page } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ZapDebugger from './+page.svelte';

const pubkey = '79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
const invoice =
	'lnbc10n1pvjluezsp5zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygspp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdq5xysxxatsyp3k7enxv4jsxqzpu9qrsgquk0rl77nj30yxdy8j9vdx85fkpmdla2087ne0xh8nhedh8w27kyke0lp53ut353s06fv3qfegext0eh0ymjpf39tuven09sam30g4vgp5nzkrw';

afterEach(() => {
	delete window.nostr;
	vi.unstubAllGlobals();
});

describe('Zap debugger protocol boundaries', () => {
	it('passes raw endpoint, unsigned event, and signed event to structured-cloning controllers', async () => {
		const payResponse = {
			tag: 'payRequest',
			callback: 'https://example.com/callback',
			minSendable: 1000,
			maxSendable: 100000,
			metadata: '[["text/plain","Example"]]',
			allowsNostr: true,
			nostrPubkey: pubkey
		};
		const fetcher = vi
			.fn()
			.mockResolvedValueOnce(
				new Response(JSON.stringify(payResponse), { status: 200, statusText: 'OK' })
			)
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ pr: invoice, routes: [] }), {
					status: 200,
					statusText: 'OK'
				})
			);
		vi.stubGlobal('fetch', fetcher);
		const signEvent = vi.fn().mockImplementation(async (event) => ({
			...event,
			pubkey,
			id: '0'.repeat(64),
			sig: '0'.repeat(128)
		}));
		const getPublicKey = vi.fn().mockResolvedValue(pubkey);
		window.nostr = {
			getPublicKey,
			signEvent
		};

		render(ZapDebugger);
		await page.getByLabelText('Lightning Address').fill('alice@example.com');
		await page.getByRole('button', { name: 'Validate address' }).click();
		await page.getByRole('button', { name: 'Resolve LNURL-pay endpoint' }).click();
		await page.getByRole('button', { name: 'GET LNURL-pay endpoint' }).click();

		expect(fetcher).toHaveBeenCalledWith('https://example.com/.well-known/lnurlp/alice', {
			method: 'GET'
		});
		await expect.element(page.getByText('LUD-06 validation: Valid')).toBeInTheDocument();

		await page.getByLabelText('Recipient pubkey (hex or npub)').fill(pubkey);
		await page.getByLabelText('Amount (msat)').fill('1000');
		await page.getByLabelText('Zap Receipt relays (one per line)').fill('wss://relay.example');
		await page.getByRole('button', { name: 'Validate parameters' }).click();
		await page.getByRole('button', { name: 'Build Zap Request' }).click();
		await page.getByRole('button', { name: 'Sign with NIP-07' }).click();

		expect(signEvent).toHaveBeenCalledOnce();
		expect(getPublicKey).not.toHaveBeenCalled();
		expect(signEvent.mock.calls[0]?.[0]).toMatchObject({ kind: 9734, content: '' });

		await page.getByRole('button', { name: 'GET callback' }).click();
		expect(fetcher).toHaveBeenCalledTimes(2);
		const callbackUrl = new URL(fetcher.mock.calls[1]?.[0] as string);
		expect(`${callbackUrl.origin}${callbackUrl.pathname}`).toBe('https://example.com/callback');
		expect(callbackUrl.searchParams.get('amount')).toBe('1000');
		expect(callbackUrl.searchParams.get('lnurl')).toMatch(/^lnurl1/);
		expect(JSON.parse(callbackUrl.searchParams.get('nostr') ?? '')).toMatchObject({
			kind: 9734,
			id: '0'.repeat(64),
			sig: '0'.repeat(128)
		});
		await expect.element(page.getByText(invoice)).toBeInTheDocument();
		await page.getByRole('button', { name: 'Decode invoice' }).click();
		await expect.element(page.getByText('1000', { exact: true }).last()).toBeInTheDocument();
		await expect
			.element(page.getByText('✓ Invoice amount matches requested amount'))
			.toBeInTheDocument();
	});
});
