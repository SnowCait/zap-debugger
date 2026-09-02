import { expect, test } from '@playwright/test';

test('validates a Lightning Address from the production app', async ({ page }) => {
	await page.goto('/');

	await expect(page).toHaveTitle('NIP-57 Zap Debugger');
	await expect(page.getByRole('heading', { level: 1, name: 'NIP-57 Zap Debugger' })).toBeVisible();

	await page.getByLabel('Lightning Address').fill('alice@example.com');
	await page.getByRole('button', { name: 'Validate address' }).click();

	await expect(page.getByText('✓ Valid LUD-16 Lightning Address')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Resolve LNURL-pay endpoint' })).toBeVisible();
});
