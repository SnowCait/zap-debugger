import { schnorr } from '@noble/curves/secp256k1.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { describe, expect, it, vi } from 'vitest';
import { calculateEventId } from './nip01';
import type { Nip07Signer } from './nip07';
import { Nip07SigningController, type SigningHooks } from './nip07-signing';
import type { SignedNostrEvent, UnsignedNostrEvent } from './nostr-event';
import type { SignedEventValidation } from './signed-event';

const secretKey = hexToBytes('0000000000000000000000000000000000000000000000000000000000000003');
const pubkey = bytesToHex(schnorr.getPublicKey(secretKey));

function event(amount: string): UnsignedNostrEvent {
	return {
		kind: 9734,
		created_at: 1700000000,
		tags: [['amount', amount]],
		content: ''
	};
}

function sign(unsigned: UnsignedNostrEvent): SignedNostrEvent {
	const id = calculateEventId(pubkey, unsigned);
	return {
		...structuredClone(unsigned),
		pubkey,
		id,
		sig: bytesToHex(schnorr.sign(hexToBytes(id), secretKey, new Uint8Array(32)))
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
	const state: {
		signing: boolean;
		pubkey?: string;
		result?: unknown;
		validation?: SignedEventValidation;
		error?: string;
	} = { signing: false };
	const hooks: SigningHooks = {
		onStart: () => {
			state.signing = true;
			state.pubkey = undefined;
			state.result = undefined;
			state.validation = undefined;
			state.error = undefined;
		},
		onPublicKey: (value) => (state.pubkey = value),
		onSuccess: (result, validation) => {
			state.result = result;
			state.validation = validation;
		},
		onError: (message) => (state.error = message),
		onFinish: () => (state.signing = false)
	};
	return { state, hooks };
}

async function nextMicrotasks(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
}

describe('Nip07SigningController', () => {
	it('does not sign a new current event when invalidated during getPublicKey()', async () => {
		const publicKey = deferred<string>();
		const signer: Nip07Signer = {
			getPublicKey: vi.fn(() => publicKey.promise),
			signEvent: vi.fn()
		};
		const controller = new Nip07SigningController();
		const { state, hooks } = stateHooks();
		const eventA = event('1000');
		const eventB = event('2000');
		const attempt = controller.sign(signer, eventA, hooks);

		controller.invalidate();
		state.signing = false;
		publicKey.resolve(pubkey);
		await attempt;

		expect(eventB.tags).toEqual([['amount', '2000']]);
		expect(signer.signEvent).not.toHaveBeenCalled();
		expect(state.result).toBeUndefined();
		expect(state.validation).toBeUndefined();
		expect(state.error).toBeUndefined();
	});

	it('does not commit a signed result after invalidation during signEvent()', async () => {
		const signature = deferred<unknown>();
		const signer: Nip07Signer = {
			getPublicKey: vi.fn().mockResolvedValue(pubkey),
			signEvent: vi.fn(() => signature.promise)
		};
		const controller = new Nip07SigningController();
		const { state, hooks } = stateHooks();
		const eventA = event('1000');
		const attempt = controller.sign(signer, eventA, hooks);
		await nextMicrotasks();
		expect(signer.signEvent).toHaveBeenCalledOnce();

		controller.invalidate();
		state.signing = false;
		state.pubkey = undefined;
		signature.resolve(sign(eventA));
		await attempt;

		expect(state.result).toBeUndefined();
		expect(state.validation).toBeUndefined();
		expect(state.error).toBeUndefined();
		expect(state.pubkey).toBeUndefined();
	});

	it('does not let an old attempt finish a newer pending attempt', async () => {
		const oldPublicKey = deferred<string>();
		const newSignature = deferred<unknown>();
		const oldSigner: Nip07Signer = {
			getPublicKey: vi.fn(() => oldPublicKey.promise),
			signEvent: vi.fn()
		};
		const newSigner: Nip07Signer = {
			getPublicKey: vi.fn().mockResolvedValue(pubkey),
			signEvent: vi.fn(() => newSignature.promise)
		};
		const controller = new Nip07SigningController();
		const { state, hooks } = stateHooks();
		const oldAttempt = controller.sign(oldSigner, event('1000'), hooks);

		controller.invalidate();
		state.signing = false;
		const eventB = event('2000');
		const newAttempt = controller.sign(newSigner, eventB, hooks);
		await nextMicrotasks();
		expect(state.signing).toBe(true);

		oldPublicKey.resolve(pubkey);
		await oldAttempt;
		expect(state.signing).toBe(true);
		expect(state.error).toBeUndefined();

		newSignature.resolve(sign(eventB));
		await newAttempt;
		expect(state.signing).toBe(false);
		expect(state.validation?.valid).toBe(true);
	});

	it('commits and validates a normal signing attempt', async () => {
		const signer: Nip07Signer = {
			getPublicKey: vi.fn().mockResolvedValue(pubkey),
			signEvent: vi.fn().mockImplementation(async (value: UnsignedNostrEvent) => sign(value))
		};
		const controller = new Nip07SigningController();
		const { state, hooks } = stateHooks();
		const unsigned = event('1000');

		await controller.sign(signer, unsigned, hooks);

		expect(state.signing).toBe(false);
		expect(state.pubkey).toBe(pubkey);
		expect(state.result).toBeDefined();
		expect(state.validation?.valid).toBe(true);
		expect(state.error).toBeUndefined();
		expect(unsigned).toEqual(event('1000'));
	});
});
