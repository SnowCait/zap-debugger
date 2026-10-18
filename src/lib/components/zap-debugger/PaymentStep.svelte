<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import InvoiceQr from '$lib/InvoiceQr.svelte';
	import { createPaymentHandoffValues } from '$lib/protocol/payment-handoff';
	import type { ZapDebuggerState } from '$lib/zap-debugger-state.svelte';

	let { state }: { state: ZapDebuggerState } = $props();
</script>

<section>
	<h2><span>10</span> {m.pay_invoice()}</h2>
	{#if state.paymentReady() && state.callbackResult?.kind === 'invoice' && state.invoiceAmountResult?.status === 'specified'}
		{@const handoff = createPaymentHandoffValues(state.callbackResult.pr)}
		{#if state.descriptionHashResult?.status === 'direct-description'}
			<p class="warning" role="status">
				⚠ {m.regular_invoice_payment_warning()}
			</p>
			<p>{m.regular_invoice_payment_instruction()}</p>
		{:else}
			<p>{m.zap_invoice_payment_instruction()}</p>
		{/if}
		<div class="grid">
			<div>
				<h3>{m.payment_handoff()}</h3>
				<dl>
					<dt>{m.field_amount_msat()}</dt>
					<dd>{state.invoiceAmountResult.amountMsat.toString()}</dd>
					<dt>Lightning invoice</dt>
					<dd class="break">{state.callbackResult.pr}</dd>
				</dl>
				<div class="actions">
					<button onclick={() => state.copyInvoice(handoff.clipboardValue)}
						>{m.action_copy_invoice()}</button
					>
					<!-- A custom protocol URI must not be rewritten as an application route. -->
					<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
					<a class="button secondary" href={handoff.openWalletUri}>{m.action_open_wallet()}</a>
				</div>
				{#if state.copyStatus === 'copied'}
					<p class="success" role="status">✓ {m.invoice_copied()}</p>
				{:else if state.copyStatus === 'failed'}
					<p class="errors" role="alert">✕ {m.invoice_copy_failed()}</p>
				{/if}
			</div>
			<div>
				<h3>{m.qr_code()}</h3>
				<div class="qr"><InvoiceQr payload={handoff.qrPayload} /></div>
				<dl>
					<dt>{m.qr_payload()}</dt>
					<dd class="break">{handoff.qrPayload}</dd>
				</dl>
			</div>
		</div>
		{#if state.descriptionHashResult?.status === 'match'}
			<p class="notice">{m.after_zap_payment()}</p>
		{/if}
	{:else}
		<p class="muted">
			{m.payment_prerequisite()}
		</p>
	{/if}
</section>
