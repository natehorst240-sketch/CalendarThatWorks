/**
 * visual-qa.spec.ts
 *
 * Screenshot capture for AI visual QA review.
 * No assertions that can fail — this is a data-collection step.
 * All screenshots land in qa-output/screenshots/ for ai-qa-review.mjs.
 *
 * Run standalone:  npx playwright test visual-qa --config playwright.config.ts
 * Run full suite:  npm run qa:visual  (capture + AI review)
 */
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const SHOTS_DIR = 'qa-output/screenshots';

// Create output dir before any test runs
test.beforeAll(() => {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
});

async function snap(page, name: string) {
  await page.screenshot({
    path: path.join(SHOTS_DIR, `${name}.png`),
    fullPage: false,
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function waitForCalendar(page) {
  await expect(page.locator('[role="grid"], [role="table"], .wc-agenda')).toBeVisible({ timeout: 10_000 });
  // Short settle for animations / async font loads
  await page.waitForTimeout(400);
}

async function switchView(page, viewLabel: string) {
  const btn = page.getByRole('button', { name: new RegExp(viewLabel, 'i') }).first();
  if (await btn.isVisible()) {
    await btn.click();
    await page.waitForTimeout(300);
  }
}

// ── Desktop viewport captures ─────────────────────────────────────────────

test.describe('Desktop (1280×900)', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('month view', async ({ page }) => {
    await page.goto('/');
    await waitForCalendar(page);
    await switchView(page, 'month');
    await snap(page, '01-month-desktop');
  });

  test('week view', async ({ page }) => {
    await page.goto('/');
    await waitForCalendar(page);
    await switchView(page, 'week');
    await snap(page, '02-week-desktop');
  });

  test('day view', async ({ page }) => {
    await page.goto('/');
    await waitForCalendar(page);
    await switchView(page, 'day');
    await snap(page, '03-day-desktop');
  });

  test('agenda view', async ({ page }) => {
    await page.goto('/');
    await waitForCalendar(page);
    await switchView(page, 'agenda');
    await snap(page, '04-agenda-desktop');
  });

  test('schedule / timeline view', async ({ page }) => {
    await page.goto('/');
    await waitForCalendar(page);
    await switchView(page, 'schedule');
    await snap(page, '05-schedule-desktop');
  });

  test('add-event modal open', async ({ page }) => {
    await page.goto('/');
    await waitForCalendar(page);
    await switchView(page, 'month');
    // Click the + button or a day cell to open the modal
    const addBtn = page.getByRole('button', { name: /add event|new event|\+/i }).first();
    if (await addBtn.isVisible()) {
      await addBtn.click();
    } else {
      // Click a day cell as fallback
      const cell = page.locator('[data-date]').first();
      await cell.dblclick().catch(() => cell.click());
    }
    await page.waitForTimeout(400);
    await snap(page, '06-add-event-modal');
    // Close it
    await page.keyboard.press('Escape');
  });

  test('hover card on event', async ({ page }) => {
    await page.goto('/');
    await waitForCalendar(page);
    await switchView(page, 'month');
    // Hover the first visible event pill
    const pill = page.locator('[role="button"][class*="eventPill"], [role="button"][class*="spanBar"]').first();
    if (await pill.isVisible()) {
      await pill.hover();
      await page.waitForTimeout(500);
    }
    await snap(page, '07-hover-card-desktop');
  });

  test('filter bar with active filter', async ({ page }) => {
    await page.goto('/');
    await waitForCalendar(page);
    // Click the first filter pill if present
    const filterPill = page.locator('[class*="filterPill"], [class*="FilterPill"]').first();
    if (await filterPill.isVisible()) {
      await filterPill.click();
      await page.waitForTimeout(300);
    }
    await snap(page, '08-filter-active-desktop');
  });

  test('month view — navigate forward one month', async ({ page }) => {
    await page.goto('/');
    await waitForCalendar(page);
    await switchView(page, 'month');
    const nextBtn = page.getByRole('button', { name: /next|›|chevron.*right/i }).first();
    if (await nextBtn.isVisible()) {
      await nextBtn.click();
      await page.waitForTimeout(300);
    }
    await snap(page, '09-month-next-desktop');
  });

  test('week view — time grid with events', async ({ page }) => {
    await page.goto('/');
    await waitForCalendar(page);
    await switchView(page, 'week');
    // Navigate to a week that likely has events
    const nextBtn = page.getByRole('button', { name: /next|›/i }).first();
    if (await nextBtn.isVisible()) await nextBtn.click();
    await page.waitForTimeout(300);
    await snap(page, '10-week-events-desktop');
  });
});

// ── Mobile viewport captures ──────────────────────────────────────────────

test.describe('Mobile (375×812)', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('month view mobile', async ({ page }) => {
    await page.goto('/');
    await waitForCalendar(page);
    await switchView(page, 'month');
    await snap(page, '11-month-mobile');
  });

  test('agenda view mobile', async ({ page }) => {
    await page.goto('/');
    await waitForCalendar(page);
    await switchView(page, 'agenda');
    await snap(page, '12-agenda-mobile');
  });

  test('week view mobile', async ({ page }) => {
    await page.goto('/');
    await waitForCalendar(page);
    await switchView(page, 'week');
    await snap(page, '13-week-mobile');
  });
});

// ── Tablet viewport captures ──────────────────────────────────────────────

test.describe('Tablet (768×1024)', () => {
  test.use({ viewport: { width: 768, height: 1024 } });

  test('month view tablet', async ({ page }) => {
    await page.goto('/');
    await waitForCalendar(page);
    await switchView(page, 'month');
    await snap(page, '14-month-tablet');
  });

  test('schedule view tablet', async ({ page }) => {
    await page.goto('/');
    await waitForCalendar(page);
    await switchView(page, 'schedule');
    await snap(page, '15-schedule-tablet');
  });
});

// ── Specialised fixture captures ──────────────────────────────────────────

test.describe('Fixtures', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('pill span matrix', async ({ page }) => {
    await page.goto('/pill-span-matrix-fixture.html');
    await waitForCalendar(page);
    await snap(page, '16-pill-span-matrix');
  });

  test('regression bugs fixture', async ({ page }) => {
    await page.goto('/regression-bugs.html');
    await page.waitForTimeout(600);
    await snap(page, '17-regression-bugs');
  });

  test('on-call span fixture', async ({ page }) => {
    await page.goto('/oncall-span-fixture.html');
    await waitForCalendar(page);
    await snap(page, '18-oncall-span');
  });
});
