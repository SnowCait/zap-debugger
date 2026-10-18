import { m } from '$lib/paraglide/messages';
import type { LightningAddress } from './lightning-address';

export type LnurlPayEndpoint = LightningAddress & { scheme: 'http' | 'https'; url: string };

export function resolveLnurlPayEndpoint(address: LightningAddress): LnurlPayEndpoint {
	if (!address.username || !address.domain)
		throw new Error(m.diagnostic_address_validated_required());
	const scheme = address.domain.toLowerCase().endsWith('.onion') ? 'http' : 'https';
	return {
		...address,
		scheme,
		url: `${scheme}://${address.domain}/.well-known/lnurlp/${address.username}`
	};
}
