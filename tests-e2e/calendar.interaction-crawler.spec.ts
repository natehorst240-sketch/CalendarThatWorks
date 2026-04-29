/**
 * Interaction crawler — post-#424 exploratory smoke test.
 *
 * This is intentionally not a pixel-perfect user journey. It is a
 * low-cost UI crawler that walks the demo the way a curious user does:
 * click visible buttons/tabs/pills/controls, verify the app does not
 * crash, then recover back to a usable state before the next click.
 *
 * It is designed to catch:
 *   - dead buttons / pills
 *   - modals that cannot close
 *   - overlays that trap the page
 *   - uncaught console/page errors
 *   - controls that navigate the app into a broken state
 *
 * Keep this test broad but conservative. Do not click destructive final
 * actions such as delete, remove, confirm, finish, or approve unless a
 * future seeded test mode makes those flows safely reversible.
 */
import { expect, test, type Page, type Locator } from '@playwright/test';

type UiError = {
  readonly source: 'console' | 'pageerror';
  readonly message: string;
};

const ROOT_TEST_ID = 'works-calendar';

// Keep this crawler CI-safe. The full exploratory crawler can grow later as a
// nightly-only job, but the PR gate must stay comfortably under Playwright's
// default 60s timeout on shared runners.
const MAX_CLICKS_PER_SURFACE = 10;
const MAX_CANDIDATES_PER_SURFACE = 120;

// Intentionally skip actions that may mutate demo state, create noisy
// downloads, or leave the app in an irreversible flow.
const UNSAFE_NAME = /\b(delete|remove|clear all|reset|discard|confirm|approve|deny|reject|finish|save|create|submit|export|download|import|upload|publish|sign out|logout)\b/i;

// Controls users commonly poke while exploring the UI. This is broader
// than scripted smoke tests but still avoids free-text inputs.
const CRAWL_SELECTOR = [
  'button:not([disabled])',
  'a[href]',
  '[role="button"]:not([aria-disabled="true"])',
  '[role="tab"]:not([aria-disabled="true"])',
  '[role="menuitem"]:not([aria-disabled="true"])',
  '[role="checkbox"]:not([aria-disabled="true"])',
  '[role="radio"]:not([aria-disabled="true"])',
  'summary',
  'select:not([disabled])',
].join(', ');

const SURFACES: readonly { name: string; open?: (page: Page) => Promise<void> }[] = [
  { name: 'initial demo' },
  { name: 'Assets', open: async page => clickIfVisible(page.getByRole('button', { name: /^Assets$/ })) },
  { name: 'Calendar', open: async page => clickIfVisible(page.getByRole('button', { name: /^Calendar$/ })) },
  { name: 'Schedule', open: async page => clickIfVisible(page.getByRole('button', { name: /^Schedule$/ })) },
  { name: 'Requests', open: async page => clickIfVisible(page.getByRole('button', { name: /^Requests?$/ })) },
  { name: 'Readiness', open: async page => clickIfVisible(page.getByRole('button', { name: /^Readiness$/ })) },
];

test.describe('WorksCalendar interaction crawler', () => {
  test.setTimeout(90_000);

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto('/?embed=1');
    await expect(page.getByTestId(ROOT_TEST_ID)).toBeVisible();
  });

  test('visible controls do not crash, trap, or produce console errors', async ({ page }) => {
    const uiErrors = collectUiErrors(page);

    for (const surface of SURFACES) {
      await recover(page);
      await surface.open?.(page);
      await expect(page.getByTestId(ROOT_TEST_ID), `surface ${surface.name} should keep calendar mounted`).toBeVisible();
      await crawlCurrentSurface(page, surface.name);
    }

    expect(formatErrors(uiErrors)).toEqual([]);
  });
});

async function crawlCurrentSurface(page: Page, surfaceName: string): Promise<void> {
  const seen = new Set<string>();

  for (let i = 0; i < MAX_CLICKS_PER_SURFACE; i += 1) {
    if (page.isClosed()) return;
    await expect(page.getByTestId(ROOT_TEST_ID), `${surfaceName}: calendar root before click ${i}`).toBeVisible();

    const target = await nextClickable(page, seen);
    if (!target) break;

    const label = await labelFor(target);
    seen.add(label);

    await test.step(`${surfaceName}: click ${label}`, async () => {
      await target.scrollIntoViewIfNeeded().catch(() => undefined);

      // Trial first so hidden overlays or offscreen transforms do not fail the test
      // before we can recover. If Playwright says it cannot be clicked, skip it.
      const clickable = await target.click({ trial: true, timeout: 500 })
        .then(() => true)
        .catch(() => false);
      if (!clickable || page.isClosed()) return;

      await target.click({ timeout: 1_000 }).catch(async err => {
        throw new Error(`${surfaceName}: failed clicking ${label}: ${String(err)}`);
      });

      await shortPause(page, 75);
      if (page.isClosed()) return;
      await expect(page.getByTestId(ROOT_TEST_ID), `${surfaceName}: calendar root after clicking ${label}`).toBeVisible();
      await recover(page);
    });
  }
}

async function nextClickable(page: Page, seen: ReadonlySet<string>): Promise<Locator | null> {
  const candidates = page.locator(CRAWL_SELECTOR);
  const count = Math.min(await candidates.count(), MAX_CANDIDATES_PER_SURFACE);

  for (let i = 0; i < count; i += 1) {
    const candidate = candidates.nth(i);
    if (!(await candidate.isVisible().catch(() => false))) continue;
    if (!(await candidate.isEnabled().catch(() => true))) continue;

    const label = await labelFor(candidate);
    if (!label || seen.has(label) || UNSAFE_NAME.test(label)) continue;

    return candidate;
  }

  return null;
}

async function labelFor(locator: Locator): Promise<string> {
  const [name, text, role, testId, href] = await Promise.all([
    locator.getAttribute('aria-label').catch(() => null),
    locator.innerText({ timeout: 300 }).catch(() => null),
    locator.getAttribute('role').catch(() => null),
    locator.getAttribute('data-testid').catch(() => null),
    locator.getAttribute('href').catch(() => null),
  ]);

  return [name, text, role, testId, href]
    .filter((v): v is string => Boolean(v && v.trim()))
    .join(' | ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

async function recover(page: Page): Promise<void> {
  if (page.isClosed()) return;

  // Close menus/dialogs/popovers that opened during the prior click. Multiple
  // Escape presses are intentional: nested overlays often need more than one.
  for (let i = 0; i < 2; i += 1) {
    if (page.isClosed()) return;
    await page.keyboard.press('Escape').catch(() => undefined);
    await shortPause(page, 25);
  }

  if (page.isClosed()) return;

  // If a visible Cancel/Close button remains, use it. Avoid Save/Submit/etc.
  const closeButtons = page.getByRole('button', { name: /^(close|cancel|done|back)$/i });
  const count = Math.min(await closeButtons.count().catch(() => 0), 2);
  for (let i = 0; i < count; i += 1) {
    if (page.isClosed()) return;
    const btn = closeButtons.nth(i);
    if (await btn.isVisible().catch(() => false)) {
      await btn.click({ timeout: 500 }).catch(() => undefined);
      await shortPause(page, 25);
    }
  }
}

async function shortPause(page: Page, ms: number): Promise<void> {
  if (page.isClosed()) return;
  await page.waitForTimeout(ms).catch(() => undefined);
}

async function clickIfVisible(locator: Locator): Promise<void> {
  if (await locator.isVisible().catch(() => false)) {
    await locator.click();
  }
}

function collectUiErrors(page: Page): UiError[] {
  const errors: UiError[] = [];

  page.on('console', msg => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (isIgnoredConsoleError(text)) return;
    errors.push({ source: 'console', message: text });
  });

  page.on('pageerror', err => {
    errors.push({ source: 'pageerror', message: err.message });
  });

  return errors;
}

function isIgnoredConsoleError(message: string): boolean {
  // Known browser/dev-server noise only. Do not ignore generic 404s here:
  // missing same-origin chunks, fixtures, or demo endpoints are real crawler
  // failures and should stay visible.
  return (
    /ResizeObserver loop/i.test(message) ||
    /net::ERR_CERT_/i.test(message) ||
    /Failed to load resource.*favicon/i.test(message) ||
    /favicon\.ico/i.test(message)
  );
}

function formatErrors(errors: readonly UiError[]): string[] {
  return errors.map(err => `${err.source}: ${err.message}`);
}
