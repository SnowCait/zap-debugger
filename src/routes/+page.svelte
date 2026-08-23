<script lang="ts">
	import { onMount } from 'svelte';
	import { fetchLnurlPay, type HttpInspection } from '$lib/protocol/http';
	import { encodeLnurl } from '$lib/protocol/lnurl-bech32';
	import {
		parseLightningAddress,
		type AddressParseResult,
		type LightningAddress
	} from '$lib/protocol/lightning-address';
	import { validateLud06, type Lud06Result } from '$lib/protocol/lud06';
	import { resolveLnurlPayEndpoint, type LnurlPayEndpoint } from '$lib/protocol/lud16';
	import { validateNip57, type Nip57Result } from '$lib/protocol/nip57';
	import { getNip07Signer, requestPublicKey, requestSignature } from '$lib/protocol/nip07';
	import {
		isValidXOnlyPubkey,
		parseRecipientPubkey,
		type RecipientPubkeyResult
	} from '$lib/protocol/nostr-key';
	import type { UnsignedNostrEvent } from '$lib/protocol/nostr-event';
	import { validateSignedEvent, type SignedEventValidation } from '$lib/protocol/signed-event';
	import {
		parseRelays,
		validateZapAmount,
		type AmountValidation,
		type RelayValidation
	} from '$lib/protocol/zap-parameters';
	import { buildZapRequest, validateZapRequest } from '$lib/protocol/zap-request';
	import type { ValidationItem } from '$lib/protocol/validation';

	let input = $state('');
	let addressResult = $state<AddressParseResult>();
	let address = $state<LightningAddress>();
	let endpoint = $state<LnurlPayEndpoint>();
	let http = $state<HttpInspection>();
	let lud06 = $state<Lud06Result>();
	let nip57 = $state<Nip57Result>();
	let loading = $state(false);
	let recipientInput = $state('');
	let amountInput = $state('');
	let relaysInput = $state('');
	let commentInput = $state('');
	let recipientResult = $state<RecipientPubkeyResult>();
	let amountResult = $state<AmountValidation>();
	let relayResult = $state<RelayValidation>();
	let encodedLnurl = $state<string>();
	let unsignedEvent = $state<UnsignedNostrEvent>();
	let unsignedValidation = $state<ValidationItem[]>();
	let signerAvailable = $state(false);
	let senderPubkey = $state<string>();
	let senderPubkeyValid = $state(false);
	let signing = $state(false);
	let signError = $state<string>();
	let signedRaw = $state<unknown>();
	let signedValidation = $state<SignedEventValidation>();

	onMount(() => {
		refreshSignerAvailability();
	});
	function refreshSignerAvailability() {
		signerAvailable = getNip07Signer() !== undefined;
		if (!signerAvailable) signError = 'NIP-07 signer is not available';
		else if (signError === 'NIP-07 signer is not available') signError = undefined;
	}

	function resetSigned() {
		senderPubkey = undefined;
		senderPubkeyValid = false;
		signError = undefined;
		signedRaw = undefined;
		signedValidation = undefined;
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
		http = undefined;
		lud06 = undefined;
		nip57 = undefined;
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
		loading = true;
		resetFetch();
		http = await fetchLnurlPay(endpoint.url);
		if (http.json !== undefined) {
			lud06 = validateLud06(http.json);
			if (lud06.kind === 'payRequest' && lud06.valid) nip57 = validateNip57(http.json);
		}
		loading = false;
	}
	function changeZapParameter(field: 'recipient' | 'amount' | 'relays' | 'comment', value: string) {
		if (field === 'recipient') recipientInput = value;
		if (field === 'amount') amountInput = value;
		if (field === 'relays') relaysInput = value;
		if (field === 'comment') commentInput = value;
		resetZap();
	}
	function validateZapParameters() {
		if (lud06?.kind !== 'payRequest' || !lud06.valid || nip57?.status !== 'supported' || !endpoint)
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
		signing = true;
		signError = undefined;
		signedRaw = undefined;
		signedValidation = undefined;
		try {
			const pubkey = await requestPublicKey(signer);
			senderPubkey = pubkey;
			senderPubkeyValid = isValidXOnlyPubkey(pubkey);
			if (!senderPubkeyValid)
				throw new Error('NIP-07 getPublicKey() returned an invalid NIP-01 public key');
			const { result, expectedUnsigned } = await requestSignature(signer, unsignedEvent);
			signedRaw = result;
			signedValidation = validateSignedEvent(result, expectedUnsigned, pubkey);
		} catch (error) {
			signError = error instanceof Error ? error.message : String(error);
		} finally {
			signing = false;
		}
	}
	const formattedJson = (value: unknown) => JSON.stringify(value, null, 2);
	const zapReady = () =>
		lud06?.kind === 'payRequest' &&
		lud06.valid &&
		nip57?.status === 'supported' &&
		endpoint !== undefined &&
		lud06.data.callback !== undefined &&
		lud06.data.minSendable !== undefined &&
		lud06.data.maxSendable !== undefined;
	const parametersValid = () =>
		recipientResult?.valid === true &&
		amountResult?.valid === true &&
		relayResult?.valid === true &&
		encodedLnurl !== undefined;
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
		<h2><span>6</span> Sign and validate with NIP-07</h2>
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
						<dt>Sender pubkey</dt>
						<dd class="break">{senderPubkey ?? '(not requested)'}</dd>
						<dt>Sender pubkey valid</dt>
						<dd>{senderPubkey ? (senderPubkeyValid ? 'Yes' : 'No') : '(not checked)'}</dd>
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
				<div class="raw-grid result grid">
					<div>
						<h3>Signed event raw JSON</h3>
						<pre>{formattedJson(signedRaw)}</pre>
					</div>
					<div>
						<h3>Independent validation</h3>
						<ul class="checks">
							{#each signedValidation?.items ?? [] as item (item.label)}<li
									class:failed={!item.valid}
								>
									{item.valid ? '✓' : '✕'}
									{item.label}
								</li>{/each}
						</ul>
						<h3>Calculated event id</h3>
						<pre>{signedValidation?.calculatedId ?? '(unavailable)'}</pre>
					</div>
				</div>
			{/if}
		{:else}<p class="muted">Build and validate an unsigned event in Step 5 first.</p>{/if}
	</section>
</main>
