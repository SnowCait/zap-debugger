import type { ValidationItem } from './validation';

export type MetadataEntry = [string, ...unknown[]];
export type LnurlPayData = {
	callback?: string;
	minSendable?: number;
	maxSendable?: number;
	metadata?: string;
	parsedMetadata?: unknown;
	allowsNostr?: unknown;
	nostrPubkey?: unknown;
};
export type Lud06Result =
	| { kind: 'error'; valid: false; status: 'ERROR'; reason: string }
	| { kind: 'payRequest'; valid: boolean; items: ValidationItem[]; data: LnurlPayData };

const record = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);
const amount = (value: unknown): value is number =>
	typeof value === 'number' && Number.isSafeInteger(value);
const parsedAmount = (value: unknown): number | undefined => (amount(value) ? value : undefined);

export function validateLud06(value: unknown): Lud06Result {
	if (record(value) && value.status === 'ERROR' && typeof value.reason === 'string') {
		return { kind: 'error', valid: false, status: 'ERROR', reason: value.reason };
	}
	const source = record(value) ? value : {};
	let parsedMetadata: unknown;
	let metadataParses = false;
	if (typeof source.metadata === 'string') {
		try {
			parsedMetadata = JSON.parse(source.metadata);
			metadataParses = true;
		} catch {
			// Reported in the validation items below.
		}
	}
	const metadataEntriesValid =
		Array.isArray(parsedMetadata) &&
		parsedMetadata.every(
			(entry) => Array.isArray(entry) && entry.length >= 2 && typeof entry[0] === 'string'
		);
	const metadataArray = Array.isArray(parsedMetadata) ? parsedMetadata : [];
	const hasPlainText =
		metadataEntriesValid && metadataArray.some((entry: unknown[]) => entry[0] === 'text/plain');
	let callbackValid = false;
	if (typeof source.callback === 'string') {
		try {
			new URL(source.callback);
			callbackValid = true;
		} catch {
			// Reported below.
		}
	}
	const minValid = amount(source.minSendable);
	const maxValid = amount(source.maxSendable);
	const minSendable = parsedAmount(source.minSendable);
	const maxSendable = parsedAmount(source.maxSendable);
	const items: ValidationItem[] = [
		{ label: 'tag === "payRequest"', valid: source.tag === 'payRequest' },
		{ label: 'callback is present', valid: typeof source.callback === 'string' },
		{ label: 'callback parses as a URL', valid: callbackValid },
		{ label: 'minSendable is a safe integer number', valid: minValid },
		{ label: 'maxSendable is a safe integer number', valid: maxValid },
		{ label: 'minSendable >= 1', valid: minSendable !== undefined && minSendable >= 1 },
		{
			label: 'minSendable <= maxSendable',
			valid: minSendable !== undefined && maxSendable !== undefined && minSendable <= maxSendable
		},
		{ label: 'metadata is a string', valid: typeof source.metadata === 'string' },
		{ label: 'metadata parses as JSON', valid: metadataParses },
		{ label: 'parsed metadata is an array', valid: Array.isArray(parsedMetadata) },
		{
			label: 'every metadata entry is an array beginning with a type string',
			valid: metadataEntriesValid
		},
		{ label: 'metadata contains text/plain', valid: hasPlainText }
	];
	return {
		kind: 'payRequest',
		valid: items.every((item) => item.valid),
		items,
		data: {
			callback: typeof source.callback === 'string' ? source.callback : undefined,
			minSendable,
			maxSendable,
			metadata: typeof source.metadata === 'string' ? source.metadata : undefined,
			parsedMetadata,
			allowsNostr: source.allowsNostr,
			nostrPubkey: source.nostrPubkey
		}
	};
}
