/**
 * AssetsView — grouping + saved-view round-trip E2E (ticket #134-6).
 *
 * The demo loads with the schedule view; we flip to Assets, verify the
 * grid paints its core affordances (rowheaders, zoom control), then drive
 * a saved-view round-trip by seeding localStorage with a pinned Assets
 * profile and clicking its chip. The round-trip spec is the one that
 * ties ticket #134-2 (persist zoomLevel + collapsedGroups) back to the
 * user-facing flow.
 */
import { test, expect } from '@playwright/test';

const DEMO_CALENDAR_ID = 'ihc-oncall-demo';
const SAVED_VIEWS_KEY = `wc-saved-views-${DEMO_CALENDAR_ID}`;

test.describe('WorksCalendar Assets view', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto('/');
    await expect(page.getByTestId('works-calendar')).toBeVisible();
  });

  test('renders the Assets grid with rowheaders and the zoom control', async ({ page }) => {
    await page.getByRole('button', { name: /^Assets$/ }).click();
    // The grid's aria-label includes "Assets timeline for <month>".
    await expect(page.getByRole('grid', { name: /Assets timeline for / })).toBeVisible();
    // At least one rowheader (employee resource) should be present.
    const rowheaders = page.getByRole('rowheader');
    await expect(rowheaders.first()).toBeVisible();
    // Zoom control group with its four buttons.
    await expect(page.getByRole('group', { name: /Zoom level/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Zoom to Day/ })).toBeVisible();
  });

  test('clicking a zoom button toggles aria-pressed on the new zoom', async ({ page }) => {
    await page.getByRole('button', { name: /^Assets$/ }).click();
    const monthBtn = page.getByRole('button', { name: /Zoom to Month/ });
    const dayBtn   = page.getByRole('button', { name: /Zoom to Day/ });
    // Default zoom is month per AssetsView.
    await expect(monthBtn).toHaveAttribute('aria-pressed', 'true');
    await dayBtn.click();
    await expect(dayBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(monthBtn).toHaveAttribute('aria-pressed', 'false');
  });

  test('saved view round-trip restores zoomLevel when its chip is applied', async ({ page }) => {
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

    // ProfileBar chip for our seeded view should be visible. The chip's
    // accessible name is just the view.name — the 3-letter viewTag span is
    // marked aria-hidden since it's a visual affordance, not content.
    const chip = page.getByRole('button', { name: 'Assets Day Zoom' });
    await expect(chip).toBeVisible();
    await chip.click();

    // Applying the saved view switches to the Assets grid.
    await expect(page.getByRole('grid', { name: /Assets timeline for / })).toBeVisible();
    // And the pinned zoomLevel ('day') should be active.
    await expect(page.getByRole('button', { name: /Zoom to Day/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});
