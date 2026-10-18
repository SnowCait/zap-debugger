<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import type { ZapDebuggerState } from '$lib/zap-debugger-state.svelte';

	let { state }: { state: ZapDebuggerState } = $props();
</script>

<section>
	<h2><span>4</span> {m.validate_zap_parameters()}</h2>
	{#if state.zapReady()}
		<p class="notice">
			{m.recipient_notice_intro()} <code>nostrPubkey</code>
			{m.recipient_notice_outro()}
		</p>
		<div class="grid">
			<div>
				<h3>{m.ui_input()}</h3>
				<label for="recipient-pubkey">{m.field_recipient_pubkey_input()}</label>
				<input
					id="recipient-pubkey"
					value={state.recipientInput}
					oninput={(event) => state.changeZapParameter('recipient', event.currentTarget.value)}
					placeholder={m.recipient_pubkey_placeholder()}
					autocomplete="off"
					spellcheck="false"
				/>
				<label for="zap-amount">{m.field_amount_msat()}</label>
				<input
					id="zap-amount"
					value={state.amountInput}
					oninput={(event) => state.changeZapParameter('amount', event.currentTarget.value)}
					placeholder={`${state.lud06?.kind === 'payRequest' ? state.lud06.data.minSendable : ''}`}
					inputmode="numeric"
					autocomplete="off"
				/>
				<label for="zap-relays">{m.field_receipt_relays()}</label>
				<textarea
					id="zap-relays"
					value={state.relaysInput}
					oninput={(event) => state.changeZapParameter('relays', event.currentTarget.value)}
					placeholder="wss://relay.example"
					rows="4"
					spellcheck="false"></textarea>
				<label for="zap-comment">{m.field_comment_optional()}</label>
				<textarea
					id="zap-comment"
					value={state.commentInput}
					oninput={(event) => state.changeZapParameter('comment', event.currentTarget.value)}
					rows="3"></textarea>
				<button onclick={state.validateZapParameters}>{m.action_validate_parameters()}</button>
			</div>
			<div>
				<h3>{m.ui_transformation()}</h3>
				<dl>
					<dt>{m.field_recipient_input()}</dt>
					<dd class="break">{state.recipientResult?.input ?? m.ui_not_validated()}</dd>
					<dt>{m.field_recipient_normalized()}</dt>
					<dd class="break">{state.recipientResult?.normalized ?? m.ui_unavailable()}</dd>
					<dt>{m.field_amount_input()}</dt>
					<dd>{state.amountResult?.input ?? m.ui_not_validated()}</dd>
					<dt>{m.field_amount_normalized()}</dt>
					<dd>{state.amountResult?.amount ?? m.ui_unavailable()}</dd>
					<dt>{m.field_parsed_relays()}</dt>
					<dd class="break">
						{state.relayResult
							? state.formattedJson(state.relayResult.relays)
							: m.ui_not_validated()}
					</dd>
				</dl>
				<h3>{m.ui_validation()}</h3>
				{#if state.recipientResult && state.amountResult && state.relayResult}
					<ul class="checks">
						{#each [...state.recipientResult.checks, ...state.amountResult.items, ...state.relayResult.items] as item (item.label)}<li
								class:failed={!item.valid}
							>
								{item.valid ? '✓' : '✕'}
								{item.label}
							</li>{/each}
					</ul>
				{:else}<p class="muted">{m.ui_not_run()}</p>{/if}
			</div>
		</div>
		{#if state.encodedLnurl}
			<div class="output">
				<h3>{m.lnurl_output()}</h3>
				<dl>
					<dt>LNURL-pay URL</dt>
					<dd class="break">{state.endpoint?.url}</dd>
					<dt>Bech32 LNURL</dt>
					<dd class="break">{state.encodedLnurl}</dd>
				</dl>
				<button onclick={state.buildRequest} disabled={!state.parametersValid()}
					>{m.action_build_request()}</button
				>
			</div>
		{/if}
	{:else}
		<p class="muted">
			{m.parameters_prerequisite()}
		</p>
	{/if}
</section>
<section>
	<h2><span>5</span> {m.build_unsigned_event()}</h2>
	{#if state.unsignedEvent}
		<div class="raw-grid grid">
			<div>
				<h3>{m.signing_input()}</h3>
				<pre>{state.formattedJson(state.unsignedEvent)}</pre>
			</div>
			<div>
				<h3>{m.ui_validation()}</h3>
				<ul class="checks">
					{#each state.unsignedValidation ?? [] as item (item.label)}<li class:failed={!item.valid}>
							{item.valid ? '✓' : '✕'}
							{item.label}
						</li>{/each}
				</ul>
			</div>
		</div>
	{:else}<p class="muted">{m.build_request_prerequisite()}</p>{/if}
</section>
<section>
	<h2><span>6</span> {m.sign_zap_request()}</h2>
	{#if state.unsignedEvent}
		<div class="grid">
			<div>
				<h3>{m.signer()}</h3>
				<p class:success={state.signerAvailable} class:errors={!state.signerAvailable}>
					{state.signerAvailable ? '✓ ' + m.signer_available() : '✕ ' + m.signer_unavailable()}
				</p>
				<button class="secondary" onclick={state.refreshSignerAvailability}
					>{m.action_check_signer()}</button
				>
				<dl>
					<dt>{m.field_recipient_pubkey()}</dt>
					<dd class="break">{state.recipientResult?.normalized}</dd>
				</dl>
				<button
					onclick={state.signRequest}
					disabled={!state.signerAvailable ||
						state.signing ||
						state.unsignedValidation?.some((item) => !item.valid)}
					>{state.signing ? m.waiting_for_signer() : m.action_sign()}</button
				>
				{#if state.signError}<p class="errors" role="alert">
						✕ {m.signing_error_notice({ error: state.signError })}
					</p>{/if}
			</div>
			<div>
				<h3>{m.unsigned_event_preserved()}</h3>
				<pre>{state.formattedJson(state.unsignedEvent)}</pre>
			</div>
		</div>
		{#if state.signedRaw !== undefined}
			<div class="result">
				<h3>{m.signed_event_raw_json()}</h3>
				<pre>{state.formattedJson(state.signedRaw)}</pre>
			</div>
		{/if}
	{:else}<p class="muted">{m.sign_request_prerequisite()}</p>{/if}
</section>
