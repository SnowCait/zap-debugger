import { describe, expect, it, vi } from 'vitest';
import type { HttpInspection } from './http';
import {
	LnurlPayFetchController,
	type LnurlPayFetchHooks,
	type LnurlPayFetchResult
} from './lnurl-pay-fetch';
import type { LnurlPayEndpoint } from './lud16';

const generatorX = '79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';

function endpoint(username: string): LnurlPayEndpoint {
	return {
		address: `${username}@example.com`,
		username,
		domain: 'example.com',
		scheme: 'https',
		url: `https://example.com/.well-known/lnurlp/${username}`
	};
}

function validHttp(url: string): HttpInspection {
	return {
		method: 'GET',
		url,
		status: 200,
		statusText: 'OK',
		rawBody: '{}',
		json: {
			tag: 'payRequest',
			callback: `${url}/callback`,
			minSendable: 1000,
			maxSendable: 100000,
			metadata: '[["text/plain","Example"]]',
			allowsNostr: true,
			nostrPubkey: generatorX
		}
	};
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((resolvePromise) => {
		resolve = resolvePromise;
	});
	return { promise, resolve };
}

type FetchState = { loading: boolean; result?: LnurlPayFetchResult };

const currentResult = (state: FetchState) => state.result;

function stateHooks() {
	const state: FetchState = { loading: false };
	const hooks: LnurlPayFetchHooks = {
		onStart: () => {
			state.loading = true;
			state.result = undefined;
		},
		onSuccess: (result) => {
			state.result = result;
		},
		onFinish: () => {
			state.loading = false;
		}
	};
	return { state, hooks };
}

describe('LnurlPayFetchController', () => {
	it('does not commit or automatically fetch a new endpoint after invalidation', async () => {
		const responseA = deferred<HttpInspection>();
		const fetcher = vi.fn(() => responseA.promise);
		const controller = new LnurlPayFetchController();
		const { state, hooks } = stateHooks();
		const endpointA = endpoint('alice');
		const endpointB = endpoint('bob');
		const attemptA = controller.run(endpointA, hooks, fetcher);

		controller.invalidate();
		state.loading = false;
		state.result = undefined;
		responseA.resolve(validHttp(endpointA.url));
		await attemptA;

		expect(fetcher).toHaveBeenCalledOnce();
		expect(fetcher).toHaveBeenCalledWith(endpointA.url);
		expect(fetcher).not.toHaveBeenCalledWith(endpointB.url);
		expect(state.result).toBeUndefined();
	});

	it('does not commit a stale HTTP error result', async () => {
		const responseA = deferred<HttpInspection>();
		const controller = new LnurlPayFetchController();
		const { state, hooks } = stateHooks();
		const endpointA = endpoint('alice');
		const attemptA = controller.run(endpointA, hooks, () => responseA.promise);

		controller.invalidate();
		state.loading = false;
		state.result = undefined;
		responseA.resolve({ method: 'GET', url: endpointA.url, error: 'Network failed' });
		await attemptA;

		expect(state.result).toBeUndefined();
	});

	it('does not let an old request finish a newer pending request', async () => {
		const responseA = deferred<HttpInspection>();
		const responseB = deferred<HttpInspection>();
		const controller = new LnurlPayFetchController();
		const { state, hooks } = stateHooks();
		const endpointA = endpoint('alice');
		const endpointB = endpoint('bob');
		const attemptA = controller.run(endpointA, hooks, () => responseA.promise);

		controller.invalidate();
		state.loading = false;
		state.result = undefined;
		const attemptB = controller.run(endpointB, hooks, () => responseB.promise);
		responseA.resolve(validHttp(endpointA.url));
		await attemptA;

		expect(state.loading).toBe(true);
		expect(state.result).toBeUndefined();

		responseB.resolve(validHttp(endpointB.url));
		await attemptB;
		expect(state.loading).toBe(false);
		expect(currentResult(state)?.endpoint.url).toBe(endpointB.url);
	});

	it('commits a normal response and its validations for the captured endpoint', async () => {
		const controller = new LnurlPayFetchController();
		const { state, hooks } = stateHooks();
		const endpointA = endpoint('alice');
		const fetcher = vi.fn().mockResolvedValue(validHttp(endpointA.url));

		await controller.run(endpointA, hooks, fetcher);

		expect(fetcher).toHaveBeenCalledWith(endpointA.url);
		expect(state.loading).toBe(false);
		expect(currentResult(state)?.endpoint).toEqual(endpointA);
		expect(currentResult(state)?.http.url).toBe(endpointA.url);
		expect(currentResult(state)?.lud06).toMatchObject({ kind: 'payRequest', valid: true });
		expect(currentResult(state)?.nip57).toMatchObject({ status: 'supported' });
	});
});
