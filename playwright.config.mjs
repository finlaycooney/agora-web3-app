import { defineConfig, devices } from '@playwright/test';
import { config as loadEnv } from 'dotenv';
import { assertNonproductionTestEnvironment } from './tests/support/nonproduction.js';

loadEnv({ path: '.env.local', quiet: true });
assertNonproductionTestEnvironment();

export default defineConfig({
    testDir: './tests/e2e',
    fullyParallel: false,
    forbidOnly: Boolean(process.env.CI),
    retries: process.env.CI ? 2 : 0,
    // One worker on CI: Beams (home, /jobs) and FaultyTerminal render with
    // software WebGL on runners, and two browsers plus the dev server starve
    // each other into hydration and navigation timeouts.
    workers: process.env.CI ? 1 : undefined,
    reporter: process.env.CI ? 'github' : 'list',
    use: {
        baseURL: 'http://127.0.0.1:3000',
        trace: 'retain-on-failure',
        // Functional specs run with reduced motion, so the WebGL backgrounds
        // (Beams, FaultyTerminal) paint one still frame instead of animating.
        // Animated, they hold the main thread on software GL (CI runners have
        // no GPU) and clicks and navigations time out. visual-components.spec
        // overrides this and covers both motion settings.
        reducedMotion: 'reduce',
    },
    webServer: {
        command: 'npm run dev -- --hostname 127.0.0.1',
        url: 'http://127.0.0.1:3000/jobs',
        reuseExistingServer: false,
        timeout: 120_000,
        env: {
            ...process.env,
            NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
            SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
            NEXTAUTH_URL: process.env.NEXTAUTH_URL || 'http://127.0.0.1:3000',
            NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET || 'local-playwright-secret',
        },
    },
    projects: [
        { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
        { name: 'mobile-chromium', use: { ...devices['Pixel 5'] } },
    ],
});
