import type { UnsignedNostrEvent } from './nostr-event';

export type Nip07Signer = {
	getPublicKey(): Promise<string>;
	signEvent(event: UnsignedNostrEvent): Promise<unknown>;
};

declare global {
	interface Window {
		nostr?: Nip07Signer;
	}
}

export function getNip07Signer(
	source: Pick<Window, 'nostr'> | undefined = typeof window === 'undefined' ? undefined : window
): Nip07Signer | undefined {
	const signer = source?.nostr;
	return signer &&
		typeof signer.getPublicKey === 'function' &&
		typeof signer.signEvent === 'function'
		? signer
		: undefined;
}

export async function requestPublicKey(signer: Nip07Signer | undefined): Promise<string> {
	if (!signer) throw new Error('NIP-07 signer is not available');
	return signer.getPublicKey();
}

export async function requestSignature(
	signer: Nip07Signer | undefined,
	event: UnsignedNostrEvent
): Promise<{ result: unknown; expectedUnsigned: UnsignedNostrEvent }> {
	if (!signer) throw new Error('NIP-07 signer is not available');
	const expectedUnsigned = structuredClone(event);
	const eventForSigner = structuredClone(expectedUnsigned);
	const result = await signer.signEvent(eventForSigner);
	return { result, expectedUnsigned };
}
