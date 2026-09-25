import { expect, test } from '@playwright/test';

test('staff area redirects unauthenticated visitors to the staff sign-in page', async ({ page }) => {
    await page.goto('/staff');
    await expect(page).toHaveURL(/\/staff\/sign-in/);
    await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible();
});

test('staff no-access page redirects unauthenticated visitors to sign-in', async ({ page }) => {
    await page.goto('/staff/no-access');
    await expect(page).toHaveURL(/\/staff\/sign-in/);
});
