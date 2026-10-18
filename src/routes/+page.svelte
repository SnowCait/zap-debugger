<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import InvoiceSteps from '$lib/components/zap-debugger/InvoiceSteps.svelte';
	import LnurlDiscoverySteps from '$lib/components/zap-debugger/LnurlDiscoverySteps.svelte';
	import PaymentStep from '$lib/components/zap-debugger/PaymentStep.svelte';
	import ReceiptSteps from '$lib/components/zap-debugger/ReceiptSteps.svelte';
	import ZapRequestSteps from '$lib/components/zap-debugger/ZapRequestSteps.svelte';
	import { createZapDebuggerState } from '$lib/zap-debugger-state.svelte';
	import { m } from '$lib/paraglide/messages';
	import { assertIsLocale, getLocale, getTextDirection, setLocale } from '$lib/paraglide/runtime';

	const debuggerState = createZapDebuggerState();

	onMount(() => {
		const locale = getLocale();
		document.documentElement.lang = locale;
		document.documentElement.dir = getTextDirection(locale);

		debuggerState.refreshSignerAvailability();

		const params = new URLSearchParams(window.location.search);
		const lightningAddress = params.get('lud16');
		const recipientPubkey = params.get('npub');
		const relays = params.get('relays');

		if (lightningAddress !== null) debuggerState.changeInput(lightningAddress);
		if (recipientPubkey !== null) debuggerState.changeZapParameter('recipient', recipientPubkey);
		if (relays !== null) debuggerState.changeZapParameter('relays', relays);
	});
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
		<div class="header-top">
			<p class="eyebrow">Protocol inspector</p>
			<label class="language-selector">
				{m.language_label()}
				<select
					value={getLocale()}
					onchange={(event) => setLocale(assertIsLocale(event.currentTarget.value))}
				>
					<option value="en" lang="en">English</option>
					<option value="ja" lang="ja">日本語</option>
				</select>
			</label>
		</div>
		<h1>NIP-57 Zap Debugger</h1>
		<p>Run Lightning Address discovery one step at a time and inspect every intermediate value.</p>
	</header>
	<LnurlDiscoverySteps state={debuggerState} />
	<ZapRequestSteps state={debuggerState} />
	<InvoiceSteps state={debuggerState} />
	<PaymentStep state={debuggerState} />
	<ReceiptSteps state={debuggerState} />
</main>
