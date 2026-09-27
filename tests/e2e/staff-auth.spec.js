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

test('staff MFA pages redirect unauthenticated visitors to sign-in', async ({ page }) => {
    for (const path of ['/staff/mfa/enroll', '/staff/mfa/verify']) {
        await page.goto(path);
        await expect(page).toHaveURL(/\/staff\/sign-in/);
    }
});

test('staff workspace pages redirect unauthenticated visitors to sign-in', async ({ page }) => {
    const id = '00000000-0000-4000-8000-000000000000';
    for (const path of [
        '/staff/clients',
        '/staff/clients/new',
        `/staff/clients/${id}`,
        '/staff/jobs',
        '/staff/jobs/new',
        `/staff/jobs/${id}`,
        `/staff/jobs/${id}/edit`,
        '/staff/applications',
        '/staff/candidates',
        `/staff/candidates/${id}`,
        '/staff/members',
    ]) {
        await page.goto(path);
        await expect(page).toHaveURL(/\/staff\/sign-in/);
    }
});

test('staff data API routes reject unauthenticated requests', async ({ request }) => {
    const id = '00000000-0000-4000-8000-000000000000';
    for (const path of [
        '/api/staff/clients',
        `/api/staff/clients/${id}`,
        '/api/staff/jobs',
        `/api/staff/jobs/${id}/draft`,
        `/api/staff/jobs/${id}/revision`,
        `/api/staff/jobs/${id}/publish`,
        '/api/staff/applications',
        '/api/staff/candidates',
        '/api/staff/members',
    ]) {
        const response = await request.post(path, { data: {} });
        expect(response.status()).toBe(401);
    }
});

test('staff document download rejects unauthenticated requests', async ({ request }) => {
    const id = '00000000-0000-4000-8000-000000000000';
    const response = await request.get(`/api/staff/documents/${id}`);
    expect(response.status()).toBe(401);
});
