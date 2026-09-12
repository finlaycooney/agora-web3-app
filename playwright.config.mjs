import { defineConfig, devices } from '@playwright/test';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local', quiet: true });

export default defineConfig({
    testDir: './tests/e2e',
    fullyParallel: false,
    forbidOnly: Boolean(process.env.CI),
    retries: process.env.CI ? 2 : 0,
    reporter: process.env.CI ? 'github' : 'list',
    use: {
        baseURL: 'http://127.0.0.1:3000',
        trace: 'retain-on-failure',
    },
    webServer: {
        command: 'npm run dev -- --hostname 127.0.0.1',
        url: 'http://127.0.0.1:3000/jobs',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: {
            ...process.env,
            NEXTAUTH_URL: process.env.NEXTAUTH_URL || 'http://127.0.0.1:3000',
            NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET || 'local-playwright-secret',
            GITHUB_ID: process.env.GITHUB_ID || 'local-playwright-client',
            GITHUB_SECRET: process.env.GITHUB_SECRET || 'local-playwright-secret',
        },
    },
    projects: [
        { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
        { name: 'mobile-chromium', use: { ...devices['Pixel 5'] } },
    ],
});
