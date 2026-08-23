import { requestPublicKey, requestSignature, type Nip07Signer } from './nip07';
import { isValidXOnlyPubkey } from './nostr-key';
import type { UnsignedNostrEvent } from './nostr-event';
import { validateSignedEvent, type SignedEventValidation } from './signed-event';

export type SigningHooks = {
	onStart(): void;
	onPublicKey(pubkey: string): void;
	onSuccess(result: unknown, validation: SignedEventValidation): void;
	onError(message: string): void;
	onFinish(): void;
};

export class Nip07SigningController {
	#generation = 0;

	invalidate(): void {
		this.#generation += 1;
	}

	sign(signer: Nip07Signer, event: UnsignedNostrEvent, hooks: SigningHooks): Promise<void> {
		const attempt = ++this.#generation;
		const eventToSign = structuredClone(event);
		hooks.onStart();
		return this.#run(attempt, signer, eventToSign, hooks);
	}

	#isCurrent(attempt: number): boolean {
		return attempt === this.#generation;
	}

	async #run(
		attempt: number,
		signer: Nip07Signer,
		eventToSign: UnsignedNostrEvent,
		hooks: SigningHooks
	): Promise<void> {
		try {
			const pubkey = await requestPublicKey(signer);
			if (!this.#isCurrent(attempt)) return;
			if (!isValidXOnlyPubkey(pubkey))
				throw new Error('NIP-07 getPublicKey() returned an invalid NIP-01 public key');
			hooks.onPublicKey(pubkey);

			const { result, expectedUnsigned } = await requestSignature(signer, eventToSign);
			if (!this.#isCurrent(attempt)) return;
			const validation = validateSignedEvent(result, expectedUnsigned, pubkey);
			hooks.onSuccess(result, validation);
		} catch (error) {
			if (!this.#isCurrent(attempt)) return;
			hooks.onError(error instanceof Error ? error.message : String(error));
		} finally {
			if (this.#isCurrent(attempt)) hooks.onFinish();
		}
	}
}
