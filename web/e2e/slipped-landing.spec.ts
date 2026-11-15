import type { Page } from '@playwright/test';
import { answerHeading, expect, openExplore, printCount, stubPrint, test } from './fixtures';

/**
 * The target demonstration, in the planner's words: "Our landing slipped by five days. Show what changed at the
 * original site, which nearby alternative works better, and the sunlight, powered-time, and Earth-contact trade-offs
 * supporting that recommendation." Explore shows the slip at the site; Compare sets the planned landing, five days
 * later and the best place nearby side by side, says what changed and what works better, and its link and brief carry
 * the same comparison.
 */

/** The comparison's figures: every row of the table as its words, once each scenario is worked out. */
async function tableWords(page: Page): Promise<string[]> {
  const region = page.getByRole('region', { name: 'The scenarios side by side' });
  await expect(region.getByRole('table')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('Working out…')).toHaveCount(0, { timeout: 120_000 });
  await expect(page.getByText('Working out the figures…')).toHaveCount(0, { timeout: 120_000 });
  return (await region.getByRole('row').allInnerTexts()).map((row) => row.replace(/\s+/g, ' ').trim());
}

test.describe('A landing that slips by five days', () => {
  test('Explore shows what the slip changes at the original site and advises a nearby site', async ({ page, shot }) => {
    const answer = page.getByRole('region', { name: 'The answer' });
    const period = page.getByRole('region', { name: 'What this forecast is for' });
    // Before: the planned landing on 1 January.
    await openExplore(page);
    await expect(answerHeading(page)).toHaveText(/^Landing at de Gerlache Rim\s2 on 1 January: /);
    const planned = (await answerHeading(page).textContent()) ?? '';
    // After: five days later, the same site's answer changes.
    await period.getByLabel('From').fill('2027-01-06');
    await expect(answerHeading(page)).toHaveText(/^Landing at de Gerlache Rim\s2 on 6 January: /);
    const slipped = (await answerHeading(page).textContent()) ?? '';
    expect(slipped.replace(/ on 6 January/, '')).not.toBe(planned.replace(/ on 1 January/, ''));
    // The nearby site Explore advises for the new landing day, with its reason in one sentence and a way there.
    const advice = answer.getByText(/^Nearby, .+ \(\d+ km away[^)]*\) keeps power/);
    await expect(advice).toBeVisible();
    const name = /^Nearby, (.+?) \(\d+ km away[^)]*\)/.exec((await advice.textContent()) ?? '')?.[1] ?? '';
    expect(name, 'the advice names a site').not.toBe('');
    await expect(answer.getByRole('link', { name: `Explore ${name}` })).toBeVisible();
    await shot('explore-slipped');
  });

  test('Compare from here sets the planned landing, five days later and the best place nearby side by side, says what changed and what works better, and its link and brief carry it', async ({ page, browser, shot }) => {
    test.setTimeout(300_000);
    await stubPrint(page);

    await test.step('Compare from here makes the planned landing the baseline', async () => {
      // The planned landing, in Explore: de Gerlache Rim 2 on 1 January 2027, 30 days, the small lander.
      await openExplore(page);
      await page.getByRole('button', { name: 'Compare from here' }).click();
      await page.waitForURL(/\/compare\?/);
      await expect(page.getByRole('group', { name: /^Baseline: / })).toBeVisible({ timeout: 60_000 });
    });

    await test.step('the baseline’s slip, open at five days later, adds the slipped landing in one press', async () => {
      await page.getByRole('group', { name: /^Baseline: / }).getByRole('button', { name: 'Add 5 days later' }).click();
      await expect(page.getByRole('group', { name: 'Scenario 2: 5 days later' })).toBeVisible();
    });

    await test.step('the slipped landing finds the best place nearby', async () => {
      await page.getByRole('group', { name: 'Scenario 2: 5 days later' }).getByRole('button', { name: 'Find a nearby alternative' }).click();
      await expect(page.getByRole('group', { name: /^Scenario 3: / })).toBeVisible({ timeout: 120_000 });
    });

    let figures: string[] = [];
    await test.step('the words say what changed at the original site and which site works better, with the trade-offs', async () => {
      figures = await tableWords(page);
      const story = page.getByRole('region', { name: 'What changed, and what works better' });
      const original = story.getByRole('heading', { name: 'At the original site' });
      await expect(original).toBeVisible();
      // What changed at the original site: the slipped landing's power against the planned one's.
      await expect(original.locator('xpath=following-sibling::p').first()).toHaveText(/^5 days later \(6 January 2027, 00:00 UTC\): power for .+ instead of .+/);
      // Which site works better, and the trade-offs behind it: sunlight, powered time and contact with Earth.
      const another = story.getByRole('heading', { name: 'At another site' });
      await expect(another).toBeVisible();
      await expect(another.locator('xpath=following-sibling::p').first()).toHaveText(/works better than “5 days later” at the same landing time .*: power for .+ instead of .+/);
      // The trade-offs repeat the table's rows in words: one tap away, in their fold.
      await story.getByRole('button', { name: 'The trade-offs' }).click();
      const tradeoffs = story.getByRole('listitem');
      for (const measure of ['Sunlight', 'Radio contact while it has power', 'Earth in view']) await expect(tradeoffs.filter({ hasText: new RegExp(`^${measure}: `) })).toHaveCount(1);
      // The figures behind it, one column per scenario.
      const table = page.getByRole('region', { name: 'The scenarios side by side' }).getByRole('table');
      await expect(table.getByRole('columnheader')).toHaveCount(4);
      for (const row of ['Site', 'Landing (UTC)', 'Time with power', 'Sunlight', 'Earth in view', 'Radio contact while it has power']) {
        await expect(table.getByRole('rowheader', { name: row, exact: true })).toBeVisible();
      }
      await shot('compare-scenarios');
    });

    await test.step('the page’s link, opened in a fresh browser, shows the same table', async () => {
      const link = page.url();
      expect(link).toMatch(/\/compare\?/);
      const fresh = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'en-US', timezoneId: 'UTC' });
      const other = await fresh.newPage();
      await other.goto(link);
      expect(await tableWords(other)).toEqual(figures);
      await fresh.close();
    });

    await test.step('the comparison brief carries the same comparison to paper', async () => {
      await page.getByRole('link', { name: 'Printable comparison brief' }).click();
      await page.waitForURL(/\/compare\/brief/);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 60_000 });
      await expect(page.getByText('Working out the figures…')).toBeHidden({ timeout: 120_000 });
      await expect(page.locator('main')).toContainText('5 days later');
      await page.getByRole('button', { name: 'Print or save as PDF' }).click();
      expect(await printCount(page)).toBe(1);
      await shot('comparison-brief');
    });
  });
});
