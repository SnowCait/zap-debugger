import {
	inspectBolt11Amount,
	verifyBolt11DescriptionHash,
	type Bolt11AmountResult,
	type DescriptionHashVerificationResult
} from '$lib/protocol/bolt11';
import type { HttpInspection } from '$lib/protocol/http';
import { LnurlPayFetchController } from '$lib/protocol/lnurl-pay-fetch';
import { encodeLnurl } from '$lib/protocol/lnurl-bech32';
import {
	parseLightningAddress,
	type AddressParseResult,
	type LightningAddress
} from '$lib/protocol/lightning-address';
import type { Lud06Result } from '$lib/protocol/lud06';
import { resolveLnurlPayEndpoint, type LnurlPayEndpoint } from '$lib/protocol/lud16';
import type { Nip57Result } from '$lib/protocol/nip57';
import { getNip07Signer } from '$lib/protocol/nip07';
import { Nip07SigningController } from '$lib/protocol/nip07-signing';
import { parseRecipientPubkey, type RecipientPubkeyResult } from '$lib/protocol/nostr-key';
import type { UnsignedNostrEvent } from '$lib/protocol/nostr-event';
import {
	parseRelays,
	validateZapAmount,
	type AmountValidation,
	type RelayValidation
} from '$lib/protocol/zap-parameters';
import { buildZapRequest, validateZapRequest } from '$lib/protocol/zap-request';
import type { ZapCallbackResult } from '$lib/protocol/zap-callback';
import { ZapCallbackFetchController } from '$lib/protocol/zap-callback-fetch';
import type { ValidationItem } from '$lib/protocol/validation';
import { isPaymentHandoffReady } from '$lib/protocol/payment-handoff';
import {
	ZapReceiptSubscriptionController,
	type ZapReceiptSubscriptionState
} from '$lib/protocol/zap-receipt-subscription';
import {
	validateZapReceipt,
	type ReceiptCheck,
	type ReceiptValidationResult
} from '$lib/protocol/zap-receipt-validation';

export function createZapDebuggerState() {
	let input = $state('');
	let addressResult = $state<AddressParseResult>();
	let address = $state<LightningAddress>();
	let endpoint = $state.raw<LnurlPayEndpoint>();
	let http = $state<HttpInspection>();
	let lud06 = $state<Lud06Result>();
	let nip57 = $state<Nip57Result>();
	let loading = $state(false);
	let fetchedEndpointUrl = $state<string>();
	let recipientInput = $state('');
	let amountInput = $state('');
	let relaysInput = $state('');
	let commentInput = $state('');
	let recipientResult = $state<RecipientPubkeyResult>();
	let amountResult = $state<AmountValidation>();
	let relayResult = $state<RelayValidation>();
	let encodedLnurl = $state<string>();
	let unsignedEvent = $state.raw<UnsignedNostrEvent>();
	let unsignedValidation = $state<ValidationItem[]>();
	let signerAvailable = $state(false);
	let signing = $state(false);
	let signError = $state<string>();
	let signedRaw = $state.raw<unknown>();
	let callbackLoading = $state(false);
	let callbackRequestUrl = $state<string>();
	let callbackZapRequestJson = $state<string>();
	let callbackHttp = $state<HttpInspection>();
	let callbackResult = $state<ZapCallbackResult>();
	let invoiceAmountResult = $state<Bolt11AmountResult>();
	let descriptionHashResult = $state<DescriptionHashVerificationResult>();
	let descriptionHashLoading = $state(false);
	let descriptionHashGeneration = 0;
	let copyStatus = $state<'copied' | 'failed'>();
	let copyGeneration = 0;
	let receiptState = $state<ZapReceiptSubscriptionState>({
		waiting: false,
		relays: [],
		candidates: []
	});
	let receiptValidations = $state<Record<string, ReceiptValidationResult | 'loading'>>({});
	let receiptValidationGeneration = 0;
	const signingController = new Nip07SigningController();
	const fetchController = new LnurlPayFetchController();
	const callbackController = new ZapCallbackFetchController();
	const receiptController = new ZapReceiptSubscriptionController();

	function refreshSignerAvailability() {
		signerAvailable = getNip07Signer() !== undefined;
		if (!signerAvailable) signError = 'NIP-07 signer is not available';
		else if (signError === 'NIP-07 signer is not available') signError = undefined;
	}

	function resetCallback() {
		callbackController.invalidate();
		callbackLoading = false;
		callbackRequestUrl = undefined;
		callbackZapRequestJson = undefined;
		callbackHttp = undefined;
		callbackResult = undefined;
		invoiceAmountResult = undefined;
		resetDescriptionHash();
	}
	function resetDescriptionHash() {
		resetReceiptSubscription();
		descriptionHashGeneration += 1;
		descriptionHashLoading = false;
		descriptionHashResult = undefined;
		copyGeneration += 1;
		copyStatus = undefined;
	}
	function resetReceiptSubscription() {
		receiptController.stop();
		receiptState = { waiting: false, relays: [], candidates: [] };
		resetReceiptValidations();
	}
	function resetReceiptValidations() {
		receiptValidationGeneration += 1;
		receiptValidations = {};
	}
	function resetSigned() {
		signingController.invalidate();
		signing = false;
		signError = undefined;
		signedRaw = undefined;
		resetCallback();
	}
	function resetBuilt() {
		unsignedEvent = undefined;
		unsignedValidation = undefined;
		resetSigned();
	}
	function resetZap() {
		recipientResult = undefined;
		amountResult = undefined;
		relayResult = undefined;
		encodedLnurl = undefined;
		resetBuilt();
	}

	function resetFetch() {
		fetchController.invalidate();
		loading = false;
		http = undefined;
		lud06 = undefined;
		nip57 = undefined;
		fetchedEndpointUrl = undefined;
		resetZap();
	}
	function changeInput(value: string) {
		input = value;
		addressResult = undefined;
		address = undefined;
		endpoint = undefined;
		resetFetch();
	}
	function validateAddress() {
		addressResult = parseLightningAddress(input);
		address = addressResult.valid ? addressResult.value : undefined;
		endpoint = undefined;
		resetFetch();
	}
	function resolveEndpoint() {
		if (address) {
			endpoint = resolveLnurlPayEndpoint(address);
			resetFetch();
		}
	}
	async function runGet() {
		if (!endpoint) return;
		resetFetch();
		await fetchController.run(endpoint, {
			onStart: () => {
				loading = true;
			},
			onSuccess: (result) => {
				fetchedEndpointUrl = result.endpoint.url;
				http = result.http;
				lud06 = result.lud06;
				nip57 = result.nip57;
			},
			onFinish: () => {
				loading = false;
			}
		});
	}
	function changeZapParameter(field: 'recipient' | 'amount' | 'relays' | 'comment', value: string) {
		if (field === 'recipient') recipientInput = value;
		if (field === 'amount') amountInput = value;
		if (field === 'relays') relaysInput = value;
		if (field === 'comment') commentInput = value;
		resetZap();
	}
	function validateZapParameters() {
		if (
			lud06?.kind !== 'payRequest' ||
			!lud06.valid ||
			nip57?.status !== 'supported' ||
			!endpoint ||
			fetchedEndpointUrl !== endpoint.url
		)
			return;
		const { minSendable, maxSendable, callback } = lud06.data;
		if (minSendable === undefined || maxSendable === undefined || callback === undefined) return;
		recipientResult = parseRecipientPubkey(recipientInput);
		amountResult = validateZapAmount(amountInput, minSendable, maxSendable);
		relayResult = parseRelays(relaysInput);
		encodedLnurl = encodeLnurl(endpoint.url);
		resetBuilt();
	}
	function buildRequest() {
		if (
			!recipientResult?.valid ||
			!recipientResult.normalized ||
			!amountResult?.valid ||
			amountResult.amount === undefined ||
			!relayResult?.valid ||
			!encodedLnurl ||
			lud06?.kind !== 'payRequest' ||
			lud06.data.minSendable === undefined ||
			lud06.data.maxSendable === undefined
		)
			return;
		unsignedEvent = buildZapRequest({
			recipientPubkey: recipientResult.normalized,
			amount: amountResult.amount,
			relays: relayResult.relays,
			lnurl: encodedLnurl,
			comment: commentInput,
			createdAt: Math.floor(Date.now() / 1000)
		});
		unsignedValidation = validateZapRequest(unsignedEvent, {
			recipientPubkey: recipientResult.normalized,
			amount: amountResult.amount,
			relays: relayResult.relays,
			lnurl: encodedLnurl,
			comment: commentInput,
			minSendable: lud06.data.minSendable,
			maxSendable: lud06.data.maxSendable
		});
		resetSigned();
	}
	async function signRequest() {
		if (!unsignedEvent) return;
		const signer = getNip07Signer();
		signerAvailable = signer !== undefined;
		if (!signer) {
			signError = 'NIP-07 signer is not available';
			return;
		}
		await signingController.sign(signer, unsignedEvent, {
			onStart: () => {
				resetCallback();
				signing = true;
				signError = undefined;
				signedRaw = undefined;
			},
			onSuccess: (result) => {
				signedRaw = result;
			},
			onError: (message) => {
				signError = message;
			},
			onFinish: () => {
				signing = false;
			}
		});
	}
	async function getCallback() {
		if (
			signedRaw === undefined ||
			amountResult?.amount === undefined ||
			encodedLnurl === undefined ||
			lud06?.kind !== 'payRequest' ||
			lud06.data.callback === undefined
		)
			return;
		await callbackController.run(
			{
				callback: lud06.data.callback,
				amount: amountResult.amount.toString(),
				signedZapRequest: signedRaw,
				encodedLnurl
			},
			{
				onStart: ({ requestUrl, zapRequestJson }) => {
					callbackLoading = true;
					callbackRequestUrl = requestUrl;
					callbackZapRequestJson = zapRequestJson;
					callbackHttp = undefined;
					callbackResult = undefined;
					invoiceAmountResult = undefined;
					resetDescriptionHash();
				},
				onSuccess: (result) => {
					callbackRequestUrl = result.requestUrl;
					callbackZapRequestJson = result.zapRequestJson;
					callbackHttp = result.http;
					callbackResult = result.callback;
				},
				onFinish: () => {
					callbackLoading = false;
				}
			}
		);
	}
	function decodeInvoice() {
		if (callbackResult?.kind !== 'invoice') return;
		resetDescriptionHash();
		invoiceAmountResult = inspectBolt11Amount(callbackResult.pr);
	}
	async function verifyDescriptionHash() {
		if (
			callbackResult?.kind !== 'invoice' ||
			callbackZapRequestJson === undefined ||
			invoiceAmountResult === undefined ||
			invoiceAmountResult.status === 'failure'
		)
			return;
		const generation = ++descriptionHashGeneration;
		const invoice = callbackResult.pr;
		const zapRequestJson = callbackZapRequestJson;
		descriptionHashLoading = true;
		descriptionHashResult = undefined;
		copyGeneration += 1;
		copyStatus = undefined;
		const result = await verifyBolt11DescriptionHash(invoice, zapRequestJson);
		if (generation !== descriptionHashGeneration) return;
		descriptionHashResult = result;
		descriptionHashLoading = false;
	}
	async function copyInvoice(invoice: string) {
		const generation = ++copyGeneration;
		copyStatus = undefined;
		try {
			await navigator.clipboard.writeText(invoice);
			if (generation === copyGeneration) copyStatus = 'copied';
		} catch {
			if (generation === copyGeneration) copyStatus = 'failed';
		}
	}
	function getSignedTagValues(name: string): string[] {
		if (typeof signedRaw !== 'object' || signedRaw === null) return [];
		const tags = (signedRaw as { tags?: unknown }).tags;
		if (!Array.isArray(tags)) return [];
		return tags.flatMap((tag) =>
			Array.isArray(tag) && tag[0] === name && typeof tag[1] === 'string' ? [tag[1]] : []
		);
	}
	const receiptRelays = () => {
		if (typeof signedRaw !== 'object' || signedRaw === null) return [];
		const tags = (signedRaw as { tags?: unknown }).tags;
		if (!Array.isArray(tags)) return [];
		const relaysTag = tags.find((tag) => Array.isArray(tag) && tag[0] === 'relays');
		return Array.isArray(relaysTag)
			? relaysTag.slice(1).filter((relay): relay is string => typeof relay === 'string')
			: [];
	};
	const receiptRecipient = () => getSignedTagValues('p')[0];
	const receiptCreatedAt = () => {
		if (typeof signedRaw !== 'object' || signedRaw === null) return undefined;
		const createdAt = (signedRaw as { created_at?: unknown }).created_at;
		return typeof createdAt === 'number' &&
			Number.isFinite(createdAt) &&
			Number.isInteger(createdAt) &&
			createdAt >= 0
			? createdAt
			: undefined;
	};
	function startReceiptSubscription() {
		if (!receiptReady()) return;
		const invoice = callbackResult?.kind === 'invoice' ? callbackResult.pr : undefined;
		const recipientPubkey = receiptRecipient();
		const relays = receiptRelays();
		const createdAt = receiptCreatedAt();
		if (!invoice || !recipientPubkey || relays.length === 0 || createdAt === undefined) return;
		resetReceiptValidations();
		receiptController.start({
			relays,
			recipientPubkey,
			invoice,
			createdAt,
			onState: (state) => (receiptState = state)
		});
	}
	async function validateCandidate(candidateKey: string, candidate: unknown) {
		if (
			callbackResult?.kind !== 'invoice' ||
			callbackZapRequestJson === undefined ||
			signedRaw === undefined ||
			encodedLnurl === undefined ||
			lud06?.kind !== 'payRequest' ||
			typeof lud06.data.nostrPubkey !== 'string'
		)
			return;
		const generation = receiptValidationGeneration;
		receiptValidations = { ...receiptValidations, [candidateKey]: 'loading' };
		const result = await validateZapReceipt({
			candidate,
			signedZapRequest: signedRaw,
			exactZapRequestJson: callbackZapRequestJson,
			currentInvoice: callbackResult.pr,
			providerNostrPubkey: lud06.data.nostrPubkey,
			currentLnurl: encodedLnurl
		});
		if (
			generation !== receiptValidationGeneration ||
			!receiptState.candidates.some((item) => item.key === candidateKey)
		)
			return;
		receiptValidations = { ...receiptValidations, [candidateKey]: result };
	}
	const checkMark = (check: ReceiptCheck) => {
		if (check.status === 'pass') return '✓';
		if (check.status === 'fail') return '✕';
		if (check.status === 'warning') return '⚠';
		return '—';
	};
	const checkClass = (check: ReceiptCheck) =>
		check.status === 'fail'
			? 'errors'
			: check.status === 'warning'
				? 'warning'
				: check.status === 'pass'
					? 'success'
					: 'muted';
	function stopReceiptSubscription() {
		resetReceiptSubscription();
	}
	const formattedJson = (value: unknown) => JSON.stringify(value, null, 2);
	const zapReady = () =>
		lud06?.kind === 'payRequest' &&
		lud06.valid &&
		nip57?.status === 'supported' &&
		endpoint !== undefined &&
		fetchedEndpointUrl === endpoint.url &&
		lud06.data.callback !== undefined &&
		lud06.data.minSendable !== undefined &&
		lud06.data.maxSendable !== undefined;
	const parametersValid = () =>
		recipientResult?.valid === true &&
		amountResult?.valid === true &&
		relayResult?.valid === true &&
		encodedLnurl !== undefined;
	const paymentReady = () =>
		isPaymentHandoffReady({
			invoice: callbackResult?.kind === 'invoice' ? callbackResult.pr : undefined,
			requestedAmountMsat:
				amountResult?.amount === undefined ? undefined : BigInt(amountResult.amount),
			decodedAmountMsat:
				invoiceAmountResult?.status === 'specified' ? invoiceAmountResult.amountMsat : undefined,
			descriptionHashStatus: descriptionHashResult?.status
		});
	const receiptReady = () =>
		paymentReady() &&
		signedRaw !== undefined &&
		receiptRelays().length > 0 &&
		receiptRecipient() !== undefined &&
		receiptCreatedAt() !== undefined;
	const receiptValidationReady = () =>
		receiptState.candidates.length > 0 &&
		callbackZapRequestJson !== undefined &&
		typeof (lud06?.kind === 'payRequest' ? lud06.data.nostrPubkey : undefined) === 'string' &&
		encodedLnurl !== undefined;

	function dispose() {
		receiptController.stop();
	}

	return {
		get input() {
			return input;
		},
		get addressResult() {
			return addressResult;
		},
		get address() {
			return address;
		},
		get endpoint() {
			return endpoint;
		},
		get http() {
			return http;
		},
		get lud06() {
			return lud06;
		},
		get nip57() {
			return nip57;
		},
		get loading() {
			return loading;
		},
		get fetchedEndpointUrl() {
			return fetchedEndpointUrl;
		},
		get recipientInput() {
			return recipientInput;
		},
		get amountInput() {
			return amountInput;
		},
		get relaysInput() {
			return relaysInput;
		},
		get commentInput() {
			return commentInput;
		},
		get recipientResult() {
			return recipientResult;
		},
		get amountResult() {
			return amountResult;
		},
		get relayResult() {
			return relayResult;
		},
		get encodedLnurl() {
			return encodedLnurl;
		},
		get unsignedEvent() {
			return unsignedEvent;
		},
		get unsignedValidation() {
			return unsignedValidation;
		},
		get signerAvailable() {
			return signerAvailable;
		},
		get signing() {
			return signing;
		},
		get signError() {
			return signError;
		},
		get signedRaw() {
			return signedRaw;
		},
		get callbackLoading() {
			return callbackLoading;
		},
		get callbackRequestUrl() {
			return callbackRequestUrl;
		},
		get callbackZapRequestJson() {
			return callbackZapRequestJson;
		},
		get callbackHttp() {
			return callbackHttp;
		},
		get callbackResult() {
			return callbackResult;
		},
		get invoiceAmountResult() {
			return invoiceAmountResult;
		},
		get descriptionHashResult() {
			return descriptionHashResult;
		},
		get descriptionHashLoading() {
			return descriptionHashLoading;
		},
		get copyStatus() {
			return copyStatus;
		},
		get receiptState() {
			return receiptState;
		},
		get receiptValidations() {
			return receiptValidations;
		},
		refreshSignerAvailability,
		changeInput,
		validateAddress,
		resolveEndpoint,
		runGet,
		changeZapParameter,
		validateZapParameters,
		buildRequest,
		signRequest,
		getCallback,
		decodeInvoice,
		verifyDescriptionHash,
		copyInvoice,
		startReceiptSubscription,
		validateCandidate,
		stopReceiptSubscription,
		formattedJson,
		zapReady,
		parametersValid,
		paymentReady,
		receiptReady,
		receiptValidationReady,
		receiptRelays,
		receiptRecipient,
		receiptCreatedAt,
		checkMark,
		checkClass,
		dispose
	};
}

export type ZapDebuggerState = ReturnType<typeof createZapDebuggerState>;
