import { page } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ZapDebugger from './+page.svelte';

const pubkey = '79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';

afterEach(() => {
	delete window.nostr;
	vi.unstubAllGlobals();
});

describe('Zap debugger protocol boundaries', () => {
	it('passes raw endpoint and unsigned-event state to structured-cloning controllers', async () => {
		const payResponse = {
			tag: 'payRequest',
			callback: 'https://example.com/callback',
			minSendable: 1000,
			maxSendable: 100000,
			metadata: '[["text/plain","Example"]]',
			allowsNostr: true,
			nostrPubkey: pubkey
		};
		const fetcher = vi.fn().mockResolvedValue(
			new Response(JSON.stringify(payResponse), {
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
		window.nostr = {
			getPublicKey: vi.fn().mockResolvedValue(pubkey),
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
		expect(signEvent.mock.calls[0]?.[0]).toMatchObject({ kind: 9734, content: '' });
	});
});
