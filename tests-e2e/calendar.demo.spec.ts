import { test, expect } from '@playwright/test';

const viewports = [
  { name: 'mobile-small', width: 320, height: 640 },
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 900 },
];

/**
 * Errors caused by the runner environment, not the calendar code under test.
 *
 * The chromium sandbox in some CI runners refuses external HTTPS requests
 * (tile servers, font CDNs) and surfaces them as
 *   console.error("net::ERR_CERT_AUTHORITY_INVALID …")
 * Those are unambiguously environmental — sandboxed chromium cannot validate
 * arbitrary upstream certificates, full stop.
 *
 * What we explicitly DON'T filter is a blanket
 *   /Failed to load resource.*4xx|5xx/
 * because that would also swallow real same-origin failures (a broken local
 * asset, a 500 from the demo's own data path, a 404 on a missing icon) —
 * exactly the kind of regression the "loads without crashing" assertion is
 * supposed to catch. If a specific external host's 4xx/5xx ends up being
 * deterministic CI noise in the future, add a targeted host-scoped pattern
 * here (e.g. /fonts\.gstatic\.com.*status of \d+/) rather than going broad.
 */
const ENV_NOISE_PATTERNS: RegExp[] = [
  /net::ERR_CERT_AUTHORITY_INVALID/i,
  /net::ERR_CERT_DATE_INVALID/i,
  /net::ERR_CERT_COMMON_NAME_INVALID/i,
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
