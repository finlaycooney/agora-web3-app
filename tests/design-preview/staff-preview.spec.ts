import { fileURLToPath } from 'node:url';

import { expect, test, type Page } from '@playwright/test';

const SCREENSHOT_DIR = fileURLToPath(
    new URL('../../test-results/design-preview', import.meta.url),
);

async function expectNoConsoleErrors(page: Page, errors: string[]) {
    expect(errors, `console errors on ${page.url()}`).toEqual([]);
}

function watchConsole(page: Page, errors: string[]) {
    page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));
}

async function gotoHash(page: Page, hash: string) {
    await page.evaluate((value) => {
        window.location.hash = value;
    }, hash);
}

function watchRequests(page: Page, external: string[]) {
    page.on('request', (request) => {
        const url = request.url();
        const allowed =
            url.startsWith('http://127.0.0.1:3100')
            || url.startsWith('ws://127.0.0.1:3100')
            || url.startsWith('data:')
            || url.startsWith('blob:')
            || url === 'about:blank';
        if (!allowed) external.push(url);
    });
}

test.describe('staff design preview', () => {
    test('candidate list renders, search and detail flows work', async ({ page }) => {
        const errors: string[] = [];
        const external: string[] = [];
        watchConsole(page, errors);
        watchRequests(page, external);
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.goto('/#/candidates');

        await expect(page.getByRole('heading', { name: 'Candidates', level: 1 })).toBeVisible();
        await expect(page.getByText('Design preview · synthetic data')).toBeVisible();
        await expect(
            page.getByText('Design preview only. Changes reset on refresh'),
        ).toBeVisible();
        await expect(page.getByRole('link', { name: 'Alex Morgan' })).toBeVisible();

        await page.screenshot({ path: `${SCREENSHOT_DIR}/candidates-desktop.png`, fullPage: false });

        const search = page.getByLabel('Search');
        await search.fill('nobody-matches-this');
        await expect(page.getByText('No candidates match these filters')).toBeVisible();
        await page.getByRole('button', { name: 'Clear filters' }).first().click();
        await expect(page.getByRole('link', { name: 'Alex Morgan' })).toBeVisible();

        await search.fill('morgan');
        await page.getByRole('link', { name: 'Alex Morgan' }).click();

        const drawer = page.getByRole('dialog', { name: 'Alex Morgan' });
        await expect(drawer).toBeVisible();
        await expect(drawer.getByRole('tab', { name: 'Overview' })).toBeVisible();
        await expect(drawer.getByText('Led reusable component and accessibility work.')).toBeVisible();
        expect(page.url()).not.toContain('#/candidates/demo-01');
        await page.waitForTimeout(450);
        await page.screenshot({ path: `${SCREENSHOT_DIR}/candidate-drawer.png` });

        await page.keyboard.press('Escape');
        await expect(drawer).toHaveCount(0);
        await expect(page.getByRole('link', { name: 'Alex Morgan' })).toBeFocused();

        await page.getByRole('link', { name: 'Alex Morgan' }).click();
        await page.getByRole('link', { name: 'Open full profile' }).click();
        await expect(
            page.getByRole('heading', { name: 'Alex Morgan', level: 1 }),
        ).toBeVisible();
        await expect(page.getByRole('dialog')).toHaveCount(0);
        await expect(
            page.getByRole('heading', { name: 'Experience' }),
        ).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Skills' })).toBeVisible();
        await expect(page.getByText('Sample product team')).toBeVisible();

        // Latest note card sits on the overview and switches tabs in place.
        await expect(page.getByRole('heading', { name: 'Latest note' })).toBeVisible();
        await expect(page.getByText('Strong system-design instincts.')).toBeVisible();
        await page.getByRole('button', { name: /View all notes/ }).click();
        await expect(page.getByRole('tab', { name: /Notes/ })).toHaveAttribute(
            'aria-selected',
            'true',
        );
        await page.getByRole('tab', { name: 'Overview' }).click();
        await page.getByRole('button', { name: 'Add note' }).last().click();
        await expect(page.getByLabel('Add a note')).toBeFocused();
        await page.getByRole('tab', { name: 'Overview' }).click();

        const tabsList = page.getByRole('tablist', { name: 'Candidate sections' });
        const tabsNoOverflow = await tabsList.evaluate(
            (element) =>
                element.scrollWidth <= element.clientWidth
                && element.scrollHeight <= element.clientHeight,
        );
        expect(tabsNoOverflow).toBe(true);
        await page.screenshot({ path: `${SCREENSHOT_DIR}/candidate-detail-desktop.png` });

        await page.setViewportSize({ width: 390, height: 844 });
        const tabsMobileNoOverflow = await tabsList.evaluate(
            (element) =>
                element.scrollWidth <= element.clientWidth
                && element.scrollHeight <= element.clientHeight,
        );
        expect(tabsMobileNoOverflow).toBe(true);
        const pageMobileOverflow = await page.evaluate(
            () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
        );
        expect(pageMobileOverflow).toBe(false);
        await page.screenshot({ path: `${SCREENSHOT_DIR}/candidate-tabs-mobile.png` });
        await page.setViewportSize({ width: 1440, height: 1000 });

        await page.getByRole('button', { name: 'Edit tags' }).click();
        await page.getByRole('checkbox', { name: 'Remote' }).check();
        await page.keyboard.press('Escape');
        await expect(page.getByText('Remote').first()).toBeVisible();

        await page.getByRole('tab', { name: /Notes/ }).click();
        const noteBox = page.getByLabel('Add a note');
        await noteBox.fill('Design preview note from the smoke test.');
        await page.getByRole('button', { name: 'Save note' }).click();
        await expect(page.getByText('Design preview note from the smoke test.')).toBeVisible();
        await expect(page.getByRole('status')).toContainText('Demo note saved.');

        // The saved note immediately becomes the latest note on the overview.
        await page.getByRole('tab', { name: 'Overview' }).click();
        await expect(
            page.getByText('Design preview note from the smoke test.'),
        ).toBeVisible();

        await page.getByRole('link', { name: 'Candidates' }).first().click();
        await expect(page.getByLabel('Search')).toHaveValue('morgan');
        await expect(page.getByRole('link', { name: 'Alex Morgan' })).toBeVisible();

        await expectNoConsoleErrors(page, errors);
        expect(external, 'external network requests').toEqual([]);
    });

    test('import wizard completes with 2 added and 1 skipped', async ({ page }) => {
        const errors: string[] = [];
        watchConsole(page, errors);
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.goto('/#/import');

        await expect(
            page.getByRole('heading', { name: 'Import candidates', level: 1 }),
        ).toBeVisible();
        await page.getByRole('button', { name: 'Use sample CSV' }).click();
        await expect(page.getByText('Sample CSV loaded — 3 records')).toBeVisible();
        await page.getByRole('button', { name: 'Continue' }).click();

        await expect(page.getByRole('heading', { name: 'Map CSV columns' })).toBeVisible();
        await page.getByRole('button', { name: 'Continue' }).click();

        await expect(page.getByText('2 ready · 1 possible match')).toBeVisible();
        await expect(page.getByText('Possible match — Skip')).toBeVisible();
        await page.screenshot({ path: `${SCREENSHOT_DIR}/import-review.png` });
        await page
            .getByRole('checkbox', {
                name: 'Import only the ready records; skip the possible match',
            })
            .check();
        await page.getByRole('button', { name: 'Import 2 demo candidates' }).click();

        await expect(page.getByRole('heading', { name: 'Import complete' })).toBeVisible();
        await expect(page.getByText('2 added', { exact: true })).toBeVisible();
        await expect(page.getByText('1 skipped', { exact: true })).toBeVisible();

        await page.getByRole('link', { name: 'View candidates' }).click();
        await expect(page.getByRole('heading', { name: 'Candidates', level: 1 })).toBeVisible();
        await expect(page.getByRole('link', { name: 'Nina Patel' })).toBeVisible();
        await expect(page.getByRole('link', { name: 'Owen Brooks' })).toBeVisible();

        await expectNoConsoleErrors(page, errors);
    });

    test('field mappings drive imported data', async ({ page }) => {
        const errors: string[] = [];
        watchConsole(page, errors);
        await page.goto('/#/import');

        await page.getByRole('button', { name: 'Use sample CSV' }).click();
        await page.getByRole('button', { name: 'Continue' }).click();

        await page.getByLabel('Map Notes to').click();
        await page.getByRole('option', { name: 'Do not import' }).click();
        await page.getByLabel('Shared tag for imported candidates').click();
        await page.getByRole('option', { name: 'Remote' }).click();
        await page.getByRole('button', { name: 'Continue' }).click();

        await page
            .getByRole('checkbox', {
                name: 'Import only the ready records; skip the possible match',
            })
            .check();
        await page.getByRole('button', { name: 'Import 2 demo candidates' }).click();
        await expect(page.getByRole('heading', { name: 'Import complete' })).toBeVisible();

        await page.getByRole('link', { name: 'View candidates' }).click();
        await page.getByRole('link', { name: 'Nina Patel' }).click();
        await page.getByRole('link', { name: 'Open full profile' }).click();
        await expect(
            page.getByRole('heading', { name: 'Nina Patel', level: 1 }),
        ).toBeVisible();
        await expect(page.getByRole('dialog')).toHaveCount(0);
        await expect(page.getByText('Remote').first()).toBeVisible();
        await page.getByRole('tab', { name: /Notes/ }).click();
        await expect(page.getByText('No notes yet')).toBeVisible();

        await expectNoConsoleErrors(page, errors);
    });

    test('re-importing the same sample leaves no new records', async ({ page }) => {
        const errors: string[] = [];
        watchConsole(page, errors);
        await page.goto('/#/import');

        await page.getByRole('button', { name: 'Use sample CSV' }).click();
        await page.getByRole('button', { name: 'Continue' }).click();
        await page.getByRole('button', { name: 'Continue' }).click();
        await page
            .getByRole('checkbox', {
                name: 'Import only the ready records; skip the possible match',
            })
            .check();
        await page.getByRole('button', { name: 'Import 2 demo candidates' }).click();
        await expect(page.getByRole('heading', { name: 'Import complete' })).toBeVisible();

        await page.getByRole('link', { name: 'View candidates' }).click();
        await gotoHash(page, '#/import');
        await page.getByRole('button', { name: 'Use sample CSV' }).click();
        await page.getByRole('button', { name: 'Continue' }).click();
        await page.getByRole('button', { name: 'Continue' }).click();

        await expect(page.getByText('0 ready · 3 possible matches')).toBeVisible();
        await expect(
            page.getByRole('button', { name: 'No new records to import' }),
        ).toBeDisabled();

        await expectNoConsoleErrors(page, errors);
    });

    test('restricted candidate is masked in lists and queues', async ({ page }) => {
        const errors: string[] = [];
        watchConsole(page, errors);
        await page.goto('/#/candidates');

        await page.getByLabel('Search').fill('Engineering Manager');
        await expect(page.getByText('No candidates match these filters')).toBeVisible();
        await page.getByRole('button', { name: 'Clear filters' }).first().click();

        await page.getByLabel('Search').fill('Taylor');
        await expect(page.getByRole('link', { name: 'Taylor Quinn' })).toBeVisible();
        await expect(page.getByText('taylor.quinn@reserved.example')).toHaveCount(0);
        await expect(page.getByText('Engineering Manager')).toHaveCount(0);

        await page.getByRole('link', { name: 'Taylor Quinn' }).click();
        const restrictedDrawer = page.getByRole('dialog', { name: 'Taylor Quinn' });
        await expect(restrictedDrawer).toBeVisible();
        await expect(restrictedDrawer.getByText('Record demo-05').first()).toBeVisible();
        await expect(restrictedDrawer.getByRole('tab')).toHaveCount(0);
        await expect(
            restrictedDrawer.getByRole('link', { name: /Open privacy case/ }),
        ).toBeVisible();
        await expect(
            restrictedDrawer.getByText('taylor.quinn@reserved.example'),
        ).toHaveCount(0);
        await page.keyboard.press('Escape');
        await expect(restrictedDrawer).toHaveCount(0);

        await page.goto('/#/applications');
        await expect(page.getByText('Taylor Quinn')).toHaveCount(0);

        await page.goto('/#/overview');
        await expect(page.getByText('Taylor Quinn — Engineering Manager')).toHaveCount(0);

        await expectNoConsoleErrors(page, errors);
    });

    test('manual add validates input and reset restores demo data', async ({ page }) => {
        const errors: string[] = [];
        watchConsole(page, errors);
        await page.goto('/#/candidates');

        await page.getByRole('button', { name: 'Add candidate' }).click();
        const dialog = page.getByRole('dialog');
        await dialog.getByLabel('Name').fill('Casey Demo');
        await dialog.getByLabel('Email (optional)').fill('not-an-email');
        await dialog.getByRole('button', { name: 'Add demo candidate' }).click();
        await expect(dialog).toBeVisible();
        await expect(page.getByRole('link', { name: 'Casey Demo' })).toHaveCount(0);

        await dialog.getByLabel('Email (optional)').fill('casey.demo@reserved.example');
        await dialog.getByRole('button', { name: 'Add demo candidate' }).click();
        await expect(dialog).toHaveCount(0);
        await expect(page.getByRole('link', { name: 'Casey Demo' })).toBeVisible();
        await expect(page.getByText('All 13')).toBeVisible();

        await page.getByRole('link', { name: 'Casey Demo' }).click();
        await page.getByRole('link', { name: 'Open full profile' }).click();
        await expect(page.getByRole('dialog')).toHaveCount(0);
        await expect(page.getByText('Manual').first()).toBeVisible();
        await page.getByRole('link', { name: 'Candidates' }).first().click();

        await page.getByLabel('Search').fill('casey');
        await page.getByRole('button', { name: 'Reset preview' }).click();
        await page
            .getByRole('dialog')
            .getByRole('button', { name: 'Reset preview' })
            .click();
        await expect(page.getByLabel('Search')).toHaveValue('');
        await expect(page.getByText('All 12')).toBeVisible();
        await expect(page.getByRole('link', { name: 'Casey Demo' })).toHaveCount(0);

        await expectNoConsoleErrors(page, errors);
    });

    test('mobile viewport has no overflow and sheet works', async ({ page }) => {
        const errors: string[] = [];
        watchConsole(page, errors);
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto('/#/candidates');

        const hasOverflow = await page.evaluate(
            () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
        );
        expect(hasOverflow).toBe(false);

        const menuButton = page.getByRole('button', { name: 'Open navigation' });
        await menuButton.click();
        const navSheet = page.getByRole('dialog');
        await expect(navSheet).toBeVisible();
        await expect(navSheet.getByRole('link', { name: 'Candidates' })).toBeVisible();
        await page.waitForTimeout(400);
        await page.screenshot({ path: `${SCREENSHOT_DIR}/mobile-nav.png` });

        await page.keyboard.press('Escape');
        await expect(navSheet).toHaveCount(0);
        await expect(menuButton).toBeFocused();

        await expectNoConsoleErrors(page, errors);
    });

    test('applications filters, grouping, deep links and views', async ({ page }) => {
        const errors: string[] = [];
        const external: string[] = [];
        watchConsole(page, errors);
        watchRequests(page, external);
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.goto('/#/applications');

        const status = page.getByRole('status');
        await expect(page.getByRole('heading', { name: 'Applications', level: 1 })).toBeVisible();
        await expect(status).toHaveText('9 applications');
        await expect(page.getByRole('button', { name: 'All applications 9' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'New 3' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Reviewing 4' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Interview 2' })).toBeVisible();
        await expect(page.getByText('Taylor Quinn')).toHaveCount(0);
        await page.screenshot({ path: `${SCREENSHOT_DIR}/applications-stage-cards.png` });

        // The large stage cards are the only stage filter control.
        await page.getByRole('button', { name: 'New 3' }).click();
        await expect(status).toHaveText('3 applications');
        await expect(page.getByRole('button', { name: 'New 3' })).toHaveAttribute(
            'aria-pressed',
            'true',
        );
        await page.getByRole('button', { name: 'Interview 2' }).click();
        await expect(status).toHaveText('2 applications');
        await expect(page.getByRole('button', { name: 'Interview 2' })).toHaveAttribute(
            'aria-pressed',
            'true',
        );
        await page.getByRole('button', { name: 'All applications 9' }).click();
        await expect(status).toHaveText('9 applications');

        // Owner filtering includes the current user's applications.
        await page.getByLabel('Filter by owner').click();
        await page.getByRole('option', { name: 'Mine · Jamie Taylor' }).click();
        await expect(status).toHaveText('6 applications');
        await page.getByLabel('Filter by owner').click();
        await page.getByRole('option', { name: 'Priya Shah' }).click();
        await expect(status).toHaveText('3 applications');
        await page.getByLabel('Filter by owner').click();
        await page.getByRole('option', { name: 'All owners' }).click();
        await expect(status).toHaveText('9 applications');

        // Client + stage + date compose.
        await page.getByLabel('Filter by client').click();
        await page.getByRole('option', { name: 'Meridian', exact: true }).click();
        await expect(status).toHaveText('4 applications');
        await page.getByRole('button', { name: 'Reviewing 2' }).click();
        await expect(status).toHaveText('2 applications');
        await page.getByLabel('Filter by received date').click();
        await page.getByRole('option', { name: 'Last 7 days' }).click();
        await expect(status).toHaveText('1 application');

        // Clear filters restores everything and keeps the current view.
        await page.getByRole('button', { name: 'Clear filters' }).click();
        await expect(status).toHaveText('9 applications');
        await expect(page.getByRole('button', { name: 'Table' })).toHaveAttribute(
            'aria-pressed',
            'true',
        );

        // Fixed date ranges on the sample timeline.
        await page.getByLabel('Filter by received date').click();
        await page.getByRole('option', { name: 'Last 7 days' }).click();
        await expect(status).toHaveText('5 applications');
        await page.getByLabel('Filter by received date').click();
        await page.getByRole('option', { name: 'Last 30 days' }).click();
        await expect(status).toHaveText('9 applications');

        // Custom range.
        await page.getByLabel('Filter by received date').click();
        await page.getByRole('option', { name: 'Custom range' }).click();
        await page.getByLabel('From', { exact: true }).fill('2026-09-23');
        await page.getByLabel('To', { exact: true }).fill('2026-09-23');
        await expect(status).toHaveText('2 applications');

        // Invalid custom range shows an error and hides results.
        await page.getByLabel('From', { exact: true }).fill('2026-09-24');
        await expect(
            page.getByRole('alert').filter({ hasText: 'From date is after the To date' }),
        ).toBeVisible();
        await expect(status).toContainText('Fix the date range');
        await page.getByRole('button', { name: 'Clear filters' }).click();
        await expect(status).toHaveText('9 applications');

        // Grouped table view.
        await page.getByLabel('Group by').click();
        await page.getByRole('option', { name: 'Client' }).click();
        await expect(
            page.getByRole('heading', { name: /Atlas Network/ }),
        ).toContainText('3 applications');
        await expect(
            page.getByRole('heading', { name: /Meridian/ }),
        ).toContainText('4 applications');
        await expect(
            page.getByRole('heading', { name: /Northstar Labs/ }),
        ).toContainText('2 applications');
        await page.screenshot({ path: `${SCREENSHOT_DIR}/applications-grouped-table.png` });

        // Card view keeps the same filters and grouping.
        await page.getByRole('button', { name: 'Cards' }).click();
        await expect(status).toHaveText('9 applications');
        await expect(page.getByRole('heading', { name: /Meridian/ })).toBeVisible();
        await page.screenshot({ path: `${SCREENSHOT_DIR}/applications-cards.png` });

        await expect(
            page.getByRole('link', { name: 'Atlas Network' }).first(),
        ).toHaveAttribute('href', '#/clients/atlas');

        const aliceCard = page.locator('[data-testid="application-card-app-103"]');
        const aliceCardBox = await aliceCard.boundingBox();
        if (!aliceCardBox) throw new Error('application card not rendered');
        await page.mouse.click(
            aliceCardBox.x + aliceCardBox.width - 8,
            aliceCardBox.y + 8,
        );
        const cardDrawer = page.getByRole('dialog', { name: 'Alice Chen' });
        await expect(cardDrawer).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(cardDrawer).toHaveCount(0);
        await expect(aliceCard.getByRole('link', { name: 'Alice Chen' })).toBeFocused();

        await aliceCard.getByRole('link', { name: 'Atlas Network' }).click();
        await expect(
            page.getByRole('heading', { name: 'Atlas Network', level: 1 }),
        ).toBeVisible();

        // View preference survives a deep link that reapplies filters.
        await gotoHash(page, '#/applications?stage=New');
        await expect(status).toHaveText('3 applications');
        await expect(page.getByRole('button', { name: 'Cards' })).toHaveAttribute(
            'aria-pressed',
            'true',
        );

        // Client + job deep link: removing the client chip also clears the job
        // filter and preserves the card view and client grouping.
        await gotoHash(page, '#/applications?client=northstar&job=job-frontend');
        await expect(status).toHaveText('1 application');
        await expect(page.getByText('Alex Morgan')).toBeVisible();
        await page.getByRole('button', { name: /Remove client filter/ }).click();
        await expect(status).toHaveText('9 applications');
        await expect(
            page.getByRole('button', { name: /Remove job filter/ }),
        ).toHaveCount(0);
        await expect(
            page.getByRole('button', { name: /Remove client filter/ }),
        ).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Cards' })).toHaveAttribute(
            'aria-pressed',
            'true',
        );
        await expect(page.getByLabel('Group by')).toHaveText('Client');

        // Unknown client deep link shows an invalid-filter state.
        await gotoHash(page, '#/applications?client=unknown-co');
        await expect(
            page.getByRole('alert').filter({ hasText: 'Unknown client filter' }),
        ).toBeVisible();
        await expect(status).toHaveText('0 applications');

        await expectNoConsoleErrors(page, errors);
        expect(external, 'external network requests').toEqual([]);
    });

    test('clients list and client detail', async ({ page }) => {
        const errors: string[] = [];
        watchConsole(page, errors);
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.goto('/#/clients');

        await expect(page.getByRole('heading', { name: 'Clients', level: 1 })).toBeVisible();
        await expect(page.getByRole('status')).toHaveText('3 clients');
        const northstar = page.getByRole('link', { name: 'Northstar Labs' }).first();
        await expect(northstar).toBeVisible();
        await expect(page.getByRole('link', { name: 'Meridian', exact: true })).toBeVisible();
        await expect(page.getByRole('link', { name: 'Atlas Network' })).toBeVisible();
        await expect(page.getByText('Taylor Quinn')).toHaveCount(0);

        await page.screenshot({ path: `${SCREENSHOT_DIR}/clients.png` });

        await page.getByLabel('Search clients').fill('zzz-no-match');
        await expect(page.getByText('No clients found')).toBeVisible();
        await page.getByLabel('Search clients').fill('');
        await expect(page.getByRole('status')).toHaveText('3 clients');

        // Status filtering and the table view expose the same records.
        await page.getByLabel('Filter clients by status').click();
        await page.getByRole('option', { name: 'Draft' }).click();
        await expect(page.getByText('No clients found')).toBeVisible();
        await page.getByLabel('Filter clients by status').click();
        await page.getByRole('option', { name: 'Active' }).click();
        await expect(page.getByRole('status')).toHaveText('3 clients');

        await page.getByRole('button', { name: 'Table' }).click();
        await expect(page.locator('tbody tr')).toHaveCount(3);
        const northstarRow = page.locator('[data-testid="client-row-northstar"]');
        await northstarRow.getByRole('cell').nth(1).click();
        const clientDrawer = page.getByRole('dialog', { name: 'Northstar Labs' });
        await expect(clientDrawer).toBeVisible();
        await expect(
            clientDrawer.getByRole('link', { name: 'Open full client' }),
        ).toBeVisible();
        expect(page.url()).toContain('#/clients');
        await clientDrawer.getByRole('link', { name: 'Open full client' }).click();
        await expect(
            page.getByRole('heading', { name: 'Northstar Labs', level: 1 }),
        ).toBeVisible();
        await page.getByRole('button', { name: 'Back to Client preview' }).click();
        await expect(clientDrawer).toBeVisible();
        expect(page.url()).toContain('#/clients');
        await page.keyboard.press('Escape');
        await expect(clientDrawer).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Table' })).toHaveAttribute(
            'aria-pressed',
            'true',
        );

        await page.getByRole('button', { name: 'Cards' }).click();
        const northstarCard = page.locator('[data-testid="client-card-northstar"]');
        const northstarCardBox = await northstarCard.boundingBox();
        if (!northstarCardBox) throw new Error('client card not rendered');
        await page.mouse.click(
            northstarCardBox.x + northstarCardBox.width - 8,
            northstarCardBox.y + 8,
        );
        await expect(
            page.getByRole('heading', { name: 'Northstar Labs', level: 1 }),
        ).toBeVisible();
        await gotoHash(page, '#/clients');

        await northstar.click();
        await expect(
            page.getByRole('heading', { name: 'Northstar Labs', level: 1 }),
        ).toBeVisible();
        await expect(page.getByText('Fintech · London')).toBeVisible();
        await expect(page.getByText('robin@northstar.example')).toBeVisible();
        await expect(page.getByText('Senior Frontend Engineer').first()).toBeVisible();
        await expect(page.getByText('Engineering Manager').first()).toBeVisible();
        await expect(page.getByText('Full-stack Engineer').first()).toBeVisible();
        await expect(page.getByText('Taylor Quinn')).toHaveCount(0);
        await expect(page.getByRole('heading', { name: 'Roles' })).toBeVisible();
        await expect(
            page.getByRole('heading', { name: 'Recent applications' }),
        ).toBeVisible();
        await expect(
            page.getByRole('link', { name: 'Open roles 3' }),
        ).toHaveAttribute('href', '#/jobs?client=northstar');
        await expect(
            page.getByRole('link', { name: 'Applications 2' }),
        ).toHaveAttribute('href', '#/applications?client=northstar');
        await expect(
            page.getByRole('link', { name: 'Interviewing 0' }),
        ).toHaveAttribute('href', '#/applications?client=northstar&stage=Interview');
        // Recent applications are newest-first: Devon Park (23 Sep) before
        // Alex Morgan (22 Sep).
        await expect(page.locator('tbody tr').nth(0)).toContainText('Devon Park');
        await expect(page.locator('tbody tr').nth(1)).toContainText('Alex Morgan');
        await page.screenshot({ path: `${SCREENSHOT_DIR}/client-detail.png` });

        const roleCard = page.locator('[data-testid="client-role-job-frontend"]');
        const roleCardBox = await roleCard.boundingBox();
        if (!roleCardBox) throw new Error('role card not rendered');
        await page.mouse.click(roleCardBox.x + 8, roleCardBox.y + roleCardBox.height - 8);
        const roleDrawer = page.getByRole('dialog', { name: 'Senior Frontend Engineer' });
        await expect(roleDrawer).toBeVisible();
        await expect(
            roleDrawer.getByRole('heading', { name: 'Description', exact: true }),
        ).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(roleDrawer).toHaveCount(0);

        await page.getByRole('link', { name: 'View job description' }).first().click();
        await expect(roleDrawer).toBeVisible();
        await roleDrawer.getByRole('link', { name: 'Open full job' }).click();
        await expect(
            page.getByRole('heading', { name: 'Senior Frontend Engineer', level: 1 }),
        ).toBeVisible();
        await expect(
            page.getByRole('heading', { name: 'Description', exact: true }),
        ).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Responsibilities' })).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Requirements' })).toBeVisible();
        await expect(page.getByText(/Sample job description/)).toBeVisible();
        await expect(page.getByText('Full-time')).toBeVisible();
        await page.screenshot({ path: `${SCREENSHOT_DIR}/job-detail.png` });
        await page.getByRole('link', { name: /View applications/ }).first().click();
        await expect(page).toHaveURL(/#\/applications\?client=northstar&job=job-frontend/);
        await expect(page.getByRole('status')).toHaveText('1 application');

        await gotoHash(page, '#/jobs/not-a-job');
        await expect(page.getByText('Job not found')).toBeVisible();

        await gotoHash(page, '#/clients/northstar');
        await page
            .getByRole('link', { name: 'View applications for Senior Frontend Engineer' })
            .click();
        await expect(page.getByRole('status')).toHaveText('1 application');
        await expect(page.getByText('Alex Morgan')).toBeVisible();
        await page.getByRole('button', { name: /Remove job filter/ }).click();
        await expect(page.getByRole('status')).toHaveText('2 applications');

        await gotoHash(page, '#/clients/not-a-client');
        await expect(page.getByText('Client not found')).toBeVisible();

        await expectNoConsoleErrors(page, errors);
    });

    test('notifications navigate, mark read and reach privacy', async ({ page }) => {
        const errors: string[] = [];
        watchConsole(page, errors);
        await page.goto('/#/overview');

        // Privacy stays out of the sidebar and overview.
        await expect(
            page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link'),
        ).toHaveText(['Overview', 'Applications', 'Candidates', 'Jobs', 'Clients']);
        await expect(page.getByText('Clients hiring')).toBeVisible();
        await expect(page.getByRole('heading', { name: 'To-do' })).toBeVisible();
        await expect(page.getByText('Privacy cases needing attention')).toHaveCount(0);
        await expect(page.getByText('Applications awaiting review')).toHaveCount(0);
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.screenshot({ path: `${SCREENSHOT_DIR}/overview.png` });

        const bell = page.getByRole('button', { name: 'Notifications, 3 unread' });
        await bell.click();
        await expect(page.getByText('New applications to review')).toBeVisible();
        await expect(page.getByText('Interviews in progress')).toBeVisible();
        await expect(
            page.getByRole('link', { name: /^Candidate data requests/ }),
        ).toBeVisible();
        await expect(
            page.getByText('Access or correction requests from candidates'),
        ).toBeVisible();

        await page.getByRole('link', { name: /New applications to review/ }).click();
        await expect(page).toHaveURL(/#\/applications\?stage=New/);
        await expect(page.getByRole('status')).toHaveText('3 applications');

        await page.getByRole('button', { name: 'Notifications, 2 unread' }).click();
        await expect(page.getByText('Read').first()).toBeVisible();
        await page
            .getByRole('link', { name: 'View candidate data requests' })
            .click();
        await expect(
            page.getByRole('heading', { name: 'Candidate data requests', level: 1 }),
        ).toBeVisible();
        await expect(
            page.getByText(
                'Requests from candidates to access, correct or restrict their personal information.',
            ),
        ).toBeVisible();

        await expectNoConsoleErrors(page, errors);
    });

    test('theme tokens and mobile applications layout', async ({ page }) => {
        const errors: string[] = [];
        const external: string[] = [];
        watchConsole(page, errors);
        watchRequests(page, external);
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto('/#/applications');

        await expect(page.getByRole('status')).toHaveText('9 applications');
        await expect(page.getByRole('button', { name: /Notifications/ })).toBeVisible();

        const bodyBackground = await page.evaluate(
            () => getComputedStyle(document.body).backgroundColor,
        );
        expect(bodyBackground).toBe('rgb(255, 255, 255)');
        const primaryColor = await page
            .getByText('A', { exact: true })
            .evaluate((element) => getComputedStyle(element).backgroundColor);
        expect(primaryColor).toBe('rgb(36, 39, 44)');

        const sidebarBackground = await page
            .locator('aside')
            .first()
            .evaluate((element) => getComputedStyle(element).backgroundColor);
        expect(sidebarBackground).toBe('rgb(253, 251, 246)');
        const activeNavBackground = await page
            .locator('aside nav a', { hasText: 'Applications' })
            .evaluate((element) => getComputedStyle(element).backgroundColor);
        expect(activeNavBackground).toBe('rgb(250, 231, 185)');
        const accentLinkColor = await page
            .locator('.text-accent-foreground')
            .first()
            .evaluate((element) => getComputedStyle(element).color);
        expect(accentLinkColor).toBe('rgb(48, 54, 61)');

        const hasOverflow = await page.evaluate(
            () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
        );
        expect(hasOverflow).toBe(false);
        await page.screenshot({ path: `${SCREENSHOT_DIR}/mobile-applications.png` });

        // Card view at 390px renders cards without horizontal overflow.
        await page.getByRole('button', { name: 'Cards' }).click();
        await expect(
            page.getByRole('link', { name: 'View candidate' }).first(),
        ).toBeVisible();
        const cardsOverflow = await page.evaluate(
            () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
        );
        expect(cardsOverflow).toBe(false);

        // Client detail at 390px.
        await gotoHash(page, '#/clients/northstar');
        await expect(
            page.getByRole('heading', { name: 'Northstar Labs', level: 1 }),
        ).toBeVisible();
        const clientOverflow = await page.evaluate(
            () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
        );
        expect(clientOverflow).toBe(false);

        // Header back control returns to the previous view at mobile width.
        await page.getByRole('button', { name: 'Back to Applications' }).click();
        await expect(
            page.getByRole('heading', { name: 'Applications', level: 1 }),
        ).toBeVisible();

        // Mobile bell stays reachable without crowding the header, and Escape
        // returns focus to the trigger.
        const bell = page.getByRole('button', { name: /Notifications/ });
        await bell.click();
        await expect(
            page.getByRole('link', { name: /^Candidate data requests/ }),
        ).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(bell).toBeFocused();

        await gotoHash(page, '#/candidates');
        await page.getByRole('link', { name: 'Alex Morgan' }).click();
        const mobileDrawer = page.getByRole('dialog', { name: 'Alex Morgan' });
        await expect(mobileDrawer).toBeVisible();
        const drawerWidth = await mobileDrawer.evaluate(
            (element) => element.getBoundingClientRect().width,
        );
        expect(drawerWidth).toBeGreaterThanOrEqual(390);
        const drawerOverflow = await page.evaluate(
            () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
        );
        expect(drawerOverflow).toBe(false);
        await page.waitForTimeout(450);
        await page.screenshot({ path: `${SCREENSHOT_DIR}/mobile-candidate-drawer.png` });

        const drawerTabs = mobileDrawer.getByRole('tablist', {
            name: 'Candidate preview sections',
        });
        const drawerTabsNoOverflow = await drawerTabs.evaluate(
            (element) =>
                element.scrollWidth <= element.clientWidth
                && element.scrollHeight <= element.clientHeight,
        );
        expect(drawerTabsNoOverflow).toBe(true);
        await mobileDrawer.getByRole('tab', { name: /Documents/ }).click();
        await expect(mobileDrawer.getByLabel('Document version')).toBeVisible();
        const drawerInnerOverflow = await mobileDrawer.evaluate(
            (element) => element.scrollWidth > element.clientWidth,
        );
        expect(drawerInnerOverflow).toBe(false);
        await page.screenshot({
            path: `${SCREENSHOT_DIR}/mobile-candidate-drawer-documents.png`,
        });

        await page.keyboard.press('Escape');
        await expect(mobileDrawer).toHaveCount(0);
        await expect(page.getByRole('link', { name: 'Alex Morgan' })).toBeFocused();

        await gotoHash(page, '#/overview');
        await expect(page.getByRole('heading', { name: 'To-do' })).toBeVisible();
        const todoOverflow = await page.evaluate(
            () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
        );
        expect(todoOverflow).toBe(false);
        await page.screenshot({ path: `${SCREENSHOT_DIR}/mobile-overview-todo.png` });

        await expectNoConsoleErrors(page, errors);
        expect(external, 'external network requests').toEqual([]);
    });

    test('candidate documents auto-preview with metadata and version switcher', async ({
        page,
    }) => {
        const errors: string[] = [];
        watchConsole(page, errors);
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.goto('/#/candidates/demo-01?tab=documents');

        await expect(
            page.getByRole('heading', { name: 'Alex Morgan', level: 1 }),
        ).toBeVisible();
        const preview = page.getByRole('region', { name: 'CV preview' });
        await expect(preview).toBeVisible();
        await expect(
            preview.getByText('Sample CV · synthetic design preview'),
        ).toBeVisible();
        await expect(page.getByText('CV — Alex Morgan').first()).toBeVisible();
        await expect(page.getByText('Version 3')).toBeVisible();
        await page.screenshot({ path: `${SCREENSHOT_DIR}/candidate-documents.png` });

        await page.getByLabel('Document version').click();
        await page
            .getByRole('option', { name: 'CV — Alex Morgan (previous version) · v2' })
            .click();
        await expect(page.getByText('Version 2')).toBeVisible();
        await expect(
            page.getByText('CV — Alex Morgan (previous version)').first(),
        ).toBeVisible();

        await gotoHash(page, '#/candidates/demo-03?tab=documents');
        await expect(
            page.getByRole('heading', { name: 'Sam Rivera', level: 1 }),
        ).toBeVisible();
        await expect(page.getByText('still being scanned')).toBeVisible();
        await expect(page.getByText('Sample CV · synthetic design preview')).toHaveCount(0);

        await gotoHash(page, '#/candidates/demo-02?tab=documents');
        await expect(
            page.getByRole('region', { name: 'CV preview' }),
        ).toBeVisible();
        await expect(page.getByText('Version 1')).toBeVisible();

        await expectNoConsoleErrors(page, errors);
    });

    test('jobs table, job preview drawer and job detail', async ({ page }) => {
        const errors: string[] = [];
        watchConsole(page, errors);
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.goto('/#/jobs');

        await expect(page.getByRole('heading', { name: 'Jobs', level: 1 })).toBeVisible();
        await expect(page.getByRole('status')).toHaveText('10 jobs');
        await expect(
            page.getByRole('columnheader', { name: 'Role' }),
        ).toBeVisible();
        await expect(
            page.getByRole('columnheader', { name: 'Applications' }),
        ).toBeVisible();
        await expect(page.locator('tbody tr')).toHaveCount(10);
        await expect(
            page.getByRole('link', { name: 'Engineering Intern', exact: true }),
        ).toBeVisible();
        await expect(page.getByText('Internship').first()).toBeVisible();
        await page.screenshot({ path: `${SCREENSHOT_DIR}/jobs-table.png` });

        // Status filtering and sortable columns stay inside the table.
        await page.getByLabel('Filter jobs by status').click();
        await page.getByRole('option', { name: 'Draft' }).click();
        await expect(page.locator('tbody tr')).toHaveCount(0);
        await page.getByLabel('Filter jobs by status').click();
        await page.getByRole('option', { name: 'Open' }).click();
        await expect(page.locator('tbody tr')).toHaveCount(10);

        await page.getByRole('button', { name: 'Role' }).click();
        await expect(
            page.getByRole('columnheader', { name: 'Role' }),
        ).toHaveAttribute('aria-sort', 'descending');
        await expect(page.locator('tbody tr').first()).toContainText(
            'Senior Frontend Engineer',
        );
        await page.getByRole('button', { name: 'Location' }).click();
        await expect(
            page.getByRole('columnheader', { name: 'Location' }),
        ).toHaveAttribute('aria-sort', 'ascending');

        // Blank area of a row opens the job preview drawer.
        const designerRow = page.locator('tbody tr', {
            has: page.getByRole('link', { name: 'Product Designer', exact: true }),
        });
        await designerRow.getByRole('cell').nth(2).click();
        const designerDrawer = page.getByRole('dialog', { name: 'Product Designer' });
        await expect(designerDrawer).toBeVisible();
        expect(page.url()).toContain('#/jobs');
        await page.keyboard.press('Escape');
        await expect(designerDrawer).toHaveCount(0);

        // Client names in the table still navigate to the client page.
        await page.getByRole('link', { name: 'Atlas Network' }).first().click();
        await expect(
            page.getByRole('heading', { name: 'Atlas Network', level: 1 }),
        ).toBeVisible();
        await gotoHash(page, '#/jobs');

        await page.getByLabel('Filter jobs by client').click();
        await page.getByRole('option', { name: 'Atlas Network' }).click();
        await expect(page.locator('tbody tr')).toHaveCount(3);
        await expect(
            page.getByRole('link', { name: 'Backend Engineer', exact: true }),
        ).toBeVisible();

        await page.getByLabel('Search').fill('mobile');
        await expect(page.locator('tbody tr')).toHaveCount(1);
        await expect(
            page.getByRole('link', { name: 'Mobile Engineer', exact: true }),
        ).toBeVisible();

        await page.getByRole('link', { name: 'Mobile Engineer', exact: true }).click();
        const mobileDrawer = page.getByRole('dialog', { name: 'Mobile Engineer' });
        await expect(mobileDrawer).toBeVisible();
        await expect(
            mobileDrawer.getByRole('heading', { name: 'Description', exact: true }),
        ).toBeVisible();
        await page.waitForTimeout(400);
        await page.screenshot({
            path: `${SCREENSHOT_DIR}/job-drawer.png`,
            animations: 'disabled',
        });
        await mobileDrawer.getByRole('link', { name: 'Open full job' }).click();

        await expect(
            page.getByRole('heading', { name: 'Mobile Engineer', level: 1 }),
        ).toBeVisible();
        await expect(
            page.getByRole('heading', { name: 'Description', exact: true }),
        ).toBeVisible();
        await page
            .getByRole('link', { name: /View applications/ })
            .first()
            .click();
        await expect(page).toHaveURL(/#\/applications\?client=atlas&job=job-mobile/);
        await expect(page.getByRole('status')).toHaveText('1 application');

        await gotoHash(page, '#/jobs/not-a-job');
        await expect(page.getByText('Job not found')).toBeVisible();
        await page.getByRole('link', { name: 'All jobs' }).click();
        await expect(page.getByRole('heading', { name: 'Jobs', level: 1 })).toBeVisible();

        await expectNoConsoleErrors(page, errors);
    });

    test('adding a candidate to a job warns before duplicating a pipeline entry', async ({
        page,
    }) => {
        const errors: string[] = [];
        watchConsole(page, errors);
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.goto('/#/candidates/demo-02');
        await expect(
            page.getByRole('heading', { name: 'Alice Chen', level: 1 }),
        ).toBeVisible();

        await page.getByRole('button', { name: 'Add to job' }).click();
        const dialog = page.getByRole('dialog', {
            name: 'Add candidate to a job',
        });
        await dialog.getByLabel('Open job').click();
        await page
            .getByRole('option', { name: 'Backend Engineer · Atlas Network' })
            .click();
        await expect(dialog.getByRole('alert')).toContainText(
            'Already in this pipeline',
        );
        await expect(dialog.getByRole('alert')).toContainText(
            'Owner · Priya Shah · Source · Referral',
        );
        await expect(
            dialog.getByRole('button', { name: 'Add to pipeline' }),
        ).toBeDisabled();

        await dialog.getByLabel('Open job').click();
        await page
            .getByRole('option', { name: 'QA Engineer · Atlas Network' })
            .click();
        await dialog.getByRole('button', { name: 'Add to pipeline' }).click();
        await expect(dialog).toHaveCount(0);
        await expect(page.getByRole('status')).toContainText(
            'Demo application added for QA Engineer',
        );
        await expect(page.getByRole('tab', { name: /Applications/ })).toContainText('2');

        await page.getByRole('button', { name: 'Add to job' }).click();
        await dialog.getByLabel('Open job').click();
        await page
            .getByRole('option', { name: 'QA Engineer · Atlas Network' })
            .click();
        await expect(dialog.getByRole('alert')).toContainText(
            'Owner · Jamie Taylor · Source · Manual',
        );

        await expectNoConsoleErrors(page, errors);
    });

    test('overview metrics navigate and to-do state persists locally', async ({ page }) => {
        const errors: string[] = [];
        watchConsole(page, errors);
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.goto('/#/overview');

        await expect(page.getByRole('heading', { name: 'To-do' })).toBeVisible();
        await expect(page.getByText('Your next recruiting actions.')).toBeVisible();

        await expect(page.getByRole('tab', { name: 'All 3' })).toBeVisible();
        await expect(page.getByRole('tab', { name: 'Review 1' })).toBeVisible();
        await expect(page.getByRole('tab', { name: 'Interviews 1' })).toBeVisible();
        await expect(page.getByRole('tab', { name: 'Notes 1' })).toBeVisible();
        await expect(page.getByText('Review Alice Chen')).toBeVisible();
        await expect(page.getByText('Prepare Casey Lin’s interview')).toBeVisible();
        await expect(page.getByText('Add screening notes for Devon Park')).toBeVisible();
        await page.screenshot({ path: `${SCREENSHOT_DIR}/overview-todo.png` });

        await expect(
            page.getByRole('link', { name: 'Candidates 12' }),
        ).toHaveAttribute('href', '#/candidates?all=1');
        await expect(
            page.getByRole('link', { name: 'Applications 9' }),
        ).toHaveAttribute('href', '#/applications?all=1');
        await expect(page.getByRole('link', { name: 'Open roles 10' })).toHaveAttribute(
            'href',
            '#/jobs?all=1',
        );

        const northstarCard = page.locator('div.relative', {
            has: page.getByRole('link', { name: 'Northstar Labs' }),
        });
        await expect(
            northstarCard.getByRole('link', { name: '3 open roles' }),
        ).toHaveAttribute('href', '#/jobs?client=northstar');
        await expect(
            northstarCard.getByRole('link', { name: '2 applications' }),
        ).toHaveAttribute('href', '#/applications?client=northstar');

        await page.getByRole('link', { name: 'Review candidate' }).click();
        const aliceDrawer = page.getByRole('dialog', { name: 'Alice Chen' });
        await expect(aliceDrawer).toBeVisible();
        await expect(aliceDrawer.getByText('Distributed systems')).toBeVisible();
        await page.keyboard.press('Escape');

        await page
            .getByRole('checkbox', { name: 'Mark Review Alice Chen complete' })
            .click();
        await expect(page.getByRole('tab', { name: 'All 2' })).toBeVisible();
        await expect(page.getByText('Review Alice Chen')).toHaveCount(0);
        await expect(
            page.getByRole('button', { name: 'Completed (1)' }),
        ).toBeVisible();

        await page.getByRole('tab', { name: 'Review 0' }).click();
        await expect(page.getByText('No tasks in this category')).toBeVisible();
        await page.getByRole('tab', { name: 'All 2' }).click();

        await gotoHash(page, '#/candidates');
        await gotoHash(page, '#/overview');
        await expect(page.getByRole('tab', { name: 'All 2' })).toBeVisible();

        await page.getByRole('button', { name: 'Completed (1)' }).click();
        await expect(page.getByRole('tab', { name: 'All 1' })).toBeVisible();
        await expect(page.getByText('Review Alice Chen')).toBeVisible();
        await page
            .getByRole('checkbox', { name: 'Reopen Review Alice Chen' })
            .click();
        await expect(page.getByText('No completed tasks in this view')).toBeVisible();
        await page.getByRole('button', { name: 'Completed (0)' }).click();
        await expect(page.getByRole('tab', { name: 'All 3' })).toBeVisible();

        await page.getByRole('link', { name: 'Add notes' }).click();
        await expect(
            page.getByRole('heading', { name: 'Devon Park', level: 1 }),
        ).toBeVisible();
        await expect(page.getByRole('tab', { name: /Notes/ })).toHaveAttribute(
            'aria-selected',
            'true',
        );
        await expect(page.getByLabel('Add a note')).toBeFocused();

        await gotoHash(page, '#/overview');
        await page.getByRole('checkbox', { name: 'Mark Review Alice Chen complete' }).click();
        await expect(page.getByRole('tab', { name: 'All 2' })).toBeVisible();
        await page.getByRole('button', { name: 'Reset preview' }).click();
        await page
            .getByRole('dialog')
            .getByRole('button', { name: 'Reset preview' })
            .click();
        await gotoHash(page, '#/overview');
        await expect(page.getByRole('tab', { name: 'All 3' })).toBeVisible();

        await expectNoConsoleErrors(page, errors);
    });

    test('in-app navigation restores views, drawers and filters', async ({ page }) => {
        const errors: string[] = [];
        watchConsole(page, errors);
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.goto('/#/overview');
        const status = page.getByRole('status');

        // "All records" metric resets stale filters instead of reusing them.
        await gotoHash(page, '#/applications');
        await page.getByLabel('Filter by client').click();
        await page.getByRole('option', { name: 'Meridian', exact: true }).click();
        await expect(status).toHaveText('4 applications');
        await gotoHash(page, '#/overview');
        await page.getByRole('link', { name: 'Applications 9' }).click();
        await expect(status).toHaveText('9 applications');

        // Header back returns to the overview; browser forward restores the list.
        await page.getByRole('button', { name: 'Back to Overview' }).click();
        await expect(
            page.getByRole('heading', { name: 'Overview', level: 1 }),
        ).toBeVisible();
        await page.goForward();
        await expect(
            page.getByRole('heading', { name: 'Applications', level: 1 }),
        ).toBeVisible();
        await expect(status).toHaveText('9 applications');

        // Job preview round-trip: list filters, the drawer and its scroll
        // position all survive View applications → Back.
        await page.setViewportSize({ width: 1440, height: 460 });
        await gotoHash(page, '#/jobs');
        await page.getByLabel('Filter jobs by client').click();
        await page.getByRole('option', { name: 'Meridian', exact: true }).click();
        await page.getByLabel('Search').fill('Product');
        await expect(page.locator('tbody tr')).toHaveCount(2);
        await page.getByRole('link', { name: 'Product Engineer', exact: true }).click();
        const productDrawer = page.getByRole('dialog', { name: 'Product Engineer' });
        await expect(productDrawer).toBeVisible();
        expect(page.url()).toContain('#/jobs');
        const drawerBody = productDrawer.locator('div.overflow-y-auto').first();
        const drawerScrollable = await drawerBody.evaluate(
            (element) => element.scrollHeight > element.clientHeight,
        );
        expect(drawerScrollable).toBe(true);
        await drawerBody.evaluate((element) => {
            element.scrollTop = 120;
        });
        const drawerScrollTop = await drawerBody.evaluate(
            (element) => element.scrollTop,
        );
        expect(drawerScrollTop).toBeGreaterThan(0);
        // The CTA sits in the non-scrolling header row, so a normal click
        // cannot disturb the drawer body scroll being measured.
        const scrollBeforeClick = await drawerBody.evaluate(
            (element) => element.scrollTop,
        );
        expect(scrollBeforeClick).toBe(drawerScrollTop);
        await productDrawer
            .getByRole('link', { name: 'View applications' })
            .click();
        await expect(page).toHaveURL(/#\/applications\?client=meridian&job=job-product/);
        await expect(status).toHaveText('1 application');
        await expect(
            page
                .getByRole('navigation', { name: 'Main navigation' })
                .getByRole('link', { name: 'Applications' }),
        ).toHaveAttribute('aria-current', 'page');
        await expect(page.getByRole('dialog')).toHaveCount(0);
        await expect(
            page.getByRole('button', { name: 'Back to Job preview' }),
        ).toBeVisible();
        await page.screenshot({
            path: `${SCREENSHOT_DIR}/applications-back-label.png`,
            animations: 'disabled',
        });

        await page.goBack();
        await expect(productDrawer).toBeVisible();
        await expect(page.locator('tbody tr')).toHaveCount(2);
        await expect(drawerBody).toHaveJSProperty('scrollTop', drawerScrollTop);
        await page.goForward();
        await expect(status).toHaveText('1 application');

        await page.getByRole('button', { name: 'Back to Job preview' }).click();
        await expect(productDrawer).toBeVisible();
        await expect(page.locator('tbody tr')).toHaveCount(2);
        await expect(drawerBody).toHaveJSProperty('scrollTop', drawerScrollTop);
        await page.keyboard.press('Escape');
        await expect(
            page.getByRole('link', { name: 'Product Engineer', exact: true }),
        ).toBeFocused();

        // Candidate chain: preview → full profile → job page → back twice.
        await gotoHash(page, '#/candidates');
        await page.getByLabel('Search').fill('Morgan');
        await page.getByRole('link', { name: 'Alex Morgan' }).click();
        const alexDrawer = page.getByRole('dialog', { name: 'Alex Morgan' });
        await expect(alexDrawer).toBeVisible();
        await expect(
            alexDrawer.getByRole('heading', { name: 'Latest note' }),
        ).toBeVisible();
        await page.waitForTimeout(400);
        await page.screenshot({
            path: `${SCREENSHOT_DIR}/candidate-drawer-latestnote.png`,
            animations: 'disabled',
        });
        await alexDrawer.getByRole('link', { name: 'Open full profile' }).click();
        await expect(
            page.getByRole('heading', { name: 'Alex Morgan', level: 1 }),
        ).toBeVisible();
        await expect(page.getByRole('dialog')).toHaveCount(0);
        await expect(
            page.getByRole('heading', { name: 'Latest note' }),
        ).toBeVisible();
        await page.screenshot({
            path: `${SCREENSHOT_DIR}/candidate-detail-latestnote.png`,
            animations: 'disabled',
        });
        await page
            .getByRole('link', { name: 'Senior Frontend Engineer' })
            .first()
            .click();
        await expect(
            page.getByRole('heading', { name: 'Senior Frontend Engineer', level: 1 }),
        ).toBeVisible();
        await page.getByRole('button', { name: 'Back to Alex Morgan' }).click();
        await expect(
            page.getByRole('heading', { name: 'Alex Morgan', level: 1 }),
        ).toBeVisible();
        await expect(page.getByRole('dialog')).toHaveCount(0);
        await page
            .getByRole('button', { name: 'Back to Candidate preview' })
            .click();
        await expect(alexDrawer).toBeVisible();
        await expect(page.getByLabel('Search')).toHaveValue('Morgan');
        await page.keyboard.press('Escape');

        // Application filters, view and grouping restore per entry, not the URL.
        await gotoHash(page, '#/applications');
        await page.getByLabel('Filter by client').click();
        await page.getByRole('option', { name: 'Meridian', exact: true }).click();
        await page.getByLabel('Group by').click();
        await page.getByRole('option', { name: 'Client' }).click();
        await page.getByRole('button', { name: 'Cards' }).click();
        await expect(status).toHaveText('4 applications');
        await page.getByRole('link', { name: 'Meridian', exact: true }).first().click();
        await expect(
            page.getByRole('heading', { name: 'Meridian', level: 1 }),
        ).toBeVisible();
        await page
            .getByRole('link', { name: 'View applications for Product Engineer' })
            .click();
        await expect(status).toHaveText('1 application');
        await page.getByRole('button', { name: 'Back to Meridian' }).click();
        await expect(
            page.getByRole('heading', { name: 'Meridian', level: 1 }),
        ).toBeVisible();
        await page.getByRole('button', { name: 'Back to Applications' }).click();
        await expect(status).toHaveText('4 applications');
        await expect(page.getByRole('button', { name: 'Cards' })).toHaveAttribute(
            'aria-pressed',
            'true',
        );
        await expect(page.getByLabel('Group by')).toHaveText('Client');

        // Breadcrumbs are real links and keep list state intact.
        await gotoHash(page, '#/jobs');
        await page.getByLabel('Search').fill('Product');
        await page.getByRole('link', { name: 'Product Engineer', exact: true }).click();
        await page
            .getByRole('dialog')
            .getByRole('link', { name: 'Open full job' })
            .click();
        await expect(
            page.getByRole('heading', { name: 'Product Engineer', level: 1 }),
        ).toBeVisible();
        await page
            .getByRole('navigation', { name: 'Breadcrumb' })
            .getByRole('link', { name: 'Jobs' })
            .click();
        await expect(page.getByRole('heading', { name: 'Jobs', level: 1 })).toBeVisible();
        await expect(page.getByLabel('Search')).toHaveValue('Product');
        await expect(page.locator('tbody tr')).toHaveCount(2);
        await page
            .getByRole('navigation', { name: 'Breadcrumb' })
            .getByRole('link', { name: 'Workspace' })
            .click();
        await expect(
            page.getByRole('heading', { name: 'Overview', level: 1 }),
        ).toBeVisible();

        // A direct deep link has no previous entry: back falls back to the parent.
        await page.goto('/#/jobs/job-product');
        await page.reload();
        await expect(
            page.getByRole('heading', { name: 'Product Engineer', level: 1 }),
        ).toBeVisible();
        await page.getByRole('button', { name: 'Back to Jobs' }).click();
        await expect(page.getByRole('heading', { name: 'Jobs', level: 1 })).toBeVisible();
        expect(page.url()).toContain('#/jobs');

        await expectNoConsoleErrors(page, errors);
    });

    test('overview back label and jobs client deep links', async ({ page }) => {
        const errors: string[] = [];
        watchConsole(page, errors);
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto('/#/clients/northstar');
        await expect(
            page.getByRole('heading', { name: 'Northstar Labs', level: 1 }),
        ).toBeVisible();

        // Breadcrumb "Workspace" reaches Overview, which keeps the real
        // back label instead of hiding the control on the overview screen.
        await page
            .getByRole('navigation', { name: 'Breadcrumb' })
            .getByRole('link', { name: 'Workspace' })
            .click();
        await expect(
            page.getByRole('heading', { name: 'Overview', level: 1 }),
        ).toBeVisible();
        await page.getByRole('button', { name: 'Back to Northstar Labs' }).click();
        await expect(
            page.getByRole('heading', { name: 'Northstar Labs', level: 1 }),
        ).toBeVisible();

        // Browser forward restores the overview and its back state.
        await page.goForward();
        await expect(
            page.getByRole('heading', { name: 'Overview', level: 1 }),
        ).toBeVisible();
        await expect(
            page.getByRole('button', { name: 'Back to Northstar Labs' }),
        ).toBeVisible();
        await page.goBack();
        await expect(
            page.getByRole('heading', { name: 'Northstar Labs', level: 1 }),
        ).toBeVisible();

        // An explicit ?client= link means "all jobs for this client": the
        // stale search query is cleared and the filter applied verbatim.
        await gotoHash(page, '#/jobs');
        await page.getByLabel('Search').fill('Backend');
        await page.getByLabel('Filter jobs by client').click();
        await page.getByRole('option', { name: 'Atlas Network' }).click();
        await gotoHash(page, '#/clients/northstar');
        await page.getByRole('link', { name: 'Open roles 3' }).click();
        await expect(page).toHaveURL(/#\/jobs\?client=northstar/);
        await expect(page.locator('tbody tr')).toHaveCount(3);
        await expect(page.getByLabel('Search')).toHaveValue('');
        await page.goBack();
        await expect(
            page.getByRole('heading', { name: 'Northstar Labs', level: 1 }),
        ).toBeVisible();

        // An unknown client id stays unknown: zero rows plus a way to clear.
        await gotoHash(page, '#/jobs?client=bad');
        await expect(page.locator('tbody tr')).toHaveCount(0);
        await expect(page.getByText('No jobs match these filters')).toBeVisible();
        await page.getByRole('button', { name: 'Clear filters' }).last().click();
        await expect(page.locator('tbody tr')).toHaveCount(10);

        await expectNoConsoleErrors(page, errors);
    });

    test('reset discards history snapshots and restores defaults', async ({
        page,
    }) => {
        const errors: string[] = [];
        watchConsole(page, errors);
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto('/#/candidates');
        await page.getByLabel('Search').fill('Morgan');
        await page.getByRole('checkbox', { name: 'Select Alex Morgan' }).click();
        await expect(
            page.getByRole('checkbox', { name: 'Select Alex Morgan' }),
        ).toBeChecked();
        await page.getByRole('link', { name: 'Alex Morgan' }).click();
        await expect(
            page.getByRole('dialog', { name: 'Alex Morgan' }),
        ).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog')).toHaveCount(0);

        await gotoHash(page, '#/applications');
        await expect(
            page.getByRole('heading', { name: 'Applications', level: 1 }),
        ).toBeVisible();

        await page.getByRole('button', { name: 'Reset preview' }).click();
        await page
            .getByRole('dialog')
            .getByRole('button', { name: 'Reset preview' })
            .click();
        await expect(
            page.getByRole('heading', { name: 'Candidates', level: 1 }),
        ).toBeVisible();
        await expect(page.getByLabel('Search')).toHaveValue('');
        await expect(
            page.getByRole('checkbox', { name: 'Select Alex Morgan' }),
        ).not.toBeChecked();

        // Browser back enters a pre-reset entry; its old-session marker is
        // unknown now, so a fresh default view is applied — old filters,
        // selection and preview state cannot come back.
        await page.goBack();
        await expect(
            page.getByRole('heading', { name: 'Candidates', level: 1 }),
        ).toBeVisible();
        await expect(page.getByLabel('Search')).toHaveValue('');
        await expect(
            page.getByRole('checkbox', { name: 'Select Alex Morgan' }),
        ).not.toBeChecked();
        await page.goForward();
        await expect(
            page.getByRole('heading', { name: 'Candidates', level: 1 }),
        ).toBeVisible();
        await expect(page.getByLabel('Search')).toHaveValue('');

        await expectNoConsoleErrors(page, errors);
    });

    test('normal Overview application candidate Back returns through preview without loops', async ({
        page,
    }) => {
        const errors: string[] = [];
        watchConsole(page, errors);
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto('/#/overview');
        const startLength = await page.evaluate(() => history.length);

        await page.getByRole('link', { name: 'Applications 9' }).click();
        const status = page.locator('[role="status"]');
        await expect(status).toHaveText('9 applications');
        await page.getByRole('link', { name: 'Alice Chen' }).first().click();
        const aliceSheet = page.getByRole('dialog', { name: 'Alice Chen' });
        await expect(aliceSheet).toBeVisible();
        await aliceSheet.getByRole('link', { name: 'Open full profile' }).click();
        await expect(
            page.getByRole('heading', { name: 'Alice Chen', level: 1 }),
        ).toBeVisible();

        await page
            .getByRole('button', { name: 'Back to Candidate preview' })
            .click();
        await expect(aliceSheet).toBeVisible();
        await expect(status).toHaveText('9 applications');
        await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog')).toHaveCount(0);

        await page.getByRole('button', { name: 'Back to Overview' }).click();
        await expect(
            page.getByRole('heading', { name: 'Overview', level: 1 }),
        ).toBeVisible();
        expect(await page.evaluate(() => history.length)).toBe(startLength + 2);

        await page.goForward();
        await expect(status).toHaveText('9 applications');
        await expect(page.getByRole('dialog')).toHaveCount(0);
        await page.goForward();
        await expect(
            page.getByRole('heading', { name: 'Alice Chen', level: 1 }),
        ).toBeVisible();
        await page
            .getByRole('button', { name: 'Back to Applications' })
            .click();
        await expect(status).toHaveText('9 applications');
        await expect(page.getByRole('dialog')).toHaveCount(0);
        expect(await page.evaluate(() => history.length)).toBe(startLength + 2);

        await expectNoConsoleErrors(page, errors);
    });

    test('fallback Back does not cycle after the candidate session is refreshed', async ({
        page,
    }) => {
        const errors: string[] = [];
        watchConsole(page, errors);
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto('/#/overview');
        await page.getByRole('link', { name: 'Applications 9' }).click();
        await expect(page.getByRole('status')).toHaveText('9 applications');
        await page.getByRole('link', { name: 'Alice Chen' }).first().click();
        const aliceSheet = page.getByRole('dialog', { name: 'Alice Chen' });
        await expect(aliceSheet).toBeVisible();
        await aliceSheet.getByRole('link', { name: 'Open full profile' }).click();
        await expect(page.getByRole('dialog')).toHaveCount(0);

        await page.reload();
        await expect(
            page.getByRole('heading', { name: 'Alice Chen', level: 1 }),
        ).toBeVisible();
        const before = await page.evaluate(() => ({
            length: history.length,
            id: (history.state?.agoraPreview?.id as string | undefined) ?? null,
        }));

        await page.getByRole('button', { name: 'Back to Candidates' }).click();
        await expect(
            page.getByRole('heading', { name: 'Candidates', level: 1 }),
        ).toBeVisible();
        const after = await page.evaluate(() => ({
            length: history.length,
            id: (history.state?.agoraPreview?.id as string | undefined) ?? null,
        }));
        expect(after.length).toBe(before.length);
        expect(after.id).toBe(before.id);
        await expect(
            page.getByRole('button', { name: 'Back to Alice Chen' }),
        ).toHaveCount(0);
        await expect(
            page.getByRole('button', { name: 'Back to Overview' }),
        ).toBeVisible();

        await page.getByRole('button', { name: 'Back to Overview' }).click();
        await expect(
            page.getByRole('heading', { name: 'Overview', level: 1 }),
        ).toBeVisible();
        expect(await page.evaluate(() => history.length)).toBe(before.length);
        await expect(
            page.getByRole('button', { name: /^Back to/ }),
        ).toHaveCount(0);

        await expectNoConsoleErrors(page, errors);
    });

    test('canonical back fallback replaces the current entry for fresh detail loads', async ({
        page,
    }) => {
        const errors: string[] = [];
        watchConsole(page, errors);
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto('/#/candidates/demo-02');
        await expect(
            page.getByRole('heading', { name: 'Alice Chen', level: 1 }),
        ).toBeVisible();
        const aliceEntryId = await page.evaluate(
            () => (history.state?.agoraPreview?.id as string | undefined) ?? null,
        );

        await page
            .getByRole('navigation', { name: 'Breadcrumb' })
            .getByRole('link', { name: 'Candidates' })
            .click();
        await expect(
            page.getByRole('heading', { name: 'Candidates', level: 1 }),
        ).toBeVisible();
        await page.goBack();
        await expect(
            page.getByRole('heading', { name: 'Alice Chen', level: 1 }),
        ).toBeVisible();

        await page.getByRole('button', { name: 'Back to Candidates' }).click();
        await expect(
            page.getByRole('heading', { name: 'Candidates', level: 1 }),
        ).toBeVisible();
        const replacedId = await page.evaluate(
            () => (history.state?.agoraPreview?.id as string | undefined) ?? null,
        );
        expect(replacedId).toBe(aliceEntryId);

        await page.goForward();
        await expect(
            page.getByRole('heading', { name: 'Candidates', level: 1 }),
        ).toBeVisible();
        await page
            .getByRole('button', { name: 'Back to Candidates' })
            .click();
        await expect(
            page.getByRole('heading', { name: 'Candidates', level: 1 }),
        ).toBeVisible();
        await page.getByRole('button', { name: 'Back to Overview' }).click();
        await expect(
            page.getByRole('heading', { name: 'Overview', level: 1 }),
        ).toBeVisible();
        await expect(
            page.getByRole('button', { name: /^Back to/ }),
        ).toHaveCount(0);

        await page.goto('/#/jobs/job-product');
        await page.reload();
        await expect(
            page.getByRole('heading', { name: 'Product Engineer', level: 1 }),
        ).toBeVisible();
        await page.getByRole('button', { name: 'Back to Jobs' }).click();
        await expect(page.getByRole('heading', { name: 'Jobs', level: 1 })).toBeVisible();
        await page.getByRole('button', { name: 'Back to Overview' }).click();
        await expect(
            page.getByRole('heading', { name: 'Overview', level: 1 }),
        ).toBeVisible();

        await page.goto('/#/clients/northstar');
        await page.reload();
        await expect(
            page.getByRole('heading', { name: 'Northstar Labs', level: 1 }),
        ).toBeVisible();
        await page.getByRole('button', { name: 'Back to Clients' }).click();
        await expect(
            page.getByRole('heading', { name: 'Clients', level: 1 }),
        ).toBeVisible();
        await page.getByRole('button', { name: 'Back to Overview' }).click();
        await expect(
            page.getByRole('heading', { name: 'Overview', level: 1 }),
        ).toBeVisible();

        await expectNoConsoleErrors(page, errors);
    });

    test('table headers stay static while body rows hover', async ({ page }) => {
        const errors: string[] = [];
        watchConsole(page, errors);
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.goto('/#/jobs');
        await expect(
            page.getByRole('heading', { name: 'Jobs', level: 1 }),
        ).toBeVisible();

        const headerRow = page.locator('thead tr').first();
        const headerBackground = await headerRow.evaluate(
            (element) => getComputedStyle(element).backgroundColor,
        );
        await headerRow.hover();
        await page.waitForTimeout(250);
        await expect(headerRow).toHaveCSS('background-color', headerBackground);
        await expect(headerRow).toHaveCSS('cursor', 'default');

        await page.getByRole('columnheader', { name: 'Role' }).click();
        expect(page.url()).toContain('#/jobs');
        await expect(page.locator('tbody tr')).toHaveCount(10);

        const firstRow = page.locator('tbody tr').first();
        await firstRow.hover();
        await expect(firstRow).toHaveCSS(
            'background-color',
            'rgb(250, 242, 223)',
        );

        await firstRow.locator('td').nth(2).click();
        await expect(page.getByRole('dialog')).toBeVisible();

        await expectNoConsoleErrors(page, errors);
    });

    test('cream hover and persistent active navigation', async ({ page }) => {
        const errors: string[] = [];
        watchConsole(page, errors);
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.goto('/#/candidates');
        await expect(
            page.getByRole('heading', { name: 'Candidates', level: 1 }),
        ).toBeVisible();

        const nav = page.locator('aside nav');
        const applicationsLink = nav.getByRole('link', { name: 'Applications' });
        const candidatesLink = nav.getByRole('link', { name: 'Candidates' });
        await applicationsLink.hover();
        await expect(applicationsLink).toHaveCSS(
            'background-color',
            'rgb(250, 242, 223)',
        );
        const [hoveredBackground, sidebarBackground] = await Promise.all([
            applicationsLink.evaluate(
                (element) => getComputedStyle(element).backgroundColor,
            ),
            page
                .locator('aside')
                .first()
                .evaluate(
                    (element) => getComputedStyle(element).backgroundColor,
                ),
        ]);
        expect(hoveredBackground).toBe('rgb(250, 242, 223)');
        expect(sidebarBackground).toBe('rgb(253, 251, 246)');
        await expect(candidatesLink).toHaveCSS(
            'background-color',
            'rgb(250, 231, 185)',
        );
        await expect(candidatesLink).toHaveAttribute('aria-current', 'page');
        await expect(applicationsLink).not.toHaveAttribute(
            'aria-current',
            /.*/,
        );

        const importLink = page.getByRole('link', { name: 'Import candidates' });
        await importLink.hover();
        await expect(importLink).toHaveCSS(
            'background-color',
            'rgb(250, 242, 223)',
        );

        await page
            .getByRole('heading', { name: 'Candidates', level: 1 })
            .hover();
        await expect(candidatesLink).toHaveCSS(
            'background-color',
            'rgb(250, 231, 185)',
        );
        await expect(applicationsLink).toHaveCSS(
            'background-color',
            'rgba(0, 0, 0, 0)',
        );

        const addButton = page.getByRole('button', { name: 'Add candidate' });
        await addButton.hover();
        await expect(addButton).toHaveCSS(
            'background-color',
            'rgb(250, 242, 223)',
        );
        await expect(addButton).toHaveCSS('color', 'rgb(32, 33, 36)');

        await page.keyboard.press('Tab');
        const ringShadow = await page.evaluate(
            () => getComputedStyle(document.activeElement as Element).boxShadow,
        );
        expect(ringShadow).toContain('rgb(115, 119, 127)');

        const bodyBackground = await page.evaluate(
            () => getComputedStyle(document.body).backgroundColor,
        );
        expect(bodyBackground).toBe('rgb(255, 255, 255)');

        await page.screenshot({
            path: `${SCREENSHOT_DIR}/hover-soft.png`,
            animations: 'disabled',
        });
        await expectNoConsoleErrors(page, errors);
    });

    test('neutral surfaces reserve colour for notifications', async ({ page }) => {
        const errors: string[] = [];
        watchConsole(page, errors);
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.goto('/#/overview');
        await expect(
            page.getByRole('heading', { name: 'Overview', level: 1 }),
        ).toBeVisible();

        const metricCard = page
            .getByRole('link', { name: /Candidates \d+/ })
            .locator('div')
            .first();
        await expect(metricCard).toHaveCSS('background-color', 'rgb(255, 255, 255)');
        await expect(metricCard).toHaveCSS('border-color', 'rgb(229, 231, 235)');

        const badge = page
            .getByRole('button', { name: /Notifications, 3 unread/ })
            .locator('span');
        await expect(badge).toHaveCSS('background-color', 'rgb(250, 218, 94)');
        await expect(badge).toHaveCSS('color', 'rgb(73, 56, 20)');

        await page.goto('/#/candidates/demo-01');
        await expect(
            page.getByRole('heading', { name: 'Alex Morgan', level: 1 }),
        ).toBeVisible();
        const noteColors = await page
            .getByRole('heading', { name: 'Latest note' })
            .evaluate((element) => {
                const card = element.closest('div.border') as HTMLElement;
                const styles = getComputedStyle(card);
                return {
                    background: styles.backgroundColor,
                    border: styles.borderColor,
                };
            });
        expect(noteColors.background).toBe('rgb(255, 255, 255)');
        expect(noteColors.border).toBe('rgb(229, 231, 235)');

        await expectNoConsoleErrors(page, errors);
    });

    test('client creation validates contract fields and lists the new client', async ({
        page,
    }) => {
        const errors: string[] = [];
        watchConsole(page, errors);
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.goto('/#/clients');
        await expect(
            page.getByRole('heading', { name: 'Clients', level: 1 }),
        ).toBeVisible();

        await page.getByRole('link', { name: 'Add client' }).click();
        await expect(
            page.getByRole('heading', { name: 'New client', level: 1 }),
        ).toBeVisible();

        await page.getByRole('button', { name: 'Create client' }).click();
        await expect(page.locator('#client-name-error')).toHaveText(
            'Length must be 1..256.',
        );
        await expect(page.locator('#client-contact-name-error')).toHaveText(
            'Length must be 1..256.',
        );
        await expect(page.locator('#client-contact-email-error')).toHaveText(
            'Length must be 1..254.',
        );

        await page.locator('#client-name').fill('Quasar Dynamics');
        await page.locator('#client-contact-name').fill('Pat Lane');
        await page.locator('#client-contact-email').fill('pat@quasar.example');
        await page.locator('#client-telegram').fill('patlane');
        await page.locator('#client-website').fill('quasar.example');
        await page.getByRole('button', { name: 'Add social link' }).click();
        await page
            .locator('#social-url-0')
            .fill('www.linkedin.com/company/quasar-example');
        await page.screenshot({ path: `${SCREENSHOT_DIR}/client-editor.png` });

        await page.getByRole('button', { name: 'Create client' }).click();
        await expect(page).toHaveURL(/#\/clients\/client-/);
        await expect(
            page.getByRole('heading', { name: 'Quasar Dynamics', level: 1 }),
        ).toBeVisible();
        await expect(page.getByText('pat@quasar.example')).toBeVisible();

        await gotoHash(page, '#/clients');
        await expect(page.getByRole('status')).toHaveText('4 clients');
        await expect(page.getByRole('link', { name: 'Quasar Dynamics' })).toBeVisible();

        await expectNoConsoleErrors(page, errors);
    });

    test('client drafts drop invalid optional links and stay clearly marked', async ({
        page,
    }) => {
        const errors: string[] = [];
        watchConsole(page, errors);
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.goto('/#/clients/new');

        await expect(page.locator('#client-name')).toHaveAttribute(
            'aria-required',
            'true',
        );
        await page.locator('#client-name').fill('Draft Works');
        await page.locator('#client-website').fill('draftworks.example');
        await page.getByRole('button', { name: 'Add social link' }).click();
        await page.locator('#social-platform-0').click();
        await page.getByRole('option', { name: 'GitHub' }).click();
        await page.locator('#social-url-0').fill('linkedin.com/company/draft-works');

        await page.getByRole('button', { name: 'Create client' }).click();
        await expect(page.locator('#social-url-0-error')).toHaveText(
            'Must be a GitHub URL.',
        );

        // Saving while cancelling keeps valid optional data and drops the bad link.
        await page.getByRole('link', { name: 'Cancel' }).click();
        const guard = page.getByRole('dialog', { name: 'Unsaved changes' });
        await expect(guard).toBeVisible();
        await guard.getByRole('button', { name: 'Save and continue' }).click();
        await expect(page.getByRole('heading', { name: 'Clients', level: 1 })).toBeVisible();
        await expect(page.getByRole('status')).toHaveText('4 clients');
        const draftCard = page.locator('[data-testid^="client-card-"]', {
            hasText: 'Draft Works',
        });
        await expect(draftCard).toContainText('Draft');
        await expect(draftCard).toHaveCSS('background-color', 'rgb(250, 250, 250)');
        await expect(draftCard.getByRole('link', { name: 'Finish draft' })).toBeVisible();

        await page.getByRole('button', { name: 'Table' }).click();
        const draftRow = page.locator('tbody tr', { hasText: 'Draft Works' });
        await expect(draftRow).toHaveAttribute('data-status', 'draft');
        await expect(draftRow).toHaveCSS('background-color', 'rgb(250, 250, 250)');
        await page.getByRole('button', { name: 'Cards' }).click();

        await draftCard.getByRole('link', { name: 'Draft Works' }).click();
        await expect(
            page.getByRole('heading', { name: 'Draft Works', level: 1 }),
        ).toBeVisible();
        await expect(page.getByText('Draft client', { exact: true })).toBeVisible();
        await expect(
            page.getByRole('link', { name: 'https://draftworks.example' }),
        ).toBeVisible();
        await expect(page.getByRole('link', { name: 'Add job' })).toHaveCount(0);
        await expect(
            page.getByText('Draft clients cannot receive roles yet.'),
        ).toBeVisible();

        await page.getByRole('link', { name: 'Finish draft' }).click();
        await expect(page.locator('#social-url-0')).toHaveCount(0);
        await page.locator('#client-contact-name').fill('Drew Draft');
        await page.locator('#client-contact-email').fill('drew@draftworks.example');
        await page.getByRole('button', { name: 'Activate client' }).click();
        await expect(page.getByText('Draft client')).toHaveCount(0);
        await expect(
            page.getByRole('link', { name: 'Add job' }).first(),
        ).toBeVisible();

        await expectNoConsoleErrors(page, errors);
    });

    test('stealth client requires an anonymous description', async ({ page }) => {
        const errors: string[] = [];
        watchConsole(page, errors);
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.goto('/#/clients/new');
        await expect(
            page.getByRole('heading', { name: 'New client', level: 1 }),
        ).toBeVisible();

        await page.locator('#client-name').fill('Hidden Works');
        await page.locator('#client-contact-name').fill('Sam Fox');
        await page.locator('#client-contact-email').fill('sam@hidden.example');
        await page.locator('#client-stealth').click();

        await page.getByRole('button', { name: 'Create client' }).click();
        await expect(page.locator('#client-anonymous-description-error')).toHaveText(
            'Required for a stealth client.',
        );

        await page
            .locator('#client-anonymous-description')
            .fill('A confidential robotics company hiring its first platform team.');
        await page.getByRole('button', { name: 'Create client' }).click();
        await expect(page).toHaveURL(/#\/clients\/client-/);
        await expect(
            page.getByRole('heading', { name: 'Hidden Works', level: 1 }),
        ).toBeVisible();
        await expect(page.getByText('Identity hidden externally')).toBeVisible();
        await expect(
            page.getByText(
                'A confidential robotics company hiring its first platform team.',
            ),
        ).toBeVisible();

        await expectNoConsoleErrors(page, errors);
    });

    test('job draft saves from a client context and stays unpublished', async ({ page }) => {
        const errors: string[] = [];
        watchConsole(page, errors);
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.goto('/#/clients/northstar');
        await expect(
            page.getByRole('heading', { name: 'Northstar Labs', level: 1 }),
        ).toBeVisible();

        await page.getByRole('link', { name: 'Add job' }).first().click();
        await expect(page).toHaveURL(/#\/jobs\/new\?client=northstar/);
        await expect(
            page.getByRole('heading', { name: 'New job', level: 1 }),
        ).toBeVisible();
        // The client is fixed to the originating record.
        await expect(page.locator('#job-client')).toContainText('Northstar Labs');

        await page.locator('#job-title').fill('QA Automation Engineer');
        await page
            .getByRole('textbox', { name: 'Job description' })
            .fill('Own the end-to-end test strategy for regulated payment flows.');

        await page.getByRole('button', { name: 'Save draft' }).click();
        await expect(page.getByRole('status')).toHaveText('Saved');
        await expect(page.getByText('Draft', { exact: true })).toBeVisible();

        await gotoHash(page, '#/jobs');
        await expect(page.getByRole('status')).toHaveText('11 jobs');
        const draftRow = page.locator('tbody tr', { hasText: 'QA Automation Engineer' });
        await expect(draftRow).toContainText('Draft');
        await expect(draftRow).toContainText('Northstar Labs');
        await page.screenshot({ path: `${SCREENSHOT_DIR}/jobs-with-draft.png` });

        await draftRow.getByRole('link', { name: 'QA Automation Engineer' }).click();
        await page
            .getByRole('dialog')
            .getByRole('link', { name: 'Open full job' })
            .click();
        await expect(
            page.getByRole('heading', { name: 'QA Automation Engineer', level: 1 }),
        ).toBeVisible();
        await expect(
            page.getByText('Own the end-to-end test strategy for regulated payment flows.'),
        ).toBeVisible();

        await expectNoConsoleErrors(page, errors);
    });

    test('job locations use canonical suggestions and Other bonuses save', async ({
        page,
    }) => {
        const errors: string[] = [];
        watchConsole(page, errors);
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.goto('/#/jobs/new');

        const descriptionBox = await page
            .getByRole('heading', { name: /Job description/ })
            .boundingBox();
        const compensationBox = await page
            .getByRole('heading', { name: 'Compensation' })
            .boundingBox();
        if (!descriptionBox || !compensationBox) throw new Error('job sections not rendered');
        expect(descriptionBox.y).toBeLessThan(compensationBox.y);

        await expect(page.locator('#job-title')).toHaveAttribute('required', '');
        await page.locator('#job-client').click();
        await page.getByRole('option', { name: 'Northstar Labs' }).click();
        await page.locator('#job-title').fill('Location Validation Engineer');
        await page.locator('#job-workplace-mode').click();
        await page.getByRole('option', { name: 'On-site' }).click();
        await page.getByRole('button', { name: 'Add location' }).click();

        const location = page.locator('#Locations-0');
        await location.fill('lon');
        await expect(
            page.getByRole('listbox', { name: 'Locations-0 suggestions' }),
        ).toBeVisible();
        await expect(page.getByRole('option', { name: 'London' })).toBeVisible();
        await location.fill('world');
        await expect(page.getByRole('option', { name: 'Worldwide' })).toBeVisible();
        await page.getByRole('option', { name: 'Worldwide' }).click();
        await expect(location).toHaveValue('Worldwide');

        await location.fill('Not A Real Place');
        await page.getByRole('button', { name: 'Add bonus' }).click();
        await page.locator('#bonus-type-0').click();
        await page.getByRole('option', { name: 'Other' }).click();
        await page.locator('#bonus-details-0').fill('Quarterly retention award');
        await page.getByRole('button', { name: 'Save draft' }).click();
        await expect(page.locator('#Locations-0-error')).toHaveText(
            'Select a supported location.',
        );

        await location.fill('london');
        await page.locator('#job-title').click();
        await expect(location).toHaveValue('London');
        await page.getByRole('button', { name: 'Save draft' }).click();
        await expect(page.getByRole('status')).toHaveText('Saved');
        await expect(page.locator('#bonus-type-0')).toContainText('Other');

        await expectNoConsoleErrors(page, errors);
    });

    test('job publish reviews the external post then opens the role', async ({ page }) => {
        const errors: string[] = [];
        watchConsole(page, errors);
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.goto('/#/jobs/new');
        await expect(
            page.getByRole('heading', { name: 'New job', level: 1 }),
        ).toBeVisible();

        await page.locator('#job-client').click();
        await page.getByRole('option', { name: 'Meridian' }).click();
        await page.locator('#job-title').fill('Platform Engineer');
        await page.locator('#job-employment-type').click();
        await page.getByRole('option', { name: 'Full-time' }).click();
        await page.locator('#job-workplace-mode').click();
        await page.getByRole('option', { name: 'Remote' }).click();
        await page.getByRole('button', { name: 'Add remote region' }).click();
        await page.locator('input[id="Remote regions-0"]').fill('Worldwide');
        await page.locator('#job-comp-min').fill('90000');
        await page.locator('#job-comp-max').fill('130000');
        await page.locator('#job-currency').fill('USD');
        await page.locator('#job-pay-period').click();
        await page.getByRole('option', { name: 'Per year' }).click();
        await page.getByRole('button', { name: 'Add bonus' }).click();
        await page.locator('#bonus-details-0').fill('Sign-on bonus');
        await page
            .getByRole('textbox', { name: 'Job description' })
            .fill('Build the paved path for service deployment and observability.');

        // A publish review renders exactly what candidates would see.
        await page.getByRole('button', { name: 'Review public post' }).click();
        const dialog = page.getByRole('dialog', { name: 'Public post preview' });
        await expect(dialog).toBeVisible();
        const preview = dialog.locator('[data-testid="public-post-preview"]');
        await expect(preview).toContainText('Platform Engineer');
        await expect(preview).toContainText('Meridian');
        await expect(preview).toContainText('Remote · Worldwide');
        await expect(preview).toContainText('USD 90000–130000 per year');
        await expect(preview).toContainText('Cash bonus: Sign-on bonus');
        await expect(preview).toContainText(
            'Build the paved path for service deployment and observability.',
        );
        await page.screenshot({ path: `${SCREENSHOT_DIR}/job-publish-preview.png` });

        await dialog.getByRole('button', { name: 'Publish job' }).click();
        await expect(page).toHaveURL(/#\/jobs\/job-/);
        await expect(
            page.getByRole('heading', { name: 'Platform Engineer', level: 1 }),
        ).toBeVisible();
        await expect(page.getByText('Open', { exact: true }).first()).toBeVisible();

        await gotoHash(page, '#/jobs');
        await expect(page.getByRole('status')).toHaveText('11 jobs');

        await expectNoConsoleErrors(page, errors);
    });

    test('stealth client jobs hide company identity in the publish preview', async ({
        page,
    }) => {
        const errors: string[] = [];
        watchConsole(page, errors);
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.goto('/#/jobs/new?client=atlas');
        await expect(
            page.getByRole('heading', { name: 'New job', level: 1 }),
        ).toBeVisible();
        await expect(page.locator('#job-client')).toContainText('Atlas Network');
        await expect(page.getByText('Identity hidden externally')).toBeVisible();

        await page.locator('#job-title').fill('Telemetry Engineer');
        await page.locator('#job-employment-type').click();
        await page.getByRole('option', { name: 'Contract' }).click();
        await page.locator('#job-workplace-mode').click();
        await page.getByRole('option', { name: 'Remote' }).click();
        await page.getByRole('button', { name: 'Add remote region' }).click();
        await page.locator('input[id="Remote regions-0"]').fill('EU');
        await page.locator('#job-comp-min').fill('600');
        await page.locator('#job-comp-max').fill('750');
        await page.locator('#job-currency').fill('EUR');
        await page.locator('#job-pay-period').click();
        await page.getByRole('option', { name: 'Per day' }).click();
        await page
            .getByRole('textbox', { name: 'Job description' })
            .fill('Design alerting pipelines for a confidential platform.');

        await page.getByRole('button', { name: 'Review public post' }).click();
        const preview = page.locator('[data-testid="public-post-preview"]');
        await expect(preview).toContainText('Stealth company');
        await expect(preview).toContainText(
            'A confidential infrastructure company building monitoring and alerting tooling',
        );
        await expect(preview).not.toContainText('Atlas Network');
        await expect(preview).not.toContainText('atlas-network.example');
        await page.screenshot({ path: `${SCREENSHOT_DIR}/job-publish-stealth.png` });

        await page.getByRole('button', { name: 'Back to editing' }).click();
        await expect(page.getByRole('dialog')).toHaveCount(0);

        await expectNoConsoleErrors(page, errors);
    });

    test('job editor rejects an unknown preset client without creating a job', async ({
        page,
    }) => {
        const errors: string[] = [];
        watchConsole(page, errors);
        await page.goto('/#/jobs/new?client=missing-client');

        await page.locator('#job-title').fill('Orphaned role');
        await page
            .getByRole('textbox', { name: 'Job description' })
            .fill('This draft must not be attached to an unknown client.');
        await page.getByRole('button', { name: 'Save draft' }).click();

        await expect(page.locator('#job-client-error')).toHaveText(
            'Select an active client.',
        );
        await expect(page.getByRole('status')).toHaveText('Unsaved changes');
        await gotoHash(page, '#/jobs');
        await expect(page.getByRole('status')).toHaveText('10 jobs');
        await expect(page.getByText('Orphaned role')).toHaveCount(0);

        await expectNoConsoleErrors(page, errors);
    });

    test('editing a published job keeps draft changes until publish', async ({ page }) => {
        const errors: string[] = [];
        watchConsole(page, errors);
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.goto('/#/jobs/job-frontend/edit');
        await expect(
            page.getByRole('heading', { name: 'Edit Senior Frontend Engineer', level: 1 }),
        ).toBeVisible();
        await expect(page.getByText('Published', { exact: true })).toBeVisible();
        await expect(page.locator('#job-title')).toHaveValue('Senior Frontend Engineer');
        await expect(page.locator('#job-client')).toContainText('Northstar Labs');

        await page.locator('#job-title').fill('Senior Frontend Engineer II');
        await page.getByRole('button', { name: 'Save draft' }).click();
        await expect(page.getByRole('status')).toHaveText('Saved');
        await expect(page.getByText('Draft changes', { exact: true })).toBeVisible();

        // The published post keeps its public state; edits sit on a draft revision.
        await gotoHash(page, '#/jobs/job-frontend');
        await expect(
            page.getByRole('heading', { name: 'Senior Frontend Engineer II', level: 1 }),
        ).toBeVisible();
        await expect(page.getByText('Draft changes pending publish')).toBeVisible();
        await expect(page.getByText('Open', { exact: true }).first()).toBeVisible();
        await page.screenshot({ path: `${SCREENSHOT_DIR}/job-draft-changes.png` });

        await page.getByRole('link', { name: 'Edit job' }).click();
        await expect(page.locator('#job-title')).toHaveValue(
            'Senior Frontend Engineer II',
        );
        await page.getByRole('button', { name: 'Review public post' }).click();
        const dialog = page.getByRole('dialog', { name: 'Public post preview' });
        await expect(dialog).toBeVisible();
        await dialog.getByRole('button', { name: 'Publish changes' }).click();
        await expect(page).toHaveURL(/#\/jobs\/job-frontend$/);
        await expect(
            page.getByRole('heading', { name: 'Senior Frontend Engineer II', level: 1 }),
        ).toBeVisible();
        await expect(page.getByText('Draft changes pending publish')).toHaveCount(0);

        await expectNoConsoleErrors(page, errors);
    });

    test('duplicating a job opens a prefilled draft editor', async ({ page }) => {
        const errors: string[] = [];
        watchConsole(page, errors);
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.goto('/#/jobs/job-manager');
        await expect(
            page.getByRole('heading', { name: 'Engineering Manager', level: 1 }),
        ).toBeVisible();

        await page.getByRole('button', { name: 'Duplicate job' }).click();
        await expect(page).toHaveURL(/#\/jobs\/job-[\w-]+\/edit$/);
        await expect(
            page.getByRole('heading', { name: 'Edit Engineering Manager', level: 1 }),
        ).toBeVisible();
        await expect(page.getByText('Draft', { exact: true })).toBeVisible();
        await expect(page.locator('#job-title')).toHaveValue('Engineering Manager');
        await expect(page.locator('#job-comp-min')).toHaveValue('95000');

        await page.locator('#job-title').fill('Engineering Manager (maternity cover)');
        await page.getByRole('button', { name: 'Save draft' }).click();
        await expect(page.getByRole('status')).toHaveText('Saved');

        await gotoHash(page, '#/jobs');
        await expect(page.getByRole('status')).toHaveText('11 jobs');
        await expect(
            page.locator('tbody tr', { hasText: 'Engineering Manager (maternity cover)' }),
        ).toContainText('Draft');

        await expectNoConsoleErrors(page, errors);
    });

    test('leaving a dirty editor asks to save, discard or keep editing', async ({
        page,
    }) => {
        const errors: string[] = [];
        watchConsole(page, errors);
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.goto('/#/clients/new');
        await expect(
            page.getByRole('heading', { name: 'New client', level: 1 }),
        ).toBeVisible();

        await page.locator('#client-name').fill('Unsaved Co');
        await page
            .getByRole('navigation', { name: 'Main navigation' })
            .getByRole('link', { name: 'Jobs' })
            .click();
        const guard = page.getByRole('dialog', { name: 'Unsaved changes' });
        await expect(guard).toBeVisible();

        await guard.getByRole('button', { name: 'Keep editing' }).click();
        await expect(guard).toHaveCount(0);
        await expect(page.locator('#client-name')).toHaveValue('Unsaved Co');
        expect(page.url()).toContain('#/clients/new');

        await page
            .getByRole('navigation', { name: 'Main navigation' })
            .getByRole('link', { name: 'Jobs' })
            .click();
        await guard.getByRole('button', { name: 'Discard and continue' }).click();
        await expect(
            page.getByRole('heading', { name: 'Jobs', level: 1 }),
        ).toBeVisible();

        // Saving from the guard persists the draft before navigating away.
        await page.goto('/#/jobs/job-designer/edit');
        await expect(
            page.getByRole('heading', { name: 'Edit Product Designer', level: 1 }),
        ).toBeVisible();
        await page.locator('#job-title').fill('Product Designer (contract)');
        await page
            .getByRole('navigation', { name: 'Main navigation' })
            .getByRole('link', { name: 'Candidates' })
            .click();
        await expect(guard).toBeVisible();
        await guard.getByRole('button', { name: 'Save and continue' }).click();
        await expect(
            page.getByRole('heading', { name: 'Candidates', level: 1 }),
        ).toBeVisible();

        await gotoHash(page, '#/jobs/job-designer');
        await expect(
            page.getByRole('heading', { name: 'Product Designer (contract)', level: 1 }),
        ).toBeVisible();
        await expect(page.getByText('Draft changes pending publish')).toBeVisible();

        await expectNoConsoleErrors(page, errors);
    });
});
