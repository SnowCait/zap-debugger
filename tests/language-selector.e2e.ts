import { expect, test, type Page } from '@playwright/test';
import { localStorageKey, type Locale } from '../src/lib/paraglide/runtime';

function collectBrowserErrors(page: Page): string[] {
	const errors: string[] = [];
	page.on('console', (message) => {
		if (message.type() === 'warning' || message.type() === 'error') errors.push(message.text());
	});
	page.on('pageerror', (error) => errors.push(error.message));
	return errors;
}

async function expectLocale(page: Page, locale: Locale) {
	await expect(
		page.getByRole('combobox', { name: locale === 'ja' ? '言語' : 'Language', exact: true })
	).toHaveValue(locale);
	await expect(page.locator('html')).toHaveAttribute('lang', locale);
	await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
}

const cases = [
	{ name: 'English browser', browserLocale: 'en-US', saved: undefined, expected: 'en' },
	{ name: 'Japanese browser', browserLocale: 'ja-JP', saved: undefined, expected: 'ja' },
	{
		name: 'unsupported browser language',
		browserLocale: 'fr-FR',
		saved: undefined,
		expected: 'en'
	},
	{
		name: 'saved English in a Japanese browser',
		browserLocale: 'ja-JP',
		saved: 'en',
		expected: 'en'
	},
	{
		name: 'saved Japanese in an English browser',
		browserLocale: 'en-US',
		saved: 'ja',
		expected: 'ja'
	}
] as const;

for (const { name, browserLocale, saved, expected } of cases) {
	test.describe(name, () => {
		test.use({ locale: browserLocale });

		test('shows the selected language and document attributes after hydration', async ({
			page
		}) => {
			const errors = collectBrowserErrors(page);
			if (saved) {
				await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), {
					key: localStorageKey,
					value: saved
				});
			}

			await page.goto('./?lud16=alice%40example.com');
			await expect(page.getByLabel('Lightning Address')).toHaveValue('alice@example.com');
			await expectLocale(page, expected);
			expect(errors).toEqual([]);
		});
	});
}

test.describe('language switching', () => {
	test.use({ locale: 'en-US', viewport: { width: 375, height: 812 } });

	test('preserves the URL and restores the selection without running the Zap flow', async ({
		page
	}) => {
		const errors = collectBrowserErrors(page);
		const operations: string[] = [];
		page.on('request', (request) => {
			if (request.resourceType() === 'fetch' || request.resourceType() === 'xhr') {
				operations.push(request.url());
			}
		});
		page.on('websocket', (socket) => operations.push(socket.url()));
		await page.addInitScript(() => {
			window.nostr = {
				async getPublicKey() {
					console.error('Unexpected NIP-07 public key request');
					throw new Error('Unexpected NIP-07 public key request');
				},
				async signEvent() {
					console.error('Unexpected NIP-07 signing request');
					throw new Error('Unexpected NIP-07 signing request');
				}
			};
		});
		const params = new URLSearchParams({
			lud16: 'alice@example.com',
			npub: 'npub1example',
			relays: 'wss://relay.example\nwss://relay2.example'
		});
		await page.goto(`./?${params}`);
		const originalUrl = page.url();
		await expectLocale(page, 'en');
		await expect(page.getByLabel('Lightning Address')).toHaveValue('alice@example.com');

		await Promise.all([
			page.waitForNavigation(),
			page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('ja')
		]);
		await expectLocale(page, 'ja');
		expect(page.url()).toBe(originalUrl);

		await page.reload();
		await expectLocale(page, 'ja');
		expect(page.url()).toBe(originalUrl);
		await expect(page.getByLabel('Lightning Address')).toHaveValue('alice@example.com');
		await expect(page.getByText('未実行', { exact: true })).toBeVisible();
		await expect(page.locator('section > h2')).toHaveText([
			'1 Lightning Address を検証',
			'2 LNURL-pay エンドポイントを解決',
			'3 LNURL-pay レスポンスを取得・検証',
			'4 Zap Request のパラメーターを検証',
			'5 未署名の kind 9734 イベントを生成',
			'6 NIP-07 で Zap Request に署名',
			'7 Zap callback を GET で取得',
			'8 BOLT11 invoice の金額を確認',
			'9 invoice の description hash を検証',
			'10 invoice を支払う',
			'11 Zap Receipt を待機',
			'12 Zap Receipt を検証'
		]);
		expect(operations).toEqual([]);
		expect(errors).toEqual([]);
	});
});
