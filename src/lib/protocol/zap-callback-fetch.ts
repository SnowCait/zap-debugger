import { fetchLnurlPay, type HttpInspection } from './http';
import {
	buildZapCallbackUrl,
	interpretZapCallbackResponse,
	type ZapCallbackInput,
	type ZapCallbackResult
} from './zap-callback';

export type ZapCallbackFetcher = (url: string) => Promise<HttpInspection>;

export type ZapCallbackFetchResult = {
	input: ZapCallbackInput;
	requestUrl: string;
	http: HttpInspection;
	callback?: ZapCallbackResult;
};

export type ZapCallbackFetchHooks = {
	onStart(requestUrl: string): void;
	onSuccess(result: ZapCallbackFetchResult): void;
	onFinish(): void;
};

export class ZapCallbackFetchController {
	#generation = 0;

	invalidate(): void {
		this.#generation += 1;
	}

	run(
		input: ZapCallbackInput,
		hooks: ZapCallbackFetchHooks,
		fetcher: ZapCallbackFetcher = fetchLnurlPay
	): Promise<void> {
		const attempt = ++this.#generation;
		const capturedInput = structuredClone(input);
		const requestUrl = buildZapCallbackUrl(capturedInput);
		hooks.onStart(requestUrl);
		return this.#run(attempt, capturedInput, requestUrl, hooks, fetcher);
	}

	#isCurrent(attempt: number): boolean {
		return attempt === this.#generation;
	}

	async #run(
		attempt: number,
		input: ZapCallbackInput,
		requestUrl: string,
		hooks: ZapCallbackFetchHooks,
		fetcher: ZapCallbackFetcher
	): Promise<void> {
		try {
			const http = await fetcher(requestUrl);
			if (!this.#isCurrent(attempt)) return;
			hooks.onSuccess({
				input,
				requestUrl,
				http,
				callback: interpretZapCallbackResponse(http)
			});
		} finally {
			if (this.#isCurrent(attempt)) hooks.onFinish();
		}
	}
}
