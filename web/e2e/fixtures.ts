import { expect, test as base, type Locator, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

/** The pitch's site and month: de Gerlache Rim 2 from 1 January 2027, for 30 days. */
export const SITE = 'de_gerlache_rim_2';
export const START = '2027-01-01';
export const exploreUrl = (site = SITE, start = START, days = 30) => `/explore?site=${site}&start=${start}&days=${days}`;
export const standUrl = (site = SITE, start = START, days = 30, hour = 0) => `/explore/stand?site=${site}&start=${start}&days=${days}&hour=${hour}`;

/** Where the journeys' screenshots go: E2E_SHOTS, else test-results/shots. */
export const SHOTS = process.env.E2E_SHOTS ?? path.join(__dirname, '..', 'test-results', 'shots');

/** The two files every page with figures reads first: the site catalogue and the Sun and Earth table's header. */
const DATA_PROBES = ['/data/sites.json', '/data/ephemeris/moon_me_2024_2036_1h.json'];
export const NO_DATA =
  'The data is not served (web/public/data is empty): run `uv run python -m lunar_pipeline.cli sync-local --tiles` in pipeline/, as the README says, then run the journeys again.';

type Options = {
  /** Uncaught errors the page may throw in this test without failing it (a pattern each must match). */
  allowedPageErrors: RegExp[];
};
type Fixtures = {
  /** Saves a screenshot of the window under SHOTS, named for the journey and the step. */
  shot: (name: string) => Promise<void>;
  /** Uncaught errors and unhandled rejections the page has thrown so far. */
  pageErrors: string[];
};
type WorkerFixtures = { dataServed: boolean };

export const test = base.extend<Options & Fixtures & { _guards: void }, WorkerFixtures>({
  allowedPageErrors: [[], { option: true }],
  dataServed: [
    async ({ playwright }, provide, workerInfo) => {
      const request = await playwright.request.newContext({ baseURL: workerInfo.project.use.baseURL });
      let ok = true;
      for (const probe of DATA_PROBES) ok = ok && (await request.get(probe).then((r) => r.ok(), () => false));
      await request.dispose();
      await provide(ok);
    },
    { scope: 'worker' },
  ],
  pageErrors: async ({ page }, provide) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await provide(errors);
  },
  // Every journey needs the data, and none may leave an uncaught error behind.
  _guards: [
    async ({ dataServed, pageErrors, allowedPageErrors }, provide, testInfo) => {
      testInfo.skip(!dataServed, NO_DATA);
      await provide();
      const unexpected = pageErrors.filter((m) => !allowedPageErrors.some((re) => re.test(m)));
      expect(unexpected, 'uncaught errors on the page').toEqual([]);
    },
    { auto: true },
  ],
  shot: async ({ page }, provide, testInfo) => {
    mkdirSync(SHOTS, { recursive: true });
    const slug = (s: string) =>
      s
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 60);
    await provide(async (name) => {
      await page.screenshot({ path: path.join(SHOTS, `${slug(testInfo.titlePath.slice(1, -1).join(' ') || 'journey')}--${slug(name)}.png`), timeout: 120_000 });
    });
  },
});

export { expect };

/** Explore's answer: the heading of the panel that leads the page. */
export const answerHeading = (page: Page) => page.getByRole('region', { name: 'The answer' }).getByRole('heading', { level: 1 });

/** Opens Explore and waits for its answer. */
export async function openExplore(page: Page, url = exploreUrl()) {
  await page.goto(url);
  await expect(answerHeading(page)).toBeVisible({ timeout: 90_000 });
}

/** The stand view's heading, kept for screen readers at all times (the plate shows it to the eye). */
export const standHeading = (page: Page) => page.locator('h1').first();

/**
 * Presses Tab (or Shift+Tab) until `target` has the focus, and returns how many presses it took: proof that the
 * keyboard reaches it in the page's order. Fails after `max` presses.
 */
export async function tabTo(page: Page, target: Locator, { max = 80, back = false }: { max?: number; back?: boolean } = {}): Promise<number> {
  await target.waitFor({ state: 'attached' });
  for (let n = 1; n <= max; n++) {
    await page.keyboard.press(back ? 'Shift+Tab' : 'Tab');
    if (await target.evaluate((el) => el === document.activeElement)) return n;
  }
  const at = await page.evaluate(() => {
    const el = document.activeElement;
    return el ? `${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 60)}"` : 'nothing';
  });
  throw new Error(`Tab did not reach the target in ${max} presses; the focus is on ${at}`);
}

/**
 * The focused element shows the keyboard's focus: it matches :focus-visible, and it or the label round it (a radio
 * hidden in a styled label) draws an outline or a ring that is not transparent.
 */
export async function expectFocusVisible(page: Page) {
  const ring = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return { ok: false, why: 'nothing has the focus' };
    if (!el.matches(':focus-visible')) return { ok: false, why: `${el.tagName} has the focus but not :focus-visible` };
    const clear = (c: string) => c === 'transparent' || /rgba\(.*,\s*0\)$/.test(c);
    for (let node: HTMLElement | null = el, up = 0; node && up < 3; node = node.parentElement, up++) {
      const s = getComputedStyle(node);
      if (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 1 && !clear(s.outlineColor)) return { ok: true, why: `outline on ${node.tagName}` };
      if (s.boxShadow && s.boxShadow !== 'none') return { ok: true, why: `ring on ${node.tagName}` };
    }
    return { ok: false, why: `no outline or ring on ${el.tagName} "${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 40)}"` };
  });
  expect(ring.ok, ring.why).toBe(true);
}

/** The page cannot scroll sideways: nothing reaches past the window's right edge, and a sideways scroll stays at 0. */
export async function expectNoSideScroll(page: Page, what: string) {
  const r = await page.evaluate(() => {
    const doc = document.documentElement;
    window.scrollTo(400, window.scrollY);
    const x = window.scrollX;
    window.scrollTo(0, window.scrollY);
    return { scrollWidth: doc.scrollWidth, width: doc.clientWidth, x };
  });
  expect(r.scrollWidth, `${what}: the page is ${r.scrollWidth} px wide in a ${r.width} px window`).toBeLessThanOrEqual(r.width);
  expect(r.x, `${what}: a sideways scroll moved the page`).toBe(0);
}

/** Replaces window.print with a counter, so a journey can press Print without a dialog. */
export async function stubPrint(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { __prints: number }).__prints = 0;
    window.print = () => {
      (window as unknown as { __prints: number }).__prints++;
    };
  });
}
export const printCount = (page: Page) => page.evaluate(() => (window as unknown as { __prints: number }).__prints);
