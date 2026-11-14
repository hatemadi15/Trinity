import { answerHeading, expect, expectFocusVisible, openExplore, printCount, standHeading, stubPrint, tabTo, test } from './fixtures';

/**
 * The planning journey with the keyboard alone: each control is reached with Tab (or Shift+Tab) in the page's
 * order, worked with Enter, Space, the arrows or typing, and shows where the focus is.
 */
test.describe('Keyboard only', () => {
  test('every step of the planning journey is reached and worked with the keyboard, with the focus in sight', async ({ page, shot }) => {
    test.setTimeout(360_000);
    await stubPrint(page);
    await openExplore(page);
    const period = page.getByRole('region', { name: 'What this forecast is for' });
    const answer = page.getByRole('region', { name: 'The answer' });
    const bar = page.getByRole('region', { name: 'Time' });
    const slider = bar.getByRole('slider', { name: 'Time' });

    await test.step('the time bar: Shift+Tab from the top reaches the slider; the keys move the time, Space plays and pauses', async () => {
      await tabTo(page, slider, { back: true });
      await expectFocusVisible(page);
      await page.keyboard.press('PageUp');
      await expect(slider).toHaveAttribute('aria-valuetext', /^2 Jan 2027, 00:00 UTC: /);
      await page.keyboard.press('Shift+ArrowRight');
      await expect(slider).toHaveAttribute('aria-valuetext', /^3 Jan 2027/);
      await page.keyboard.press('Home');
      await expect(slider).toHaveAttribute('aria-valuetext', /^1 Jan 2027, 00:00 UTC: /);
      await page.keyboard.press('Space');
      await expect(bar.getByRole('button', { name: /^Pause$/ })).toBeVisible();
      await page.keyboard.press('Space');
      await expect(bar.getByRole('button', { name: /^Play$/ })).toBeVisible();
      await page.keyboard.press('Home');
    });

    await test.step('the date: typed into the From box, the answer follows', async () => {
      await tabTo(page, period.getByLabel('From'));
      await expectFocusVisible(page);
      // The box's fields in the en-US order: month, day, year.
      await page.keyboard.type('01062027');
      await expect(answerHeading(page)).toHaveText(/ on 6 January: /);
    });

    await test.step('the period: the arrows move between 14, 30 and 90 days', async () => {
      await tabTo(page, period.getByRole('radio', { name: '30 days' }));
      await expectFocusVisible(page);
      await page.keyboard.press('ArrowLeft');
      await expect(period.getByRole('radio', { name: '14 days' })).toBeChecked();
      await page.keyboard.press('ArrowRight');
      await expect(period.getByRole('radio', { name: '30 days' })).toBeChecked();
    });

    await test.step('the lander: Enter opens the dialog, the arrows choose, Escape closes it and gives the focus back', async () => {
      const lander = period.getByRole('button', { name: /^Small lander.*\. Change$/ });
      await tabTo(page, lander);
      await expectFocusVisible(page);
      await page.keyboard.press('Enter');
      const dialog = page.getByRole('dialog', { name: 'The lander' });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole('button', { name: 'Close' })).toBeFocused();
      await expectFocusVisible(page);
      await tabTo(page, dialog.getByRole('radio', { name: /^Small lander/ }), { max: 10 });
      await expectFocusVisible(page);
      await page.keyboard.press('ArrowDown');
      await expect(dialog.getByRole('radio', { name: /^Medium lander/ })).toBeChecked();
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      await expect(period.getByRole('button', { name: /^Medium lander.*\. Change$/ })).toBeFocused();
    });

    await test.step('the answer: Enter opens why, and Enter on Stand at the site opens the view from the site', async () => {
      const why = answer.getByRole('button', { name: /Why this happens/ });
      await tabTo(page, why);
      await expectFocusVisible(page);
      await page.keyboard.press('Enter');
      await expect(why).toHaveAttribute('aria-expanded', 'true');
      await tabTo(page, answer.getByRole('link', { name: 'Stand at the site' }));
      await expectFocusVisible(page);
      await page.keyboard.press('Enter');
      await page.waitForURL(/\/explore\/stand\?site=de_gerlache_rim_2&start=2027-01-06&days=30/);
      await expect(standHeading(page)).toHaveText(/^Landing on 6 January: /);
    });

    await test.step('the view from the site: Turn to Earth by the keyboard, then Change and Compare sites', async () => {
      await expect(page.getByText('Building the ground from NASA heights…')).toBeHidden({ timeout: 180_000 });
      const earth = page.getByRole('button', { name: 'Face Earth' });
      await tabTo(page, earth);
      await expectFocusVisible(page);
      await page.keyboard.press('Enter');
      await expect(page.locator('[data-caption]')).toContainText('Earth', { timeout: 60_000 });
      await shot('stand-earth');
      const next = page.getByRole('group', { name: 'Next step' });
      const change = next.getByRole('button', { name: 'Change', exact: true });
      await tabTo(page, change, { back: true });
      await expectFocusVisible(page);
      await page.keyboard.press('Enter');
      await expect(change).toHaveAttribute('aria-expanded', 'true');
      await tabTo(page, next.getByRole('button', { name: 'Compare sites' }).filter({ visible: true }), { max: 10 });
      await expectFocusVisible(page);
      await page.keyboard.press('Enter');
      await page.waitForURL(/\/compare$/);
    });

    await test.step('Compare: a second site chosen in the list by typing its name, and added with Enter', async () => {
      const table = page.getByRole('table');
      await expect(table.getByRole('rowheader')).toHaveText(['de Gerlache Rim 2']);
      const add = page.getByLabel('Add a site');
      await tabTo(page, add);
      await expectFocusVisible(page);
      await page.keyboard.type('de Gerlache rim');
      await expect(add).toHaveValue('de_gerlache_center_rim_high');
      await tabTo(page, page.getByRole('button', { name: 'Add', exact: true }), { max: 5 });
      await expectFocusVisible(page);
      await page.keyboard.press('Enter');
      await expect(table.getByRole('rowheader')).toHaveText(['de Gerlache Rim 2', 'de Gerlache rim summit']);
    });

    await test.step('the brief: reached by its link and printed with Enter', async () => {
      await tabTo(page, page.getByRole('link', { name: 'Printable brief for de Gerlache Rim 2' }));
      await expectFocusVisible(page);
      await page.keyboard.press('Enter');
      await page.waitForURL(/\/brief$/);
      await expect(page.getByRole('heading', { level: 1, name: 'de Gerlache Rim 2' })).toBeVisible();
      await tabTo(page, page.getByRole('button', { name: 'Print or save as PDF' }));
      await expectFocusVisible(page);
      await page.keyboard.press('Enter');
      expect(await printCount(page)).toBe(1);
      await shot('brief-print-focused');
    });
  });
});
