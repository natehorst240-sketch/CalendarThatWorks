import { test, expect } from '@playwright/test';

const viewports = [
  { name: 'mobile-small', width: 320, height: 640 },
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 900 },
];

/**
 * Errors caused by the runner environment, not the calendar code under test.
 * The chromium sandbox in some CI runners refuses external HTTPS requests
 * (tile servers, font CDNs, the demo PWA's own service-worker fetches) and
 * surfaces them as console.error("net::ERR_CERT_AUTHORITY_INVALID …") or as
 * the related "Failed to load resource" line. Filtering them keeps the
 * "loads without crashing" + "drag does not crash" assertions tight on the
 * code paths the suite actually owns.
 */
const ENV_NOISE_PATTERNS: RegExp[] = [
  /net::ERR_CERT_AUTHORITY_INVALID/i,
  /net::ERR_CERT_DATE_INVALID/i,
  /Failed to load resource.*the server responded with a status of (4|5)\d{2}/i,
];

function ignoreEnvNoise(line: string): boolean {
  return !ENV_NOISE_PATTERNS.some((re) => re.test(line));
}

for (const vp of viewports) {
  test.describe('WorksCalendar demo ' + vp.name, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test('loads without crashing', async ({ page }) => {
      const consoleErrors: string[] = [];
      const pageErrors: string[] = [];

      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });

      page.on('pageerror', (err) => {
        pageErrors.push(err.message);
      });

      await page.goto('/');
      await expect(page.getByTestId('works-calendar')).toBeVisible();
      await expect(page.getByRole('toolbar', { name: /calendar navigation/i })).toBeVisible();
      expect(consoleErrors.concat(pageErrors).filter(ignoreEnvNoise)).toEqual([]);
    });

    test('main navigation buttons work', async ({ page }) => {
      await page.goto('/');
      const calendar = page.getByTestId('works-calendar');
      await expect(calendar).toBeVisible();

      const dateLabel = page.locator('[aria-live="polite"]').first();
      const before = (await dateLabel.textContent()) || '';

      await page.getByRole('button', { name: /next/i }).first().click();
      await expect(dateLabel).not.toHaveText(before);

      await page.getByRole('button', { name: /^today$/i }).click();
      await expect(calendar).toBeVisible();
    });

    test('all views can be selected', async ({ page }) => {
      await page.goto('/');

      const views = ['Month', 'Week', 'Day', 'Agenda', 'Schedule'];

      for (const view of views) {
        const viewBtn = page.getByRole('button', { name: new RegExp(`^${view}$`, 'i') });

        await viewBtn.click();
        await expect(viewBtn).toHaveAttribute('aria-pressed', 'true');
      }
    });

    test('add event dialog opens', async ({ page }) => {
      await page.goto('/');
      // Demo now defaults to schedule view; the "Add new event" button only
      // renders in non-schedule views, so switch to Month first.
      await page.getByRole('button', { name: /^Month$/i }).click();
      const addBtn = page.getByRole('button', { name: /add new event/i });
      await expect(addBtn).toBeVisible();
      await addBtn.click();
      await expect(page.getByText(/save/i).first()).toBeVisible();
    });

    test('layout is visible and not tiny', async ({ page }) => {
      await page.goto('/');
      const root = page.getByTestId('works-calendar');
      await expect(root).toBeVisible();
      const box = await root.boundingBox();
      expect(box).not.toBeNull();
      if (box) {
        expect(box.width).toBeGreaterThan(250);
        expect(box.height).toBeGreaterThan(250);
      }
    });

    test('save viewport screenshot', async ({ page }) => {
      await page.goto('/');
      await expect(page.getByTestId('works-calendar')).toBeVisible();
      await page.screenshot({ path: 'qa-output/' + vp.name + '.png', fullPage: true });
    });
  });
}
