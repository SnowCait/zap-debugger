import { expect, it, vi } from 'vitest';
import { parseLightningAddress } from './lightning-address';
import { validateLud06 } from './lud06';
import { validateNip57 } from './nip57';
import { validateZapAmount } from './zap-parameters';
import { parseBolt11Amount, inspectBolt11Amount } from './bolt11';
import { bech32 } from '@scure/base';
import { interpretZapCallbackResponse } from './zap-callback';
import { fetchLnurlPay } from './http';

vi.mock(import('$lib/paraglide/runtime'), async (importOriginal) => ({
	...(await importOriginal()),
	getLocale: () => 'ja' as const
}));

it('generates Japanese validation errors, labels, and interpolated limits at the source', () => {
	expect(parseLightningAddress('alice')).toEqual({
		valid: false,
		errors: ['Lightning Address には @ が必要です。']
	});
	expect(validateNip57({})).toMatchObject({
		status: 'not-supported',
		reason: 'allowsNostr がありません'
	});
	const amount = validateZapAmount('999', 1000, 100000);
	expect(amount.valid).toBe(false);
	expect(amount.items[2]).toEqual({ label: 'amount >= minSendable（1000 msat）', valid: false });
	expect(() => parseBolt11Amount('01')).toThrow(
		'invoice の金額は先頭にゼロを含まない正の10進整数である必要があります'
	);
	expect(inspectBolt11Amount(bech32.encode('unknown', [0], false))).toEqual({
		status: 'failure',
		reason: '不明な Bitcoin ネットワークのプレフィックスです'
	});
});

it('preserves external HTTP reasons and exception messages in Japanese diagnostics', async () => {
	const reason = 'Original provider error: payment rejected';
	expect(validateLud06({ status: 'ERROR', reason })).toEqual({
		kind: 'error',
		valid: false,
		status: 'ERROR',
		reason
	});
	expect(
		interpretZapCallbackResponse({
			method: 'GET',
			url: 'https://example.com',
			status: 200,
			json: { status: 'ERROR', reason }
		})
	).toEqual({ kind: 'error', reason });
	const error = new Error('Original browser error');
	const result = await fetchLnurlPay('https://example.com', async () => {
		throw error;
	});
	expect(result.error).toBe(
		'ブラウザの fetch に失敗しました。ブラウザでは CORS エラーとネットワーク障害を区別できません。 Original browser error'
	);
});
