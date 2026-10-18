import { defineConfig } from '@playwright/test';

const baseURL = `http://localhost:4173${process.env.BASE_PATH ?? ''}/`;

export default defineConfig({
	use: { baseURL },
	webServer: { command: 'npm run build && npm run preview', url: baseURL },
	testMatch: '**/*.e2e.{ts,js}'
});
