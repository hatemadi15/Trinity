import type { Page } from '@playwright/test';
import { expect, expectNoSideScroll, exploreUrl, standUrl, test } from './fixtures';

/** A phone 390 px wide, held upright, with a touch screen. */
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

/** Compare's example, a landing at de Gerlache Rim 2 slipped by five days with the best place nearby, worked out. */
async function slipExample(page: Page) {
  await page.getByRole('button', { name: /What if our landing is 5 days late\?/ }).tap({ timeout: 60_000 });
  await expect(page.getByRole('group', { name: /^Landing 3: / })).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText('Working out the figures…')).toHaveCount(0, { timeout: 120_000 });
}

/** Each page, how to know it has drawn, and what to open on it before measuring, at 390 px. */
const PAGES: { name: string; path: string; ready: (page: Page) => Promise<void> }[] = [
  {
    name: 'The home page',
    path: '/',
    ready: async (page) => {
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Fly to the south pole' })).toBeVisible();
    },
  },
  {
    name: 'Choose a site',
    path: '/sites',
    ready: async (page) => {
      await expect(page.getByRole('heading', { level: 1, name: 'Choose a landing site' })).toBeVisible();
      // The map is the page: every site is a marker. A first tap names the site on a card, which is the way in.
      await page.getByRole('link', { name: 'de Gerlache Rim 2', exact: true }).tap({ timeout: 60_000 });
      const card = page.getByRole('link', { name: 'Open de Gerlache Rim 2' });
      await expect(card).toBeVisible();
      await expect(card).toHaveAttribute('href', /^\/explore\?site=de_gerlache_rim_2&start=/);
      await expect(page.getByRole('link', { name: 'Choose your own site' })).toHaveAttribute('href', '/explore?own=1');
    },
  },
  {
    name: 'Explore, with its fields open',
    path: exploreUrl(),
    ready: async (page) => {
      await expect(page.getByRole('region', { name: 'The answer' }).getByRole('heading', { level: 1 })).toBeVisible({ timeout: 90_000 });
      await expectNoSideScroll(page, 'Explore, its fields folded');
      await page.getByRole('button', { name: 'change', exact: true }).tap();
      await expect(page.getByLabel('From', { exact: true })).toBeVisible();
    },
  },
  {
    name: 'The view from the site',
    path: standUrl(),
    ready: async (page) => {
      await expect(page.locator('h1').first()).toHaveText(/^Landing on 1 January: /, { timeout: 90_000 });
      await expect(page.getByText('Building the ground from NASA heights…')).toBeHidden({ timeout: 180_000 });
    },
  },
  {
    name: 'Compare, with the five-day slip example',
    path: '/compare',
    ready: async (page) => {
      await expect(page.getByRole('heading', { level: 1, name: 'Compare landings' })).toBeVisible({ timeout: 60_000 });
      await expectNoSideScroll(page, 'Compare, empty');
      await slipExample(page);
    },
  },
  {
    name: 'The comparison brief',
    path: '/compare',
    ready: async (page) => {
      await slipExample(page);
      await page.getByRole('link', { name: 'Printable comparison brief' }).tap();
      await page.waitForURL(/\/compare\/brief/);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 60_000 });
      await expect(page.getByText('Working out the figures…')).toBeHidden({ timeout: 120_000 });
    },
  },
  {
    name: 'The brief',
    path: '/brief',
    ready: async (page) => {
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 60_000 });
      await expect(page.getByRole('button', { name: 'Print or save as PDF' })).toBeVisible();
    },
  },
  {
    name: 'Plan a landing, with its example worked out',
    path: '/plan',
    ready: async (page) => {
      await expect(page.getByRole('heading', { level: 1, name: 'Plan a landing' })).toBeVisible();
      await page.getByRole('button', { name: 'Try the example' }).tap({ timeout: 60_000 });
      await expect(page.getByRole('region', { name: 'I heard' })).toBeVisible({ timeout: 60_000 });
      await page.getByRole('button', { name: /^Search \d+ sites?$/ }).tap();
      await expect(page.getByRole('region', { name: 'The answer' })).toBeVisible({ timeout: 180_000 });
    },
  },
  {
    name: 'How it works',
    path: '/learn',
    ready: async (page) => {
      await expect(page.getByRole('heading', { level: 1, name: 'How it works' })).toBeVisible();
    },
  },
  {
    name: 'Accuracy',
    path: '/validate',
    ready: async (page) => {
      await expect(page.getByRole('heading', { level: 1, name: 'Accuracy' })).toBeVisible();
      // A table of figures, opened: it may scroll inside its own box, never the page.
      await page.getByRole('button', { name: 'Show the numbers' }).first().tap({ timeout: 60_000 });
      await expect(page.getByRole('table').first()).toBeVisible();
    },
  },
  {
    name: 'A page that does not exist',
    path: '/no-such-page',
    ready: async (page) => {
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    },
  },
];

test.describe('Narrow screens', () => {
  for (const p of PAGES) {
    test(`${p.name} fits a 390 px phone with no sideways scroll`, async ({ page, shot }) => {
      test.setTimeout(240_000);
      await page.goto(p.path);
      await p.ready(page);
      await expectNoSideScroll(page, p.name);
      // Down to the foot of the page, where tables and footers live.
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await expectNoSideScroll(page, `${p.name}, scrolled to its foot`);
      await page.evaluate(() => window.scrollTo(0, 0));
      await shot('phone');
    });
  }
});
