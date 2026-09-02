<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import InvoiceSteps from '$lib/components/zap-debugger/InvoiceSteps.svelte';
	import LnurlDiscoverySteps from '$lib/components/zap-debugger/LnurlDiscoverySteps.svelte';
	import PaymentStep from '$lib/components/zap-debugger/PaymentStep.svelte';
	import ReceiptSteps from '$lib/components/zap-debugger/ReceiptSteps.svelte';
	import ZapRequestSteps from '$lib/components/zap-debugger/ZapRequestSteps.svelte';
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
	<LnurlDiscoverySteps state={debuggerState} />
	<ZapRequestSteps state={debuggerState} />
	<InvoiceSteps state={debuggerState} />
	<PaymentStep state={debuggerState} />
	<ReceiptSteps state={debuggerState} />
</main>
