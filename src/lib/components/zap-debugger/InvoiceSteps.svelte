<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import type { ZapDebuggerState } from '$lib/zap-debugger-state.svelte';

	let { state }: { state: ZapDebuggerState } = $props();
</script>

<section>
	<h2><span>7</span> {m.get_zap_callback()}</h2>
	{#if state.signedRaw !== undefined && state.amountResult?.amount !== undefined && state.encodedLnurl && state.lud06?.kind === 'payRequest' && state.lud06.data.callback}
		<div class="output">
			<h3>{m.callback_input()}</h3>
			<dl>
				<dt>Callback URL</dt>
				<dd class="break">{state.lud06.data.callback}</dd>
				<dt>{m.field_amount_msat()}</dt>
				<dd>{state.amountResult.amount}</dd>
				<dt>{m.field_encoded_lnurl()}</dt>
				<dd class="break">{state.encodedLnurl}</dd>
			</dl>
			<h3>{m.signed_zap_request()}</h3>
			<pre>{state.formattedJson(state.signedRaw)}</pre>
			<button onclick={state.getCallback} disabled={state.callbackLoading}
				>{state.callbackLoading ? m.ui_requesting() : m.action_get_callback()}</button
			>
		</div>
		{#if state.callbackRequestUrl}
			<div class="result">
				<h3>{m.http_request()}</h3>
				<dl>
					<dt>{m.field_method()}</dt>
					<dd>GET</dd>
					<dt>{m.field_final_request_url()}</dt>
					<dd class="break">{state.callbackRequestUrl}</dd>
				</dl>
				{#if state.callbackHttp}
					{#if state.callbackHttp.error}<p class="errors" role="alert">
							✕ {state.callbackHttp.error}
						</p>{/if}
					{#if state.callbackHttp.status !== undefined}
						<h3>{m.http_response()}</h3>
						<dl>
							<dt>{m.field_status()}</dt>
							<dd>{state.callbackHttp.status}</dd>
							<dt>{m.field_status_text()}</dt>
							<dd>{state.callbackHttp.statusText || m.ui_empty()}</dd>
						</dl>
					{/if}
					<div class="raw-grid grid">
						<div>
							<h3>{m.raw_response_body()}</h3>
							<pre>{state.callbackHttp.rawBody ?? m.ui_unavailable()}</pre>
						</div>
						<div>
							<h3>{m.parsed_json()}</h3>
							<pre>{state.callbackHttp.json === undefined
									? m.ui_unavailable()
									: state.formattedJson(state.callbackHttp.json)}</pre>
						</div>
					</div>
					{#if state.callbackResult?.kind === 'invoice'}
						<h3>Lightning invoice (pr)</h3>
						<pre>{state.callbackResult.pr}</pre>
					{:else if state.callbackResult?.kind === 'error'}
						<h3>{m.lud06_application_error()}</h3>
						<dl>
							<dt>{m.field_reason()}</dt>
							<dd class="break">{state.callbackResult.reason}</dd>
						</dl>
					{:else if state.callbackResult?.kind === 'missing'}
						<p class="errors" role="alert">
							✕ {m.invoice_not_received({ reason: state.callbackResult.reason })}
						</p>
					{/if}
				{/if}
			</div>
		{/if}
	{:else}<p class="muted">
			{m.callback_prerequisite()}
		</p>{/if}
</section>
<section>
	<h2><span>8</span> {m.inspect_invoice_amount()}</h2>
	{#if state.callbackResult?.kind === 'invoice' && state.amountResult?.amount !== undefined}
		<div class="grid">
			<div>
				<h3>{m.ui_input()}</h3>
				<dl>
					<dt>Lightning invoice (pr)</dt>
					<dd class="break">{state.callbackResult.pr}</dd>
					<dt>{m.field_requested_amount()}</dt>
					<dd>{state.amountResult.amount}</dd>
				</dl>
				<button onclick={state.decodeInvoice}>{m.action_decode_invoice()}</button>
			</div>
			<div>
				<h3>{m.decode_result()}</h3>
				{#if state.invoiceAmountResult?.status === 'failure'}
					<p class="errors" role="alert">
						✕ {m.invoice_amount_decode_failed({ reason: state.invoiceAmountResult.reason })}
					</p>
				{:else if state.invoiceAmountResult}
					<dl>
						<dt>{m.field_network_prefix()}</dt>
						<dd>
							{state.invoiceAmountResult.network} / {state.invoiceAmountResult.prefix}
						</dd>
						<dt>{m.field_invoice_amount()}</dt>
						<dd>
							{state.invoiceAmountResult.status === 'specified'
								? state.invoiceAmountResult.amountMsat.toString()
								: m.ui_unspecified()}
						</dd>
						<dt>{m.field_requested_amount()}</dt>
						<dd>{state.amountResult.amount}</dd>
						<dt>{m.amount_comparison()}</dt>
						<dd>
							{#if state.invoiceAmountResult.status === 'unspecified'}
								<span class="errors">✕ {m.invoice_amount_unspecified()}</span>
							{:else if state.invoiceAmountResult.amountMsat === BigInt(state.amountResult.amount)}
								<span class="success">✓ {m.invoice_amount_match()}</span>
							{:else}
								<span class="errors">✕ {m.invoice_amount_mismatch()}</span>
							{/if}
						</dd>
					</dl>
				{:else}<p class="muted">{m.ui_not_run()}</p>{/if}
			</div>
		</div>
	{:else}<p class="muted">{m.inspect_amount_prerequisite()}</p>{/if}
</section>
<section>
	<h2><span>9</span> {m.verify_invoice_description_hash()}</h2>
	{#if state.callbackResult?.kind === 'invoice' && state.callbackZapRequestJson !== undefined && state.invoiceAmountResult && state.invoiceAmountResult.status !== 'failure'}
		<div class="grid">
			<div>
				<h3>{m.ui_input()}</h3>
				<dl>
					<dt>Lightning invoice</dt>
					<dd class="break">{state.callbackResult.pr}</dd>
				</dl>
				<h3>{m.sent_zap_request_json()}</h3>
				<pre>{state.callbackZapRequestJson}</pre>
				<button onclick={state.verifyDescriptionHash} disabled={state.descriptionHashLoading}
					>{state.descriptionHashLoading
						? m.ui_verifying()
						: m.action_verify_description_hash()}</button
				>
			</div>
			<div>
				<h3>{m.verification_result()}</h3>
				{#if state.descriptionHashResult?.status === 'failure'}
					<p class="errors" role="alert">✕ {state.descriptionHashResult.reason}</p>
				{:else if state.descriptionHashResult?.status === 'direct-description'}
					<p class="warning" role="status">
						⚠ {m.direct_description_warning()}
					</p>
				{:else if state.descriptionHashResult}
					<dl>
						<dt>{m.field_invoice_description_hash()}</dt>
						<dd class="break">{state.descriptionHashResult.invoiceHashHex}</dd>
						<dt>{m.field_calculated_description_hash()}</dt>
						<dd class="break">{state.descriptionHashResult.calculatedHashHex}</dd>
						<dt>{m.comparison()}</dt>
						<dd>
							{#if state.descriptionHashResult.status === 'match'}
								<span class="success">✓ {m.description_hash_match()}</span>
							{:else}
								<span class="errors">✕ {m.description_hash_mismatch()}</span>
							{/if}
						</dd>
					</dl>
				{:else}<p class="muted">{m.ui_not_run()}</p>{/if}
			</div>
		</div>
	{:else}<p class="muted">{m.verify_hash_prerequisite()}</p>{/if}
</section>
