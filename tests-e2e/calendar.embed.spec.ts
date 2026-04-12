import { test, expect } from '@playwright/test';

const viewports = [
  { name: 'mobile-small', width: 320, height: 640 },
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 900 },
];

for (const vp of viewports) {
  test.describe('WorksCalendar iframe embed ' + vp.name, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test('host page loads iframe and embedded calendar', async ({ page }) => {
      await page.goto('/embed-host.html');

      const frameEl = page.getByTestId('calendar-embed-iframe');
      await expect(frameEl).toBeVisible();
      await expect(frameEl).toHaveAttribute('title', /workscalendar embed demo/i);

      const frame = page.frameLocator('[data-testid="calendar-embed-iframe"]');
      await expect(frame.getByTestId('works-calendar')).toBeVisible();
      await expect(frame.getByRole('toolbar', { name: /calendar navigation/i })).toBeVisible();
    });

    test('embedded calendar navigation works', async ({ page }) => {
      await page.goto('/embed-host.html');

      const frame = page.frameLocator('[data-testid="calendar-embed-iframe"]');
      const calendar = frame.getByTestId('works-calendar');
      await expect(calendar).toBeVisible();

      const dateLabel = frame.locator('[aria-live="polite"]').first();
      const before = (await dateLabel.textContent()) || '';

      await frame.getByRole('button', { name: /next/i }).first().click();
      await expect(dateLabel).not.toHaveText(before);

      await frame.getByRole('button', { name: /^today$/i }).click();
      await expect(calendar).toBeVisible();
    });

    test('embedded calendar views can be selected', async ({ page }) => {
      await page.goto('/embed-host.html');

      const frame = page.frameLocator('[data-testid="calendar-embed-iframe"]');
      const views = ['Month', 'Week', 'Day', 'Agenda', 'Schedule'];

      for (const view of views) {
        const viewBtn = frame.getByRole('button', { name: new RegExp(`^${view}$`, 'i') });
        await viewBtn.click();
        await expect(viewBtn).toHaveAttribute('aria-pressed', 'true');
      }
    });

    test('embedded add event dialog opens', async ({ page }) => {
      await page.goto('/embed-host.html');

      const frame = page.frameLocator('[data-testid="calendar-embed-iframe"]');
      const addBtn = frame.getByRole('button', { name: /add new event/i });
      await expect(addBtn).toBeVisible();
      await addBtn.click();

      await expect(frame.getByText(/save/i).first()).toBeVisible();
    });

    test('iframe container stays visible and reasonably sized', async ({ page }) => {
      await page.goto('/embed-host.html');

      const frameEl = page.getByTestId('calendar-embed-iframe');
      await expect(frameEl).toBeVisible();

      const box = await frameEl.boundingBox();
      expect(box).not.toBeNull();

      if (box) {
        expect(box.width).toBeGreaterThan(250);
        expect(box.height).toBeGreaterThan(400);
      }
    });

    test('save iframe embed screenshot', async ({ page }) => {
      await page.goto('/embed-host.html');
      await expect(page.getByTestId('calendar-embed-iframe')).toBeVisible();

      await page.screenshot({ path: 'qa-output/embed-' + vp.name + '.png', fullPage: true });
    });
  });
}
