import { expect, test } from '@playwright/test';

function toDatetimeLocalInput(date: Date): string {
  const d = new Date(date);
  d.setSeconds(0, 0);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function dateKey(offsetDays = 0): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

test.describe('WorksCalendar happy paths', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/');
    await expect(page.getByTestId('works-calendar')).toBeVisible();
    // Demo defaults to schedule view; these tests exercise month-view flows
    // (drag, add-event toolbar button), so normalize to Month first.
    await page.getByRole('button', { name: /^Month$/i }).click();
  });

  test('month view navigation moves forward and back', async ({ page }) => {
    const monthButton = page.getByRole('button', { name: /^Month$/i });
    await monthButton.click();
    await expect(monthButton).toHaveAttribute('aria-pressed', 'true');

    const dateLabel = page.locator('[aria-live="polite"]').first();
    const originalLabel = (await dateLabel.textContent())?.trim();
    expect(originalLabel).toBeTruthy();

    await page.getByRole('button', { name: /^Next$/i }).first().click();
    await expect(dateLabel).not.toHaveText(originalLabel ?? '');

    await page.getByRole('button', { name: /^Previous$/i }).first().click();
    await expect(dateLabel).toHaveText(originalLabel ?? '');
  });

  test('can drag an event in month view without crashing', async ({ page }) => {
    // Use the purpose-built regression fixture instead of demo data so the test
    // does not depend on whether a specific demo event title is visible in the
    // current month viewport.
    await page.goto('/regression-bugs.html');
    await expect(page.getByTestId('works-calendar')).toBeVisible();

    const event = page.getByRole('button', { name: /Drag Crash Pill/i }).first();
    await expect(event).toBeVisible();

    const sourceBox = await event.boundingBox();
    const targetCell = page.locator(`[data-date="${dateKey(1)}"]`).first();
    await expect(targetCell).toBeVisible();
    const targetBox = await targetCell.boundingBox();

    expect(sourceBox).not.toBeNull();
    expect(targetBox).not.toBeNull();

    if (!sourceBox || !targetBox) {
      throw new Error('Unable to resolve drag coordinates for month event move.');
    }

    await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 14 });
    await page.mouse.up();

    await expect(page.getByTestId('works-calendar')).toBeVisible();
    await expect(page.getByRole('button', { name: /Drag Crash Pill/i }).first()).toBeVisible();
  });

  test('can create a recurring event from the add-event modal', async ({ page }) => {
    await page.getByRole('button', { name: /Add New Event/i }).click();
    await expect(page.getByRole('dialog', { name: /Add event/i })).toBeVisible();

    const now = new Date();
    const start = new Date(now);
    start.setHours(10, 0, 0, 0);
    const end = new Date(now);
    end.setHours(11, 0, 0, 0);

    await page.getByLabel(/^Title/i).fill('Happy Path Recurring Event');
    await page.getByLabel(/^Start/i).fill(toDatetimeLocalInput(start));
    await page.getByLabel(/^End/i).fill(toDatetimeLocalInput(end));
    await page.getByLabel(/^Repeat$/i).selectOption('daily');

    await page.getByRole('button', { name: /Add Event/i }).click();

    await expect(page.getByRole('button', { name: /Happy Path Recurring Event/i }).first()).toBeVisible();
  });

  test('can switch theme via Settings > Setup', async ({ page }) => {
    // Authenticate as owner (demo password is "demo1234").
    // On success, useOwnerConfig.authenticate() calls setConfigOpen(true) so
    // the Settings dialog opens automatically — no need to click the gear button.
    await page.getByLabel('Owner settings').click();
    await page.getByPlaceholder(/Enter password/i).fill('demo1234');
    await page.getByRole('button', { name: /Unlock/i }).click();

    // Dialog auto-opens on successful auth (SHA-256 check is async, give it time).
    await expect(page.getByRole('dialog', { name: /Calendar settings/i })).toBeVisible({ timeout: 10000 });

    // The Setup tab should be active by default, click the Corporate Dark
    // theme (after issue #268 the theme list is family × mode; corporate-dark
    // resolves to the historical 'ocean' CSS selector via resolveCssTheme).
    await page.getByRole('button', { name: /Corporate Dark/i }).click();

    // Close the settings panel
    await page.getByLabel('Close settings').click();

    // Verify the theme was applied
    await expect(page.getByTestId('works-calendar')).toHaveAttribute('data-wc-theme', 'ocean');
  });

  test('can export visible events to spreadsheet download', async ({ page }) => {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /Export to Excel/i }).click(),
    ]);

    const suggested = download.suggestedFilename();
    expect(suggested).toMatch(/^calendar-events\.(xlsx|csv)$/i);
  });
});
