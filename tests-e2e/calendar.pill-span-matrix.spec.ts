import { test, expect } from '@playwright/test';
import { addDays, startOfMonth } from 'date-fns';

function firstMondayInMonth(baseDate) {
  let day = startOfMonth(baseDate);
  while (day.getDay() !== 1) day = addDays(day, 1);
  return day;
}

function dateKey(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

const base = new Date();
base.setHours(0, 0, 0, 0);
const monday = firstMondayInMonth(base);

const cases = [
  {
    id: 'case-sameweek-oncall',
    label: 'On Call Matrix',
    start: monday,
    lastCoveredDay: addDays(monday, 2),
    nextDay: addDays(monday, 3),
    type: 'same-week',
  },
  {
    id: 'case-sameweek-pto',
    label: 'PTO Matrix',
    start: addDays(monday, 1),
    lastCoveredDay: addDays(monday, 2),
    nextDay: addDays(monday, 3),
    type: 'same-week',
  },
  {
    id: 'case-crossweek-deploy',
    label: 'Deploy Matrix',
    start: addDays(monday, 4),
    lastCoveredDay: addDays(monday, 6),
    nextDay: addDays(monday, 7),
    type: 'cross-week',
  },
  {
    id: 'case-crossweek-incident',
    label: 'Incident Matrix',
    start: addDays(monday, 5),
    lastCoveredDay: addDays(monday, 6),
    nextDay: addDays(monday, 7),
    type: 'cross-week',
  },
];

for (const c of cases) {
  test(`month pill matrix: ${c.label} respects ${c.type} visual span boundaries`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/pill-span-matrix-fixture.html');

const category =
  c.label === 'On Call Matrix' ? 'oncall'
  : c.label.includes('PTO') ? 'TimeOff'
  : c.label.includes('Deploy') ? 'Deploy'
  : 'Incident';

const pillName =
  c.type === 'cross-week'
    ? new RegExp(`^${c.label}, ${category}, continues next week$`, 'i')
    : new RegExp(`^${c.label}, ${category}$`, 'i');

const monthGrid = page.locator('[role="grid"]').filter({ has: page.locator('[data-date]') }).first();

    const startCell = monthGrid.locator(`[data-date="${dateKey(c.start)}"]`).first();
    const lastCoveredCell = monthGrid.locator(`[data-date="${dateKey(c.lastCoveredDay)}"]`).first();
    const nextDayCell = monthGrid.locator(`[data-date="${dateKey(c.nextDay)}"]`).first();
    await expect(startCell).toBeVisible();
    const weekRow = startCell.locator('xpath=ancestor::div[contains(@class,"weekRow")][1]');
    const pill = weekRow.getByRole('button', { name: pillName }).first();
    await expect(pill).toBeVisible();
    await expect(lastCoveredCell).toBeVisible();
    await expect(nextDayCell).toBeVisible();

    const pillBox = await pill.boundingBox();
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
      // For same-week events nextDay is in the same row — x-coordinate comparison is valid.
      // For cross-week events nextDay (Monday) is in the next row, so its x resets to the
      // far-left of the grid (~31px). Comparing that against the pill's right edge (~1249px)
      // is meaningless across rows. Assertion #2 already covers the week-boundary clip.
      if (c.type !== 'cross-week') {
        expect(pillBox.x + pillBox.width).toBeLessThan(nextBox.x + 8);
      }
      expect(pillBox.height).toBeGreaterThan(10);
    }
  });
}
