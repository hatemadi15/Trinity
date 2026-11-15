import { expect, test } from './fixtures';

test.use({ viewport: { width: 1440, height: 900 } });

/**
 * The guided arrival (spec 23.4): a site picked on the Choose a site map opens Explore one part at a time. The click is
 * a navigation inside the app, so this goes through the map rather than opening the address directly: the tour once
 * failed only that way, because it read the address before the new page had it.
 */
test.describe('Guided arrival', () => {
  test('a site picked on the map opens its details one step at a time, and Next brings in the next part', async ({ page, shot }) => {
    test.setTimeout(180_000);
    await page.goto('/sites');
    const marker = page.locator('a[href*="/explore?site="][href*="tour=1"]').first();
    await expect(marker).toBeAttached({ timeout: 60_000 });
    // The map's markers sit over the relief: a click goes to the marker link itself.
    await marker.click({ force: true });
    if (!/\/explore/.test(page.url())) await marker.click({ force: true });
    await expect(page).toHaveURL(/\/explore\?.*tour=1/, { timeout: 60_000 });

    const bar = page.locator('[data-part="tour-bar"]');
    await expect(bar).toBeVisible({ timeout: 60_000 });
    await expect(bar).toContainText('Step 1 of 5');
    const next = page.getByRole('button', { name: /^Next: the answer/ });
    await expect(next).toBeVisible();
    await shot('step-1');

    await next.click();
    await expect(bar).toContainText('Step 2 of 5');
    await expect(page.getByRole('button', { name: /^Next: hour by hour/ })).toBeVisible();
    await shot('step-2');

    // "Show everything" ends the tour: the whole page, and an address without tour=1 to share.
    await bar.getByRole('button', { name: 'Show everything' }).click();
    await expect(bar).toBeHidden();
    await expect(page).not.toHaveURL(/tour=1/);
  });
});
