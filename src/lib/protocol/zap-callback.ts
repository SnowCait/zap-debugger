import type { HttpInspection } from './http';

export type ZapCallbackInput = {
	callback: string;
	amount: string;
	signedZapRequest: unknown;
	encodedLnurl: string;
};

export type ZapCallbackResult =
	| { kind: 'invoice'; pr: string }
	| { kind: 'error'; reason: string }
	| { kind: 'missing'; reason: string };

export type ZapCallbackRequest = {
	requestUrl: string;
	zapRequestJson: string;
};

export function buildZapCallbackRequest(input: ZapCallbackInput): ZapCallbackRequest {
	const zapRequestJson = JSON.stringify(input.signedZapRequest);
	const url = new URL(input.callback);
	url.searchParams.set('amount', input.amount);
	url.searchParams.set('nostr', zapRequestJson);
	url.searchParams.set('lnurl', input.encodedLnurl);
	return { requestUrl: url.toString(), zapRequestJson };
}

export function buildZapCallbackUrl(input: ZapCallbackInput): string {
	return buildZapCallbackRequest(input).requestUrl;
}

export function interpretZapCallbackResponse(http: HttpInspection): ZapCallbackResult | undefined {
	if (http.error || http.json === undefined) return undefined;
	if (http.status !== undefined && (http.status < 200 || http.status >= 300)) {
		return {
			kind: 'missing',
			reason: `HTTP ${http.status} did not provide a successful response.`
		};
	}
	const value = http.json;
	if (typeof value !== 'object' || value === null) {
		return { kind: 'missing', reason: 'The JSON response is not an object with a string pr.' };
	}
	const record = value as Record<string, unknown>;
	if (record.status === 'ERROR') {
		return {
			kind: 'error',
			reason: typeof record.reason === 'string' ? record.reason : '(reason unavailable)'
		};
	}
	if (typeof record.pr === 'string') return { kind: 'invoice', pr: record.pr };
	return {
		kind: 'missing',
		reason: 'The JSON response does not contain a string pr.'
	};
}
