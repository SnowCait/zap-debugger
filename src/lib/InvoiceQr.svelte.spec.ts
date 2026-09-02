import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import QRCode from 'qrcode';

vi.mock(import('qrcode'), { spy: true });

import InvoiceQr from './InvoiceQr.svelte';

const toDataURL = vi.mocked(QRCode.toDataURL);
toDataURL.mockImplementation(vi.fn().mockResolvedValue('data:image/png;base64,cXI='));

describe('Invoice QR code', () => {
	it('passes the exact payment payload to the QR generator', async () => {
		const payload = 'lightning:LNBC10N1INVOICE';
		render(InvoiceQr, { payload });

		await expect
			.element(page.getByAltText('QR code for opening this invoice in a Lightning wallet'))
			.toBeInTheDocument();
		expect(toDataURL).toHaveBeenCalledWith(payload, {
			errorCorrectionLevel: 'M',
			margin: 2,
			width: 280
		});
	});
});
