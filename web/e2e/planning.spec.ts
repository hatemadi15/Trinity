import { answerHeading, expect, openExplore, printCount, SHOTS, standHeading, stubPrint, test } from './fixtures';
import path from 'node:path';

/**
 * The main planning journey, as a mission planner takes it with a mouse: Explore at a site and date, the answer read,
 * the date and the lander changed, the view from the site, Compare with two sites, and the brief printed. Each page is
 * reached by the app's own links, so what was chosen on one page has to hold on the next.
 */
test.describe('The main planning journey', () => {
  test('a planner reads the answer, changes the date and the lander, stands at the site, compares two sites and prints the brief', async ({ page, shot }) => {
    test.setTimeout(360_000);
    await stubPrint(page);
    const answer = page.getByRole('region', { name: 'The answer' });
    const period = page.getByRole('region', { name: 'What this forecast is for' });

    await test.step('Explore opens at the site and date with the answer first', async () => {
      await openExplore(page);
      await expect(answerHeading(page)).toHaveText(/^Landing at de Gerlache Rim\s2 on 1 January: power for .+/);
      await expect(period.getByRole('button', { name: 'Landing site: de Gerlache Rim 2. Change site' })).toBeVisible();
      await expect(period.getByText('1 January 2027, 00:00', { exact: true })).toBeVisible();
      await expect(period.getByRole('spinbutton', { name: 'For' })).toHaveValue('30');
      await expect(period.getByRole('button', { name: /^Small lander: 4 m² panel, uses 200 W, 2 kWh battery\. Change$/ })).toBeVisible();
      // The reasons wait one tap away, under "Why this happens".
      const why = answer.getByRole('button', { name: /Why this happens/ });
      await why.click();
      await expect(why).toHaveAttribute('aria-expanded', 'true');
      await expect(page.locator(`[id="${await why.getAttribute('aria-controls')}"]`)).toBeVisible();
      // The time bar: Play, the date and hour, and the slider.
      const bar = page.getByRole('region', { name: 'Time' });
      await expect(bar.getByRole('button', { name: /Play/ })).toBeEnabled();
      await expect(bar.getByRole('slider', { name: 'Time' })).toHaveAttribute('aria-valuetext', /^1 Jan 2027, 00:00 UTC: /);
      await shot('explore');
    });

    const before = (await answerHeading(page).textContent()) ?? '';

    await test.step('changing the date to five days later recomputes the answer', async () => {
      await period.getByLabel('From').fill('2027-01-06');
      await expect(answerHeading(page)).toHaveText(/^Landing at de Gerlache Rim\s2 on 6 January: /);
      await expect(period.getByText('6 January 2027, 00:00', { exact: true })).toBeVisible();
      expect(await answerHeading(page).textContent()).not.toBe(before);
    });

    await test.step('choosing the medium lander changes the battery and the figures', async () => {
      await period.getByRole('button', { name: /^Small lander.*\. Change$/ }).click();
      const dialog = page.getByRole('dialog', { name: 'The lander' });
      await expect(dialog).toBeVisible();
      await dialog.getByRole('radio', { name: /^Medium lander: 8 m² panel, uses 400 W, 20 kWh battery/ }).check();
      await dialog.getByRole('button', { name: 'Close' }).click();
      await expect(dialog).toBeHidden();
      await expect(period.getByRole('button', { name: /^Medium lander: 8 m² panel, uses 400 W, 20 kWh battery\. Change$/ })).toBeVisible();
      // 20 kWh at 400 W: 50 hours of battery when full, where the small lander had 10.
      await expect(page.getByRole('region', { name: 'The numbers' }).getByText('2 d 2 h', { exact: true })).toBeVisible();
      await shot('explore-changed');
    });

    const changed = (await answerHeading(page).textContent()) ?? '';

    await test.step('the printable brief holds the site, the period and the lander, and Print opens the print dialog', async () => {
      await page.getByRole('region', { name: 'The numbers' }).getByRole('link', { name: 'Printable brief' }).click();
      await page.waitForURL(/\/brief(\?|$)/);
      await expect(page.getByRole('heading', { level: 1, name: 'de Gerlache Rim 2' })).toBeVisible();
      await expect(page.getByText(/6 Jan 2027, 00:00 UTC, 30 days/)).toBeVisible();
      // The verdict in Explore's words.
      await expect(page.locator('#brief-verdict')).toHaveText(changed.replace(/\u00a0/g, ' '));
      await expect(page.getByText(/8 m² panel that turns to the Sun, uses 400 W, 20 kWh battery/)).toBeVisible();
      await page.getByRole('button', { name: 'Print or save as PDF' }).click();
      expect(await printCount(page)).toBe(1);
      await shot('brief');
      // On paper the page's own buttons and links back are left out.
      await page.emulateMedia({ media: 'print' });
      await expect(page.getByRole('button', { name: 'Print or save as PDF' })).toBeHidden();
      await page.pdf({ path: path.join(SHOTS, 'the-main-planning-journey--brief.pdf'), format: 'A4' });
      await page.emulateMedia({ media: 'screen' });
      await page.getByRole('link', { name: 'Back to Explore' }).click();
      await expect(answerHeading(page)).toHaveText(changed);
    });

    await test.step('Stand at the site opens the view from the site for the same site, date and lander', async () => {
      await answer.getByRole('link', { name: 'Stand at the site' }).click();
      await page.waitForURL(/\/explore\/stand\?site=de_gerlache_rim_2&start=2027-01-06&days=30/);
      await expect(standHeading(page)).toHaveText(/^Landing on 6 January: /);
      await expect(page.locator('canvas[role="application"]')).toBeAttached({ timeout: 120_000 });
      await expect(page.getByText('Building the ground from NASA heights…')).toBeHidden({ timeout: 180_000 });
      await expect(page.getByRole('region', { name: 'Time' }).getByRole('slider', { name: 'Time' })).toHaveAttribute('aria-valuetext', /^6 Jan 2027/);
      await shot('stand');
    });

    await test.step('Compare sites starts a comparison from the site, and a nearby site joins it for the same days and lander', async () => {
      // At this width the next step waits in today's card (spec 25): More opens it.
      await page.getByRole('region', { name: 'The answer for this site' }).getByRole('button', { name: 'More', exact: true }).click();
      await page.locator('#stand-card').getByRole('button', { name: 'Compare sites' }).filter({ visible: true }).click();
      await page.waitForURL(/\/compare/);
      await expect(page.getByRole('heading', { level: 1, name: 'Compare landings' })).toBeVisible();
      const baseline = page.getByRole('group', { name: /^Your landing: / });
      await expect(baseline).toBeVisible({ timeout: 60_000 });
      // The full table waits behind "All figures".
      await page.getByRole('button', { name: 'All figures' }).click();
      const table = page.getByRole('region', { name: 'The landings side by side' }).getByRole('table');
      // The site, the landing day and the lander chosen in Explore.
      await expect(table.getByRole('row').filter({ has: page.getByRole('rowheader', { name: 'Site', exact: true }) })).toContainText('de Gerlache Rim 2');
      await expect(table.getByRole('row').filter({ has: page.getByRole('rowheader', { name: 'Landing (UTC)', exact: true }) })).toContainText(/6 Jan/);
      await expect(table.getByRole('row').filter({ has: page.getByRole('rowheader', { name: 'Lander', exact: true }) })).toContainText(/8 m²|Medium/);
      await page.getByRole('region', { name: 'Add a landing to compare' }).getByRole('button', { name: 'Find the best place nearby' }).click();
      await expect(page.getByRole('group', { name: /^Landing 2: / })).toBeVisible({ timeout: 120_000 });
      await expect(table.getByRole('columnheader')).toHaveCount(3);
      for (const row of ['Sunlight', 'Earth in view', 'Time with power']) await expect(table.getByRole('rowheader', { name: row, exact: true })).toBeVisible();
      await expect(page.getByRole('region', { name: 'Which landing works best' })).toBeVisible({ timeout: 120_000 });
      await shot('compare');
    });

    await test.step('the printable comparison brief holds both sites, and Print opens the print dialog', async () => {
      await page.getByRole('link', { name: 'Printable comparison brief' }).click();
      await page.waitForURL(/\/compare\/brief/);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 60_000 });
      await expect(page.locator('main')).toContainText('de Gerlache Rim 2');
      await expect(page.getByText('Working out the figures…')).toBeHidden({ timeout: 120_000 });
      await page.getByRole('button', { name: 'Print or save as PDF' }).click();
      expect(await printCount(page)).toBe(2);
      await shot('comparison-brief');
    });
  });
});
