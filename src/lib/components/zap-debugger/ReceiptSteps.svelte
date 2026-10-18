<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import {
		calculateZapReceiptSince,
		RECEIPT_CLOCK_SKEW_MARGIN_SECONDS
	} from '$lib/protocol/zap-receipt-subscription';
	import type { ZapDebuggerState } from '$lib/zap-debugger-state.svelte';

	const checkLevelMessages = {
		required: m.receipt_level_required,
		recommended: m.receipt_level_recommended,
		diagnostic: m.receipt_level_diagnostic
	};
	const checkStatusMessages = {
		pass: m.receipt_status_pass,
		fail: m.receipt_status_fail,
		warning: m.receipt_status_warning,
		'not-applicable': m.receipt_status_not_applicable,
		'not-checked': m.receipt_status_not_checked
	};

	let { state }: { state: ZapDebuggerState } = $props();
</script>

<section>
	<h2><span>11</span> {m.wait_zap_receipt()}</h2>
	{#if state.receiptReady() && state.callbackResult?.kind === 'invoice'}
		<p class="notice">
			{m.receipt_subscription_notice()}
		</p>
		<div class="grid">
			<div>
				<h3>{m.subscription_input()}</h3>
				<dl>
					<dt>{m.field_recipient_pubkey()}</dt>
					<dd class="break">{state.receiptRecipient()}</dd>
					<dt>{m.field_current_invoice()}</dt>
					<dd class="break">{state.callbackResult.pr}</dd>
					<dt>{m.field_signed_request_created_at()}</dt>
					<dd>{state.receiptCreatedAt()}</dd>
					<dt>{m.field_clock_skew_margin()}</dt>
					<dd>{m.duration_seconds({ seconds: RECEIPT_CLOCK_SKEW_MARGIN_SECONDS })}</dd>
					<dt>REQ since</dt>
					<dd>{calculateZapReceiptSince(state.receiptCreatedAt() ?? 0)}</dd>
					<dt>{m.field_signed_request_relays()}</dt>
					<dd><pre>{state.formattedJson(state.receiptRelays())}</pre></dd>
				</dl>
				{#if state.receiptState.waiting}
					<button onclick={state.stopReceiptSubscription}>{m.action_stop_waiting()}</button>
				{:else}
					<button onclick={state.startReceiptSubscription}>{m.wait_zap_receipt()}</button>
				{/if}
			</div>
			<div>
				<h3>{m.relay_status()}</h3>
				{#if state.receiptState.relays.length === 0}
					<p class="muted">{m.ui_not_started()}</p>
				{:else}
					{#each state.receiptState.relays as relay (relay.relay)}
						<div class="result">
							<strong class="break">{relay.relay}</strong>
							<p>
								{relay.state === 'subscribed'
									? m.relay_subscribed()
									: relay.state === 'connecting'
										? m.relay_connecting()
										: relay.state === 'closed'
											? m.relay_closed()
											: m.relay_error()}
								{relay.eose ? ' · EOSE' : ''}
							</p>
							{#if relay.notice}<p>NOTICE: {relay.notice}</p>{/if}
							{#if relay.closedMessage}<p>CLOSED: {relay.closedMessage}</p>{/if}
							{#if relay.error}<p class="errors">{relay.error}</p>{/if}
						</div>
					{/each}
				{/if}
			</div>
		</div>
		<div class="output">
			<h3>{m.candidate_receipts()}</h3>
			{#if state.receiptState.candidates.length === 0}
				<p class="muted">{m.no_receipt_candidates()}</p>
			{:else}
				{#each state.receiptState.candidates as candidate, index (candidate.key)}
					<div class="result">
						<h3>{m.receipt_candidate({ number: index + 1 })}</h3>
						<dl>
							<dt>{m.field_event_id()}</dt>
							<dd class="break">
								{typeof candidate.event.id === 'string'
									? candidate.event.id
									: m.ui_missing_or_malformed()}
							</dd>
							<dt>{m.field_received_from()}</dt>
							<dd><pre>{candidate.sourceRelays.join('\n')}</pre></dd>
						</dl>
						<h3>{m.raw_event()}</h3>
						<pre>{state.formattedJson(candidate.event)}</pre>
					</div>
				{/each}
			{/if}
		</div>
	{:else}
		<p class="muted">
			{m.wait_receipt_prerequisite()}
		</p>
	{/if}
</section>
<section>
	<h2><span>12</span> {m.validate_zap_receipt()}</h2>
	{#if state.receiptValidationReady()}
		<p class="notice">
			{m.receipt_validation_notice()}
		</p>
		{#each state.receiptState.candidates as candidate, index (candidate.key)}
			{@const validation = state.receiptValidations[candidate.key]}
			<div class="result">
				<h3>{m.receipt_candidate({ number: index + 1 })}</h3>
				<button
					onclick={() => state.validateCandidate(candidate.key, candidate.event)}
					disabled={validation === 'loading'}
				>
					{validation === 'loading' ? m.ui_validating() : m.validate_zap_receipt()}
				</button>
				{#if validation && validation !== 'loading'}
					<dl>
						<dt>{m.field_claimed_event_id()}</dt>
						<dd class="break">{validation.claimedEventId ?? m.ui_missing_or_malformed()}</dd>
						<dt>{m.field_calculated_event_id()}</dt>
						<dd class="break">{validation.calculatedEventId ?? m.ui_not_calculable()}</dd>
						<dt>{m.event_id_comparison()}</dt>
						<dd>
							{validation.claimedEventId === validation.calculatedEventId
								? m.ui_match()
								: m.ui_mismatch()}
						</dd>
					</dl>
					{#each validation.sections as validationSection (validationSection.title)}
						<h3>{validationSection.title}</h3>
						<ul class="validation-checks">
							{#each validationSection.checks as check (check.id)}
								<li class={state.checkClass(check)}>
									<strong>{state.checkMark(check)} {check.label}</strong>
									<small
										>{checkLevelMessages[check.level]()} · {checkStatusMessages[
											check.status
										]()}{check.detail ? ` · ${check.detail}` : ''}</small
									>
								</li>
							{/each}
						</ul>
					{/each}
					<h3>{m.description_exact_comparison()}</h3>
					<dl>
						<dt>{m.field_receipt_description()}</dt>
						<dd class="break">{validation.receiptDescription ?? m.ui_missing()}</dd>
						<dt>{m.field_expected_description()}</dt>
						<dd class="break">{validation.expectedDescription}</dd>
						<dt>{m.exact_comparison()}</dt>
						<dd>
							{validation.receiptDescription === validation.expectedDescription
								? m.ui_match()
								: m.ui_mismatch()}
						</dd>
					</dl>
					<h3>{m.overall()}</h3>
					<p class={validation.valid ? 'success' : 'errors'}>
						<strong
							>{validation.valid ? '✓ ' + m.receipt_valid() : '✕ ' + m.receipt_invalid()}</strong
						>
					</p>
					<p class={validation.warningCount > 0 ? 'warning' : 'muted'}>
						{m.receipt_warnings({ count: validation.warningCount })}
					</p>
				{/if}
			</div>
		{/each}
	{:else}
		<p class="muted">
			{m.validate_receipt_prerequisite()}
		</p>
	{/if}
</section>
