<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import type { ZapDebuggerState } from '$lib/zap-debugger-state.svelte';

	let { state }: { state: ZapDebuggerState } = $props();
</script>

<section>
	<h2><span>1</span> {m.validate_lightning_address()}</h2>
	<div class="grid">
		<div>
			<h3>{m.ui_input()}</h3>
			<label for="lightning-address">Lightning Address</label><input
				id="lightning-address"
				value={state.input}
				oninput={(event) => state.changeInput(event.currentTarget.value)}
				placeholder="alice@example.com"
				autocomplete="off"
				spellcheck="false"
			/><button onclick={state.validateAddress} disabled={!state.input}
				>{m.action_validate_address()}</button
			>
		</div>
		<div>
			<h3>{m.ui_transformation()}</h3>
			<p>
				{m.address_split_intro()} <code>@</code>
				{m.address_split_outro()}
			</p>
			<h3>{m.ui_validation()}</h3>
			{#if state.addressResult?.valid}<p class="success">
					✓ {m.address_valid()}
				</p>{:else if state.addressResult}<ul class="errors">
					{#each state.addressResult.errors as error (error)}<li>✕ {error}</li>{/each}
				</ul>{:else}<p class="muted">{m.ui_not_run()}</p>{/if}
		</div>
	</div>
	{#if state.address}<div class="output">
			<h3>{m.ui_output()}</h3>
			<dl>
				<dt>Lightning Address</dt>
				<dd>{state.address.address}</dd>
				<dt>{m.field_username()}</dt>
				<dd>{state.address.username}</dd>
				<dt>{m.field_domain()}</dt>
				<dd>{state.address.domain}</dd>
			</dl>
			<button onclick={state.resolveEndpoint}>{m.resolve_endpoint()}</button>
		</div>{/if}
</section>
<section>
	<h2><span>2</span> {m.resolve_endpoint()}</h2>
	{#if state.endpoint}<div class="grid">
			<div>
				<h3>{m.ui_input()}</h3>
				<dl>
					<dt>Lightning Address</dt>
					<dd>{state.endpoint.address}</dd>
					<dt>{m.field_username()}</dt>
					<dd>{state.endpoint.username}</dd>
					<dt>{m.field_domain()}</dt>
					<dd>{state.endpoint.domain}</dd>
				</dl>
			</div>
			<div>
				<h3>{m.ui_transformation()}</h3>
				<p>
					{m.endpoint_scheme_intro()} <code>http</code>
					{m.endpoint_onion_intro()} <code>.onion</code>{m.endpoint_otherwise()}
					<code>https</code>{m.endpoint_path_instruction()}
				</p>
				<h3>{m.ui_validation()}</h3>
				<p class="success">✓ {m.endpoint_resolved()}</p>
			</div>
		</div>
		<div class="output">
			<h3>{m.ui_output()}</h3>
			<dl>
				<dt>{m.field_scheme()}</dt>
				<dd>{state.endpoint.scheme}</dd>
				<dt>{m.field_resolved_url()}</dt>
				<dd class="break">{state.endpoint.url}</dd>
			</dl>
			<button onclick={state.runGet} disabled={state.loading}
				>{state.loading ? m.ui_requesting() : m.action_get_endpoint()}</button
			>
		</div>{:else}<p class="muted">{m.endpoint_prerequisite()}</p>{/if}
</section>
<section>
	<h2><span>3</span> {m.fetch_lnurl_response()}</h2>
	{#if state.http}<h3>{m.http_request()}</h3>
		<dl>
			<dt>{m.field_method()}</dt>
			<dd>{state.http.method}</dd>
			<dt>{m.field_request_url()}</dt>
			<dd class="break">{state.http.url}</dd>
		</dl>
		{#if state.http.error}<p class="errors" role="alert">
				✕ {state.http.error}
			</p>{/if}{#if state.http.status !== undefined}<h3>{m.http_response()}</h3>
			<dl>
				<dt>{m.field_status()}</dt>
				<dd>{state.http.status}</dd>
				<dt>{m.field_status_text()}</dt>
				<dd>{state.http.statusText || m.ui_empty()}</dd>
			</dl>{/if}
		<div class="raw-grid grid">
			<div>
				<h3>{m.raw_response_body()}</h3>
				<pre>{state.http.rawBody ?? m.ui_unavailable()}</pre>
			</div>
			<div>
				<h3>{m.parsed_json()}</h3>
				<pre>{state.http.json === undefined
						? m.ui_unavailable()
						: state.formattedJson(state.http.json)}</pre>
			</div>
		</div>
		{#if state.lud06?.kind === 'error'}<div class="result">
				<h3>{m.lud06_error_response()}</h3>
				<dl>
					<dt>{m.field_status()}</dt>
					<dd>{state.lud06.status}</dd>
					<dt>{m.field_reason()}</dt>
					<dd>{state.lud06.reason}</dd>
				</dl>
				<p>{m.pay_request_not_continued()}</p>
			</div>
		{:else if state.lud06?.kind === 'payRequest'}<div class="result">
				<h3>
					{m.lud06_validation_result({ result: state.lud06.valid ? m.ui_valid() : m.ui_invalid() })}
				</h3>
				<ul class="checks">
					{#each state.lud06.items as item (item.label)}<li class:failed={!item.valid}>
							{item.valid ? '✓' : '✕'}
							{item.label}
						</li>{/each}
				</ul>
				<h3>{m.extracted_output()}</h3>
				<dl>
					<dt>Callback</dt>
					<dd>{state.lud06.data.callback ?? m.ui_unavailable()}</dd>
					<dt>{m.field_minimum_msat()}</dt>
					<dd>{state.lud06.data.minSendable ?? m.ui_unavailable()}</dd>
					<dt>{m.field_maximum_msat()}</dt>
					<dd>{state.lud06.data.maxSendable ?? m.ui_unavailable()}</dd>
					<dt>allowsNostr</dt>
					<dd>{state.formattedJson(state.lud06.data.allowsNostr)}</dd>
					<dt>{m.field_provider_pubkey()}</dt>
					<dd class="break">
						{typeof state.lud06.data.nostrPubkey === 'string'
							? state.lud06.data.nostrPubkey
							: m.ui_unavailable()}
					</dd>
				</dl>
				<div class="raw-grid grid">
					<div>
						<h3>{m.raw_metadata()}</h3>
						<pre>{state.lud06.data.metadata ?? m.ui_unavailable()}</pre>
					</div>
					<div>
						<h3>{m.parsed_metadata()}</h3>
						<pre>{state.lud06.data.parsedMetadata === undefined
								? m.ui_unavailable()
								: state.formattedJson(state.lud06.data.parsedMetadata)}</pre>
					</div>
				</div>
			</div>{/if}
		{#if state.nip57}<div class="result">
				<h3>
					{m.nip57_support_result({
						result:
							state.nip57.status === 'supported'
								? m.ui_supported()
								: state.nip57.status === 'not-supported'
									? m.ui_not_supported()
									: m.ui_invalid_advertisement()
					})}
				</h3>
				{#if state.nip57.reason}<p>
						<strong>{m.reason_prefix()}</strong>
						{state.nip57.reason}
					</p>{/if}
				<ul class="checks">
					{#each state.nip57.items as item (item.label)}<li class:failed={!item.valid}>
							{item.valid ? '✓' : '✕'}
							{item.label}
						</li>{/each}
				</ul>
			</div>{/if}
	{:else}<p class="muted">
			{m.fetch_response_prerequisite()}
		</p>{/if}
</section>
