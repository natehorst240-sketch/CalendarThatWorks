import { test, expect } from '@playwright/test';
import { addDays, startOfMonth } from 'date-fns';

function firstMondayInMonth(baseDate) {
  let day = startOfMonth(baseDate);
  while (day.getDay() !== 1) {
    day = addDays(day, 1);
  }
  return day;
}

function dateKey(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

test.describe('WorksCalendar on-call span end-date regressions', () => {
  test('short on-call pill stops at its real end day instead of filling the rest of the week', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/oncall-span-fixture.html');

    const onCall = page.getByRole('button', { name: /^On Call, oncall$/i }).first();
    await expect(onCall).toBeVisible();

    const base = new Date();
    base.setHours(0, 0, 0, 0);
    const start = firstMondayInMonth(base);
    const lastCoveredDay = addDays(start, 2);
    const nextDay = addDays(start, 3);

    const startCell = page.locator(`[data-date="${dateKey(start)}"]`).first();
    const lastCoveredCell = page.locator(`[data-date="${dateKey(lastCoveredDay)}"]`).first();
    const nextDayCell = page.locator(`[data-date="${dateKey(nextDay)}"]`).first();

    await expect(startCell).toBeVisible();
    await expect(lastCoveredCell).toBeVisible();
    await expect(nextDayCell).toBeVisible();

    const pillBox = await onCall.boundingBox();
    const startBox = await startCell.boundingBox();
    const coveredBox = await lastCoveredCell.boundingBox();
    const nextBox = await nextDayCell.boundingBox();

    expect(pillBox).not.toBeNull();
    expect(startBox).not.toBeNull();
    expect(coveredBox).not.toBeNull();
    expect(nextBox).not.toBeNull();

    if (pillBox && startBox && coveredBox && nextBox) {
      expect(pillBox.x).toBeGreaterThanOrEqual(startBox.x - 8);
      expect(pillBox.x + pillBox.width).toBeLessThanOrEqual(coveredBox.x + coveredBox.width + 8);
      expect(pillBox.x + pillBox.width).toBeLessThan(nextBox.x + 8);
      expect(pillBox.width).toBeLessThan((nextBox.x + nextBox.width) - startBox.x - 8);
    }
  });
});
