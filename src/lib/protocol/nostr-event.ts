export type NostrTag = string[];

export type UnsignedNostrEvent = {
	created_at: number;
	kind: number;
	tags: NostrTag[];
	content: string;
};

export type SignedNostrEvent = UnsignedNostrEvent & {
	id: string;
	pubkey: string;
	sig: string;
};

export function parseSignedNostrEvent(value: unknown): SignedNostrEvent | undefined {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
	const event = value as Record<string, unknown>;
	if (
		typeof event.id !== 'string' ||
		typeof event.pubkey !== 'string' ||
		typeof event.sig !== 'string' ||
		!Number.isInteger(event.created_at) ||
		!Number.isInteger(event.kind) ||
		typeof event.content !== 'string' ||
		!Array.isArray(event.tags) ||
		!event.tags.every(
			(tag) => Array.isArray(tag) && tag.length > 0 && tag.every((item) => typeof item === 'string')
		)
	) {
		return undefined;
	}
	return event as SignedNostrEvent;
}
