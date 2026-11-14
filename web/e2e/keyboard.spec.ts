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

    await test.step('the stay: the arrows lengthen and shorten it a day at a time', async () => {
      const stay = period.getByRole('spinbutton', { name: 'For' });
      await tabTo(page, stay);
      await expectFocusVisible(page);
      await page.keyboard.press('ArrowUp');
      await expect(stay).toHaveValue('31');
      await page.keyboard.press('ArrowDown');
      await expect(stay).toHaveValue('30');
      await expect(answerHeading(page)).toHaveText(/ on 6 January: /);
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
      const next = page.getByRole('group', { name: 'Next step' });
      const change = next.getByRole('button', { name: 'Change', exact: true });
      await tabTo(page, change, { back: true });
      await expectFocusVisible(page);
      await page.keyboard.press('Enter');
      await expect(change).toHaveAttribute('aria-expanded', 'true');
      await tabTo(page, next.getByRole('button', { name: 'Compare sites' }).filter({ visible: true }), { max: 10 });
      await expectFocusVisible(page);
      await page.keyboard.press('Enter');
      await page.waitForURL(/\/compare/);
    });

    await test.step('Compare: a nearby alternative added with Enter, beside the site as the baseline', async () => {
      const baseline = page.getByRole('group', { name: /^Baseline: / });
      await expect(baseline).toBeVisible({ timeout: 60_000 });
      await tabTo(page, baseline.getByRole('button', { name: 'Find a nearby alternative' }));
      await expectFocusVisible(page);
      await page.keyboard.press('Enter');
      await expect(page.getByRole('group', { name: /^Scenario 2: / })).toBeVisible({ timeout: 120_000 });
      // The table scrolls inside its own box, which the keyboard reaches too.
      await tabTo(page, page.getByRole('region', { name: 'The scenarios side by side' }));
      await expectFocusVisible(page);
    });

    await test.step('the comparison brief: reached by its link and printed with Enter', async () => {
      await tabTo(page, page.getByRole('link', { name: 'Printable comparison brief' }));
      await expectFocusVisible(page);
      await page.keyboard.press('Enter');
      await page.waitForURL(/\/compare\/brief/);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 60_000 });
      await tabTo(page, page.getByRole('button', { name: 'Print or save as PDF' }));
      await expectFocusVisible(page);
      await page.keyboard.press('Enter');
      expect(await printCount(page)).toBe(1);
      await shot('brief-print-focused');
    });
  });
});
