import { describe, expect, it, vi } from 'vitest';
import type { HttpInspection } from './http';
import type { ZapCallbackInput } from './zap-callback';
import {
	ZapCallbackFetchController,
	type ZapCallbackFetchHooks,
	type ZapCallbackFetchResult
} from './zap-callback-fetch';

function input(amount: string): ZapCallbackInput {
	return {
		callback: 'https://pay.example/callback',
		amount,
		signedZapRequest: { kind: 9734, content: '', tags: [['amount', amount]] },
		encodedLnurl: 'lnurl1example'
	};
}

function response(url: string, pr: string): HttpInspection {
	return { method: 'GET', url, status: 200, statusText: 'OK', json: { pr } };
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((resolvePromise) => (resolve = resolvePromise));
	return { promise, resolve };
}

function stateHooks() {
	const state: { loading: boolean; result?: ZapCallbackFetchResult } = { loading: false };
	const hooks: ZapCallbackFetchHooks = {
		onStart: () => {
			state.loading = true;
			state.result = undefined;
		},
		onSuccess: (result) => (state.result = result),
		onFinish: () => (state.loading = false)
	};
	return { state, hooks };
}

describe('ZapCallbackFetchController', () => {
	it('does not commit a pending response after invalidation', async () => {
		const pending = deferred<HttpInspection>();
		const controller = new ZapCallbackFetchController();
		const { state, hooks } = stateHooks();
		const attempt = controller.run(input('1000'), hooks, () => pending.promise);
		controller.invalidate();
		state.loading = false;
		pending.resolve(response('old', 'old-pr'));
		await attempt;
		expect(state.result).toBeUndefined();
	});

	it('does not commit a stale network error', async () => {
		const pending = deferred<HttpInspection>();
		const controller = new ZapCallbackFetchController();
		const { state, hooks } = stateHooks();
		const attempt = controller.run(input('1000'), hooks, () => pending.promise);
		controller.invalidate();
		state.loading = false;
		pending.resolve({ method: 'GET', url: 'old', error: 'Network failed' });
		await attempt;
		expect(state.result).toBeUndefined();
	});

	it('does not let an old request finish a newer pending request', async () => {
		const oldPending = deferred<HttpInspection>();
		const newPending = deferred<HttpInspection>();
		const controller = new ZapCallbackFetchController();
		const { state, hooks } = stateHooks();
		const oldAttempt = controller.run(input('1000'), hooks, () => oldPending.promise);
		controller.invalidate();
		state.loading = false;
		const newAttempt = controller.run(input('2000'), hooks, () => newPending.promise);
		oldPending.resolve(response('old', 'old-pr'));
		await oldAttempt;
		expect(state.loading).toBe(true);
		expect(state.result).toBeUndefined();
		newPending.resolve(response('new', 'new-pr'));
		await newAttempt;
		expect(state.loading).toBe(false);
		expect(state.result?.callback).toEqual({ kind: 'invoice', pr: 'new-pr' });
	});

	it('captures inputs and commits a normal response with its pr', async () => {
		const controller = new ZapCallbackFetchController();
		const { state, hooks } = stateHooks();
		const currentInput = input('21000');
		const fetcher = vi.fn(async (url: string) => response(url, 'lnbc1invoice'));
		await controller.run(currentInput, hooks, fetcher);
		expect(state.result?.input).toEqual(currentInput);
		expect(state.result?.callback).toEqual({ kind: 'invoice', pr: 'lnbc1invoice' });
		expect(fetcher).toHaveBeenCalledWith(state.result?.requestUrl);
	});
});
