import { schnorr } from '@noble/curves/secp256k1.js';
import {
	inspectBolt11Amount,
	inspectBolt11PaymentHash,
	sha256Utf8Hex,
	verifyBolt11DescriptionHash
} from './bolt11';

export type CheckLevel = 'required' | 'recommended' | 'diagnostic';
export type CheckStatus = 'pass' | 'fail' | 'warning' | 'not-applicable' | 'not-checked';
export type ReceiptCheck = {
	id: string;
	label: string;
	level: CheckLevel;
	status: CheckStatus;
	detail?: string;
};
export type ReceiptValidationResult = {
	sections: { title: string; checks: ReceiptCheck[] }[];
	valid: boolean;
	warningCount: number;
	claimedEventId?: string;
	calculatedEventId?: string;
	receiptDescription?: string;
	expectedDescription: string;
};
export type ZapReceiptValidationInput = {
	candidate: unknown;
	signedZapRequest: unknown;
	exactZapRequestJson: string;
	currentInvoice: string;
	providerNostrPubkey: string;
	currentLnurl: string;
};

const HEX_64 = /^[0-9a-f]{64}$/;
const HEX_128 = /^[0-9a-f]{128}$/;
const bytes = (hex: string) =>
	Uint8Array.from(hex.match(/../g) ?? [], (part) => parseInt(part, 16));
const record = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);
const serializableTags = (value: unknown): value is string[][] =>
	Array.isArray(value) &&
	value.every((tag) => Array.isArray(tag) && tag.every((item) => typeof item === 'string'));
const validTags = (value: unknown): value is string[][] =>
	serializableTags(value) && value.every((tag) => tag.length > 0);
const values = (tags: string[][], name: string) =>
	tags.flatMap((tag) => (tag[0] === name && typeof tag[1] === 'string' ? [tag[1]] : []));
const required = (id: string, label: string, pass: boolean, detail?: string): ReceiptCheck => ({
	id,
	label,
	level: 'required',
	status: pass ? 'pass' : 'fail',
	detail
});
const recommended = (id: string, label: string, pass: boolean, detail?: string): ReceiptCheck => ({
	id,
	label,
	level: 'recommended',
	status: pass ? 'pass' : 'warning',
	detail
});
const diagnostic = (
	id: string,
	label: string,
	status: CheckStatus,
	detail?: string
): ReceiptCheck => ({
	id,
	label,
	level: 'diagnostic',
	status,
	detail
});

export async function calculateNostrEventId(event: {
	pubkey: string;
	created_at: number;
	kind: number;
	tags: string[][];
	content: string;
}): Promise<string> {
	return sha256Utf8Hex(
		JSON.stringify([0, event.pubkey, event.created_at, event.kind, event.tags, event.content])
	);
}

export async function validateZapReceipt(
	input: ZapReceiptValidationInput
): Promise<ReceiptValidationResult> {
	const event = record(input.candidate) ? input.candidate : {};
	const shape =
		HEX_64.test(typeof event.id === 'string' ? event.id : '') &&
		HEX_64.test(typeof event.pubkey === 'string' ? event.pubkey : '') &&
		typeof event.created_at === 'number' &&
		Number.isInteger(event.created_at) &&
		event.created_at >= 0 &&
		typeof event.kind === 'number' &&
		Number.isInteger(event.kind) &&
		validTags(event.tags) &&
		typeof event.content === 'string' &&
		HEX_128.test(typeof event.sig === 'string' ? event.sig : '');
	let calculatedEventId: string | undefined;
	if (
		typeof event.pubkey === 'string' &&
		typeof event.created_at === 'number' &&
		Number.isInteger(event.created_at) &&
		typeof event.kind === 'number' &&
		Number.isInteger(event.kind) &&
		serializableTags(event.tags) &&
		typeof event.content === 'string'
	)
		calculatedEventId = await calculateNostrEventId(event as never);
	const idMatches = calculatedEventId !== undefined && event.id === calculatedEventId;
	let signatureValid = false;
	if (
		calculatedEventId &&
		HEX_64.test(typeof event.pubkey === 'string' ? event.pubkey : '') &&
		HEX_128.test(typeof event.sig === 'string' ? event.sig : '')
	) {
		try {
			signatureValid = schnorr.verify(
				bytes(event.sig as string),
				bytes(calculatedEventId),
				bytes(event.pubkey as string)
			);
		} catch {
			signatureValid = false;
		}
	}
	const integrity = [
		required('shape', 'Event shape', shape),
		required('kind', 'Kind is 9735', event.kind === 9735),
		required(
			'event-id',
			'Calculated event ID matches claimed event ID',
			idMatches,
			calculatedEventId
				? `Claimed: ${String(event.id)} · Calculated: ${calculatedEventId}`
				: 'Event fields cannot be serialized safely'
		),
		required('signature', 'BIP-340 Schnorr signature over calculated event ID', signatureValid)
	];
	const receiptTags = validTags(event.tags) ? event.tags : [];
	const request = record(input.signedZapRequest) ? input.signedZapRequest : {};
	const requestTags = validTags(request.tags) ? request.tags : [];
	const relationship = (name: string, label: string): ReceiptCheck => {
		const expected = values(requestTags, name);
		if (expected.length === 0)
			return {
				id: `${name}-tag`,
				label,
				level: 'required',
				status: 'not-applicable',
				detail: `Zap Request has no ${name} tag`
			};
		return required(
			`${name}-tag`,
			label,
			expected.every((value) => values(receiptTags, name).includes(value))
		);
	};
	const pExpected = values(requestTags, 'p');
	const pCheck = required(
		'p-tag',
		'Recipient p tag matches Zap Request',
		pExpected.length > 0 && pExpected.every((v) => values(receiptTags, 'p').includes(v))
	);
	const sender = typeof request.pubkey === 'string' ? request.pubkey : undefined;
	const capitalP = values(receiptTags, 'P');
	const pSenderCheck: ReceiptCheck =
		capitalP.length === 0
			? {
					id: 'P-tag',
					label: 'Optional sender P tag',
					level: 'diagnostic',
					status: 'not-applicable',
					detail: 'Not present'
				}
			: required(
					'P-tag',
					'Optional sender P tag matches Zap Request pubkey',
					sender !== undefined && capitalP.every((v) => v === sender)
				);
	const bolt11s = values(receiptTags, 'bolt11');
	const bolt11 = bolt11s.find((value) => value === input.currentInvoice);
	const descriptions = values(receiptTags, 'description');
	const description = descriptions.find((value) => value === input.exactZapRequestJson);
	const structure = [
		pCheck,
		relationship('e', 'Applicable e tag copied from Zap Request'),
		relationship('a', 'Applicable a tag copied from Zap Request'),
		pSenderCheck,
		required('bolt11', 'BOLT11 tag contains current callback invoice', bolt11 !== undefined),
		required(
			'description',
			'Description exactly matches Zap Request JSON sent to callback',
			description !== undefined
		),
		recommended(
			'content',
			'Receipt content SHOULD be empty',
			event.content === '',
			`Length: ${typeof event.content === 'string' ? event.content.length : 'unavailable'}`
		)
	];
	let descriptionJsonCheck = diagnostic(
		'description-json',
		'Receipt description parses as JSON',
		'not-applicable',
		'Description tag is missing'
	);
	const receiptDescription = descriptions[0];
	if (receiptDescription !== undefined) {
		try {
			JSON.parse(receiptDescription);
			descriptionJsonCheck = diagnostic(
				'description-json',
				'Receipt description parses as JSON',
				'pass'
			);
		} catch {
			descriptionJsonCheck = diagnostic(
				'description-json',
				'Receipt description parses as JSON',
				'fail'
			);
		}
	}
	const author = required(
		'author',
		'Receipt author matches LNURL provider nostrPubkey',
		event.pubkey === input.providerNostrPubkey.toLowerCase()
	);
	const amounts = values(requestTags, 'amount');
	let amountCheck: ReceiptCheck;
	if (amounts.length === 0)
		amountCheck = {
			id: 'amount',
			label: 'Receipt invoice amount matches Zap Request amount',
			level: 'required',
			status: 'not-applicable',
			detail: 'Zap Request has no amount tag'
		};
	else {
		const decoded = bolt11 !== undefined ? inspectBolt11Amount(bolt11) : undefined;
		const matches = (() => {
			try {
				return decoded?.status === 'specified' && decoded.amountMsat === BigInt(amounts[0]);
			} catch {
				return false;
			}
		})();
		amountCheck = required(
			'amount',
			'Amount in receipt bolt11 matches Zap Request amount',
			matches,
			decoded?.status === 'specified'
				? `Receipt invoice: ${decoded.amountMsat} msat · Zap Request: ${amounts[0]} msat`
				: `Receipt invoice amount: ${decoded?.status ?? 'missing'}`
		);
	}
	const lnurls = values(requestTags, 'lnurl');
	const lnurlCheck: ReceiptCheck =
		lnurls.length === 0
			? {
					id: 'lnurl',
					label: 'Zap Request lnurl matches current recipient LNURL',
					level: 'recommended',
					status: 'not-applicable',
					detail: 'Zap Request has no lnurl tag'
				}
			: recommended(
					'lnurl',
					'Zap Request lnurl SHOULD match current recipient LNURL',
					lnurls.every((value) => value === input.currentLnurl)
				);
	const authorization = [author, amountCheck, lnurlCheck];
	let hashCheck = diagnostic(
		'description-hash',
		'SHA256(receipt description) matches invoice h field',
		'not-applicable',
		'Description tag is missing'
	);
	if (receiptDescription !== undefined) {
		const result = await verifyBolt11DescriptionHash(input.currentInvoice, receiptDescription);
		hashCheck = recommended(
			'description-hash',
			'SHA256(receipt description) SHOULD match invoice h field',
			result.status === 'match',
			result.status
		);
	}
	const preimages = values(receiptTags, 'preimage');
	let preimageCheck = diagnostic(
		'preimage',
		'Optional preimage matches BOLT11 payment hash',
		'not-applicable',
		'Not present; a receipt is not cryptographic proof of payment'
	);
	if (preimages.length > 0) {
		const preimage = preimages[0];
		if (!HEX_64.test(preimage))
			preimageCheck = diagnostic(
				'preimage',
				'Optional preimage matches BOLT11 payment hash',
				'fail',
				'Preimage is not 32-byte lowercase hex; a receipt is not payment proof'
			);
		else {
			const digest = await crypto.subtle.digest('SHA-256', bytes(preimage));
			const calculated = Array.from(new Uint8Array(digest), (b) =>
				b.toString(16).padStart(2, '0')
			).join('');
			const paymentHash = inspectBolt11PaymentHash(bolt11 ?? input.currentInvoice);
			preimageCheck = diagnostic(
				'preimage',
				'Optional preimage matches BOLT11 payment hash',
				paymentHash.status === 'available' && paymentHash.paymentHashHex === calculated
					? 'pass'
					: 'fail',
				'Raw 32-byte preimage is hashed; a receipt is not cryptographic proof of payment'
			);
		}
	}
	const additional = [
		descriptionJsonCheck,
		hashCheck,
		preimageCheck,
		diagnostic(
			'paid-at',
			'Receipt created_at vs invoice paid_at',
			'not-checked',
			'Invoice paid_at is unavailable'
		)
	];
	const sections = [
		{ title: 'NIP-01 Event Integrity', checks: integrity },
		{ title: 'NIP-57 Receipt Structure', checks: structure },
		{ title: 'Appendix F Authorization', checks: authorization },
		{ title: 'Additional Diagnostics', checks: additional }
	];
	const all = sections.flatMap((section) => section.checks);
	return {
		sections,
		valid: all.every((check) => check.level !== 'required' || check.status !== 'fail'),
		warningCount: all.filter((check) => check.status === 'warning').length,
		claimedEventId: typeof event.id === 'string' ? event.id : undefined,
		calculatedEventId,
		receiptDescription,
		expectedDescription: input.exactZapRequestJson
	};
}
