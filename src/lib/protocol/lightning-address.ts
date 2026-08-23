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
	if (separator === -1) return { valid: false, errors: ['Lightning Address must contain @.'] };
	if (input.indexOf('@', separator + 1) !== -1) {
		return { valid: false, errors: ['Lightning Address must contain exactly one @.'] };
	}

	const username = input.slice(0, separator);
	const domain = input.slice(separator + 1);
	if (!username)
		errors.push('Username is required. The optional @domain shorthand is not supported.');
	if (!domain) errors.push('Domain is required.');
	if (username && !usernamePattern.test(username)) {
		errors.push('Username may contain only lowercase a-z, 0-9, -, _, ., and + for tags.');
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
				errors.push(
					'Domain must be a valid hostname without a scheme, port, path, or credentials.'
				);
			}
		} catch {
			errors.push('Domain must be a valid hostname.');
		}
	}

	return errors.length
		? { valid: false, errors }
		: { valid: true, value: { address: input, username, domain } };
}
