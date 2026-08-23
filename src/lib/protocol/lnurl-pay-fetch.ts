import { fetchLnurlPay, type HttpInspection } from './http';
import { validateLud06, type Lud06Result } from './lud06';
import type { LnurlPayEndpoint } from './lud16';
import { validateNip57, type Nip57Result } from './nip57';

export type LnurlPayFetcher = (url: string) => Promise<HttpInspection>;

export type LnurlPayFetchResult = {
	endpoint: LnurlPayEndpoint;
	http: HttpInspection;
	lud06?: Lud06Result;
	nip57?: Nip57Result;
};

export type LnurlPayFetchHooks = {
	onStart(): void;
	onSuccess(result: LnurlPayFetchResult): void;
	onFinish(): void;
};

export class LnurlPayFetchController {
	#generation = 0;

	invalidate(): void {
		this.#generation += 1;
	}

	run(
		endpoint: LnurlPayEndpoint,
		hooks: LnurlPayFetchHooks,
		fetcher: LnurlPayFetcher = fetchLnurlPay
	): Promise<void> {
		const attempt = ++this.#generation;
		const endpointToFetch = structuredClone(endpoint);
		hooks.onStart();
		return this.#run(attempt, endpointToFetch, hooks, fetcher);
	}

	#isCurrent(attempt: number): boolean {
		return attempt === this.#generation;
	}

	async #run(
		attempt: number,
		endpointToFetch: LnurlPayEndpoint,
		hooks: LnurlPayFetchHooks,
		fetcher: LnurlPayFetcher
	): Promise<void> {
		try {
			const http = await fetcher(endpointToFetch.url);
			if (!this.#isCurrent(attempt)) return;

			let lud06: Lud06Result | undefined;
			let nip57: Nip57Result | undefined;
			if (http.json !== undefined) {
				lud06 = validateLud06(http.json);
				if (lud06.kind === 'payRequest' && lud06.valid) nip57 = validateNip57(http.json);
			}
			hooks.onSuccess({ endpoint: endpointToFetch, http, lud06, nip57 });
		} finally {
			if (this.#isCurrent(attempt)) hooks.onFinish();
		}
	}
}
