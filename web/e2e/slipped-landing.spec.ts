import { answerHeading, expect, openExplore, printCount, stubPrint, test } from './fixtures';

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

  test('Compare from here sets the planned landing, five days later and the best place nearby side by side, with what changed and the trade-offs', async ({ page, shot }) => {
    test.setTimeout(300_000);
    await stubPrint(page);
    // The planned landing, in Explore: de Gerlache Rim 2 on 1 January 2027, 30 days, the small lander.
    await openExplore(page);
    const fromHere = page.getByRole('button', { name: 'Compare from here' });
    test.skip(!(await fromHere.isVisible()), 'Pending: the scenario comparison in Compare (the scenarios part) has not landed on the session branch yet.');
    await fromHere.click();
    await page.waitForURL(/\/compare\?/);

    // The baseline, alone, offers the slip open at five days later: one press.
    const baseline = page.getByRole('group', { name: /^Baseline: / });
    await expect(baseline).toBeVisible({ timeout: 60_000 });
    await baseline.getByRole('button', { name: 'Add 5 days later' }).click();
    const slipped = page.getByRole('group', { name: 'Scenario 2: 5 days later' });
    await expect(slipped).toBeVisible();

    // The best place nearby for the slipped landing.
    await slipped.getByRole('button', { name: 'Find a nearby alternative' }).click();
    await expect(page.getByRole('group', { name: /^Scenario 3: / })).toBeVisible({ timeout: 120_000 });

    // The words: what changed at the original site, then the alternative and its trade-offs.
    const story = page.getByRole('region', { name: 'What changed, and what works better' });
    await expect(story.getByRole('heading', { name: 'At the original site' })).toBeVisible({ timeout: 120_000 });
    await expect(story.getByRole('heading', { name: 'At another site' })).toBeVisible({ timeout: 120_000 });
    await expect(story.getByRole('listitem').first()).toBeVisible();
    await expect(story).not.toContainText('Working out the figures…', { timeout: 120_000 });

    // The figures behind it, side by side: sunlight, time with power and contact with Earth for each scenario.
    const table = page.getByRole('region', { name: 'The scenarios side by side' }).getByRole('table');
    await expect(table.getByRole('columnheader')).toHaveCount(4);
    for (const row of ['Site', 'Landing (UTC)', 'Time with power', 'Sunlight', 'Earth in view', 'Radio contact while it has power']) {
      await expect(table.getByRole('rowheader', { name: row, exact: true })).toBeVisible();
    }
    await shot('compare-scenarios');

    // The comparison brief carries the same story to paper.
    await page.getByRole('link', { name: /brief/i }).first().click();
    await page.waitForURL(/\/compare\/brief/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 60_000 });
    await page.getByRole('button', { name: 'Print or save as PDF' }).click();
    expect(await printCount(page)).toBe(1);
    await shot('comparison-brief');
  });
});
