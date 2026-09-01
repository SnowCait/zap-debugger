<script lang="ts">
	import type { ZapDebuggerState } from '$lib/zap-debugger-state.svelte';

	let { state }: { state: ZapDebuggerState } = $props();
</script>

<section>
	<h2><span>4</span> Validate Zap Request parameters</h2>
	{#if state.zapReady()}
		<p class="notice">
			Recipient pubkey identifies the person receiving the zap. It is separate from the LNURL
			provider <code>nostrPubkey</code> shown in Step 3.
		</p>
		<div class="grid">
			<div>
				<h3>Input</h3>
				<label for="recipient-pubkey">Recipient pubkey (hex or npub)</label>
				<input
					id="recipient-pubkey"
					value={state.recipientInput}
					oninput={(event) => state.changeZapParameter('recipient', event.currentTarget.value)}
					placeholder="npub1… or 64-character lowercase hex"
					autocomplete="off"
					spellcheck="false"
				/>
				<label for="zap-amount">Amount (msat)</label>
				<input
					id="zap-amount"
					value={state.amountInput}
					oninput={(event) => state.changeZapParameter('amount', event.currentTarget.value)}
					placeholder={`${state.lud06?.kind === 'payRequest' ? state.lud06.data.minSendable : ''}`}
					inputmode="numeric"
					autocomplete="off"
				/>
				<label for="zap-relays">Zap Receipt relays (one per line)</label>
				<textarea
					id="zap-relays"
					value={state.relaysInput}
					oninput={(event) => state.changeZapParameter('relays', event.currentTarget.value)}
					placeholder="wss://relay.example"
					rows="4"
					spellcheck="false"></textarea>
				<label for="zap-comment">Comment (optional)</label>
				<textarea
					id="zap-comment"
					value={state.commentInput}
					oninput={(event) => state.changeZapParameter('comment', event.currentTarget.value)}
					rows="3"></textarea>
				<button onclick={state.validateZapParameters}>Validate parameters</button>
			</div>
			<div>
				<h3>Transformation</h3>
				<dl>
					<dt>Recipient input</dt>
					<dd class="break">{state.recipientResult?.input ?? '(not validated)'}</dd>
					<dt>Recipient normalized hex</dt>
					<dd class="break">{state.recipientResult?.normalized ?? '(unavailable)'}</dd>
					<dt>Amount input</dt>
					<dd>{state.amountResult?.input ?? '(not validated)'}</dd>
					<dt>Amount normalized (msat)</dt>
					<dd>{state.amountResult?.amount ?? '(unavailable)'}</dd>
					<dt>Parsed relays</dt>
					<dd class="break">
						{state.relayResult ? state.formattedJson(state.relayResult.relays) : '(not validated)'}
					</dd>
				</dl>
				<h3>Validation</h3>
				{#if state.recipientResult && state.amountResult && state.relayResult}
					<ul class="checks">
						{#each [...state.recipientResult.checks, ...state.amountResult.items, ...state.relayResult.items] as item (item.label)}<li
								class:failed={!item.valid}
							>
								{item.valid ? '✓' : '✕'}
								{item.label}
							</li>{/each}
					</ul>
				{:else}<p class="muted">Not run</p>{/if}
			</div>
		</div>
		{#if state.encodedLnurl}
			<div class="output">
				<h3>LNURL output</h3>
				<dl>
					<dt>LNURL-pay URL</dt>
					<dd class="break">{state.endpoint?.url}</dd>
					<dt>Bech32 LNURL</dt>
					<dd class="break">{state.encodedLnurl}</dd>
				</dl>
				<button onclick={state.buildRequest} disabled={!state.parametersValid()}
					>Build Zap Request</button
				>
			</div>
		{/if}
	{:else}
		<p class="muted">
			Step 4 requires a valid LUD-06 response, supported NIP-57 advertisement, callback, amount
			range, and LNURL-pay URL.
		</p>
	{/if}
</section>
<section>
	<h2><span>5</span> Build unsigned kind 9734</h2>
	{#if state.unsignedEvent}
		<div class="raw-grid grid">
			<div>
				<h3>NIP-07 signing input</h3>
				<pre>{state.formattedJson(state.unsignedEvent)}</pre>
			</div>
			<div>
				<h3>Validation</h3>
				<ul class="checks">
					{#each state.unsignedValidation ?? [] as item (item.label)}<li class:failed={!item.valid}>
							{item.valid ? '✓' : '✕'}
							{item.label}
						</li>{/each}
				</ul>
			</div>
		</div>
	{:else}<p class="muted">Validate Step 4, then explicitly build the Zap Request.</p>{/if}
</section>
<section>
	<h2><span>6</span> Sign Zap Request with NIP-07</h2>
	{#if state.unsignedEvent}
		<div class="grid">
			<div>
				<h3>Signer</h3>
				<p class:success={state.signerAvailable} class:errors={!state.signerAvailable}>
					{state.signerAvailable
						? '✓ NIP-07 signer is available'
						: '✕ NIP-07 signer is not available'}
				</p>
				<button class="secondary" onclick={state.refreshSignerAvailability}
					>Check NIP-07 availability</button
				>
				<dl>
					<dt>Recipient pubkey</dt>
					<dd class="break">{state.recipientResult?.normalized}</dd>
				</dl>
				<button
					onclick={state.signRequest}
					disabled={!state.signerAvailable ||
						state.signing ||
						state.unsignedValidation?.some((item) => !item.valid)}
					>{state.signing ? 'Waiting for signer…' : 'Sign with NIP-07'}</button
				>
				{#if state.signError}<p class="errors" role="alert">
						✕ {state.signError}. The unsigned event is preserved; you can retry.
					</p>{/if}
			</div>
			<div>
				<h3>Unsigned event (preserved)</h3>
				<pre>{state.formattedJson(state.unsignedEvent)}</pre>
			</div>
		</div>
		{#if state.signedRaw !== undefined}
			<div class="result">
				<h3>Signed event raw JSON</h3>
				<pre>{state.formattedJson(state.signedRaw)}</pre>
			</div>
		{/if}
	{:else}<p class="muted">Build and validate an unsigned event in Step 5 first.</p>{/if}
</section>
