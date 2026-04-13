import { test, expect } from '@playwright/test';

test.describe('WorksCalendar month single-day source stacking', () => {
  test('same-day pills from different sources stack vertically instead of overlapping', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/source-single-stack-fixture.html');

    const pillA = page.getByRole('button', { name: /^Source A Single, Project$/i }).first();
    const pillB = page.getByRole('button', { name: /^Source B Single, Project$/i }).first();

    await expect(pillA).toBeVisible();
    await expect(pillB).toBeVisible();

    const boxA = await pillA.boundingBox();
    const boxB = await pillB.boundingBox();

    expect(boxA).not.toBeNull();
    expect(boxB).not.toBeNull();

    if (boxA && boxB) {
      expect(Math.abs(boxA.y - boxB.y)).toBeGreaterThan(8);
      expect(boxA.x).toBeGreaterThan(0);
      expect(boxB.x).toBeGreaterThan(0);
    }
  });
});
