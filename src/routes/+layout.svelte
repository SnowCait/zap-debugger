<script lang="ts">
	import type { Pathname } from '$app/types';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { locales, localizeHref } from '$lib/paraglide/runtime';
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();

	function localeHref(locale: (typeof locales)[number]) {
		return resolve(localizeHref(page.route.id ?? '/', { locale }) as Pathname);
	}
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
{@render children()}

<div style="display:none">
	{#each locales as locale (locale)}
		<a href={localeHref(locale)}>{locale}</a>
	{/each}
</div>
