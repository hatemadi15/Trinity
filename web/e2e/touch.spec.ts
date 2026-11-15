import type { Locator, Page } from '@playwright/test';
import { answerHeading, expect, expectNoSideScroll, openExplore, standHeading, test } from './fixtures';

/** A phone 390 px wide with a touch screen: every press below is a tap, and the time bar is scrubbed with a finger. */
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

/**
 * A finger put down on `target` at `from` (a share of its width), moved to `to` in small steps and lifted, as the
 * browser receives a real touch: through its input pipeline, not as events made up in the page.
 */
async function fingerDrag(page: Page, target: Locator, from: number, to: number, steps = 12) {
  const box = await target.boundingBox();
  if (!box) throw new Error('the target is not on the screen');
  const y = box.y + box.height / 2;
  const x = (share: number) => box.x + box.width * share;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x(from), y }] });
  for (let i = 1; i <= steps; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x(from + ((to - from) * i) / steps), y }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

/** The hour the time bar's slider is on. */
const hourOf = async (slider: Locator) => Number(await slider.inputValue());

test.describe('Touch', () => {
  test('on a phone, a planner taps through the forecast and scrubs the time bar with a finger', async ({ page, shot }) => {
    test.setTimeout(300_000);
    await openExplore(page);
    // The answer is on the first screen, under the period in one line.
    await expect(answerHeading(page)).toBeInViewport();
    const band = page.getByRole('region', { name: 'What this forecast is for' });
    await expect(band.getByText(/^de Gerlache Rim 2, 30 days from 1 January 2027, 00:00 UTC, small lander:$/)).toBeVisible();

    await test.step('tapping change opens the fields; a tap and the number pad set 14 days, a tap picks another lander', async () => {
      // The one button reads "change" while the fields are folded and "done" while they are open.
      const toggle = band.getByRole('button', { name: /^(change|done)$/ });
      await expect(toggle).toHaveText('change');
      await toggle.tap();
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await expect(toggle).toHaveText('done');
      // The length of the stay, typed after a tap, as a phone's number pad would.
      const stay = band.getByRole('spinbutton', { name: 'For' });
      await stay.tap();
      await stay.fill('14');
      await expect(stay).toHaveValue('14');
      await band.getByRole('button', { name: /^Small lander.*\. Change$/ }).tap();
      const dialog = page.getByRole('dialog', { name: 'The lander' });
      await dialog.getByRole('radio', { name: /^Large lander/ }).tap();
      await expect(dialog.getByRole('radio', { name: /^Large lander/ })).toBeChecked();
      await dialog.getByRole('button', { name: 'Close' }).tap();
      await expect(dialog).toBeHidden();
      await toggle.tap();
      await expect(band.getByText(/^de Gerlache Rim 2, 14 days from 1 January 2027, 00:00 UTC, large lander:$/)).toBeVisible();
      await expectNoSideScroll(page, 'Explore on a phone');
    });

    const bar = page.getByRole('region', { name: 'Time' });
    const slider = bar.getByRole('slider', { name: 'Time' });

    await test.step('a finger drawn along the time bar moves the time, and Play stays paused', async () => {
      await expect(slider).toHaveAttribute('aria-valuetext', /^1 Jan 2027, 00:00 UTC: /);
      // The time bar shows with the hour-by-hour section only: scroll down to it, as a thumb would.
      await slider.scrollIntoViewIfNeeded();
      // The page scrolls smoothly: wait until the bar has come to rest on the screen before putting a finger on it.
      await expect(slider).toBeInViewport({ ratio: 1 });
      await page.waitForTimeout(400);
      await fingerDrag(page, slider, 0.02, 0.5);
      // 14 days are 335 hours: halfway along is about the 8th.
      await expect.poll(() => hourOf(slider)).toBeGreaterThan(120);
      expect(await hourOf(slider)).toBeLessThan(220);
      await expect(slider).toHaveAttribute('aria-valuetext', /^(7|8|9) Jan 2027/);
      await expect(bar.getByRole('button', { name: /^Play$/ })).toBeVisible();
      await shot('scrubbed');
    });

    await test.step('a tap on a moment’s dot jumps the time to it', async () => {
      const first = bar.getByRole('group', { name: 'Jump to a moment' }).getByRole('button').first();
      const label = (await first.getAttribute('aria-label')) ?? '';
      const day = /, (\d+) Jan$/.exec(label)?.[1];
      expect(day, `a moment named with its day: "${label}"`).toBeTruthy();
      await first.tap();
      await expect(slider).toHaveAttribute('aria-valuetext', new RegExp(`^${day} Jan 2027`));
    });

    await test.step('Stand at the site opens the view from the site; More opens today’s card', async () => {
      await page.getByRole('region', { name: 'The answer' }).getByRole('link', { name: 'Stand at the site' }).tap();
      await page.waitForURL(/\/explore\/stand\?site=de_gerlache_rim_2&start=2027-01-01&days=14/);
      await expect(standHeading(page)).toHaveText(/^Landing on 1 January: /, { timeout: 90_000 });
      await expect(page.getByText('Building the ground from NASA heights…')).toBeHidden({ timeout: 180_000 });
      const more = page.getByRole('button', { name: 'More' });
      await more.tap();
      await expect(page.getByRole('button', { name: 'Less' })).toHaveAttribute('aria-expanded', 'true');
      await expectNoSideScroll(page, 'the view from the site on a phone');
      await shot('stand-card');
    });
  });
});
