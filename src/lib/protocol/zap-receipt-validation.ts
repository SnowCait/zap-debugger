import { m } from '$lib/paraglide/messages';
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
		required('shape', m.diagnostic_receipt_shape(), shape),
		required('kind', m.diagnostic_receipt_kind(), event.kind === 9735),
		required(
			'event-id',
			m.diagnostic_receipt_event_id(),
			idMatches,
			calculatedEventId
				? m.diagnostic_event_ids({ claimed: String(event.id), calculated: calculatedEventId })
				: m.diagnostic_receipt_serialize()
		),
		required('signature', m.diagnostic_receipt_signature(), signatureValid)
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
				detail: m.diagnostic_request_tag_missing({ name })
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
		m.diagnostic_receipt_recipient(),
		pExpected.length > 0 && pExpected.every((v) => values(receiptTags, 'p').includes(v))
	);
	const sender = typeof request.pubkey === 'string' ? request.pubkey : undefined;
	const capitalP = values(receiptTags, 'P');
	const pSenderCheck: ReceiptCheck =
		capitalP.length === 0
			? {
					id: 'P-tag',
					label: m.diagnostic_receipt_sender_optional(),
					level: 'diagnostic',
					status: 'not-applicable',
					detail: m.diagnostic_receipt_absent()
				}
			: required(
					'P-tag',
					m.diagnostic_receipt_sender_match(),
					sender !== undefined && capitalP.every((v) => v === sender)
				);
	const bolt11s = values(receiptTags, 'bolt11');
	const bolt11 = bolt11s.find((value) => value === input.currentInvoice);
	const descriptions = values(receiptTags, 'description');
	const description = descriptions.find((value) => value === input.exactZapRequestJson);
	const structure = [
		pCheck,
		relationship('e', m.diagnostic_receipt_e_tag()),
		relationship('a', m.diagnostic_receipt_a_tag()),
		pSenderCheck,
		required('bolt11', m.diagnostic_receipt_invoice(), bolt11 !== undefined),
		required('description', m.diagnostic_receipt_description(), description !== undefined),
		recommended(
			'content',
			m.diagnostic_receipt_content_empty(),
			event.content === '',
			m.diagnostic_content_length({
				length:
					typeof event.content === 'string'
						? event.content.length
						: m.diagnostic_value_unavailable()
			})
		)
	];
	let descriptionJsonCheck = diagnostic(
		'description-json',
		m.diagnostic_receipt_description_json(),
		'not-applicable',
		m.diagnostic_receipt_description_missing()
	);
	const receiptDescription = descriptions[0];
	if (receiptDescription !== undefined) {
		try {
			JSON.parse(receiptDescription);
			descriptionJsonCheck = diagnostic(
				'description-json',
				m.diagnostic_receipt_description_json(),
				'pass'
			);
		} catch {
			descriptionJsonCheck = diagnostic(
				'description-json',
				m.diagnostic_receipt_description_json(),
				'fail'
			);
		}
	}
	const author = required(
		'author',
		m.diagnostic_receipt_author(),
		event.pubkey === input.providerNostrPubkey.toLowerCase()
	);
	const amounts = values(requestTags, 'amount');
	let amountCheck: ReceiptCheck;
	if (amounts.length === 0)
		amountCheck = {
			id: 'amount',
			label: m.diagnostic_receipt_amount(),
			level: 'required',
			status: 'not-applicable',
			detail: m.diagnostic_receipt_amount_missing()
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
			m.diagnostic_receipt_amount_match(),
			matches,
			decoded?.status === 'specified'
				? m.diagnostic_invoice_amounts({
						invoiceAmount: decoded.amountMsat.toString(),
						requestAmount: amounts[0]
					})
				: m.diagnostic_invoice_amount_status({ status: decoded?.status ?? 'missing' })
		);
	}
	const lnurls = values(requestTags, 'lnurl');
	const lnurlCheck: ReceiptCheck =
		lnurls.length === 0
			? {
					id: 'lnurl',
					label: m.diagnostic_receipt_lnurl(),
					level: 'recommended',
					status: 'not-applicable',
					detail: m.diagnostic_receipt_lnurl_missing()
				}
			: recommended(
					'lnurl',
					m.diagnostic_receipt_lnurl_recommended(),
					lnurls.every((value) => value === input.currentLnurl)
				);
	const authorization = [author, amountCheck, lnurlCheck];
	let hashCheck = diagnostic(
		'description-hash',
		m.diagnostic_receipt_hash(),
		'not-applicable',
		m.diagnostic_receipt_description_missing()
	);
	if (receiptDescription !== undefined) {
		const result = await verifyBolt11DescriptionHash(input.currentInvoice, receiptDescription);
		hashCheck = recommended(
			'description-hash',
			m.diagnostic_receipt_hash_recommended(),
			result.status === 'match',
			result.status
		);
	}
	const preimages = values(receiptTags, 'preimage');
	let preimageCheck = diagnostic(
		'preimage',
		m.diagnostic_receipt_preimage(),
		'not-applicable',
		m.diagnostic_receipt_preimage_absent()
	);
	if (preimages.length > 0) {
		const preimage = preimages[0];
		if (!HEX_64.test(preimage))
			preimageCheck = diagnostic(
				'preimage',
				m.diagnostic_receipt_preimage(),
				'fail',
				m.diagnostic_receipt_preimage_invalid()
			);
		else {
			const digest = await crypto.subtle.digest('SHA-256', bytes(preimage));
			const calculated = Array.from(new Uint8Array(digest), (b) =>
				b.toString(16).padStart(2, '0')
			).join('');
			const paymentHash = inspectBolt11PaymentHash(bolt11 ?? input.currentInvoice);
			preimageCheck = diagnostic(
				'preimage',
				m.diagnostic_receipt_preimage(),
				paymentHash.status === 'available' && paymentHash.paymentHashHex === calculated
					? 'pass'
					: 'fail',
				m.diagnostic_receipt_preimage_hashed()
			);
		}
	}
	const additional = [
		descriptionJsonCheck,
		hashCheck,
		preimageCheck,
		diagnostic(
			'paid-at',
			m.diagnostic_receipt_paid_at(),
			'not-checked',
			m.diagnostic_receipt_paid_at_missing()
		)
	];
	const sections = [
		{ title: m.diagnostic_receipt_integrity_section(), checks: integrity },
		{ title: m.diagnostic_receipt_structure_section(), checks: structure },
		{ title: m.diagnostic_receipt_authorization_section(), checks: authorization },
		{ title: m.diagnostic_receipt_additional_section(), checks: additional }
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
