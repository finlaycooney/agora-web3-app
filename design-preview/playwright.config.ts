import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: '../tests/design-preview',
    fullyParallel: false,
    forbidOnly: Boolean(process.env.CI),
    retries: 0,
    reporter: 'list',
    outputDir: '../test-results/design-preview',
    use: {
        baseURL: 'http://127.0.0.1:3100',
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
    },
    projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
