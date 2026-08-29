export type RelayConnectionState = 'connecting' | 'subscribed' | 'closed' | 'error';

export type RelayStatus = {
	relay: string;
	state: RelayConnectionState;
	eose: boolean;
	notice?: string;
	closedMessage?: string;
	error?: string;
};

export type ZapReceiptCandidate = {
	key: string;
	event: Record<string, unknown>;
	sourceRelays: string[];
};

export type ZapReceiptSubscriptionState = {
	waiting: boolean;
	subscriptionId?: string;
	relays: RelayStatus[];
	candidates: ZapReceiptCandidate[];
};

export interface WebSocketTransport {
	readonly readyState: number;
	onopen: ((event: Event) => void) | null;
	onmessage: ((event: MessageEvent) => void) | null;
	onerror: ((event: Event) => void) | null;
	onclose: ((event: CloseEvent) => void) | null;
	send(data: string): void;
	close(): void;
}

type SocketFactory = (relay: string) => WebSocketTransport;
type StateListener = (state: ZapReceiptSubscriptionState) => void;

const OPEN = 1;

export function buildZapReceiptReq(subscriptionId: string, recipientPubkey: string): string {
	return JSON.stringify(['REQ', subscriptionId, { kinds: [9735], '#p': [recipientPubkey] }]);
}

export function isZapReceiptCandidate(
	event: unknown,
	currentInvoice: string
): event is Record<string, unknown> {
	if (typeof event !== 'object' || event === null || Array.isArray(event)) return false;
	const record = event as Record<string, unknown>;
	if (record.kind !== 9735 || !Array.isArray(record.tags)) return false;
	return record.tags.some(
		(tag) => Array.isArray(tag) && tag[0] === 'bolt11' && tag[1] === currentInvoice
	);
}

export class ZapReceiptSubscriptionController {
	private generation = 0;
	private sockets = new Map<string, WebSocketTransport>();
	private state: ZapReceiptSubscriptionState = { waiting: false, relays: [], candidates: [] };
	private listener?: StateListener;
	private anonymousCandidate = 0;

	constructor(private readonly createSocket: SocketFactory = (relay) => new WebSocket(relay)) {}

	start(input: {
		relays: string[];
		recipientPubkey: string;
		invoice: string;
		onState: StateListener;
	}): void {
		this.stop();
		const generation = ++this.generation;
		const subscriptionId = `zap-${generation}-${Math.random().toString(36).slice(2, 8)}`;
		this.listener = input.onState;
		this.anonymousCandidate = 0;
		this.state = {
			waiting: true,
			subscriptionId,
			relays: input.relays.map((relay) => ({ relay, state: 'connecting', eose: false })),
			candidates: []
		};
		this.emit();

		for (const relay of input.relays) {
			let socket: WebSocketTransport;
			try {
				socket = this.createSocket(relay);
			} catch (error) {
				this.updateRelay(generation, relay, {
					state: 'error',
					error: error instanceof Error ? error.message : 'WebSocket construction failed'
				});
				continue;
			}
			this.sockets.set(relay, socket);
			socket.onopen = () => {
				if (!this.isCurrent(generation)) return;
				try {
					socket.send(buildZapReceiptReq(subscriptionId, input.recipientPubkey));
					this.updateRelay(generation, relay, { state: 'subscribed' });
				} catch (error) {
					this.updateRelay(generation, relay, {
						state: 'error',
						error: error instanceof Error ? error.message : 'Failed to subscribe'
					});
				}
			};
			socket.onmessage = (message) => {
				if (!this.isCurrent(generation) || typeof message.data !== 'string') return;
				this.handleMessage(generation, relay, subscriptionId, input.invoice, message.data);
			};
			socket.onerror = () =>
				this.updateRelay(generation, relay, { state: 'error', error: 'WebSocket error' });
			socket.onclose = () => this.updateRelay(generation, relay, { state: 'closed' });
		}
	}

	stop(): void {
		const subscriptionId = this.state.subscriptionId;
		this.generation += 1;
		for (const socket of this.sockets.values()) {
			if (subscriptionId && socket.readyState === OPEN) {
				try {
					socket.send(JSON.stringify(['CLOSE', subscriptionId]));
				} catch {
					// The socket may have closed between checking readyState and sending.
				}
			}
			socket.onopen = null;
			socket.onmessage = null;
			socket.onerror = null;
			socket.onclose = null;
			socket.close();
		}
		this.sockets.clear();
		this.listener = undefined;
		this.state = { waiting: false, relays: [], candidates: [] };
	}

	private handleMessage(
		generation: number,
		relay: string,
		subscriptionId: string,
		invoice: string,
		raw: string
	): void {
		let message: unknown;
		try {
			message = JSON.parse(raw);
		} catch {
			this.updateRelay(generation, relay, { error: 'Malformed relay message' });
			return;
		}
		if (!Array.isArray(message) || typeof message[0] !== 'string') return;
		if (message[0] === 'EVENT' && message[1] === subscriptionId) {
			if (isZapReceiptCandidate(message[2], invoice)) this.addCandidate(relay, message[2]);
		} else if (message[0] === 'EOSE' && message[1] === subscriptionId) {
			this.updateRelay(generation, relay, { eose: true });
		} else if (message[0] === 'NOTICE') {
			this.updateRelay(generation, relay, {
				notice: typeof message[1] === 'string' ? message[1] : formattedMessage(message[1])
			});
		} else if (message[0] === 'CLOSED' && message[1] === subscriptionId) {
			this.updateRelay(generation, relay, {
				state: 'closed',
				closedMessage: typeof message[2] === 'string' ? message[2] : formattedMessage(message[2])
			});
		}
	}

	private addCandidate(relay: string, event: Record<string, unknown>): void {
		const id = typeof event.id === 'string' && event.id.length > 0 ? event.id : undefined;
		const key = id ? `id:${id}` : `anonymous:${++this.anonymousCandidate}`;
		const existing = id
			? this.state.candidates.find((candidate) => candidate.key === key)
			: undefined;
		if (existing) {
			if (!existing.sourceRelays.includes(relay)) existing.sourceRelays.push(relay);
		} else {
			this.state.candidates.push({ key, event, sourceRelays: [relay] });
		}
		this.emit();
	}

	private updateRelay(
		generation: number,
		relay: string,
		patch: Partial<Omit<RelayStatus, 'relay'>>
	): void {
		if (!this.isCurrent(generation)) return;
		const status = this.state.relays.find((item) => item.relay === relay);
		if (!status) return;
		Object.assign(status, patch);
		this.emit();
	}

	private isCurrent(generation: number): boolean {
		return generation === this.generation && this.state.waiting;
	}

	private emit(): void {
		this.listener?.(structuredClone(this.state));
	}
}

function formattedMessage(value: unknown): string {
	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
}
