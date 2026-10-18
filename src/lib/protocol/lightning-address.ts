import { m } from '$lib/paraglide/messages';
export type LightningAddress = {
	address: string;
	username: string;
	domain: string;
};

export type AddressParseResult =
	{ valid: true; value: LightningAddress } | { valid: false; errors: string[] };

const usernamePattern = /^[a-z0-9._+-]+$/;

export function parseLightningAddress(input: string): AddressParseResult {
	const errors: string[] = [];
	const separator = input.indexOf('@');
	if (separator === -1) return { valid: false, errors: [m.diagnostic_address_contains_at()] };
	if (input.indexOf('@', separator + 1) !== -1) {
		return { valid: false, errors: [m.diagnostic_address_one_at()] };
	}

	const username = input.slice(0, separator);
	const domain = input.slice(separator + 1);
	if (!username) errors.push(m.diagnostic_address_username_required());
	if (!domain) errors.push(m.diagnostic_address_domain_required());
	if (username && !usernamePattern.test(username)) {
		errors.push(m.diagnostic_address_username_characters());
	}
	if (domain) {
		try {
			const url = new URL(`https://${domain}`);
			if (
				url.hostname !== domain.toLowerCase() ||
				url.username ||
				url.password ||
				url.port ||
				url.pathname !== '/'
			) {
				errors.push(m.diagnostic_address_domain_structure());
			}
		} catch {
			errors.push(m.diagnostic_address_domain_invalid());
		}
	}

	return errors.length
		? { valid: false, errors }
		: { valid: true, value: { address: input, username, domain } };
}
