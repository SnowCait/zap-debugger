import { m } from '$lib/paraglide/messages';
import type { ValidationItem } from './validation';

export type AmountValidation = {
	input: string;
	amount?: number;
	items: ValidationItem[];
	valid: boolean;
};

export function validateZapAmount(
	input: string,
	minSendable: number,
	maxSendable: number
): AmountValidation {
	const decimalInteger = /^[0-9]+$/.test(input);
	const parsed = decimalInteger ? Number(input) : Number.NaN;
	const safeInteger = decimalInteger && Number.isSafeInteger(parsed);
	const amount = safeInteger ? parsed : undefined;
	const items: ValidationItem[] = [
		{ label: m.diagnostic_parameters_amount_integer(), valid: safeInteger },
		{ label: m.diagnostic_parameters_amount_positive(), valid: amount !== undefined && amount > 0 },
		{
			label: m.diagnostic_amount_min({ minSendable }),
			valid: amount !== undefined && amount >= minSendable
		},
		{
			label: m.diagnostic_amount_max({ maxSendable }),
			valid: amount !== undefined && amount <= maxSendable
		}
	];
	return { input, amount, items, valid: items.every((item) => item.valid) };
}

export type RelayValidation = {
	input: string;
	relays: string[];
	items: ValidationItem[];
	valid: boolean;
};

export function parseRelays(input: string): RelayValidation {
	const relays = input
		.split(/\r?\n/)
		.map((relay) => relay.trim())
		.filter(Boolean);
	const everyValid = relays.every((relay) => {
		try {
			const url = new URL(relay);
			return (url.protocol === 'ws:' || url.protocol === 'wss:') && url.hostname.length > 0;
		} catch {
			return false;
		}
	});
	const items = [
		{ label: m.diagnostic_parameters_relay_exists(), valid: relays.length > 0 },
		{ label: m.diagnostic_parameters_relay_scheme(), valid: relays.length > 0 && everyValid }
	];
	return { input, relays, items, valid: items.every((item) => item.valid) };
}
