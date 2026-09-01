<script lang="ts">
	import type { ZapDebuggerState } from '$lib/zap-debugger-state.svelte';

	let { state }: { state: ZapDebuggerState } = $props();
</script>

<section>
	<h2><span>1</span> Validate Lightning Address</h2>
	<div class="grid">
		<div>
			<h3>Input</h3>
			<label for="lightning-address">Lightning Address</label><input
				id="lightning-address"
				value={state.input}
				oninput={(event) => state.changeInput(event.currentTarget.value)}
				placeholder="alice@example.com"
				autocomplete="off"
				spellcheck="false"
			/><button onclick={state.validateAddress} disabled={!state.input}>Validate address</button>
		</div>
		<div>
			<h3>Transformation</h3>
			<p>
				Split at <code>@</code> without normalizing or silently correcting the input.
			</p>
			<h3>Validation</h3>
			{#if state.addressResult?.valid}<p class="success">
					✓ Valid LUD-16 Lightning Address
				</p>{:else if state.addressResult}<ul class="errors">
					{#each state.addressResult.errors as error (error)}<li>✕ {error}</li>{/each}
				</ul>{:else}<p class="muted">Not run</p>{/if}
		</div>
	</div>
	{#if state.address}<div class="output">
			<h3>Output</h3>
			<dl>
				<dt>Lightning Address</dt>
				<dd>{state.address.address}</dd>
				<dt>Username</dt>
				<dd>{state.address.username}</dd>
				<dt>Domain</dt>
				<dd>{state.address.domain}</dd>
			</dl>
			<button onclick={state.resolveEndpoint}>Resolve LNURL-pay endpoint</button>
		</div>{/if}
</section>
<section>
	<h2><span>2</span> Resolve LNURL-pay endpoint</h2>
	{#if state.endpoint}<div class="grid">
			<div>
				<h3>Input</h3>
				<dl>
					<dt>Lightning Address</dt>
					<dd>{state.endpoint.address}</dd>
					<dt>Username</dt>
					<dd>{state.endpoint.username}</dd>
					<dt>Domain</dt>
					<dd>{state.endpoint.domain}</dd>
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
				<dd>{state.endpoint.scheme}</dd>
				<dt>Resolved URL</dt>
				<dd class="break">{state.endpoint.url}</dd>
			</dl>
			<button onclick={state.runGet} disabled={state.loading}
				>{state.loading ? 'Requesting…' : 'GET LNURL-pay endpoint'}</button
			>
		</div>{:else}<p class="muted">Complete Step 1 and explicitly resolve the endpoint.</p>{/if}
</section>
<section>
	<h2><span>3</span> Fetch and validate LNURL-pay response</h2>
	{#if state.http}<h3>HTTP request</h3>
		<dl>
			<dt>Method</dt>
			<dd>{state.http.method}</dd>
			<dt>Request URL</dt>
			<dd class="break">{state.http.url}</dd>
		</dl>
		{#if state.http.error}<p class="errors" role="alert">
				✕ {state.http.error}
			</p>{/if}{#if state.http.status !== undefined}<h3>HTTP response</h3>
			<dl>
				<dt>Status</dt>
				<dd>{state.http.status}</dd>
				<dt>Status text</dt>
				<dd>{state.http.statusText || '(empty)'}</dd>
			</dl>{/if}
		<div class="raw-grid grid">
			<div>
				<h3>Raw response body</h3>
				<pre>{state.http.rawBody ?? '(unavailable)'}</pre>
			</div>
			<div>
				<h3>Parsed JSON</h3>
				<pre>{state.http.json === undefined
						? '(unavailable)'
						: state.formattedJson(state.http.json)}</pre>
			</div>
		</div>
		{#if state.lud06?.kind === 'error'}<div class="result">
				<h3>LUD-06 error response</h3>
				<dl>
					<dt>Status</dt>
					<dd>{state.lud06.status}</dd>
					<dt>Reason</dt>
					<dd>{state.lud06.reason}</dd>
				</dl>
				<p>payRequest validation was not continued.</p>
			</div>
		{:else if state.lud06?.kind === 'payRequest'}<div class="result">
				<h3>LUD-06 validation: {state.lud06.valid ? 'Valid' : 'Invalid'}</h3>
				<ul class="checks">
					{#each state.lud06.items as item (item.label)}<li class:failed={!item.valid}>
							{item.valid ? '✓' : '✕'}
							{item.label}
						</li>{/each}
				</ul>
				<h3>Extracted output</h3>
				<dl>
					<dt>Callback</dt>
					<dd>{state.lud06.data.callback ?? '(unavailable)'}</dd>
					<dt>Minimum (msat)</dt>
					<dd>{state.lud06.data.minSendable ?? '(unavailable)'}</dd>
					<dt>Maximum (msat)</dt>
					<dd>{state.lud06.data.maxSendable ?? '(unavailable)'}</dd>
					<dt>allowsNostr</dt>
					<dd>{state.formattedJson(state.lud06.data.allowsNostr)}</dd>
					<dt>LNURL provider nostrPubkey</dt>
					<dd class="break">
						{typeof state.lud06.data.nostrPubkey === 'string'
							? state.lud06.data.nostrPubkey
							: '(unavailable)'}
					</dd>
				</dl>
				<div class="raw-grid grid">
					<div>
						<h3>Raw metadata string</h3>
						<pre>{state.lud06.data.metadata ?? '(unavailable)'}</pre>
					</div>
					<div>
						<h3>Parsed metadata</h3>
						<pre>{state.lud06.data.parsedMetadata === undefined
								? '(unavailable)'
								: state.formattedJson(state.lud06.data.parsedMetadata)}</pre>
					</div>
				</div>
			</div>{/if}
		{#if state.nip57}<div class="result">
				<h3>
					NIP-57 Zap support: {state.nip57.status === 'supported'
						? 'Supported'
						: state.nip57.status === 'not-supported'
							? 'Not supported'
							: 'Invalid advertisement'}
				</h3>
				{#if state.nip57.reason}<p>
						<strong>Reason:</strong>
						{state.nip57.reason}
					</p>{/if}
				<ul class="checks">
					{#each state.nip57.items as item (item.label)}<li class:failed={!item.valid}>
							{item.valid ? '✓' : '✕'}
							{item.label}
						</li>{/each}
				</ul>
			</div>{/if}
	{:else}<p class="muted">
			Review the resolved URL in Step 2, then explicitly run the GET request.
		</p>{/if}
</section>
