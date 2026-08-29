import { describe, expect, it, vi } from 'vitest';
import {
	ZapReceiptSubscriptionController,
	buildZapReceiptReq,
	isZapReceiptCandidate,
	type WebSocketTransport,
	type ZapReceiptSubscriptionState
} from './zap-receipt-subscription';

class FakeSocket implements WebSocketTransport {
	readyState = 0;
	onopen: ((event: Event) => void) | null = null;
	onmessage: ((event: MessageEvent) => void) | null = null;
	onerror: ((event: Event) => void) | null = null;
	onclose: ((event: CloseEvent) => void) | null = null;
	sent: string[] = [];
	close = vi.fn();
	send(data: string) {
		this.sent.push(data);
	}
	open() {
		this.readyState = 1;
		this.onopen?.(new Event('open'));
	}
	message(value: unknown) {
		this.onmessage?.({
			data: typeof value === 'string' ? value : JSON.stringify(value)
		} as MessageEvent);
	}
}

const invoice = 'lnbc-current';
const pubkey = 'ab'.repeat(32);
const receipt = (id: string, invoiceValue = invoice) => ({
	id,
	kind: 9735,
	tags: [['bolt11', invoiceValue]],
	content: ''
});

function setup(relays = ['wss://relay-a.example']) {
	const sockets = new Map<string, FakeSocket>();
	let state: ZapReceiptSubscriptionState | undefined;
	const controller = new ZapReceiptSubscriptionController((relay) => {
		const socket = new FakeSocket();
		sockets.set(relay, socket);
		return socket;
	});
	controller.start({ relays, recipientPubkey: pubkey, invoice, onState: (next) => (state = next) });
	return { controller, sockets, state: () => state as ZapReceiptSubscriptionState };
}

describe('Zap Receipt subscription protocol', () => {
	it('constructs a kind 9735 and #p REQ without a #bolt11 filter', () => {
		const parsed = JSON.parse(buildZapReceiptReq('sub-1', pubkey));
		expect(parsed).toEqual(['REQ', 'sub-1', { kinds: [9735], '#p': [pubkey] }]);
		expect(parsed[2]).not.toHaveProperty('#bolt11');
	});

	it('matches any exact bolt11 tag while retaining the raw event', () => {
		const event = {
			kind: 9735,
			tags: [
				['bolt11', 'other'],
				['bolt11', invoice]
			],
			extra: true
		};
		expect(isZapReceiptCandidate(event, invoice)).toBe(true);
		expect(isZapReceiptCandidate(receipt('different', 'other'), invoice)).toBe(false);
		expect(isZapReceiptCandidate({ kind: 9735, tags: [['p', pubkey]] }, invoice)).toBe(false);
		expect(isZapReceiptCandidate({ kind: 1, tags: [['bolt11', invoice]] }, invoice)).toBe(false);
	});

	it('deduplicates event ids across relays and retains distinct events', () => {
		const { sockets, state } = setup(['wss://relay-a.example', 'wss://relay-b.example']);
		for (const socket of sockets.values()) socket.open();
		const sub = state().subscriptionId;
		sockets.get('wss://relay-a.example')?.message(['EVENT', sub, receipt('one')]);
		sockets.get('wss://relay-b.example')?.message(['EVENT', sub, receipt('one')]);
		sockets.get('wss://relay-a.example')?.message(['EVENT', sub, receipt('two')]);
		expect(state().candidates).toHaveLength(2);
		expect(state().candidates[0]?.sourceRelays).toEqual([
			'wss://relay-a.example',
			'wss://relay-b.example'
		]);
	});

	it('keeps listening after EOSE and observes NOTICE, CLOSED, and malformed JSON', () => {
		const { sockets, state } = setup();
		const socket = sockets.get('wss://relay-a.example') as FakeSocket;
		socket.open();
		const sub = state().subscriptionId;
		socket.message(['EOSE', sub]);
		expect(state().relays[0]).toMatchObject({ state: 'subscribed', eose: true });
		expect(socket.close).not.toHaveBeenCalled();
		socket.message(['NOTICE', 'rate limited']);
		expect(state().relays[0]?.notice).toBe('rate limited');
		socket.message('{bad json');
		expect(state().relays[0]?.error).toBe('Malformed relay message');
		socket.message(['CLOSED', sub, 'subscription rejected']);
		expect(state().relays[0]).toMatchObject({
			state: 'closed',
			closedMessage: 'subscription rejected'
		});
	});

	it('sends CLOSE, closes transports, and ignores stale session callbacks', () => {
		const { controller, sockets, state } = setup();
		const first = sockets.get('wss://relay-a.example') as FakeSocket;
		first.open();
		const firstSub = state().subscriptionId;
		const staleMessage = first.onmessage;
		const staleError = first.onerror;
		const staleClose = first.onclose;
		controller.stop();
		expect(first.sent).toContain(JSON.stringify(['CLOSE', firstSub]));
		expect(first.close).toHaveBeenCalledOnce();

		let current: ZapReceiptSubscriptionState | undefined;
		controller.start({
			relays: ['wss://relay-b.example'],
			recipientPubkey: pubkey,
			invoice,
			onState: (next) => (current = next)
		});
		staleMessage?.({ data: JSON.stringify(['EVENT', firstSub, receipt('stale')]) } as MessageEvent);
		staleError?.(new Event('error'));
		staleClose?.(new Event('close') as CloseEvent);
		expect(current?.candidates).toEqual([]);
		expect(current?.relays[0]).toMatchObject({
			relay: 'wss://relay-b.example',
			state: 'connecting'
		});
	});
});
