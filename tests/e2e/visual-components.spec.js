import { expect, test } from '@playwright/test';

// Visual regression guard for the public site's effect components. Every
// component in the homepage/jobs inventory must render without console
// errors, and every canvas/WebGL effect must actually draw: its pixels are
// sampled in isolation (all other boxes hidden) and must not be blank or a
// single flat colour. Runs on both configured projects (desktop + mobile) and
// again with prefers-reduced-motion.

// Section headings that identify each homepage component.
const HOMEPAGE_SECTIONS = {
    FlowingHub: 'Transforming raw signal into Tier 1 infrastructure',
    LaserStreamSection: 'Hiring with us',
    TalentPortal: 'Sync your signal',
    CapitalLayer: 'Scaling infrastructure',
    ActiveNetworkQueries: 'Real time roles',
    ResearchLayer: 'Our research',
    TheHandshake: 'Initialize connection',
};

function collectErrors(page) {
    const errors = [];
    page.on('console', (message) => {
        if (message.type() === 'error') {
            errors.push(message.text());
        }
    });
    page.on('pageerror', (error) => errors.push(error.message));
    return errors;
}

// The page runs on Playwright's fake clock, so animation frames only happen
// when the test advances time. Free-running, three software-WebGL effects
// (CI runners have no GPU) keep the main thread so busy that DOM queries time
// out. Each fastForward fires due timers and animation frames once.
async function renderFrames(page, frames = 6) {
    for (let i = 0; i < frames; i += 1) {
        await page.clock.fastForward(50);
    }
}

async function scrollThrough(page) {
    const { step, height } = await page.evaluate(() => ({
        step: Math.max(200, Math.floor(window.innerHeight * 0.6)),
        height: document.body.scrollHeight,
    }));
    for (let y = 0; y < height; y += step) {
        await page.evaluate((top) => window.scrollTo(0, top), y);
        await renderFrames(page, 2);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
}

// Screenshots only the given canvas, with every other box hidden and the body
// painted magenta, then measures colour variety and luminance range.
async function canvasPixelStats(page, canvas) {
    await canvas.evaluate((node) => node.scrollIntoView({ block: 'start' }));
    await renderFrames(page);
    const handle = await canvas.elementHandle();
    await page.evaluate((element) => {
        element.setAttribute('data-pixel-probe', '1');
        const style = document.createElement('style');
        style.id = 'pixel-probe-style';
        style.textContent = 'body * { visibility: hidden !important; }'
            + ' canvas[data-pixel-probe] { visibility: visible !important; }'
            + ' body { background: #ff00ff !important; }';
        document.head.appendChild(style);
    }, handle);
    await renderFrames(page, 2);
    // Clip to the visible part of the canvas; an element screenshot would
    // wait for an animating, page-tall canvas to become "stable".
    const box = await canvas.boundingBox();
    const viewport = page.viewportSize();
    const x = Math.max(0, box.x);
    const y = Math.max(0, box.y);
    const png = await page.screenshot({
        clip: {
            x,
            y,
            width: Math.min(viewport.width, box.x + box.width) - x,
            height: Math.min(viewport.height, box.y + box.height) - y,
        },
    });
    await page.evaluate((element) => {
        element.removeAttribute('data-pixel-probe');
        document.getElementById('pixel-probe-style')?.remove();
    }, handle);

    // Decode in a blank page: the page under test is busy rendering WebGL
    // frames and can starve an evaluate for minutes on slow software GL.
    const scratch = await page.context().newPage();
    try {
        return await scratch.evaluate(async (base64) => {
        const image = new Image();
        image.src = `data:image/png;base64,${base64}`;
        await image.decode();
        const surface = document.createElement('canvas');
        surface.width = image.width;
        surface.height = image.height;
        const context = surface.getContext('2d');
        context.drawImage(image, 0, 0);
        const { data } = context.getImageData(0, 0, surface.width, surface.height);
        // Exact magenta is the probe backdrop showing through a transparent
        // pixel; everything else is something the canvas painted.
        const painted = new Set();
        let paintedCount = 0;
        let min = 765;
        let max = 0;
        let samples = 0;
        const pixels = surface.width * surface.height;
        const stride = Math.max(1, Math.floor(pixels / 20000));
        for (let i = 0; i < pixels; i += stride) {
            const r = data[i * 4];
            const g = data[i * 4 + 1];
            const b = data[i * 4 + 2];
            samples += 1;
            if (r >= 250 && g <= 5 && b >= 250) continue;
            paintedCount += 1;
            const luma = r + g + b;
            min = Math.min(min, luma);
            max = Math.max(max, luma);
            painted.add(((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3));
        }
        return {
            paintedShare: paintedCount / samples,
            paintedColours: painted.size,
            paintedLumaRange: paintedCount ? max - min : 0,
        };
        }, png.toString('base64'));
    } finally {
        await scratch.close();
    }
}

const looksDrawn = (stats) => stats.paintedShare > 0.02
    && stats.paintedColours > 2 && stats.paintedLumaRange > 15;

// The first frames after mount can precede shader compilation or canvas
// sizing, so give a canvas a few rounds of frames to draw before judging it.
async function drawnCanvasStats(page, canvas) {
    let stats;
    for (let attempt = 0; attempt < 5; attempt += 1) {
        stats = await canvasPixelStats(page, canvas);
        if (looksDrawn(stats)) break;
        await renderFrames(page, 10);
    }
    return stats;
}

function expectDrawn(stats, name) {
    // Not blank: a meaningful share of the canvas is painted.
    expect(stats.paintedShare, `${name} canvas is blank/transparent`).toBeGreaterThan(0.02);
    // Not a single flat colour: the painted pixels vary.
    expect(stats.paintedColours, `${name} canvas is a single flat colour`).toBeGreaterThan(2);
    expect(stats.paintedLumaRange, `${name} canvas has no luminance variation`).toBeGreaterThan(15);
}

for (const reducedMotion of ['no-preference', 'reduce']) {
    test.describe(`visual components (prefers-reduced-motion: ${reducedMotion})`, () => {
        // Render at 1x: the mobile project emulates a 2.75x screen, and three
        // WebGL effects at that density on software GL (CI runners, this
        // sandbox) starve the page for minutes. Layout at 393px is unchanged.
        test.use({ reducedMotion, deviceScaleFactor: 1 });

        test('homepage components render and canvases draw', async ({ page }) => {
            test.setTimeout(180_000);
            const errors = collectErrors(page);
            await page.clock.install();
            await page.goto('/');
            await expect(page.getByRole('heading', { name: /High-Fidelity Talent Infrastructure/ })).toBeVisible();
            await scrollThrough(page);

            const heroCanvas = page.locator('section#home canvas');
            await expect(heroCanvas, 'Beams hero canvas').toHaveCount(1);
            expectDrawn(await drawnCanvasStats(page, heroCanvas), 'Beams (hero)');

            for (const [component, heading] of Object.entries(HOMEPAGE_SECTIONS)) {
                const locator = page.getByText(heading, { exact: false }).first();
                // Scroll directly: some headings sit in animated sections whose
                // boxes never become "stable" for scrollIntoViewIfNeeded.
                await locator.evaluate((node) => node.scrollIntoView({ block: 'center' }));
                await expect(locator, `${component} renders`).toBeVisible();
            }

            const terminalCanvas = page
                .locator('section', { hasText: HOMEPAGE_SECTIONS.TheHandshake })
                .locator('canvas');
            await expect(terminalCanvas, 'FaultyTerminal canvas').toHaveCount(1);
            expectDrawn(await drawnCanvasStats(page, terminalCanvas), 'FaultyTerminal');

            // magicui: Marquee rows and DecryptedText spans.
            await expect(page.locator('div.flex.shrink-0').first(), 'Marquee renders').toBeAttached();
            await expect(page.locator('span.inline-block.whitespace-nowrap').first(), 'DecryptedText renders').toBeAttached();
            // Accordion (FAQ) at the bottom of the page.
            await expect(page.locator('section').last().locator('button').first(), 'Accordion renders').toBeAttached();

            expect(errors).toEqual([]);
        });

        test('jobs board Beams background draws', async ({ page }) => {
            test.setTimeout(120_000);
            const errors = collectErrors(page);
            await page.clock.install();
            await page.goto('/jobs');
            await expect(page.getByRole('heading', { name: /Open Positions/ })).toBeVisible();
            const canvas = page.locator('main canvas');
            await expect(canvas, 'Beams jobs canvas').toHaveCount(1);
            expectDrawn(await drawnCanvasStats(page, canvas), 'Beams (jobs)');
            expect(errors).toEqual([]);
        });
    });
}
