import { m } from '$lib/paraglide/messages';
export type HttpInspection = {
	method: 'GET';
	url: string;
	status?: number;
	statusText?: string;
	rawBody?: string;
	json?: unknown;
	error?: string;
};

export async function fetchLnurlPay(
	url: string,
	fetcher: typeof fetch = fetch
): Promise<HttpInspection> {
	const inspection: HttpInspection = { method: 'GET', url };
	try {
		const response = await fetcher(url, { method: 'GET' });
		inspection.status = response.status;
		inspection.statusText = response.statusText;
		inspection.rawBody = await response.text();
		try {
			inspection.json = JSON.parse(inspection.rawBody);
		} catch {
			inspection.error = m.diagnostic_error_http_json();
		}
	} catch (error) {
		const detail = error instanceof Error ? ` ${error.message}` : '';
		inspection.error = m.diagnostic_fetch_failed({ detail });
	}
	return inspection;
}
