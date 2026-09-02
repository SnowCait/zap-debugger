<script lang="ts">
	import {
		calculateZapReceiptSince,
		RECEIPT_CLOCK_SKEW_MARGIN_SECONDS
	} from '$lib/protocol/zap-receipt-subscription';
	import type { ZapDebuggerState } from '$lib/zap-debugger-state.svelte';

	let { state }: { state: ZapDebuggerState } = $props();
</script>

<section>
	<h2><span>11</span> Wait for Zap Receipt</h2>
	{#if state.receiptReady() && state.callbackResult?.kind === 'invoice'}
		<p class="notice">
			This step discovers unverified candidates. It does not validate Zap Receipt IDs, signatures,
			authors, or tags.
		</p>
		<div class="grid">
			<div>
				<h3>Subscription input</h3>
				<dl>
					<dt>Recipient pubkey</dt>
					<dd class="break">{state.receiptRecipient()}</dd>
					<dt>Current invoice</dt>
					<dd class="break">{state.callbackResult.pr}</dd>
					<dt>Signed Zap Request created_at</dt>
					<dd>{state.receiptCreatedAt()}</dd>
					<dt>Clock-skew margin</dt>
					<dd>{RECEIPT_CLOCK_SKEW_MARGIN_SECONDS} seconds</dd>
					<dt>REQ since</dt>
					<dd>{calculateZapReceiptSince(state.receiptCreatedAt() ?? 0)}</dd>
					<dt>Relays from signed Zap Request</dt>
					<dd><pre>{state.formattedJson(state.receiptRelays())}</pre></dd>
				</dl>
				{#if state.receiptState.waiting}
					<button onclick={state.stopReceiptSubscription}>Stop waiting</button>
				{:else}
					<button onclick={state.startReceiptSubscription}>Wait for Zap Receipt</button>
				{/if}
			</div>
			<div>
				<h3>Relay status</h3>
				{#if state.receiptState.relays.length === 0}
					<p class="muted">Not started</p>
				{:else}
					{#each state.receiptState.relays as relay (relay.relay)}
						<div class="result">
							<strong class="break">{relay.relay}</strong>
							<p>
								{relay.state === 'subscribed' ? 'Connected · Subscribed' : relay.state}
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
			<h3>Candidate Zap Receipts</h3>
			{#if state.receiptState.candidates.length === 0}
				<p class="muted">No candidate Zap Receipt received yet</p>
			{:else}
				{#each state.receiptState.candidates as candidate, index (candidate.key)}
					<div class="result">
						<h3>Candidate Zap Receipt {index + 1}</h3>
						<dl>
							<dt>Event ID</dt>
							<dd class="break">
								{typeof candidate.event.id === 'string'
									? candidate.event.id
									: '(missing or malformed)'}
							</dd>
							<dt>Received from</dt>
							<dd><pre>{candidate.sourceRelays.join('\n')}</pre></dd>
						</dl>
						<h3>Raw event</h3>
						<pre>{state.formattedJson(candidate.event)}</pre>
					</div>
				{/each}
			{/if}
		</div>
	{:else}
		<p class="muted">
			Step 11 requires the verified payment handoff, signed Zap Request, recipient p tag, and at
			least one relay from its relays tag.
		</p>
	{/if}
</section>
<section>
	<h2><span>12</span> Validate Zap Receipt</h2>
	{#if state.receiptValidationReady()}
		<p class="notice">
			Validation starts only when requested. Candidate IDs are not trusted: each event ID and
			signature are independently verified.
		</p>
		{#each state.receiptState.candidates as candidate, index (candidate.key)}
			{@const validation = state.receiptValidations[candidate.key]}
			<div class="result">
				<h3>Candidate Zap Receipt {index + 1}</h3>
				<button
					onclick={() => state.validateCandidate(candidate.key, candidate.event)}
					disabled={validation === 'loading'}
				>
					{validation === 'loading' ? 'Validating…' : 'Validate Zap Receipt'}
				</button>
				{#if validation && validation !== 'loading'}
					<dl>
						<dt>Claimed event ID</dt>
						<dd class="break">{validation.claimedEventId ?? '(missing or malformed)'}</dd>
						<dt>Calculated event ID</dt>
						<dd class="break">{validation.calculatedEventId ?? '(not calculable)'}</dd>
						<dt>Event ID comparison</dt>
						<dd>
							{validation.claimedEventId === validation.calculatedEventId ? 'Match' : 'Mismatch'}
						</dd>
					</dl>
					{#each validation.sections as validationSection (validationSection.title)}
						<h3>{validationSection.title}</h3>
						<ul class="validation-checks">
							{#each validationSection.checks as check (check.id)}
								<li class={state.checkClass(check)}>
									<strong>{state.checkMark(check)} {check.label}</strong>
									<small
										>{check.level.toUpperCase()} · {check.status}{check.detail
											? ` · ${check.detail}`
											: ''}</small
									>
								</li>
							{/each}
						</ul>
					{/each}
					<h3>Description exact-string comparison</h3>
					<dl>
						<dt>Receipt description</dt>
						<dd class="break">{validation.receiptDescription ?? '(missing)'}</dd>
						<dt>Exact Zap Request JSON sent to callback</dt>
						<dd class="break">{validation.expectedDescription}</dd>
						<dt>Exact comparison</dt>
						<dd>
							{validation.receiptDescription === validation.expectedDescription
								? 'Match'
								: 'Mismatch'}
						</dd>
					</dl>
					<h3>Overall</h3>
					<p class={validation.valid ? 'success' : 'errors'}>
						<strong>{validation.valid ? '✓ Valid Zap Receipt' : '✕ Invalid Zap Receipt'}</strong>
					</p>
					<p class={validation.warningCount > 0 ? 'warning' : 'muted'}>
						Warnings: {validation.warningCount}
					</p>
				{/if}
			</div>
		{/each}
	{:else}
		<p class="muted">
			Step 12 requires at least one Step 11 candidate and the validated LNURL provider nostrPubkey.
		</p>
	{/if}
</section>
