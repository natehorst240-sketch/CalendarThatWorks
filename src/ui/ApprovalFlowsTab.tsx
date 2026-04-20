/**
 * ApprovalFlowsTab — ConfigPanel's entry point into the Phase 2
 * visual workflow builder.
 *
 * Split into its own module (and lazy-loaded from ConfigPanel) so
 * the templates catalog, the per-calendar persistence hook, and the
 * visual builder itself never touch the main app chunk. A host that
 * never opens ConfigPanel → Approval Flows pays zero runtime cost
 * for Phase 2.
 */
import { lazy, Suspense, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { createId } from '../core/createId';
import { WORKFLOW_TEMPLATES } from '../core/workflow/templates';
import { useSavedWorkflows } from '../hooks/useSavedWorkflows';
import type { SavedWorkflow } from '../hooks/useSavedWorkflows';
import type { Workflow, WorkflowLayout } from '../core/workflow/workflowSchema';
import styles from './ConfigPanel.module.css';

// Lazy-loaded so the SVG canvas, validator, layout engine and
// simulator only download when the author actually opens a draft.
const WorkflowBuilderModal = lazy(() => import('./WorkflowBuilderModal'));

interface ApprovalFlowsTabProps {
  readonly calendarId: string;
}

/**
 * Edit state for the Approval Flows tab. When non-null, the lazy-loaded
 * WorkflowBuilderModal is mounted against this draft. Two modes:
 *
 *   - `new`   — the Save handler calls `saveWorkflow(...)` to persist as
 *               a fresh entry. Used for "Create blank" and "Edit from
 *               template" (fork-on-edit).
 *   - `saved` — the Save handler calls `updateWorkflow(id, ...)` in-place
 *               so the existing entry's version bumps correctly.
 */
type ApprovalFlowsEdit =
  | { readonly kind: 'new'; readonly name: string; readonly workflow: Workflow; readonly layout: WorkflowLayout }
  | { readonly kind: 'saved'; readonly savedId: string; readonly name: string; readonly workflow: Workflow; readonly layout: WorkflowLayout };

/** Minimal validator-clean seed: one approval + finalize/deny terminals. */
function buildBlankWorkflow(): Workflow {
  return {
    id: createId('wf'),
    version: 1,
    trigger: 'on_submit',
    startNodeId: 'approve-1',
    nodes: [
      { id: 'approve-1', type: 'approval', assignTo: 'role:approver', label: 'Approve' },
      { id: 'done',      type: 'terminal', outcome: 'finalized' },
      { id: 'denied',    type: 'terminal', outcome: 'denied' },
    ],
    edges: [
      { from: 'approve-1', to: 'done',   when: 'approved' },
      { from: 'approve-1', to: 'denied', when: 'denied'   },
    ],
  };
}

/** Fork a shipped template: deep-clone + fresh id so edits can't mutate the original. */
function forkTemplate(template: Workflow): Workflow {
  return {
    id: createId('wf'),
    version: 1,
    trigger: template.trigger,
    startNodeId: template.startNodeId,
    nodes: template.nodes.map(n => ({ ...n })),
    edges: template.edges.map(e => ({ ...e })),
  };
}

function emptyLayoutFor(wf: Workflow): WorkflowLayout {
  return { workflowId: wf.id, workflowVersion: wf.version, positions: {} };
}

export function ApprovalFlowsTab({ calendarId }: ApprovalFlowsTabProps) {
  const { workflows: saved, saveWorkflow, updateWorkflow, deleteWorkflow } =
    useSavedWorkflows(calendarId);
  const [editing, setEditing] = useState<ApprovalFlowsEdit | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const editTemplate = (template: Workflow): void => {
    const wf = forkTemplate(template);
    setEditing({
      kind: 'new',
      name: `${template.id} (forked)`,
      workflow: wf,
      layout: emptyLayoutFor(wf),
    });
  };

  const editSaved = (s: SavedWorkflow): void => {
    setEditing({ kind: 'saved', savedId: s.id, name: s.name, workflow: s.workflow, layout: s.layout });
  };

  const createBlank = (): void => {
    const wf = buildBlankWorkflow();
    setEditing({ kind: 'new', name: 'New workflow', workflow: wf, layout: emptyLayoutFor(wf) });
  };

  const handleSave = (wf: Workflow, layout: WorkflowLayout): void => {
    if (!editing) return;
    if (editing.kind === 'new') {
      saveWorkflow(editing.name, wf, layout);
    } else {
      updateWorkflow(editing.savedId, { workflow: wf, layout });
    }
    setEditing(null);
  };

  return (
    <div className={styles.section}>
      <p className={styles.sectionDesc}>
        Author approval workflows visually — fork a starter template, build a new flow from
        scratch, or tweak one you saved earlier. Saved flows persist per calendar in this browser.
      </p>

      <div>
        <h4 style={{ margin: '0 0 6px', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Starter templates
        </h4>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {WORKFLOW_TEMPLATES.map(t => (
            <li
              key={t.id}
              data-template-id={t.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 8px',
                border: '1px solid var(--wc-border)',
                borderRadius: 4,
                background: 'var(--wc-surface)',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: 13, fontWeight: 500 }}>{t.id}</span>
                <span style={{ fontSize: 11, color: 'var(--wc-text-muted)' }}>
                  {t.nodes.length} nodes · {t.edges.length} edges
                </span>
              </div>
              <button
                className={styles.addFieldBtn}
                style={{ marginTop: 0 }}
                onClick={() => editTemplate(t)}
                data-testid={`edit-template-${t.id}`}
              >
                <Pencil size={12} /> Edit
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '0 0 6px' }}>
          <h4 style={{ margin: 0, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            My workflows
          </h4>
          <button
            className={styles.addFieldBtn}
            style={{ marginTop: 0 }}
            onClick={createBlank}
            data-testid="create-blank-workflow"
          >
            <Plus size={12} /> Create blank workflow
          </button>
        </div>
        {saved.length === 0
          ? (
            <p style={{ fontSize: 12, color: 'var(--wc-text-muted)', margin: 0 }}>
              No saved workflows yet.
            </p>
          )
          : (
            <ul
              style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}
              data-testid="saved-workflow-list"
            >
              {saved.map(s => (
                <li
                  key={s.id}
                  data-saved-id={s.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 8px',
                    border: '1px solid var(--wc-border)',
                    borderRadius: 4,
                    background: 'var(--wc-surface)',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{s.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--wc-text-muted)' }}>
                      v{s.workflow.version} · {s.workflow.nodes.length} nodes · {s.workflow.edges.length} edges
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button
                      className={styles.addFieldBtn}
                      style={{ marginTop: 0 }}
                      onClick={() => editSaved(s)}
                      data-testid={`edit-saved-${s.id}`}
                    >
                      <Pencil size={12} /> Edit
                    </button>
                    {confirmDel === s.id
                      ? (
                        <>
                          <button
                            className={styles.removeBtn}
                            onClick={() => { deleteWorkflow(s.id); setConfirmDel(null); }}
                            data-testid={`confirm-delete-saved-${s.id}`}
                          >
                            Confirm
                          </button>
                          <button
                            className={styles.addFieldBtn}
                            style={{ marginTop: 0 }}
                            onClick={() => setConfirmDel(null)}
                          >
                            Cancel
                          </button>
                        </>
                      )
                      : (
                        <button
                          className={styles.removeBtn}
                          onClick={() => setConfirmDel(s.id)}
                          aria-label={`Delete ${s.name}`}
                          data-testid={`delete-saved-${s.id}`}
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                  </div>
                </li>
              ))}
            </ul>
          )}
      </div>

      {editing && (
        <Suspense fallback={<div role="status">Loading builder…</div>}>
          <WorkflowBuilderModal
            workflow={editing.workflow}
            layout={editing.layout}
            title={`Editing: ${editing.name}`}
            onSave={handleSave}
            onClose={() => setEditing(null)}
          />
        </Suspense>
      )}
    </div>
  );
}

export default ApprovalFlowsTab;
