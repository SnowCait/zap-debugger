<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import InvoiceQr from '$lib/InvoiceQr.svelte';
	import { createPaymentHandoffValues } from '$lib/protocol/payment-handoff';
	import {
		calculateZapReceiptSince,
		RECEIPT_CLOCK_SKEW_MARGIN_SECONDS
	} from '$lib/protocol/zap-receipt-subscription';
	import { createZapDebuggerState } from '$lib/zap-debugger-state.svelte';

	const debuggerState = createZapDebuggerState();

	onMount(debuggerState.refreshSignerAvailability);
	onDestroy(debuggerState.dispose);
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
					value={debuggerState.input}
					oninput={(event) => debuggerState.changeInput(event.currentTarget.value)}
					placeholder="alice@example.com"
					autocomplete="off"
					spellcheck="false"
				/><button onclick={debuggerState.validateAddress} disabled={!debuggerState.input}
					>Validate address</button
				>
			</div>
			<div>
				<h3>Transformation</h3>
				<p>
					Split at <code>@</code> without normalizing or silently correcting the input.
				</p>
				<h3>Validation</h3>
				{#if debuggerState.addressResult?.valid}<p class="success">
						✓ Valid LUD-16 Lightning Address
					</p>{:else if debuggerState.addressResult}<ul class="errors">
						{#each debuggerState.addressResult.errors as error (error)}<li>✕ {error}</li>{/each}
					</ul>{:else}<p class="muted">Not run</p>{/if}
			</div>
		</div>
		{#if debuggerState.address}<div class="output">
				<h3>Output</h3>
				<dl>
					<dt>Lightning Address</dt>
					<dd>{debuggerState.address.address}</dd>
					<dt>Username</dt>
					<dd>{debuggerState.address.username}</dd>
					<dt>Domain</dt>
					<dd>{debuggerState.address.domain}</dd>
				</dl>
				<button onclick={debuggerState.resolveEndpoint}>Resolve LNURL-pay endpoint</button>
			</div>{/if}
	</section>
	<section>
		<h2><span>2</span> Resolve LNURL-pay endpoint</h2>
		{#if debuggerState.endpoint}<div class="grid">
				<div>
					<h3>Input</h3>
					<dl>
						<dt>Lightning Address</dt>
						<dd>{debuggerState.endpoint.address}</dd>
						<dt>Username</dt>
						<dd>{debuggerState.endpoint.username}</dd>
						<dt>Domain</dt>
						<dd>{debuggerState.endpoint.domain}</dd>
					</dl>
				</div>
				<div>
					<h3>Transformation</h3>
					<p>
						Select <code>http</code> for <code>.onion</code>; otherwise select
						<code>https</code>. Append the LUD-16 well-known path.
					</p>
					<h3>Validation</h3>
					<p class="success">✓ Endpoint resolved without an HTTP request</p>
				</div>
			</div>
			<div class="output">
				<h3>Output</h3>
				<dl>
					<dt>Scheme</dt>
					<dd>{debuggerState.endpoint.scheme}</dd>
					<dt>Resolved URL</dt>
					<dd class="break">{debuggerState.endpoint.url}</dd>
				</dl>
				<button onclick={debuggerState.runGet} disabled={debuggerState.loading}
					>{debuggerState.loading ? 'Requesting…' : 'GET LNURL-pay endpoint'}</button
				>
			</div>{:else}<p class="muted">Complete Step 1 and explicitly resolve the endpoint.</p>{/if}
	</section>
	<section>
		<h2><span>3</span> Fetch and validate LNURL-pay response</h2>
		{#if debuggerState.http}<h3>HTTP request</h3>
			<dl>
				<dt>Method</dt>
				<dd>{debuggerState.http.method}</dd>
				<dt>Request URL</dt>
				<dd class="break">{debuggerState.http.url}</dd>
			</dl>
			{#if debuggerState.http.error}<p class="errors" role="alert">
					✕ {debuggerState.http.error}
				</p>{/if}{#if debuggerState.http.status !== undefined}<h3>HTTP response</h3>
				<dl>
					<dt>Status</dt>
					<dd>{debuggerState.http.status}</dd>
					<dt>Status text</dt>
					<dd>{debuggerState.http.statusText || '(empty)'}</dd>
				</dl>{/if}
			<div class="raw-grid grid">
				<div>
					<h3>Raw response body</h3>
					<pre>{debuggerState.http.rawBody ?? '(unavailable)'}</pre>
				</div>
				<div>
					<h3>Parsed JSON</h3>
					<pre>{debuggerState.http.json === undefined
							? '(unavailable)'
							: debuggerState.formattedJson(debuggerState.http.json)}</pre>
				</div>
			</div>
			{#if debuggerState.lud06?.kind === 'error'}<div class="result">
					<h3>LUD-06 error response</h3>
					<dl>
						<dt>Status</dt>
						<dd>{debuggerState.lud06.status}</dd>
						<dt>Reason</dt>
						<dd>{debuggerState.lud06.reason}</dd>
					</dl>
					<p>payRequest validation was not continued.</p>
				</div>
			{:else if debuggerState.lud06?.kind === 'payRequest'}<div class="result">
					<h3>LUD-06 validation: {debuggerState.lud06.valid ? 'Valid' : 'Invalid'}</h3>
					<ul class="checks">
						{#each debuggerState.lud06.items as item (item.label)}<li class:failed={!item.valid}>
								{item.valid ? '✓' : '✕'}
								{item.label}
							</li>{/each}
					</ul>
					<h3>Extracted output</h3>
					<dl>
						<dt>Callback</dt>
						<dd>{debuggerState.lud06.data.callback ?? '(unavailable)'}</dd>
						<dt>Minimum (msat)</dt>
						<dd>{debuggerState.lud06.data.minSendable ?? '(unavailable)'}</dd>
						<dt>Maximum (msat)</dt>
						<dd>{debuggerState.lud06.data.maxSendable ?? '(unavailable)'}</dd>
						<dt>allowsNostr</dt>
						<dd>{debuggerState.formattedJson(debuggerState.lud06.data.allowsNostr)}</dd>
						<dt>LNURL provider nostrPubkey</dt>
						<dd class="break">
							{typeof debuggerState.lud06.data.nostrPubkey === 'string'
								? debuggerState.lud06.data.nostrPubkey
								: '(unavailable)'}
						</dd>
					</dl>
					<div class="raw-grid grid">
						<div>
							<h3>Raw metadata string</h3>
							<pre>{debuggerState.lud06.data.metadata ?? '(unavailable)'}</pre>
						</div>
						<div>
							<h3>Parsed metadata</h3>
							<pre>{debuggerState.lud06.data.parsedMetadata === undefined
									? '(unavailable)'
									: debuggerState.formattedJson(debuggerState.lud06.data.parsedMetadata)}</pre>
						</div>
					</div>
				</div>{/if}
			{#if debuggerState.nip57}<div class="result">
					<h3>
						NIP-57 Zap support: {debuggerState.nip57.status === 'supported'
							? 'Supported'
							: debuggerState.nip57.status === 'not-supported'
								? 'Not supported'
								: 'Invalid advertisement'}
					</h3>
					{#if debuggerState.nip57.reason}<p>
							<strong>Reason:</strong>
							{debuggerState.nip57.reason}
						</p>{/if}
					<ul class="checks">
						{#each debuggerState.nip57.items as item (item.label)}<li class:failed={!item.valid}>
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
		{#if debuggerState.zapReady()}
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
						value={debuggerState.recipientInput}
						oninput={(event) =>
							debuggerState.changeZapParameter('recipient', event.currentTarget.value)}
						placeholder="npub1… or 64-character lowercase hex"
						autocomplete="off"
						spellcheck="false"
					/>
					<label for="zap-amount">Amount (msat)</label>
					<input
						id="zap-amount"
						value={debuggerState.amountInput}
						oninput={(event) =>
							debuggerState.changeZapParameter('amount', event.currentTarget.value)}
						placeholder={`${debuggerState.lud06?.kind === 'payRequest' ? debuggerState.lud06.data.minSendable : ''}`}
						inputmode="numeric"
						autocomplete="off"
					/>
					<label for="zap-relays">Zap Receipt relays (one per line)</label>
					<textarea
						id="zap-relays"
						value={debuggerState.relaysInput}
						oninput={(event) =>
							debuggerState.changeZapParameter('relays', event.currentTarget.value)}
						placeholder="wss://relay.example"
						rows="4"
						spellcheck="false"></textarea>
					<label for="zap-comment">Comment (optional)</label>
					<textarea
						id="zap-comment"
						value={debuggerState.commentInput}
						oninput={(event) =>
							debuggerState.changeZapParameter('comment', event.currentTarget.value)}
						rows="3"></textarea>
					<button onclick={debuggerState.validateZapParameters}>Validate parameters</button>
				</div>
				<div>
					<h3>Transformation</h3>
					<dl>
						<dt>Recipient input</dt>
						<dd class="break">{debuggerState.recipientResult?.input ?? '(not validated)'}</dd>
						<dt>Recipient normalized hex</dt>
						<dd class="break">{debuggerState.recipientResult?.normalized ?? '(unavailable)'}</dd>
						<dt>Amount input</dt>
						<dd>{debuggerState.amountResult?.input ?? '(not validated)'}</dd>
						<dt>Amount normalized (msat)</dt>
						<dd>{debuggerState.amountResult?.amount ?? '(unavailable)'}</dd>
						<dt>Parsed relays</dt>
						<dd class="break">
							{debuggerState.relayResult
								? debuggerState.formattedJson(debuggerState.relayResult.relays)
								: '(not validated)'}
						</dd>
					</dl>
					<h3>Validation</h3>
					{#if debuggerState.recipientResult && debuggerState.amountResult && debuggerState.relayResult}
						<ul class="checks">
							{#each [...debuggerState.recipientResult.checks, ...debuggerState.amountResult.items, ...debuggerState.relayResult.items] as item (item.label)}<li
									class:failed={!item.valid}
								>
									{item.valid ? '✓' : '✕'}
									{item.label}
								</li>{/each}
						</ul>
					{:else}<p class="muted">Not run</p>{/if}
				</div>
			</div>
			{#if debuggerState.encodedLnurl}
				<div class="output">
					<h3>LNURL output</h3>
					<dl>
						<dt>LNURL-pay URL</dt>
						<dd class="break">{debuggerState.endpoint?.url}</dd>
						<dt>Bech32 LNURL</dt>
						<dd class="break">{debuggerState.encodedLnurl}</dd>
					</dl>
					<button onclick={debuggerState.buildRequest} disabled={!debuggerState.parametersValid()}
						>Build Zap Request</button
					>
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
		{#if debuggerState.unsignedEvent}
			<div class="raw-grid grid">
				<div>
					<h3>NIP-07 signing input</h3>
					<pre>{debuggerState.formattedJson(debuggerState.unsignedEvent)}</pre>
				</div>
				<div>
					<h3>Validation</h3>
					<ul class="checks">
						{#each debuggerState.unsignedValidation ?? [] as item (item.label)}<li
								class:failed={!item.valid}
							>
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
		{#if debuggerState.unsignedEvent}
			<div class="grid">
				<div>
					<h3>Signer</h3>
					<p
						class:success={debuggerState.signerAvailable}
						class:errors={!debuggerState.signerAvailable}
					>
						{debuggerState.signerAvailable
							? '✓ NIP-07 signer is available'
							: '✕ NIP-07 signer is not available'}
					</p>
					<button class="secondary" onclick={debuggerState.refreshSignerAvailability}
						>Check NIP-07 availability</button
					>
					<dl>
						<dt>Recipient pubkey</dt>
						<dd class="break">{debuggerState.recipientResult?.normalized}</dd>
					</dl>
					<button
						onclick={debuggerState.signRequest}
						disabled={!debuggerState.signerAvailable ||
							debuggerState.signing ||
							debuggerState.unsignedValidation?.some((item) => !item.valid)}
						>{debuggerState.signing ? 'Waiting for signer…' : 'Sign with NIP-07'}</button
					>
					{#if debuggerState.signError}<p class="errors" role="alert">
							✕ {debuggerState.signError}. The unsigned event is preserved; you can retry.
						</p>{/if}
				</div>
				<div>
					<h3>Unsigned event (preserved)</h3>
					<pre>{debuggerState.formattedJson(debuggerState.unsignedEvent)}</pre>
				</div>
			</div>
			{#if debuggerState.signedRaw !== undefined}
				<div class="result">
					<h3>Signed event raw JSON</h3>
					<pre>{debuggerState.formattedJson(debuggerState.signedRaw)}</pre>
				</div>
			{/if}
		{:else}<p class="muted">Build and validate an unsigned event in Step 5 first.</p>{/if}
	</section>
	<section>
		<h2><span>7</span> GET Zap callback</h2>
		{#if debuggerState.signedRaw !== undefined && debuggerState.amountResult?.amount !== undefined && debuggerState.encodedLnurl && debuggerState.lud06?.kind === 'payRequest' && debuggerState.lud06.data.callback}
			<div class="output">
				<h3>Callback input</h3>
				<dl>
					<dt>Callback URL</dt>
					<dd class="break">{debuggerState.lud06.data.callback}</dd>
					<dt>Amount (msat)</dt>
					<dd>{debuggerState.amountResult.amount}</dd>
					<dt>Encoded LNURL</dt>
					<dd class="break">{debuggerState.encodedLnurl}</dd>
				</dl>
				<h3>Signed Zap Request</h3>
				<pre>{debuggerState.formattedJson(debuggerState.signedRaw)}</pre>
				<button onclick={debuggerState.getCallback} disabled={debuggerState.callbackLoading}
					>{debuggerState.callbackLoading ? 'Requesting…' : 'GET callback'}</button
				>
			</div>
			{#if debuggerState.callbackRequestUrl}
				<div class="result">
					<h3>HTTP request</h3>
					<dl>
						<dt>Method</dt>
						<dd>GET</dd>
						<dt>Final request URL</dt>
						<dd class="break">{debuggerState.callbackRequestUrl}</dd>
					</dl>
					{#if debuggerState.callbackHttp}
						{#if debuggerState.callbackHttp.error}<p class="errors" role="alert">
								✕ {debuggerState.callbackHttp.error}
							</p>{/if}
						{#if debuggerState.callbackHttp.status !== undefined}
							<h3>HTTP response</h3>
							<dl>
								<dt>Status</dt>
								<dd>{debuggerState.callbackHttp.status}</dd>
								<dt>Status text</dt>
								<dd>{debuggerState.callbackHttp.statusText || '(empty)'}</dd>
							</dl>
						{/if}
						<div class="raw-grid grid">
							<div>
								<h3>Raw response body</h3>
								<pre>{debuggerState.callbackHttp.rawBody ?? '(unavailable)'}</pre>
							</div>
							<div>
								<h3>Parsed JSON</h3>
								<pre>{debuggerState.callbackHttp.json === undefined
										? '(unavailable)'
										: debuggerState.formattedJson(debuggerState.callbackHttp.json)}</pre>
							</div>
						</div>
						{#if debuggerState.callbackResult?.kind === 'invoice'}
							<h3>Lightning invoice (pr)</h3>
							<pre>{debuggerState.callbackResult.pr}</pre>
						{:else if debuggerState.callbackResult?.kind === 'error'}
							<h3>LUD-06 application error</h3>
							<dl>
								<dt>Reason</dt>
								<dd class="break">{debuggerState.callbackResult.reason}</dd>
							</dl>
						{:else if debuggerState.callbackResult?.kind === 'missing'}
							<p class="errors" role="alert">
								✕ Invoice not received: {debuggerState.callbackResult.reason}
							</p>
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
		{#if debuggerState.callbackResult?.kind === 'invoice' && debuggerState.amountResult?.amount !== undefined}
			<div class="grid">
				<div>
					<h3>Input</h3>
					<dl>
						<dt>Lightning invoice (pr)</dt>
						<dd class="break">{debuggerState.callbackResult.pr}</dd>
						<dt>Requested amount (msat)</dt>
						<dd>{debuggerState.amountResult.amount}</dd>
					</dl>
					<button onclick={debuggerState.decodeInvoice}>Decode invoice</button>
				</div>
				<div>
					<h3>Decode result</h3>
					{#if debuggerState.invoiceAmountResult?.status === 'failure'}
						<p class="errors" role="alert">
							✕ BOLT11 amount decode failed: {debuggerState.invoiceAmountResult.reason}
						</p>
					{:else if debuggerState.invoiceAmountResult}
						<dl>
							<dt>Network / prefix</dt>
							<dd>
								{debuggerState.invoiceAmountResult.network} / {debuggerState.invoiceAmountResult
									.prefix}
							</dd>
							<dt>Invoice amount (msat)</dt>
							<dd>
								{debuggerState.invoiceAmountResult.status === 'specified'
									? debuggerState.invoiceAmountResult.amountMsat.toString()
									: '(unspecified)'}
							</dd>
							<dt>Requested amount (msat)</dt>
							<dd>{debuggerState.amountResult.amount}</dd>
							<dt>Amount comparison</dt>
							<dd>
								{#if debuggerState.invoiceAmountResult.status === 'unspecified'}
									<span class="errors">✕ Invoice amount is unspecified</span>
								{:else if debuggerState.invoiceAmountResult.amountMsat === BigInt(debuggerState.amountResult.amount)}
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
		{#if debuggerState.callbackResult?.kind === 'invoice' && debuggerState.callbackZapRequestJson !== undefined && debuggerState.invoiceAmountResult && debuggerState.invoiceAmountResult.status !== 'failure'}
			<div class="grid">
				<div>
					<h3>Input</h3>
					<dl>
						<dt>Lightning invoice</dt>
						<dd class="break">{debuggerState.callbackResult.pr}</dd>
					</dl>
					<h3>Zap Request JSON actually sent in Step 7</h3>
					<pre>{debuggerState.callbackZapRequestJson}</pre>
					<button
						onclick={debuggerState.verifyDescriptionHash}
						disabled={debuggerState.descriptionHashLoading}
						>{debuggerState.descriptionHashLoading
							? 'Verifying…'
							: 'Verify description hash'}</button
					>
				</div>
				<div>
					<h3>Verification result</h3>
					{#if debuggerState.descriptionHashResult?.status === 'failure'}
						<p class="errors" role="alert">✕ {debuggerState.descriptionHashResult.reason}</p>
					{:else if debuggerState.descriptionHashResult}
						<dl>
							<dt>Invoice description hash (h)</dt>
							<dd class="break">{debuggerState.descriptionHashResult.invoiceHashHex}</dd>
							<dt>SHA-256 of the sent Zap Request JSON</dt>
							<dd class="break">{debuggerState.descriptionHashResult.calculatedHashHex}</dd>
							<dt>Comparison</dt>
							<dd>
								{#if debuggerState.descriptionHashResult.status === 'match'}
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
		{#if debuggerState.paymentReady() && debuggerState.callbackResult?.kind === 'invoice' && debuggerState.invoiceAmountResult?.status === 'specified'}
			{@const handoff = createPaymentHandoffValues(debuggerState.callbackResult.pr)}
			<p>Pay this invoice with your Lightning wallet, then continue to the next step.</p>
			<div class="grid">
				<div>
					<h3>Payment handoff</h3>
					<dl>
						<dt>Amount (msat)</dt>
						<dd>{debuggerState.invoiceAmountResult.amountMsat.toString()}</dd>
						<dt>Lightning invoice</dt>
						<dd class="break">{debuggerState.callbackResult.pr}</dd>
					</dl>
					<div class="actions">
						<button onclick={() => debuggerState.copyInvoice(handoff.clipboardValue)}
							>Copy invoice</button
						>
						<!-- A custom protocol URI must not be rewritten as an application route. -->
						<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
						<a class="button secondary" href={handoff.openWalletUri}>Open wallet</a>
					</div>
					{#if debuggerState.copyStatus === 'copied'}
						<p class="success" role="status">✓ Copied</p>
					{:else if debuggerState.copyStatus === 'failed'}
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
		{#if debuggerState.receiptReady() && debuggerState.callbackResult?.kind === 'invoice'}
			<p class="notice">
				This step discovers unverified candidates. It does not validate Zap Receipt IDs, signatures,
				authors, or tags.
			</p>
			<div class="grid">
				<div>
					<h3>Subscription input</h3>
					<dl>
						<dt>Recipient pubkey</dt>
						<dd class="break">{debuggerState.receiptRecipient()}</dd>
						<dt>Current invoice</dt>
						<dd class="break">{debuggerState.callbackResult.pr}</dd>
						<dt>Signed Zap Request created_at</dt>
						<dd>{debuggerState.receiptCreatedAt()}</dd>
						<dt>Clock-skew margin</dt>
						<dd>{RECEIPT_CLOCK_SKEW_MARGIN_SECONDS} seconds</dd>
						<dt>REQ since</dt>
						<dd>{calculateZapReceiptSince(debuggerState.receiptCreatedAt() ?? 0)}</dd>
						<dt>Relays from signed Zap Request</dt>
						<dd><pre>{debuggerState.formattedJson(debuggerState.receiptRelays())}</pre></dd>
					</dl>
					{#if debuggerState.receiptState.waiting}
						<button onclick={debuggerState.stopReceiptSubscription}>Stop waiting</button>
					{:else}
						<button onclick={debuggerState.startReceiptSubscription}>Wait for Zap Receipt</button>
					{/if}
				</div>
				<div>
					<h3>Relay status</h3>
					{#if debuggerState.receiptState.relays.length === 0}
						<p class="muted">Not started</p>
					{:else}
						{#each debuggerState.receiptState.relays as relay (relay.relay)}
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
				{#if debuggerState.receiptState.candidates.length === 0}
					<p class="muted">No candidate Zap Receipt received yet</p>
				{:else}
					{#each debuggerState.receiptState.candidates as candidate, index (candidate.key)}
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
							<pre>{debuggerState.formattedJson(candidate.event)}</pre>
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
	<section>
		<h2><span>12</span> Validate Zap Receipt</h2>
		{#if debuggerState.receiptValidationReady()}
			<p class="notice">
				Validation starts only when requested. Candidate IDs are not trusted: each event ID and
				signature are independently verified.
			</p>
			{#each debuggerState.receiptState.candidates as candidate, index (candidate.key)}
				{@const validation = debuggerState.receiptValidations[candidate.key]}
				<div class="result">
					<h3>Candidate Zap Receipt {index + 1}</h3>
					<button
						onclick={() => debuggerState.validateCandidate(candidate.key, candidate.event)}
						disabled={validation === 'loading'}
					>
						{validation === 'loading' ? 'Validating…' : 'Validate Zap Receipt'}
					</button>
					{#if validation && validation !== 'loading'}
						<dl>
							<dt>Claimed event ID</dt>
							<dd class="break">{validation.claimedEventId ?? '(missing or malformed)'}</dd>
							<dt>Calculated event ID</dt>
							<dd class="break">{validation.calculatedEventId ?? '(not calculable)'}</dd>
							<dt>Event ID comparison</dt>
							<dd>
								{validation.claimedEventId === validation.calculatedEventId ? 'Match' : 'Mismatch'}
							</dd>
						</dl>
						{#each validation.sections as validationSection (validationSection.title)}
							<h3>{validationSection.title}</h3>
							<ul class="validation-checks">
								{#each validationSection.checks as check (check.id)}
									<li class={debuggerState.checkClass(check)}>
										<strong>{debuggerState.checkMark(check)} {check.label}</strong>
										<small
											>{check.level.toUpperCase()} · {check.status}{check.detail
												? ` · ${check.detail}`
												: ''}</small
										>
									</li>
								{/each}
							</ul>
						{/each}
						<h3>Description exact-string comparison</h3>
						<dl>
							<dt>Receipt description</dt>
							<dd class="break">{validation.receiptDescription ?? '(missing)'}</dd>
							<dt>Exact Zap Request JSON sent to callback</dt>
							<dd class="break">{validation.expectedDescription}</dd>
							<dt>Exact comparison</dt>
							<dd>
								{validation.receiptDescription === validation.expectedDescription
									? 'Match'
									: 'Mismatch'}
							</dd>
						</dl>
						<h3>Overall</h3>
						<p class={validation.valid ? 'success' : 'errors'}>
							<strong>{validation.valid ? '✓ Valid Zap Receipt' : '✕ Invalid Zap Receipt'}</strong>
						</p>
						<p class={validation.warningCount > 0 ? 'warning' : 'muted'}>
							Warnings: {validation.warningCount}
						</p>
					{/if}
				</div>
			{/each}
		{:else}
			<p class="muted">
				Step 12 requires at least one Step 11 candidate and the validated LNURL provider
				nostrPubkey.
			</p>
		{/if}
	</section>
</main>
