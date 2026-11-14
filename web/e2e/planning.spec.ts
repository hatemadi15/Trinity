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
      await expect(period.getByRole('link', { name: 'Landing site: de Gerlache Rim 2. Change site' })).toBeVisible();
      await expect(period.getByText('1 January 2027', { exact: true })).toBeVisible();
      await expect(period.getByRole('radio', { name: '30 days' })).toBeChecked();
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
      await expect(period.getByText('6 January 2027', { exact: true })).toBeVisible();
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

    await test.step('Stand at the site opens the view from the site for the same site, date and lander', async () => {
      await answer.getByRole('link', { name: 'Stand at the site' }).click();
      await page.waitForURL(/\/explore\/stand\?site=de_gerlache_rim_2&start=2027-01-06&days=30/);
      await expect(standHeading(page)).toHaveText(/^Landing on 6 January: /);
      await expect(page.locator('canvas[role="application"]')).toBeAttached({ timeout: 120_000 });
      await expect(page.getByText('Building the ground from NASA heights…')).toBeHidden({ timeout: 180_000 });
      await expect(page.getByRole('region', { name: 'Time' }).getByRole('slider', { name: 'Time' })).toHaveAttribute('aria-valuetext', /^6 Jan 2027/);
      await shot('stand');
    });

    await test.step('Compare sites adds the site and a second one joins it, for the same days and lander', async () => {
      const next = page.getByRole('group', { name: 'Next step' });
      // Compare sites is the gold step when no better day is offered; otherwise it waits under Change.
      if (!(await next.getByRole('button', { name: 'Compare sites' }).first().isVisible())) await next.getByRole('button', { name: 'Change' }).click();
      await next.getByRole('button', { name: 'Compare sites' }).filter({ visible: true }).click();
      await page.waitForURL(/\/compare$/);
      await expect(page.getByRole('heading', { level: 1, name: 'Compare sites' })).toBeVisible();
      const table = page.getByRole('table');
      await expect(table.getByRole('rowheader')).toHaveText(['de Gerlache Rim 2']);
      await page.getByLabel('Add a site').selectOption({ label: 'de Gerlache rim summit' });
      await page.getByRole('button', { name: 'Add', exact: true }).click();
      await expect(table.getByRole('rowheader')).toHaveText(['de Gerlache Rim 2', 'de Gerlache rim summit']);
      // The same period and lander as Explore's.
      const forWhat = page.getByRole('region', { name: 'What this comparison is for' });
      await expect(forWhat.getByText('6 January 2027', { exact: true })).toBeVisible();
      await expect(forWhat.getByRole('button', { name: /^Medium lander/ })).toBeVisible();
      // One sentence names the best site for each measure, over the table.
      await expect(page.getByRole('region', { name: 'The sites side by side' }).locator('p').first()).toContainText(/de Gerlache/);
      for (const column of ['Sunlight', 'Earth in view', 'Longest night', 'Time with power']) await expect(table.getByRole('columnheader', { name: column })).toBeVisible();
      await shot('compare');
    });

    await test.step('the printable brief holds the site, the period and the lander, and Print opens the print dialog', async () => {
      await page.getByRole('link', { name: 'Printable brief for de Gerlache Rim 2' }).click();
      await page.waitForURL(/\/brief$/);
      await expect(page.getByRole('heading', { level: 1, name: 'de Gerlache Rim 2' })).toBeVisible();
      await expect(page.getByText(/the 30 days from 6 January 2027/)).toBeVisible();
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
    });
  });
});
