import { fetchLnurlPay, type HttpInspection } from './http';
import {
	buildZapCallbackRequest,
	interpretZapCallbackResponse,
	type ZapCallbackInput,
	type ZapCallbackResult
} from './zap-callback';

export type ZapCallbackFetcher = (url: string) => Promise<HttpInspection>;

export type ZapCallbackFetchResult = {
	input: ZapCallbackInput;
	requestUrl: string;
	zapRequestJson: string;
	http: HttpInspection;
	callback?: ZapCallbackResult;
};

export type ZapCallbackFetchHooks = {
	onStart(request: { requestUrl: string; zapRequestJson: string }): void;
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
		const request = buildZapCallbackRequest(capturedInput);
		hooks.onStart(request);
		return this.#run(attempt, capturedInput, request, hooks, fetcher);
	}

	#isCurrent(attempt: number): boolean {
		return attempt === this.#generation;
	}

	async #run(
		attempt: number,
		input: ZapCallbackInput,
		request: { requestUrl: string; zapRequestJson: string },
		hooks: ZapCallbackFetchHooks,
		fetcher: ZapCallbackFetcher
	): Promise<void> {
		try {
			const http = await fetcher(request.requestUrl);
			if (!this.#isCurrent(attempt)) return;
			hooks.onSuccess({
				input,
				...request,
				http,
				callback: interpretZapCallbackResponse(http)
			});
		} finally {
			if (this.#isCurrent(attempt)) hooks.onFinish();
		}
	}
}
