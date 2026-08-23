import type { SignedNostrEvent, UnsignedNostrEvent } from './nostr-event';

export type Nip07Signer = {
	signEvent(event: UnsignedNostrEvent): Promise<SignedNostrEvent>;
};

export type Nip07Provider = Nip07Signer & {
	getPublicKey(): Promise<string>;
};

declare global {
	interface Window {
		nostr?: Nip07Provider;
	}
}

export function getNip07Signer(
	source: { nostr?: Partial<Nip07Provider> } | undefined = typeof window === 'undefined'
		? undefined
		: window
): Nip07Signer | undefined {
	const signer = source?.nostr;
	return signer && typeof signer.signEvent === 'function' ? (signer as Nip07Signer) : undefined;
}

export async function requestSignature(
	signer: Nip07Signer | undefined,
	event: UnsignedNostrEvent
): Promise<SignedNostrEvent> {
	if (!signer) throw new Error('NIP-07 signer is not available');
	return signer.signEvent(event);
}
