import { requestSignature, type Nip07Signer } from './nip07';
import type { UnsignedNostrEvent } from './nostr-event';

export type SigningHooks = {
	onStart(): void;
	onSuccess(result: unknown): void;
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
			const result = await requestSignature(signer, eventToSign);
			if (!this.#isCurrent(attempt)) return;
			hooks.onSuccess(result);
		} catch (error) {
			if (!this.#isCurrent(attempt)) return;
			hooks.onError(error instanceof Error ? error.message : String(error));
		} finally {
			if (this.#isCurrent(attempt)) hooks.onFinish();
		}
	}
}
