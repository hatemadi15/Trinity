import { expect, openExplore, standHeading, standUrl, test } from './fixtures';

/** The line the time bar shows in Play's place when the system asks for reduced motion. */
const OFF = 'Playback is off because your system asks for reduced motion.';

/** A system that asks for reduced motion (Windows' animation effects off, macOS's Reduce motion on). */
test.use({ contextOptions: { reducedMotion: 'reduce' } });

test.describe('Reduced motion', () => {
  test('Explore turns playback off and says why, while the time still moves by hand', async ({ page, shot }) => {
    await openExplore(page);
    const bar = page.getByRole('region', { name: 'Time' });
    await expect(bar.getByText(OFF)).toBeVisible();
    await expect(bar.getByRole('button', { name: /^Play$/ })).toBeDisabled();
    await expect(bar.getByRole('button', { name: /^Speed/ })).toBeDisabled();
    // Space on the slider plays nothing; the keys still move the time.
    const slider = bar.getByRole('slider', { name: 'Time' });
    await slider.focus();
    await page.keyboard.press('Space');
    await expect(bar.getByRole('button', { name: /^Pause$/ })).toHaveCount(0);
    await page.keyboard.press('PageUp');
    await expect(slider).toHaveAttribute('aria-valuetext', /^2 Jan 2027, 00:00 UTC: /);
    await shot('explore');
  });

  test('the view from the site turns playback off, says why, and asks only for a drag', async ({ page, shot }) => {
    test.setTimeout(240_000);
    await page.goto(standUrl());
    await expect(standHeading(page)).toHaveText(/^Landing on 1 January: /, { timeout: 90_000 });
    const bar = page.getByRole('region', { name: 'Time' });
    await expect(bar.getByText(OFF)).toBeVisible();
    await expect(bar.getByRole('button', { name: /^Play$/ })).toBeDisabled();
    await expect(page.getByText('Building the ground from NASA heights…')).toBeHidden({ timeout: 180_000 });
    // The first step over the view leaves Play out.
    await expect(page.locator('[data-caption]')).toContainText('Drag to look around', { timeout: 60_000 });
    await expect(page.locator('[data-caption]')).not.toContainText('Press Play');
    await shot('stand');
  });

  test('the home page lands at once when Fly to the south pole is pressed', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Fly to the south pole' }).click();
    // No 21-second flight: the landing's heading has the focus and is in view at once.
    const landed = page.locator('[data-arrival] h2[tabindex="-1"]');
    await expect(landed).toBeFocused({ timeout: 3_000 });
    await expect(landed).toBeInViewport();
    expect(page.url()).not.toMatch(/\/sites$/);
  });
});
