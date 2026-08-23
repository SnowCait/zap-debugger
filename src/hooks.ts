import type { Reroute } from '@sveltejs/kit';
import { base } from '$app/paths';
import { deLocalizeUrl } from '$lib/paraglide/runtime';

export const reroute: Reroute = (request) => {
	const url = new URL(request.url);
	url.pathname = url.pathname.slice(base.length) || '/';
	return `${base}${deLocalizeUrl(url).pathname}`;
};
