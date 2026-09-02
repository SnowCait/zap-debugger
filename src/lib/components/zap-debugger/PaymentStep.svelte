<script lang="ts">
	import InvoiceQr from '$lib/InvoiceQr.svelte';
	import { createPaymentHandoffValues } from '$lib/protocol/payment-handoff';
	import type { ZapDebuggerState } from '$lib/zap-debugger-state.svelte';

	let { state }: { state: ZapDebuggerState } = $props();
</script>

<section>
	<h2><span>10</span> Pay invoice</h2>
	{#if state.paymentReady() && state.callbackResult?.kind === 'invoice' && state.invoiceAmountResult?.status === 'specified'}
		{@const handoff = createPaymentHandoffValues(state.callbackResult.pr)}
		<p>Pay this invoice with your Lightning wallet, then continue to the next step.</p>
		<div class="grid">
			<div>
				<h3>Payment handoff</h3>
				<dl>
					<dt>Amount (msat)</dt>
					<dd>{state.invoiceAmountResult.amountMsat.toString()}</dd>
					<dt>Lightning invoice</dt>
					<dd class="break">{state.callbackResult.pr}</dd>
				</dl>
				<div class="actions">
					<button onclick={() => state.copyInvoice(handoff.clipboardValue)}>Copy invoice</button>
					<!-- A custom protocol URI must not be rewritten as an application route. -->
					<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
					<a class="button secondary" href={handoff.openWalletUri}>Open wallet</a>
				</div>
				{#if state.copyStatus === 'copied'}
					<p class="success" role="status">✓ Copied</p>
				{:else if state.copyStatus === 'failed'}
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
