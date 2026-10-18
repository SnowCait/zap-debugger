<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import QRCode from 'qrcode';

	let { payload }: { payload: string } = $props();
	let imageUrl = $state<string>();
	let error = $state<string>();

	$effect(() => {
		const currentPayload = payload;
		let active = true;
		imageUrl = undefined;
		error = undefined;
		QRCode.toDataURL(currentPayload, { errorCorrectionLevel: 'M', margin: 2, width: 280 })
			.then((url) => {
				if (active && payload === currentPayload) imageUrl = url;
			})
			.catch(() => {
				if (active && payload === currentPayload) error = m.qr_generation_failed();
			});
		return () => {
			active = false;
		};
	});
</script>

{#if imageUrl}
	<img src={imageUrl} alt={m.qr_invoice_alt()} />
{:else if error}
	<p class="errors" role="alert">✕ {m.qr_failure_instruction({ error })}</p>
{:else}
	<p class="muted" aria-live="polite">{m.qr_generating()}</p>
{/if}
