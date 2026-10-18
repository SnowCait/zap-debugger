import { expect, it, vi } from 'vitest';
import { createZapDebuggerState } from './zap-debugger-state.svelte';

vi.mock(import('$lib/paraglide/runtime'), async (importOriginal) => ({
	...(await importOriginal()),
	getLocale: () => 'ja' as const
}));

it('localizes signer availability errors while preserving the condition that clears them', () => {
	const original = window.nostr;
	const state = createZapDebuggerState();
	try {
		delete window.nostr;
		state.refreshSignerAvailability();
		expect(state.signError).toBe('NIP-07 署名機能を利用できません');
		window.nostr = { getPublicKey: vi.fn(), signEvent: vi.fn() };
		state.refreshSignerAvailability();
		expect(state.signerAvailable).toBe(true);
		expect(state.signError).toBeUndefined();
		expect(window.nostr.signEvent).not.toHaveBeenCalled();
	} finally {
		window.nostr = original;
		state.dispose();
	}
});
