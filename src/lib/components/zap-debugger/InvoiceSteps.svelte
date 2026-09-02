<script lang="ts">
	import type { ZapDebuggerState } from '$lib/zap-debugger-state.svelte';

	let { state }: { state: ZapDebuggerState } = $props();
</script>

<section>
	<h2><span>7</span> GET Zap callback</h2>
	{#if state.signedRaw !== undefined && state.amountResult?.amount !== undefined && state.encodedLnurl && state.lud06?.kind === 'payRequest' && state.lud06.data.callback}
		<div class="output">
			<h3>Callback input</h3>
			<dl>
				<dt>Callback URL</dt>
				<dd class="break">{state.lud06.data.callback}</dd>
				<dt>Amount (msat)</dt>
				<dd>{state.amountResult.amount}</dd>
				<dt>Encoded LNURL</dt>
				<dd class="break">{state.encodedLnurl}</dd>
			</dl>
			<h3>Signed Zap Request</h3>
			<pre>{state.formattedJson(state.signedRaw)}</pre>
			<button onclick={state.getCallback} disabled={state.callbackLoading}
				>{state.callbackLoading ? 'Requesting…' : 'GET callback'}</button
			>
		</div>
		{#if state.callbackRequestUrl}
			<div class="result">
				<h3>HTTP request</h3>
				<dl>
					<dt>Method</dt>
					<dd>GET</dd>
					<dt>Final request URL</dt>
					<dd class="break">{state.callbackRequestUrl}</dd>
				</dl>
				{#if state.callbackHttp}
					{#if state.callbackHttp.error}<p class="errors" role="alert">
							✕ {state.callbackHttp.error}
						</p>{/if}
					{#if state.callbackHttp.status !== undefined}
						<h3>HTTP response</h3>
						<dl>
							<dt>Status</dt>
							<dd>{state.callbackHttp.status}</dd>
							<dt>Status text</dt>
							<dd>{state.callbackHttp.statusText || '(empty)'}</dd>
						</dl>
					{/if}
					<div class="raw-grid grid">
						<div>
							<h3>Raw response body</h3>
							<pre>{state.callbackHttp.rawBody ?? '(unavailable)'}</pre>
						</div>
						<div>
							<h3>Parsed JSON</h3>
							<pre>{state.callbackHttp.json === undefined
									? '(unavailable)'
									: state.formattedJson(state.callbackHttp.json)}</pre>
						</div>
					</div>
					{#if state.callbackResult?.kind === 'invoice'}
						<h3>Lightning invoice (pr)</h3>
						<pre>{state.callbackResult.pr}</pre>
					{:else if state.callbackResult?.kind === 'error'}
						<h3>LUD-06 application error</h3>
						<dl>
							<dt>Reason</dt>
							<dd class="break">{state.callbackResult.reason}</dd>
						</dl>
					{:else if state.callbackResult?.kind === 'missing'}
						<p class="errors" role="alert">
							✕ Invoice not received: {state.callbackResult.reason}
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
	{#if state.callbackResult?.kind === 'invoice' && state.amountResult?.amount !== undefined}
		<div class="grid">
			<div>
				<h3>Input</h3>
				<dl>
					<dt>Lightning invoice (pr)</dt>
					<dd class="break">{state.callbackResult.pr}</dd>
					<dt>Requested amount (msat)</dt>
					<dd>{state.amountResult.amount}</dd>
				</dl>
				<button onclick={state.decodeInvoice}>Decode invoice</button>
			</div>
			<div>
				<h3>Decode result</h3>
				{#if state.invoiceAmountResult?.status === 'failure'}
					<p class="errors" role="alert">
						✕ BOLT11 amount decode failed: {state.invoiceAmountResult.reason}
					</p>
				{:else if state.invoiceAmountResult}
					<dl>
						<dt>Network / prefix</dt>
						<dd>
							{state.invoiceAmountResult.network} / {state.invoiceAmountResult.prefix}
						</dd>
						<dt>Invoice amount (msat)</dt>
						<dd>
							{state.invoiceAmountResult.status === 'specified'
								? state.invoiceAmountResult.amountMsat.toString()
								: '(unspecified)'}
						</dd>
						<dt>Requested amount (msat)</dt>
						<dd>{state.amountResult.amount}</dd>
						<dt>Amount comparison</dt>
						<dd>
							{#if state.invoiceAmountResult.status === 'unspecified'}
								<span class="errors">✕ Invoice amount is unspecified</span>
							{:else if state.invoiceAmountResult.amountMsat === BigInt(state.amountResult.amount)}
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
	{#if state.callbackResult?.kind === 'invoice' && state.callbackZapRequestJson !== undefined && state.invoiceAmountResult && state.invoiceAmountResult.status !== 'failure'}
		<div class="grid">
			<div>
				<h3>Input</h3>
				<dl>
					<dt>Lightning invoice</dt>
					<dd class="break">{state.callbackResult.pr}</dd>
				</dl>
				<h3>Zap Request JSON actually sent in Step 7</h3>
				<pre>{state.callbackZapRequestJson}</pre>
				<button onclick={state.verifyDescriptionHash} disabled={state.descriptionHashLoading}
					>{state.descriptionHashLoading ? 'Verifying…' : 'Verify description hash'}</button
				>
			</div>
			<div>
				<h3>Verification result</h3>
				{#if state.descriptionHashResult?.status === 'failure'}
					<p class="errors" role="alert">✕ {state.descriptionHashResult.reason}</p>
				{:else if state.descriptionHashResult}
					<dl>
						<dt>Invoice description hash (h)</dt>
						<dd class="break">{state.descriptionHashResult.invoiceHashHex}</dd>
						<dt>SHA-256 of the sent Zap Request JSON</dt>
						<dd class="break">{state.descriptionHashResult.calculatedHashHex}</dd>
						<dt>Comparison</dt>
						<dd>
							{#if state.descriptionHashResult.status === 'match'}
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
