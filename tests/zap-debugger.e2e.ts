import { expect, test } from '@playwright/test';

test.use({ locale: 'en-US' });

test('validates a Lightning Address from the production app', async ({ page }) => {
	await page.goto('./');

	await expect(page).toHaveTitle('NIP-57 Zap Debugger');
	await expect(page.getByRole('heading', { level: 1, name: 'NIP-57 Zap Debugger' })).toBeVisible();

	await page.getByLabel('Lightning Address').fill('alice@example.com');
	await page.getByRole('button', { name: 'Validate address' }).click();

	await expect(page.getByText('✓ Valid LUD-16 Lightning Address')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Resolve LNURL-pay endpoint' })).toBeVisible();
});

test.describe('Japanese UI', () => {
	test.use({ locale: 'ja-JP' });

	test('translates the UI while preserving raw responses, events, and diagnostic messages', async ({
		page
	}) => {
		const errors: string[] = [];
		page.on('console', (message) => {
			if (message.type() === 'warning' || message.type() === 'error') errors.push(message.text());
		});
		page.on('pageerror', (error) => errors.push(error.message));
		const pubkey = '79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
		const response = {
			tag: 'payRequest',
			callback: 'https://example.com/callback',
			minSendable: 1000,
			maxSendable: 100000,
			metadata: '[["text/plain","Raw English metadata"]]',
			allowsNostr: true,
			nostrPubkey: pubkey
		};
		const rawBody = JSON.stringify(response, null, 2);
		await page.route('https://example.com/.well-known/lnurlp/alice', (route) =>
			route.fulfill({ contentType: 'application/json', body: rawBody })
		);
		await page.goto('./?lud16=alice%40example.com');
		await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
		await expect(page.locator('meta[name="description"]')).toHaveAttribute(
			'content',
			'NIP-57 Zap のための Lightning Address の解決処理を確認します'
		);
		await expect(
			page.getByText('Lightning Address の解決をステップごとに実行し、各段階の値を確認できます。')
		).toBeVisible();
		await page.getByRole('button', { name: 'アドレスを検証', exact: true }).click();
		await expect(page.getByText('✓ 有効な LUD-16 Lightning Address です')).toBeVisible();
		await page.getByRole('button', { name: 'LNURL-pay エンドポイントを解決', exact: true }).click();
		await page
			.getByRole('button', { name: 'LNURL-pay エンドポイントを GET で取得', exact: true })
			.click();
		await expect(page.getByText('LUD-06 の検証: 有効', { exact: true })).toBeVisible();
		await expect(page.getByText('metadata parses as JSON')).toBeVisible();
		const rawResponse = page
			.getByRole('heading', { name: 'レスポンス本文（未加工）', exact: true })
			.locator('..')
			.locator('pre');
		expect(await rawResponse.textContent()).toBe(rawBody);
		const recipientInput = page.getByLabel('受信者の pubkey (hex または npub)', { exact: true });
		await expect(recipientInput).toHaveAttribute(
			'placeholder',
			'npub1… または小文字の hex（64文字）'
		);
		await recipientInput.fill(pubkey);
		await page.getByLabel('金額 (msat)', { exact: true }).fill('1000');
		await page.getByLabel('Zap Receipt のリレー（1行に1件）').fill('wss://relay.example');
		const comment = 'Keep this English comment unchanged';
		await page.getByLabel('コメント（任意）').fill(comment);
		await page.getByRole('button', { name: 'パラメーターを検証', exact: true }).click();
		await page.getByRole('button', { name: 'Zap Request を生成', exact: true }).click();
		const eventJson = await page
			.getByRole('heading', { name: 'NIP-07 署名への入力', exact: true })
			.locator('..')
			.locator('pre')
			.textContent();
		expect(JSON.parse(eventJson ?? '')).toMatchObject({
			kind: 9734,
			content: comment,
			tags: expect.arrayContaining([
				['p', pubkey],
				['amount', '1000'],
				['relays', 'wss://relay.example']
			])
		});
		await expect(page.getByText('✕ NIP-07 の署名機能を利用できません')).toBeVisible();
		expect(errors).toEqual([]);
	});
});
