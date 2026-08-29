<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import InvoiceQr from '$lib/InvoiceQr.svelte';
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
	import { createPaymentHandoffValues, isPaymentHandoffReady } from '$lib/protocol/payment-handoff';
	import {
		ZapReceiptSubscriptionController,
		type ZapReceiptSubscriptionState
	} from '$lib/protocol/zap-receipt-subscription';

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
	const signingController = new Nip07SigningController();
	const fetchController = new LnurlPayFetchController();
	const callbackController = new ZapCallbackFetchController();
	const receiptController = new ZapReceiptSubscriptionController();

	onMount(() => {
		refreshSignerAvailability();
	});
	onDestroy(() => receiptController.stop());
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
		receiptController.start({
			relays,
			recipientPubkey,
			invoice,
			createdAt,
			onState: (state) => (receiptState = state)
		});
	}
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
</script>

<svelte:head
	><title>NIP-57 Zap Debugger</title><meta
		name="description"
		content="Inspect Lightning Address discovery for NIP-57 zaps"
	/></svelte:head
>
<main>
	<header>
		<p class="eyebrow">Protocol inspector</p>
		<h1>NIP-57 Zap Debugger</h1>
		<p>Run Lightning Address discovery one step at a time and inspect every intermediate value.</p>
	</header>
	<section>
		<h2><span>1</span> Validate Lightning Address</h2>
		<div class="grid">
			<div>
				<h3>Input</h3>
				<label for="lightning-address">Lightning Address</label><input
					id="lightning-address"
					value={input}
					oninput={(event) => changeInput(event.currentTarget.value)}
					placeholder="alice@example.com"
					autocomplete="off"
					spellcheck="false"
				/><button onclick={validateAddress} disabled={!input}>Validate address</button>
			</div>
			<div>
				<h3>Transformation</h3>
				<p>Split at <code>@</code> without normalizing or silently correcting the input.</p>
				<h3>Validation</h3>
				{#if addressResult?.valid}<p class="success">
						✓ Valid LUD-16 Lightning Address
					</p>{:else if addressResult}<ul class="errors">
						{#each addressResult.errors as error (error)}<li>✕ {error}</li>{/each}
					</ul>{:else}<p class="muted">Not run</p>{/if}
			</div>
		</div>
		{#if address}<div class="output">
				<h3>Output</h3>
				<dl>
					<dt>Lightning Address</dt>
					<dd>{address.address}</dd>
					<dt>Username</dt>
					<dd>{address.username}</dd>
					<dt>Domain</dt>
					<dd>{address.domain}</dd>
				</dl>
				<button onclick={resolveEndpoint}>Resolve LNURL-pay endpoint</button>
			</div>{/if}
	</section>
	<section>
		<h2><span>2</span> Resolve LNURL-pay endpoint</h2>
		{#if endpoint}<div class="grid">
				<div>
					<h3>Input</h3>
					<dl>
						<dt>Lightning Address</dt>
						<dd>{endpoint.address}</dd>
						<dt>Username</dt>
						<dd>{endpoint.username}</dd>
						<dt>Domain</dt>
						<dd>{endpoint.domain}</dd>
					</dl>
				</div>
				<div>
					<h3>Transformation</h3>
					<p>
						Select <code>http</code> for <code>.onion</code>; otherwise select <code>https</code>.
						Append the LUD-16 well-known path.
					</p>
					<h3>Validation</h3>
					<p class="success">✓ Endpoint resolved without an HTTP request</p>
				</div>
			</div>
			<div class="output">
				<h3>Output</h3>
				<dl>
					<dt>Scheme</dt>
					<dd>{endpoint.scheme}</dd>
					<dt>Resolved URL</dt>
					<dd class="break">{endpoint.url}</dd>
				</dl>
				<button onclick={runGet} disabled={loading}
					>{loading ? 'Requesting…' : 'GET LNURL-pay endpoint'}</button
				>
			</div>{:else}<p class="muted">Complete Step 1 and explicitly resolve the endpoint.</p>{/if}
	</section>
	<section>
		<h2><span>3</span> Fetch and validate LNURL-pay response</h2>
		{#if http}<h3>HTTP request</h3>
			<dl>
				<dt>Method</dt>
				<dd>{http.method}</dd>
				<dt>Request URL</dt>
				<dd class="break">{http.url}</dd>
			</dl>
			{#if http.error}<p class="errors" role="alert">
					✕ {http.error}
				</p>{/if}{#if http.status !== undefined}<h3>HTTP response</h3>
				<dl>
					<dt>Status</dt>
					<dd>{http.status}</dd>
					<dt>Status text</dt>
					<dd>{http.statusText || '(empty)'}</dd>
				</dl>{/if}
			<div class="raw-grid grid">
				<div>
					<h3>Raw response body</h3>
					<pre>{http.rawBody ?? '(unavailable)'}</pre>
				</div>
				<div>
					<h3>Parsed JSON</h3>
					<pre>{http.json === undefined ? '(unavailable)' : formattedJson(http.json)}</pre>
				</div>
			</div>
			{#if lud06?.kind === 'error'}<div class="result">
					<h3>LUD-06 error response</h3>
					<dl>
						<dt>Status</dt>
						<dd>{lud06.status}</dd>
						<dt>Reason</dt>
						<dd>{lud06.reason}</dd>
					</dl>
					<p>payRequest validation was not continued.</p>
				</div>
			{:else if lud06?.kind === 'payRequest'}<div class="result">
					<h3>LUD-06 validation: {lud06.valid ? 'Valid' : 'Invalid'}</h3>
					<ul class="checks">
						{#each lud06.items as item (item.label)}<li class:failed={!item.valid}>
								{item.valid ? '✓' : '✕'}
								{item.label}
							</li>{/each}
					</ul>
					<h3>Extracted output</h3>
					<dl>
						<dt>Callback</dt>
						<dd>{lud06.data.callback ?? '(unavailable)'}</dd>
						<dt>Minimum (msat)</dt>
						<dd>{lud06.data.minSendable ?? '(unavailable)'}</dd>
						<dt>Maximum (msat)</dt>
						<dd>{lud06.data.maxSendable ?? '(unavailable)'}</dd>
						<dt>allowsNostr</dt>
						<dd>{formattedJson(lud06.data.allowsNostr)}</dd>
						<dt>LNURL provider nostrPubkey</dt>
						<dd class="break">
							{typeof lud06.data.nostrPubkey === 'string'
								? lud06.data.nostrPubkey
								: '(unavailable)'}
						</dd>
					</dl>
					<div class="raw-grid grid">
						<div>
							<h3>Raw metadata string</h3>
							<pre>{lud06.data.metadata ?? '(unavailable)'}</pre>
						</div>
						<div>
							<h3>Parsed metadata</h3>
							<pre>{lud06.data.parsedMetadata === undefined
									? '(unavailable)'
									: formattedJson(lud06.data.parsedMetadata)}</pre>
						</div>
					</div>
				</div>{/if}
			{#if nip57}<div class="result">
					<h3>
						NIP-57 Zap support: {nip57.status === 'supported'
							? 'Supported'
							: nip57.status === 'not-supported'
								? 'Not supported'
								: 'Invalid advertisement'}
					</h3>
					{#if nip57.reason}<p><strong>Reason:</strong> {nip57.reason}</p>{/if}
					<ul class="checks">
						{#each nip57.items as item (item.label)}<li class:failed={!item.valid}>
								{item.valid ? '✓' : '✕'}
								{item.label}
							</li>{/each}
					</ul>
				</div>{/if}
		{:else}<p class="muted">
				Review the resolved URL in Step 2, then explicitly run the GET request.
			</p>{/if}
	</section>
	<section>
		<h2><span>4</span> Validate Zap Request parameters</h2>
		{#if zapReady()}
			<p class="notice">
				Recipient pubkey identifies the person receiving the zap. It is separate from the LNURL
				provider <code>nostrPubkey</code> shown in Step 3.
			</p>
			<div class="grid">
				<div>
					<h3>Input</h3>
					<label for="recipient-pubkey">Recipient pubkey (hex or npub)</label>
					<input
						id="recipient-pubkey"
						value={recipientInput}
						oninput={(event) => changeZapParameter('recipient', event.currentTarget.value)}
						placeholder="npub1… or 64-character lowercase hex"
						autocomplete="off"
						spellcheck="false"
					/>
					<label for="zap-amount">Amount (msat)</label>
					<input
						id="zap-amount"
						value={amountInput}
						oninput={(event) => changeZapParameter('amount', event.currentTarget.value)}
						placeholder={`${lud06?.kind === 'payRequest' ? lud06.data.minSendable : ''}`}
						inputmode="numeric"
						autocomplete="off"
					/>
					<label for="zap-relays">Zap Receipt relays (one per line)</label>
					<textarea
						id="zap-relays"
						value={relaysInput}
						oninput={(event) => changeZapParameter('relays', event.currentTarget.value)}
						placeholder="wss://relay.example"
						rows="4"
						spellcheck="false"></textarea>
					<label for="zap-comment">Comment (optional)</label>
					<textarea
						id="zap-comment"
						value={commentInput}
						oninput={(event) => changeZapParameter('comment', event.currentTarget.value)}
						rows="3"></textarea>
					<button onclick={validateZapParameters}>Validate parameters</button>
				</div>
				<div>
					<h3>Transformation</h3>
					<dl>
						<dt>Recipient input</dt>
						<dd class="break">{recipientResult?.input ?? '(not validated)'}</dd>
						<dt>Recipient normalized hex</dt>
						<dd class="break">{recipientResult?.normalized ?? '(unavailable)'}</dd>
						<dt>Amount input</dt>
						<dd>{amountResult?.input ?? '(not validated)'}</dd>
						<dt>Amount normalized (msat)</dt>
						<dd>{amountResult?.amount ?? '(unavailable)'}</dd>
						<dt>Parsed relays</dt>
						<dd class="break">
							{relayResult ? formattedJson(relayResult.relays) : '(not validated)'}
						</dd>
					</dl>
					<h3>Validation</h3>
					{#if recipientResult && amountResult && relayResult}
						<ul class="checks">
							{#each [...recipientResult.checks, ...amountResult.items, ...relayResult.items] as item (item.label)}<li
									class:failed={!item.valid}
								>
									{item.valid ? '✓' : '✕'}
									{item.label}
								</li>{/each}
						</ul>
					{:else}<p class="muted">Not run</p>{/if}
				</div>
			</div>
			{#if encodedLnurl}
				<div class="output">
					<h3>LNURL output</h3>
					<dl>
						<dt>LNURL-pay URL</dt>
						<dd class="break">{endpoint?.url}</dd>
						<dt>Bech32 LNURL</dt>
						<dd class="break">{encodedLnurl}</dd>
					</dl>
					<button onclick={buildRequest} disabled={!parametersValid()}>Build Zap Request</button>
				</div>
			{/if}
		{:else}
			<p class="muted">
				Step 4 requires a valid LUD-06 response, supported NIP-57 advertisement, callback, amount
				range, and LNURL-pay URL.
			</p>
		{/if}
	</section>
	<section>
		<h2><span>5</span> Build unsigned kind 9734</h2>
		{#if unsignedEvent}
			<div class="raw-grid grid">
				<div>
					<h3>NIP-07 signing input</h3>
					<pre>{formattedJson(unsignedEvent)}</pre>
				</div>
				<div>
					<h3>Validation</h3>
					<ul class="checks">
						{#each unsignedValidation ?? [] as item (item.label)}<li class:failed={!item.valid}>
								{item.valid ? '✓' : '✕'}
								{item.label}
							</li>{/each}
					</ul>
				</div>
			</div>
		{:else}<p class="muted">Validate Step 4, then explicitly build the Zap Request.</p>{/if}
	</section>
	<section>
		<h2><span>6</span> Sign Zap Request with NIP-07</h2>
		{#if unsignedEvent}
			<div class="grid">
				<div>
					<h3>Signer</h3>
					<p class:success={signerAvailable} class:errors={!signerAvailable}>
						{signerAvailable ? '✓ NIP-07 signer is available' : '✕ NIP-07 signer is not available'}
					</p>
					<button class="secondary" onclick={refreshSignerAvailability}
						>Check NIP-07 availability</button
					>
					<dl>
						<dt>Recipient pubkey</dt>
						<dd class="break">{recipientResult?.normalized}</dd>
					</dl>
					<button
						onclick={signRequest}
						disabled={!signerAvailable ||
							signing ||
							unsignedValidation?.some((item) => !item.valid)}
						>{signing ? 'Waiting for signer…' : 'Sign with NIP-07'}</button
					>
					{#if signError}<p class="errors" role="alert">
							✕ {signError}. The unsigned event is preserved; you can retry.
						</p>{/if}
				</div>
				<div>
					<h3>Unsigned event (preserved)</h3>
					<pre>{formattedJson(unsignedEvent)}</pre>
				</div>
			</div>
			{#if signedRaw !== undefined}
				<div class="result">
					<h3>Signed event raw JSON</h3>
					<pre>{formattedJson(signedRaw)}</pre>
				</div>
			{/if}
		{:else}<p class="muted">Build and validate an unsigned event in Step 5 first.</p>{/if}
	</section>
	<section>
		<h2><span>7</span> GET Zap callback</h2>
		{#if signedRaw !== undefined && amountResult?.amount !== undefined && encodedLnurl && lud06?.kind === 'payRequest' && lud06.data.callback}
			<div class="output">
				<h3>Callback input</h3>
				<dl>
					<dt>Callback URL</dt>
					<dd class="break">{lud06.data.callback}</dd>
					<dt>Amount (msat)</dt>
					<dd>{amountResult.amount}</dd>
					<dt>Encoded LNURL</dt>
					<dd class="break">{encodedLnurl}</dd>
				</dl>
				<h3>Signed Zap Request</h3>
				<pre>{formattedJson(signedRaw)}</pre>
				<button onclick={getCallback} disabled={callbackLoading}
					>{callbackLoading ? 'Requesting…' : 'GET callback'}</button
				>
			</div>
			{#if callbackRequestUrl}
				<div class="result">
					<h3>HTTP request</h3>
					<dl>
						<dt>Method</dt>
						<dd>GET</dd>
						<dt>Final request URL</dt>
						<dd class="break">{callbackRequestUrl}</dd>
					</dl>
					{#if callbackHttp}
						{#if callbackHttp.error}<p class="errors" role="alert">✕ {callbackHttp.error}</p>{/if}
						{#if callbackHttp.status !== undefined}
							<h3>HTTP response</h3>
							<dl>
								<dt>Status</dt>
								<dd>{callbackHttp.status}</dd>
								<dt>Status text</dt>
								<dd>{callbackHttp.statusText || '(empty)'}</dd>
							</dl>
						{/if}
						<div class="raw-grid grid">
							<div>
								<h3>Raw response body</h3>
								<pre>{callbackHttp.rawBody ?? '(unavailable)'}</pre>
							</div>
							<div>
								<h3>Parsed JSON</h3>
								<pre>{callbackHttp.json === undefined
										? '(unavailable)'
										: formattedJson(callbackHttp.json)}</pre>
							</div>
						</div>
						{#if callbackResult?.kind === 'invoice'}
							<h3>Lightning invoice (pr)</h3>
							<pre>{callbackResult.pr}</pre>
						{:else if callbackResult?.kind === 'error'}
							<h3>LUD-06 application error</h3>
							<dl>
								<dt>Reason</dt>
								<dd class="break">{callbackResult.reason}</dd>
							</dl>
						{:else if callbackResult?.kind === 'missing'}
							<p class="errors" role="alert">✕ Invoice not received: {callbackResult.reason}</p>
						{/if}
					{/if}
				</div>
			{/if}
		{:else}<p class="muted">
				Sign the Zap Request in Step 6 first. The callback is only requested when you explicitly
				continue.
			</p>{/if}
	</section>
	<section>
		<h2><span>8</span> Inspect BOLT11 invoice amount</h2>
		{#if callbackResult?.kind === 'invoice' && amountResult?.amount !== undefined}
			<div class="grid">
				<div>
					<h3>Input</h3>
					<dl>
						<dt>Lightning invoice (pr)</dt>
						<dd class="break">{callbackResult.pr}</dd>
						<dt>Requested amount (msat)</dt>
						<dd>{amountResult.amount}</dd>
					</dl>
					<button onclick={decodeInvoice}>Decode invoice</button>
				</div>
				<div>
					<h3>Decode result</h3>
					{#if invoiceAmountResult?.status === 'failure'}
						<p class="errors" role="alert">
							✕ BOLT11 amount decode failed: {invoiceAmountResult.reason}
						</p>
					{:else if invoiceAmountResult}
						<dl>
							<dt>Network / prefix</dt>
							<dd>{invoiceAmountResult.network} / {invoiceAmountResult.prefix}</dd>
							<dt>Invoice amount (msat)</dt>
							<dd>
								{invoiceAmountResult.status === 'specified'
									? invoiceAmountResult.amountMsat.toString()
									: '(unspecified)'}
							</dd>
							<dt>Requested amount (msat)</dt>
							<dd>{amountResult.amount}</dd>
							<dt>Amount comparison</dt>
							<dd>
								{#if invoiceAmountResult.status === 'unspecified'}
									<span class="errors">✕ Invoice amount is unspecified</span>
								{:else if invoiceAmountResult.amountMsat === BigInt(amountResult.amount)}
									<span class="success">✓ Invoice amount matches requested amount</span>
								{:else}
									<span class="errors">✕ Invoice amount does not match requested amount</span>
								{/if}
							</dd>
						</dl>
					{:else}<p class="muted">Not run</p>{/if}
				</div>
			</div>
		{:else}<p class="muted">Get a Lightning invoice from the callback in Step 7 first.</p>{/if}
	</section>
	<section>
		<h2><span>9</span> Verify invoice description hash</h2>
		{#if callbackResult?.kind === 'invoice' && callbackZapRequestJson !== undefined && invoiceAmountResult && invoiceAmountResult.status !== 'failure'}
			<div class="grid">
				<div>
					<h3>Input</h3>
					<dl>
						<dt>Lightning invoice</dt>
						<dd class="break">{callbackResult.pr}</dd>
					</dl>
					<h3>Zap Request JSON actually sent in Step 7</h3>
					<pre>{callbackZapRequestJson}</pre>
					<button onclick={verifyDescriptionHash} disabled={descriptionHashLoading}
						>{descriptionHashLoading ? 'Verifying…' : 'Verify description hash'}</button
					>
				</div>
				<div>
					<h3>Verification result</h3>
					{#if descriptionHashResult?.status === 'failure'}
						<p class="errors" role="alert">✕ {descriptionHashResult.reason}</p>
					{:else if descriptionHashResult}
						<dl>
							<dt>Invoice description hash (h)</dt>
							<dd class="break">{descriptionHashResult.invoiceHashHex}</dd>
							<dt>SHA-256 of the sent Zap Request JSON</dt>
							<dd class="break">{descriptionHashResult.calculatedHashHex}</dd>
							<dt>Comparison</dt>
							<dd>
								{#if descriptionHashResult.status === 'match'}
									<span class="success">✓ Invoice description hash matches Zap Request</span>
								{:else}
									<span class="errors">✕ Invoice description hash does not match Zap Request</span>
								{/if}
							</dd>
						</dl>
					{:else}<p class="muted">Not run</p>{/if}
				</div>
			</div>
		{:else}<p class="muted">Decode the Lightning invoice in Step 8 first.</p>{/if}
	</section>
	<section>
		<h2><span>10</span> Pay invoice</h2>
		{#if paymentReady() && callbackResult?.kind === 'invoice' && invoiceAmountResult?.status === 'specified'}
			{@const handoff = createPaymentHandoffValues(callbackResult.pr)}
			<p>Pay this invoice with your Lightning wallet, then continue to the next step.</p>
			<div class="grid">
				<div>
					<h3>Payment handoff</h3>
					<dl>
						<dt>Amount (msat)</dt>
						<dd>{invoiceAmountResult.amountMsat.toString()}</dd>
						<dt>Lightning invoice</dt>
						<dd class="break">{callbackResult.pr}</dd>
					</dl>
					<div class="actions">
						<button onclick={() => copyInvoice(handoff.clipboardValue)}>Copy invoice</button>
						<!-- A custom protocol URI must not be rewritten as an application route. -->
						<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
						<a class="button secondary" href={handoff.openWalletUri}>Open wallet</a>
					</div>
					{#if copyStatus === 'copied'}
						<p class="success" role="status">✓ Copied</p>
					{:else if copyStatus === 'failed'}
						<p class="errors" role="alert">✕ Failed to copy invoice</p>
					{/if}
				</div>
				<div>
					<h3>QR code</h3>
					<div class="qr"><InvoiceQr payload={handoff.qrPayload} /></div>
					<dl>
						<dt>QR payload</dt>
						<dd class="break">{handoff.qrPayload}</dd>
					</dl>
				</div>
			</div>
			<p class="notice">After paying the invoice, continue by waiting for the Zap Receipt.</p>
		{:else}
			<p class="muted">
				Payment handoff is available only after the invoice amount and description hash both match.
			</p>
		{/if}
	</section>
	<section>
		<h2><span>11</span> Wait for Zap Receipt</h2>
		{#if receiptReady() && callbackResult?.kind === 'invoice'}
			<p class="notice">
				This step discovers unverified candidates. It does not validate Zap Receipt IDs, signatures,
				authors, or tags.
			</p>
			<div class="grid">
				<div>
					<h3>Subscription input</h3>
					<dl>
						<dt>Recipient pubkey</dt>
						<dd class="break">{receiptRecipient()}</dd>
						<dt>Current invoice</dt>
						<dd class="break">{callbackResult.pr}</dd>
						<dt>Since (signed Zap Request created_at)</dt>
						<dd>{receiptCreatedAt()}</dd>
						<dt>Relays from signed Zap Request</dt>
						<dd><pre>{formattedJson(receiptRelays())}</pre></dd>
					</dl>
					{#if receiptState.waiting}
						<button onclick={stopReceiptSubscription}>Stop waiting</button>
					{:else}
						<button onclick={startReceiptSubscription}>Wait for Zap Receipt</button>
					{/if}
				</div>
				<div>
					<h3>Relay status</h3>
					{#if receiptState.relays.length === 0}
						<p class="muted">Not started</p>
					{:else}
						{#each receiptState.relays as relay (relay.relay)}
							<div class="result">
								<strong class="break">{relay.relay}</strong>
								<p>
									{relay.state === 'subscribed' ? 'Connected · Subscribed' : relay.state}
									{relay.eose ? ' · EOSE' : ''}
								</p>
								{#if relay.notice}<p>NOTICE: {relay.notice}</p>{/if}
								{#if relay.closedMessage}<p>CLOSED: {relay.closedMessage}</p>{/if}
								{#if relay.error}<p class="errors">{relay.error}</p>{/if}
							</div>
						{/each}
					{/if}
				</div>
			</div>
			<div class="output">
				<h3>Candidate Zap Receipts</h3>
				{#if receiptState.candidates.length === 0}
					<p class="muted">No candidate Zap Receipt received yet</p>
				{:else}
					{#each receiptState.candidates as candidate, index (candidate.key)}
						<div class="result">
							<h3>Candidate Zap Receipt {index + 1}</h3>
							<dl>
								<dt>Event ID</dt>
								<dd class="break">
									{typeof candidate.event.id === 'string'
										? candidate.event.id
										: '(missing or malformed)'}
								</dd>
								<dt>Received from</dt>
								<dd><pre>{candidate.sourceRelays.join('\n')}</pre></dd>
							</dl>
							<h3>Raw event</h3>
							<pre>{formattedJson(candidate.event)}</pre>
						</div>
					{/each}
				{/if}
			</div>
		{:else}
			<p class="muted">
				Step 11 requires the verified payment handoff, signed Zap Request, recipient p tag, and at
				least one relay from its relays tag.
			</p>
		{/if}
	</section>
</main>
