import { answerHeading, expect, openExplore, test } from './fixtures';

/**
 * The target demonstration, in the planner's words: "Our landing slipped by five days. Show what changed at the
 * original site, which nearby alternative works better, and the sunlight, powered-time, and Earth-contact trade-offs
 * supporting that recommendation." The first journey takes it as far as the app goes today (Explore for the before
 * and after, its nearby advice, Compare for the trade-offs); the second waits for the scenario comparison in Compare.
 */
test.describe('A landing that slips by five days', () => {
  test('the original site before and after the slip, the nearby site Explore advises, and the trade-offs side by side in Compare', async ({ page, shot }) => {
    test.setTimeout(240_000);
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

    // The nearby site Explore advises for the new landing day, with its reason in one sentence.
    const advice = answer.getByText(/^Nearby, .+ \(\d+ km away[^)]*\) keeps power/);
    await expect(advice).toBeVisible();
    const name = /^Nearby, (.+?) \(\d+ km away[^)]*\)/.exec((await advice.textContent()) ?? '')?.[1] ?? '';
    expect(name, 'the advice names a site').not.toBe('');
    await expect(answer.getByRole('link', { name: `Explore ${name}` })).toBeVisible();
    await shot('explore-slipped');

    // The trade-offs: both sites in Compare, for the slipped days and the same lander.
    await page.getByRole('navigation', { name: 'Sections' }).getByRole('link', { name: 'Compare sites' }).click();
    await page.waitForURL(/\/compare$/);
    await expect(page.getByRole('region', { name: 'What this comparison is for' }).getByText('6 January 2027', { exact: true })).toBeVisible();
    const add = async (label: string) => {
      await page.getByLabel('Add a site').selectOption({ label });
      await page.getByRole('button', { name: 'Add', exact: true }).click();
    };
    await add('de Gerlache Rim 2');
    await add(name);
    const table = page.getByRole('table');
    await expect(table.getByRole('rowheader').getByRole('link')).toHaveText(['de Gerlache Rim 2', name]);
    for (const column of ['Sunlight', 'Earth in view', 'Time with power']) await expect(table.getByRole('columnheader', { name: column })).toBeVisible();
    // The sentence over the table names the better site for the powered time.
    await expect(page.getByRole('region', { name: 'The sites side by side' }).locator('p').first()).toContainText(`${name} has the longest time with power`);
    await shot('compare-tradeoffs');
  });

  test('Compare sets the planned and the slipped landing side by side and recommends the nearby site, with its trade-offs', async () => {
    test.skip(
      true,
      'Pending: the scenario comparison in Compare (the scenarios part) has not landed on the session branch yet. Until it does, the journey above shows the same story with Explore and the plain Compare table.',
    );
  });
});
