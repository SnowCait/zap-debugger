import { describe, expect, it, vi } from 'vitest';
import type { Nip07Signer } from './nip07';
import { Nip07SigningController, type SigningHooks } from './nip07-signing';
import type { SignedNostrEvent, UnsignedNostrEvent } from './nostr-event';

function event(amount: string): UnsignedNostrEvent {
	return {
		kind: 9734,
		created_at: 1700000000,
		tags: [['amount', amount]],
		content: ''
	};
}

function signed(unsigned: UnsignedNostrEvent): SignedNostrEvent {
	return {
		...structuredClone(unsigned),
		pubkey: 'a'.repeat(64),
		id: 'b'.repeat(64),
		sig: 'c'.repeat(128)
	};
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason: unknown) => void;
	const promise = new Promise<T>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	});
	return { promise, resolve, reject };
}

function stateHooks() {
	const state: { signing: boolean; result?: unknown; error?: string } = { signing: false };
	const hooks: SigningHooks = {
		onStart: () => {
			state.signing = true;
			state.result = undefined;
			state.error = undefined;
		},
		onSuccess: (result) => {
			state.result = result;
		},
		onError: (message) => {
			state.error = message;
		},
		onFinish: () => {
			state.signing = false;
		}
	};
	return { state, hooks };
}

describe('Nip07SigningController', () => {
	it('does not commit a signed result after invalidation during signEvent()', async () => {
		const signature = deferred<SignedNostrEvent>();
		const signer: Nip07Signer = { signEvent: vi.fn(() => signature.promise) };
		const controller = new Nip07SigningController();
		const { state, hooks } = stateHooks();
		const eventA = event('1000');
		const attempt = controller.sign(signer, eventA, hooks);

		controller.invalidate();
		state.signing = false;
		signature.resolve(signed(eventA));
		await attempt;

		expect(state.result).toBeUndefined();
		expect(state.error).toBeUndefined();
	});

	it('does not commit a stale rejection', async () => {
		const signature = deferred<SignedNostrEvent>();
		const controller = new Nip07SigningController();
		const { state, hooks } = stateHooks();
		const attempt = controller.sign({ signEvent: () => signature.promise }, event('1000'), hooks);

		controller.invalidate();
		state.signing = false;
		signature.reject(new Error('Old rejection'));
		await attempt;

		expect(state.error).toBeUndefined();
		expect(state.result).toBeUndefined();
	});

	it('does not let an old attempt finish a newer pending attempt', async () => {
		const oldSignature = deferred<SignedNostrEvent>();
		const newSignature = deferred<SignedNostrEvent>();
		const controller = new Nip07SigningController();
		const { state, hooks } = stateHooks();
		const eventA = event('1000');
		const eventB = event('2000');
		const oldAttempt = controller.sign({ signEvent: () => oldSignature.promise }, eventA, hooks);

		controller.invalidate();
		state.signing = false;
		const newAttempt = controller.sign({ signEvent: () => newSignature.promise }, eventB, hooks);
		oldSignature.resolve(signed(eventA));
		await oldAttempt;

		expect(state.signing).toBe(true);
		expect(state.result).toBeUndefined();

		const signedB = signed(eventB);
		newSignature.resolve(signedB);
		await newAttempt;
		expect(state.signing).toBe(false);
		expect(state.result).toBe(signedB);
	});

	it('preserves the unsigned event when signEvent rejects and permits retry', async () => {
		const controller = new Nip07SigningController();
		const { state, hooks } = stateHooks();
		const unsigned = event('1000');
		const signer: Nip07Signer = {
			signEvent: vi.fn().mockRejectedValueOnce(new Error('User rejected'))
		};

		await controller.sign(signer, unsigned, hooks);
		expect(state.error).toBe('User rejected');
		expect(state.result).toBeUndefined();
		expect(unsigned).toEqual(event('1000'));

		const result = signed(unsigned);
		vi.mocked(signer.signEvent).mockResolvedValueOnce(result);
		await controller.sign(signer, unsigned, hooks);
		expect(state.error).toBeUndefined();
		expect(state.result).toBe(result);
	});

	it('isolates application state while accepting the signer result without auditing it', async () => {
		const unsigned = event('1000');
		const signer: Nip07Signer = {
			signEvent: vi.fn().mockImplementation(async (input) => {
				input.tags[0]?.push('mutated-by-provider');
				return signed(input);
			})
		};
		const controller = new Nip07SigningController();
		const { state, hooks } = stateHooks();

		await controller.sign(signer, unsigned, hooks);

		expect(unsigned).toEqual(event('1000'));
		expect(signer.signEvent).toHaveBeenCalledOnce();
		expect(state.result).toMatchObject({ tags: [['amount', '1000', 'mutated-by-provider']] });
		expect(state.error).toBeUndefined();
		expect(state.signing).toBe(false);
	});
});
