<script lang="ts">
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
				if (active && payload === currentPayload) error = 'Failed to generate QR code';
			});
		return () => {
			active = false;
		};
	});
</script>

{#if imageUrl}
	<img src={imageUrl} alt="QR code for opening this invoice in a Lightning wallet" />
{:else if error}
	<p class="errors" role="alert">✕ {error}. Use Copy invoice or Open wallet instead.</p>
{:else}
	<p class="muted" aria-live="polite">Generating QR code…</p>
{/if}
