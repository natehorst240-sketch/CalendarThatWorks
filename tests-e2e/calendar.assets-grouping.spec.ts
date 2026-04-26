/**
 * AssetsView — grouping + saved-view round-trip E2E (ticket #134-6).
 *
 * The demo loads with the schedule view; we flip to Assets, verify the
 * grid paints its core affordances (rowheaders, fixed day gantt), then
 * drives a saved-view round-trip by seeding localStorage with a pinned
 * Assets profile and clicking its chip.
 */
import { test, expect } from '@playwright/test';

const DEMO_CALENDAR_ID = 'air-ems-demo';
const SAVED_VIEWS_KEY = `wc-saved-views-${DEMO_CALENDAR_ID}`;

test.describe('WorksCalendar Assets view', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto('/');
    await expect(page.getByTestId('works-calendar')).toBeVisible();
  });

  test('renders the Assets grid with rowheaders in fixed day gantt mode', async ({ page }) => {
    await page.getByRole('button', { name: /^Assets$/ }).click();
    // The grid's aria-label includes "Assets timeline for <month>".
    await expect(page.getByRole('grid', { name: /Assets timeline for / })).toBeVisible();
    // At least one rowheader (employee resource) should be present.
    const rowheaders = page.getByRole('rowheader');
    await expect(rowheaders.first()).toBeVisible();
    // Assets no longer exposes zoom controls; it should always render in day mode.
    await expect(page.getByRole('group', { name: /Zoom level/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Zoom to / })).toHaveCount(0);
    await expect(page.locator('[data-zoom="day"]').first()).toBeVisible();
  });

  test('assets timeline does not render interactive zoom buttons', async ({ page }) => {
    await page.getByRole('button', { name: /^Assets$/ }).click();
    await expect(page.getByRole('button', { name: /Zoom to / })).toHaveCount(0);
    await expect(page.locator('[data-zoom="day"]').first()).toBeVisible();
  });

  test('saved view round-trip still opens Assets even with legacy zoomLevel', async ({ page }) => {
    // Seed a saved view pinned to the Assets view with zoomLevel=day.
    await page.evaluate(({ key }) => {
      window.localStorage.setItem(key, JSON.stringify({
        version: 3,
        views: [
          {
            id: 'sv-assets-day',
            name: 'Assets Day Zoom',
            color: '#10b981',
            filters: { categories: [], resources: [], search: '' },
            view: 'assets',
            groupBy: null,
            sort: null,
            showAllGroups: null,
            zoomLevel: 'day',
            collapsedGroups: [],
            conditions: null,
          },
        ],
      }));
    }, { key: SAVED_VIEWS_KEY });

    await page.reload();
    await expect(page.getByTestId('works-calendar')).toBeVisible();

    // The compact ProfileBar scopes saved-view chips to the current view (plus
    // globally-pinned ones), so a chip with view='assets' only appears once
    // the user is on the Assets tab. Switch first, then look for the chip.
    await page.getByRole('button', { name: /^Assets$/ }).click();

    // ProfileBar chip for our seeded view should be visible. The chip's
    // accessible name is just the view.name — the view-type icon next to
    // it carries an aria-label but isn't part of the chip's button name.
    const chip = page.getByRole('button', { name: 'Assets Day Zoom' });
    await expect(chip).toBeVisible();
    await chip.click();

    // Applying the saved view switches to the Assets grid.
    await expect(page.getByRole('grid', { name: /Assets timeline for / })).toBeVisible();
    // Legacy zoomLevel is ignored; Assets always renders day-scale.
    await expect(page.getByRole('button', { name: /Zoom to / })).toHaveCount(0);
    await expect(page.locator('[data-zoom="day"]').first()).toBeVisible();
  });
});
