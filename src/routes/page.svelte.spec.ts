import { page } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { bech32 } from '@scure/base';
import ZapDebugger from './+page.svelte';

const pubkey = '79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';

async function zapInvoice(description: string): Promise<{ invoice: string; hash: string }> {
	const digest = new Uint8Array(
		await crypto.subtle.digest('SHA-256', new TextEncoder().encode(description))
	);
	const hash = Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
	const hashWords = bech32.toWords(digest);
	const h = [23, Math.floor(hashWords.length / 32), hashWords.length % 32, ...hashWords];
	const words = [0, 0, 0, 0, 0, 0, 0, ...h, ...Array(104).fill(0)];
	return { invoice: bech32.encode('lnbc10n', words, false), hash };
}

afterEach(() => {
	delete window.nostr;
	vi.unstubAllGlobals();
});

describe('Zap debugger protocol boundaries', () => {
	it('passes raw endpoint, unsigned event, and signed event to structured-cloning controllers', async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		vi.spyOn(navigator.clipboard, 'writeText').mockImplementation(writeText);
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
			.mockImplementationOnce(async (requestUrl: string) => {
				const sentJson = new URL(requestUrl).searchParams.get('nostr') ?? '';
				const { invoice } = await zapInvoice(sentJson);
				return new Response(JSON.stringify({ pr: invoice, routes: [] }), {
					status: 200,
					statusText: 'OK'
				});
			});
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
		const sentJson = callbackUrl.searchParams.get('nostr') ?? '';
		const { invoice, hash } = await zapInvoice(sentJson);
		await expect.element(page.getByText(invoice)).toBeInTheDocument();
		await page.getByRole('button', { name: 'Decode invoice' }).click();
		await expect.element(page.getByText('1000', { exact: true }).last()).toBeInTheDocument();
		await expect
			.element(page.getByText('✓ Invoice amount matches requested amount'))
			.toBeInTheDocument();
		await page.getByRole('button', { name: 'Verify description hash' }).click();
		await expect.element(page.getByText(hash, { exact: true }).first()).toBeInTheDocument();
		await expect
			.element(page.getByText('✓ Invoice description hash matches Zap Request'))
			.toBeInTheDocument();
		await expect.element(page.getByRole('heading', { name: '10 Pay invoice' })).toBeInTheDocument();
		await expect
			.element(page.getByAltText('QR code for opening this invoice in a Lightning wallet'))
			.toBeInTheDocument();
		const openWallet = page.getByRole('link', { name: 'Open wallet' });
		await expect.element(openWallet).toHaveAttribute('href', `lightning:${invoice}`);
		await page.getByRole('button', { name: 'Copy invoice' }).click();
		expect(writeText).toHaveBeenCalledWith(invoice);
		await expect.element(page.getByText('✓ Copied')).toBeInTheDocument();

		writeText.mockRejectedValueOnce(new Error('denied'));
		await page.getByRole('button', { name: 'Copy invoice' }).click();
		await expect.element(page.getByText('✕ Failed to copy invoice')).toBeInTheDocument();
	});
});
