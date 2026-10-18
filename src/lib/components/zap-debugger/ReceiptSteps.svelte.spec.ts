import { page } from 'vitest/browser';
import { expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createZapDebuggerState, type ZapDebuggerState } from '$lib/zap-debugger-state.svelte';
import ReceiptSteps from './ReceiptSteps.svelte';

vi.mock(import('$lib/paraglide/runtime'), async (importOriginal) => ({
	...(await importOriginal()),
	getLocale: () => 'ja' as const
}));

it('translates receipt numbers, counts, and comparisons while preserving diagnostics and raw data', async () => {
	const event = { id: 'original-event-id', content: 'Original English content' };
	const description = '{"kind":9734,"content":"Original English description"}';
	const state: ZapDebuggerState = {
		...createZapDebuggerState(),
		callbackResult: { kind: 'invoice', pr: 'lnbc1original' },
		receiptReady: () => true,
		receiptValidationReady: () => true,
		receiptCreatedAt: () => 1000,
		receiptState: {
			waiting: false,
			relays: [{ relay: 'wss://relay.example', state: 'connecting', eose: false }],
			candidates: [{ key: 'candidate', event, sourceRelays: ['wss://relay.example'] }]
		},
		receiptValidations: {
			candidate: {
				valid: true,
				warningCount: 2,
				claimedEventId: event.id,
				calculatedEventId: event.id,
				receiptDescription: description,
				expectedDescription: description,
				sections: [
					{
						title: 'Original diagnostic section',
						checks: [
							{
								id: 'original-check',
								label: 'Original diagnostic label',
								detail: 'Original diagnostic detail',
								level: 'recommended',
								status: 'warning'
							}
						]
					}
				]
			}
		}
	};
	render(ReceiptSteps, { state });
	await expect.element(page.getByText('接続中', { exact: true })).toBeInTheDocument();
	await expect.element(page.getByText('60 秒', { exact: true })).toBeInTheDocument();
	await expect
		.element(page.getByRole('heading', { name: 'Zap Receipt の候補 1', exact: true }).first())
		.toBeInTheDocument();
	await expect.element(page.getByText('警告: 2 件', { exact: true })).toBeInTheDocument();
	await expect.element(page.getByText('一致', { exact: true }).first()).toBeInTheDocument();
	await expect.element(page.getByText('✓ 有効な Zap Receipt です')).toBeInTheDocument();
	await expect
		.element(page.getByRole('heading', { name: 'Original diagnostic section', exact: true }))
		.toBeInTheDocument();
	await expect.element(page.getByText('⚠ Original diagnostic label')).toBeInTheDocument();
	await expect
		.element(page.getByText('RECOMMENDED · warning · Original diagnostic detail'))
		.toBeInTheDocument();
	await expect.element(page.getByText(description, { exact: true }).first()).toBeInTheDocument();
	const rawHeading = page.getByRole('heading', { name: 'イベント（未加工）', exact: true });
	await expect.element(rawHeading).toBeInTheDocument();
	expect(rawHeading.element().nextElementSibling?.textContent).toBe(JSON.stringify(event, null, 2));
});
