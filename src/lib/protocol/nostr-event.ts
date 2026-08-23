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
