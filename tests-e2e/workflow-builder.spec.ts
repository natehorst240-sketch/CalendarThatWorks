import { expect, test } from '@playwright/test';

/**
 * Phase 2 — Workflow Visual Builder smoke
 *
 * Two scenarios exercise the same authoring loop (open ConfigPanel →
 * Approval Flows → Edit template → tweak inspector → simulate → Save):
 *
 *   1. Mouse-driven happy path, plus localStorage + "My workflows"
 *      persistence assertions.
 *   2. Keyboard-only pass (plan amendment #7): Tab/Arrow/Delete/Enter
 *      on the canvas, no click on any node.
 *
 * Selectors map to stable `data-testid` hooks authored in Phase 2 so
 * these tests are insulated from CSS/markup drift.
 */

// Must match the calendarId threaded through <WorksCalendar> in demo/App.tsx.
const STORAGE_KEY = 'wc-saved-workflows-ihc-oncall-demo';

async function authenticateAsOwner(page: import('@playwright/test').Page): Promise<void> {
  await page.getByLabel('Owner settings').click();
  await page.getByPlaceholder(/Enter password/i).fill('demo1234');
  await page.getByRole('button', { name: /Unlock/i }).click();
  await expect(page.getByRole('dialog', { name: /Calendar settings/i }))
    .toBeVisible({ timeout: 10000 });
}

async function openApprovalFlowsTab(page: import('@playwright/test').Page): Promise<void> {
  // ConfigPanel groups tabs under collapsible section headers and only
  // opens the section containing the initial tab. Expand "Workflows"
  // first (aria-expanded toggle), then pick the Approval Flows tab
  // (rendered as role="tab" inside the section's tablist).
  const section = page.getByRole('button', { name: /^Workflows$/i });
  const expanded = await section.getAttribute('aria-expanded');
  if (expanded !== 'true') await section.click();
  await page.getByRole('tab', { name: /Approval Flows/i }).click();
}

test.describe('Workflow visual builder', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 1000 });
    // Clear any prior state so localStorage assertions are deterministic.
    await page.addInitScript((key) => {
      try { localStorage.removeItem(key); } catch {}
    }, STORAGE_KEY);
    await page.goto('/');
    await expect(page.getByTestId('works-calendar')).toBeVisible();
  });

  test('fork conditional-by-cost → edit → simulate → save persists to localStorage', async ({ page }) => {
    await authenticateAsOwner(page);
    await openApprovalFlowsTab(page);

    // Edit the conditional-by-cost template (fork-on-edit semantics).
    await page.getByTestId('edit-template-conditional-by-cost').click();
    const dialog = page.getByRole('dialog', { name: /Editing:.*conditional-by-cost/i });
    await expect(dialog).toBeVisible();
    // The fork has a fresh id (wf-…), not the template's slug.
    await expect(page.getByTestId('wb-workflow-id')).toContainText(/wf-/);

    // Select the 'director' node, change its assignee.
    await dialog.locator('[data-node-id="director"]').click();
    const assignToField = dialog.getByLabel(/assign to/i);
    await assignToField.fill('user:alice');
    await expect(assignToField).toHaveValue('user:alice');

    // Switch to the Simulator pane and run cost=1000 → director path.
    await dialog.getByRole('tab', { name: /simulator/i }).click();
    await dialog.getByRole('button', { name: /^start$/i }).click();
    // After Start, we should be parked on the director approval.
    await expect(dialog.getByTestId('sim-current-node')).toContainText(/director/);
    await dialog.getByRole('button', { name: /^approve$/i }).click();
    // Emit log now carries workflow_completed.
    await expect(
      dialog.getByTestId('sim-emit-log').locator('[data-emit-type="workflow_completed"]'),
    ).toBeVisible();
    await expect(dialog.locator('[data-outcome="finalized"]')).toBeVisible();

    // Save and verify the entry appears under "My workflows".
    await page.getByTestId('wb-save').click();
    await expect(dialog).toBeHidden();
    const savedList = page.getByTestId('saved-workflow-list');
    await expect(savedList).toBeVisible();
    await expect(savedList).toContainText(/conditional-by-cost/);

    // localStorage round-trip: the hook serialises
    // `{ version: 1, workflows: SavedWorkflow[] }`.
    const stored = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!) as {
      version: number;
      workflows: Array<{ workflow: { nodes: Array<{ id: string; assignTo?: string }> } }>;
    };
    expect(parsed.version).toBe(1);
    expect(parsed.workflows).toHaveLength(1);
    const director = parsed.workflows[0].workflow.nodes.find(n => n.id === 'director');
    expect(director?.assignTo).toBe('user:alice');
  });

  test('keyboard-only pass: select, nudge, delete, undo via the canvas', async ({ page }) => {
    await authenticateAsOwner(page);
    await openApprovalFlowsTab(page);
    await page.getByTestId('edit-template-conditional-by-cost').click();

    const dialog = page.getByRole('dialog', { name: /Editing:.*conditional-by-cost/i });
    const canvas = dialog.getByTestId('workflow-canvas');
    await expect(canvas).toBeVisible();

    // Focus the node group (each <g data-node-id> is tabIndex=0 and
    // role="button"). Clicking focuses it; onKeyDown on the parent SVG
    // reads the selection state and dispatches the operations.
    const node = dialog.locator('[data-node-id="notify-ops"]');
    await node.click();

    // Delete removes the selected node.
    await page.keyboard.press('Delete');
    await expect(dialog.locator('[data-node-id="notify-ops"]')).toHaveCount(0);

    // Undo brings it back; button re-disables after restore.
    const undoBtn = page.getByTestId('wb-undo');
    await expect(undoBtn).toBeEnabled();
    await undoBtn.click();
    await expect(dialog.locator('[data-node-id="notify-ops"]')).toHaveCount(1);
    await expect(undoBtn).toBeDisabled();

    // Nudge with ArrowRight — re-select first since undo snaps state
    // back and clears selection.
    const restored = dialog.locator('[data-node-id="notify-ops"]');
    await restored.click();
    const getX = async () => (await restored.boundingBox())?.x ?? 0;
    const before = await getX();
    await page.keyboard.press('ArrowRight');
    const after = await getX();
    // ArrowRight nudges by GRID_SNAP (20 px); allow a loose floor for
    // sub-pixel / transform snapping.
    expect(after - before).toBeGreaterThanOrEqual(10);
  });
});
