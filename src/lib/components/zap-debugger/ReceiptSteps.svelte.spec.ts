import { page } from 'vitest/browser';
import { expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createZapDebuggerState, type ZapDebuggerState } from '$lib/zap-debugger-state.svelte';
import type { ReceiptCheck } from '$lib/protocol/zap-receipt-validation';
import ReceiptSteps from './ReceiptSteps.svelte';

const locale = vi.hoisted(() => ({ value: 'ja' as 'en' | 'ja' }));
vi.mock(import('$lib/paraglide/runtime'), async (importOriginal) => ({
	...(await importOriginal()),
	getLocale: () => locale.value
}));

const checks: ReceiptCheck[] = [
	{
		id: 'original-check',
		label: 'Original diagnostic label',
		detail: 'Original diagnostic detail',
		level: 'recommended',
		status: 'warning'
	},
	{ id: 'passing-check', label: 'Passing check', level: 'required', status: 'pass' },
	{ id: 'failing-check', label: 'Failing check', level: 'required', status: 'fail' },
	{
		id: 'inapplicable-check',
		label: 'Inapplicable check',
		level: 'diagnostic',
		status: 'not-applicable'
	},
	{ id: 'unchecked-check', label: 'Unchecked check', level: 'diagnostic', status: 'not-checked' }
];

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
			relays: [
				{
					relay: 'wss://relay.example',
					state: 'connecting',
					eose: true,
					notice: 'Original relay notice',
					closedMessage: 'Original relay closure'
				}
			],
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
						checks
					}
				]
			}
		}
	};
	render(ReceiptSteps, { state });
	await expect.element(page.getByText('接続中 · EOSE', { exact: true })).toBeInTheDocument();
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
		.element(page.getByText('推奨 · 警告 · Original diagnostic detail'))
		.toBeInTheDocument();
	await expect.element(page.getByText(description, { exact: true }).first()).toBeInTheDocument();
	for (const label of [
		'必須 · 合格',
		'必須 · 不合格',
		'診断 · 該当なし',
		'診断 · 未確認',
		'NOTICE: Original relay notice',
		'CLOSED: Original relay closure'
	]) {
		await expect.element(page.getByText(label, { exact: true })).toBeInTheDocument();
	}
	const rawHeading = page.getByRole('heading', { name: 'イベント（未加工）', exact: true });
	await expect.element(rawHeading).toBeInTheDocument();
	expect(rawHeading.element().nextElementSibling?.textContent).toBe(JSON.stringify(event, null, 2));
});

it('preserves English casing and spelling for receipt levels and statuses', async () => {
	locale.value = 'en';
	try {
		const state: ZapDebuggerState = {
			...createZapDebuggerState(),
			receiptValidationReady: () => true,
			receiptState: {
				waiting: false,
				relays: [],
				candidates: [{ key: 'candidate', event: {}, sourceRelays: [] }]
			},
			receiptValidations: {
				candidate: {
					valid: false,
					warningCount: 1,
					expectedDescription: '',
					sections: [{ title: 'Diagnostics', checks }]
				}
			}
		};
		render(ReceiptSteps, { state });
		for (const label of [
			'RECOMMENDED · warning · Original diagnostic detail',
			'REQUIRED · pass',
			'REQUIRED · fail',
			'DIAGNOSTIC · not-applicable',
			'DIAGNOSTIC · not-checked'
		]) {
			await expect.element(page.getByText(label, { exact: true })).toBeInTheDocument();
		}
	} finally {
		locale.value = 'ja';
	}
});
