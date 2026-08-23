<script lang="ts">
	import { fetchLnurlPay, type HttpInspection } from '$lib/protocol/http';
	import {
		parseLightningAddress,
		type AddressParseResult,
		type LightningAddress
	} from '$lib/protocol/lightning-address';
	import { validateLud06, type Lud06Result } from '$lib/protocol/lud06';
	import { resolveLnurlPayEndpoint, type LnurlPayEndpoint } from '$lib/protocol/lud16';
	import { validateNip57, type Nip57Result } from '$lib/protocol/nip57';

	let input = $state('');
	let addressResult = $state<AddressParseResult>();
	let address = $state<LightningAddress>();
	let endpoint = $state<LnurlPayEndpoint>();
	let http = $state<HttpInspection>();
	let lud06 = $state<Lud06Result>();
	let nip57 = $state<Nip57Result>();
	let loading = $state(false);

	function resetFetch() {
		http = undefined;
		lud06 = undefined;
		nip57 = undefined;
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
	const formattedJson = (value: unknown) => JSON.stringify(value, null, 2);
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
						<dt>nostrPubkey</dt>
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
</main>
