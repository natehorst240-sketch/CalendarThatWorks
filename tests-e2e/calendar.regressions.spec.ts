import { test, expect } from '@playwright/test';

function dateKey(offsetDays = 0) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

test.describe('WorksCalendar targeted regressions', () => {
  test('dragging a month pill does not crash the page', async ({ page }) => {
    const pageErrors = [];
    const consoleErrors = [];

    page.on('pageerror', (err) => pageErrors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/regression-bugs.html');

    const pill = page.getByRole('button', { name: /Drag Crash Pill/i }).first();
    await expect(pill).toBeVisible();

    const sourceBox = await pill.boundingBox();
    const target = page.locator(`[data-date="${dateKey(1)}"]`).first();
    await expect(target).toBeVisible();
    const targetBox = await target.boundingBox();

    expect(sourceBox).not.toBeNull();
    expect(targetBox).not.toBeNull();

    await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 12 });
    await page.mouse.up();

    await expect(page.getByTestId('works-calendar')).toBeVisible();
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test('hover card shows the full cross-day range for a timed multi-day event', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/regression-bugs.html');

    // Use partial match so the selector works even when the event splits
    // across week rows (aria-label gains ", continues next week" suffix).
    const crossDay = page.getByRole('button', { name: /Cross-Day Hover Range, Incident/i }).first();
    await expect(crossDay).toBeVisible();
    await crossDay.evaluate((el) => el.click());

    const dialog = page.getByRole('dialog', { name: /Event details: Cross-Day Hover Range/i });
    await expect(dialog).toBeVisible();

    const tomorrow = new Date();
    tomorrow.setHours(0, 0, 0, 0);
    tomorrow.setDate(tomorrow.getDate() + 3);
    const month = tomorrow.toLocaleString('en-US', { month: 'short' });
    const day = tomorrow.getDate();

    await expect(dialog).toContainText(new RegExp(`${month} ${day}`));
  });

  test('mobile month pills keep visible title text', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/regression-bugs.html');

    const pill = page.getByRole('button', { name: /Mobile Pill Text/i }).first();
    await expect(pill).toBeVisible();
    await expect(pill).toHaveText(/Mobile Pill Text/);
  });

  test('edit pen opens the editor with the matching event loaded', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/regression-bugs.html');

    await page.getByRole('button', { name: /Edit Pen Fixture/i }).first().click();

    const dialog = page.getByRole('dialog', { name: /Event details: Edit Pen Fixture/i });
    await expect(dialog).toBeVisible();

    await dialog.getByRole('button', { name: /Edit event/i }).click();

    const editor = page.getByRole('dialog', { name: /Edit event/i });
    await expect(editor).toBeVisible();
    await expect(editor.getByPlaceholder('Event title')).toHaveValue('Edit Pen Fixture');
  });

  test('edit pen on a recurring event shows the series repeat cadence, not "Does not repeat"', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/regression-bugs.html');

    await page.getByRole('button', { name: /Repeating Pencil Test/i }).first().click();

    const dialog = page.getByRole('dialog', { name: /Event details: Repeating Pencil Test/i });
    await expect(dialog).toBeVisible();

    await dialog.getByRole('button', { name: /Edit event/i }).click();

    const editor = page.getByRole('dialog', { name: /Edit event/i });
    await expect(editor).toBeVisible();
    await expect(editor.getByPlaceholder('Event title')).toHaveValue('Repeating Pencil Test');

    // The Repeat dropdown must NOT show "Does not repeat" — the series RRULE should be loaded.
    const repeatSelect = editor.getByLabel(/^Repeat$/i);
    await expect(repeatSelect).not.toHaveValue('none');
  });
});
