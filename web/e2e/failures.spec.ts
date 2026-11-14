import type { BrowserContext, Page } from '@playwright/test';
import { answerHeading, expect, exploreUrl, openExplore, standHeading, standUrl, test } from './fixtures';

/** Takes WebGL away: every canvas's WebGL context comes back null, as on a browser or a remote desktop without it. */
async function withoutWebGL(target: Page | BrowserContext) {
  await target.addInitScript(() => {
    const real = HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      value: function (this: HTMLCanvasElement, type: string, options?: unknown) {
        return /webgl/i.test(type) ? null : (real as (this: HTMLCanvasElement, t: string, o?: unknown) => RenderingContext | null).call(this, type, options);
      },
    });
  });
}

/** Answers a request for these data files with a 404, as a server that lacks them would. */
const missing = (page: Page, glob: string) => page.route(glob, (route) => route.fulfill({ status: 404, contentType: 'text/plain', body: 'Not found' }));

/** The answer over the view from the site: the headline, the next step and the lander's state, as words. */
const plateWords = async (page: Page) => (await page.getByRole('region', { name: 'The answer for this site' }).innerText()).replace(/\s+/g, ' ').trim();

/** Words that would mean a raw error reached the page: an address, a status code, a stack. */
const RAW = /HTTP \d|\/data\/|ERR_|TypeError|undefined|Failed to fetch/;

test.describe('Without WebGL 2', () => {
  test('the view from the site falls back to the horizon chart with the same words', async ({ page, browser, shot }) => {
    test.setTimeout(240_000);
    // With WebGL: the words over the view, read as soon as they show.
    await page.goto(standUrl());
    await expect(standHeading(page)).toHaveText(/^Landing on 1 January: /, { timeout: 90_000 });
    const heading = await standHeading(page).textContent();
    const words = await plateWords(page);
    await page.goto('about:blank');

    // Without it: the same words, the horizon chart and a line that says why.
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'en-US', timezoneId: 'UTC' });
    await withoutWebGL(context);
    const plain = await context.newPage();
    const errors: string[] = [];
    plain.on('pageerror', (e) => errors.push(e.message));
    await plain.goto(standUrl());
    await expect(plain.getByText('This browser cannot draw the view from the site, so here is the horizon chart instead.')).toBeVisible({ timeout: 90_000 });
    await expect(plain.getByText('Left to right is the direction from the site, not time.')).toBeVisible();
    await expect(standHeading(plain)).toHaveText(heading ?? '');
    expect(await plateWords(plain)).toBe(words);
    await expect(plain.locator('canvas[role="application"]')).toHaveCount(0);
    await expect(plain.getByText('Building the ground from NASA heights…')).toBeHidden();
    // The time bar still moves the hour the chart shows.
    const slider = plain.getByRole('region', { name: 'Time' }).getByRole('slider', { name: 'Time' });
    await slider.focus();
    await plain.keyboard.press('PageUp');
    await expect(slider).toHaveAttribute('aria-valuetext', /^2 Jan 2027/);
    await shot('stand-fallback', plain);
    expect(errors).toEqual([]);
    await context.close();
  });

  test('Explore keeps its answer and chart, and the 3D ground says it needs WebGL', async ({ page, shot }) => {
    await withoutWebGL(page);
    await openExplore(page);
    await expect(answerHeading(page)).toHaveText(/^Landing at de Gerlache Rim\s2 on 1 January: /);
    await expect(page.getByRole('slider', { name: 'Time' })).toBeVisible();
    const ground = page.getByRole('region', { name: 'The ground', exact: true });
    await ground.scrollIntoViewIfNeeded();
    // The shadow map is drawn without WebGL; the 3D tab says plainly that it cannot be.
    await expect(ground.getByRole('tabpanel', { name: 'Shadow map' })).toBeVisible();
    await ground.getByRole('tab', { name: '3D from above' }).click();
    await expect(ground.getByText('3D view is not available on this device.')).toBeVisible({ timeout: 60_000 });
    await shot('explore-ground');
  });

  test('the home page shows the arrival as pictures, with its words and its way to the forecast', async ({ page }) => {
    await withoutWebGL(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('[data-arrival] img').first()).toBeVisible();
    await expect(page.locator('[data-arrival] canvas')).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Open the full forecast/ }).first()).toBeAttached();
  });
});

test.describe('When the data fails', () => {
  test('with the data unreachable, each page that needs it says so plainly, with a way on and no blank screen', async ({ page, shot }) => {
    await page.route('**/data/**', (route) => route.abort('connectionrefused'));
    const plainly = 'Reload the page, or try again in a minute.';
    for (const [path, says, framed] of [
      ['/sites', 'The data could not be loaded.', true],
      [exploreUrl(), 'The data could not be loaded.', true],
      ['/compare', 'The data could not be loaded.', true],
      ['/validate', 'The checks could not be loaded.', true],
      ['/brief', 'The data could not be loaded.', false],
    ] as const) {
      await page.goto(path);
      const alert = page.getByRole('alert').filter({ hasText: says });
      await expect(alert, path).toBeVisible({ timeout: 60_000 });
      await expect(alert, path).toContainText(plainly);
      expect(await page.locator('main').innerText(), `${path} prints no raw error`).not.toMatch(RAW);
      // The way on: the header's sections, or the brief's link back.
      if (framed) await expect(page.getByRole('navigation', { name: 'Sections' }), path).toBeVisible();
      else await expect(page.getByRole('link', { name: 'Back to Explore' }), path).toBeVisible();
    }
    await shot('explore-no-data');
    await page.goto(standUrl());
    await expect(page.getByText('The data for this view did not load.')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('link', { name: 'Back to Explore' })).toBeVisible();
    // The pages that need no data still show in full.
    await page.goto('/learn');
    await expect(page.getByRole('heading', { level: 1, name: 'How it works' })).toBeVisible();
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('with one file missing, the page says which part did not load', async ({ page, shot }) => {
    test.setTimeout(240_000);
    // The site's horizon: Explore and the view from the site say the data did not load, rather than wait for ever.
    await missing(page, '**/data/masks/de_gerlache_rim_2.json');
    await page.goto(exploreUrl());
    await expect(page.getByRole('alert').filter({ hasText: 'The data could not be loaded.' })).toBeVisible({ timeout: 60_000 });
    await page.goto(standUrl());
    await expect(page.getByText('The data for this view did not load.')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText('Building the ground from NASA heights…')).toBeHidden();
    await page.unrouteAll();

    // The star catalogue: the view from the site gives way to the horizon chart, with its words.
    await missing(page, '**/data/sky/stars.bin');
    await page.goto(standUrl());
    await expect(page.getByText('The view from the site could not be loaded, so here is the horizon chart instead.')).toBeVisible({ timeout: 90_000 });
    await expect(standHeading(page)).toHaveText(/^Landing on 1 January: /);
    await shot('stand-no-stars');
    await page.unrouteAll();

    // The checks against NASA's own figures: Accuracy says they could not be loaded.
    await missing(page, '**/data/validation/**');
    await page.goto('/validate');
    await expect(page.getByRole('alert').filter({ hasText: 'The checks could not be loaded.' })).toBeVisible({ timeout: 60_000 });
  });
});
