/**
 * useSavedWorkflows — per-calendar persistence for visual-builder workflows.
 *
 * Storage key: `wc-saved-workflows-${calendarId}`
 * Payload:     `{ version: 1, workflows: SavedWorkflow[] }`
 *
 * Each `SavedWorkflow` bundles the runtime `Workflow` with its side-car
 * `WorkflowLayout` so on reopen the builder renders at the exact
 * positions the user last saved. `updateWorkflow` bumps
 * `workflow.version` (and the paired `layout.workflowVersion`) on every
 * structural change so stale layouts can't be rendered against a graph
 * whose topology has moved on — matching the guard in `layoutWorkflow`.
 *
 * State + the id it was loaded for live in a single atom so a
 * calendarId switch can't trigger a persist against the new key with
 * the previous calendar's workflows (the reload and the persist
 * effects both depend on calendarId; without this coupling the persist
 * effect would fire once before `setWorkflows` settles and corrupt
 * storage for the new calendar).
 */
import { useCallback, useEffect, useState } from 'react'
import { createId } from '../core/createId'
import type { Workflow, WorkflowLayout } from '../core/workflow/workflowSchema'

const STORAGE_VERSION = 1

export interface SavedWorkflow {
  readonly id: string
  readonly name: string
  readonly createdAt: string
  readonly workflow: Workflow
  readonly layout: WorkflowLayout
}

export interface UseSavedWorkflowsResult {
  readonly workflows: readonly SavedWorkflow[]
  readonly saveWorkflow: (
    name: string,
    workflow: Workflow,
    layout: WorkflowLayout,
  ) => SavedWorkflow
  readonly updateWorkflow: (
    id: string,
    patch: { name?: string; workflow?: Workflow; layout?: WorkflowLayout },
  ) => void
  readonly deleteWorkflow: (id: string) => void
}

interface HookState {
  readonly calendarId: string
  readonly workflows: readonly SavedWorkflow[]
}

function storageKey(calendarId: string): string {
  return `wc-saved-workflows-${calendarId}`
}

function isSavedWorkflow(value: unknown): value is SavedWorkflow {
  if (!value || typeof value !== 'object') return false
  const v = value as Partial<SavedWorkflow>
  return (
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    typeof v.createdAt === 'string' &&
    !!v.workflow &&
    typeof v.workflow === 'object' &&
    !!v.layout &&
    typeof v.layout === 'object'
  )
}

function loadWorkflows(calendarId: string): SavedWorkflow[] {
  try {
    const raw = localStorage.getItem(storageKey(calendarId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      parsed.version !== STORAGE_VERSION ||
      !Array.isArray(parsed.workflows)
    ) {
      return []
    }
    return parsed.workflows.filter(isSavedWorkflow)
  } catch {
    return []
  }
}

function persistWorkflows(
  calendarId: string,
  workflows: readonly SavedWorkflow[],
): void {
  try {
    localStorage.setItem(
      storageKey(calendarId),
      JSON.stringify({ version: STORAGE_VERSION, workflows }),
    )
  } catch {
    // Quota / disabled storage — silently drop, matching useSavedViews.
  }
}

export function useSavedWorkflows(calendarId: string): UseSavedWorkflowsResult {
  const [state, setState] = useState<HookState>(() => ({
    calendarId,
    workflows: loadWorkflows(calendarId),
  }))

  // Reload when the prop flips. Couples the swap in a single setState
  // so `state.calendarId` and `state.workflows` are never out of sync.
  useEffect(() => {
    setState(prev =>
      prev.calendarId === calendarId
        ? prev
        : { calendarId, workflows: loadWorkflows(calendarId) },
    )
  }, [calendarId])

  // Persist only when state matches the rendered prop. On a prop flip
  // this render carries the stale state; we skip the write until the
  // reload-effect's setState commits with the new id's workflows.
  useEffect(() => {
    if (state.calendarId !== calendarId) return
    persistWorkflows(state.calendarId, state.workflows)
  }, [state, calendarId])

  const saveWorkflow = useCallback(
    (name: string, workflow: Workflow, layout: WorkflowLayout): SavedWorkflow => {
      const saved: SavedWorkflow = {
        id: createId('wf'),
        name,
        createdAt: new Date().toISOString(),
        workflow,
        layout: {
          ...layout,
          workflowId: workflow.id,
          workflowVersion: workflow.version,
        },
      }
      setState(prev => ({ ...prev, workflows: [...prev.workflows, saved] }))
      return saved
    },
    [],
  )

  const updateWorkflow = useCallback(
    (
      id: string,
      patch: { name?: string; workflow?: Workflow; layout?: WorkflowLayout },
    ) => {
      setState(prev => ({
        ...prev,
        workflows: prev.workflows.map(saved => {
          if (saved.id !== id) return saved
          if (patch.workflow === undefined) {
            return {
              ...saved,
              ...(patch.name !== undefined ? { name: patch.name } : {}),
              ...(patch.layout !== undefined
                ? {
                    layout: {
                      ...patch.layout,
                      workflowId: saved.workflow.id,
                      workflowVersion: saved.workflow.version,
                    },
                  }
                : {}),
            }
          }
          const nextVersion = saved.workflow.version + 1
          const nextWorkflow: Workflow = { ...patch.workflow, version: nextVersion }
          const sourceLayout = patch.layout ?? saved.layout
          return {
            ...saved,
            ...(patch.name !== undefined ? { name: patch.name } : {}),
            workflow: nextWorkflow,
            layout: {
              ...sourceLayout,
              workflowId: nextWorkflow.id,
              workflowVersion: nextVersion,
            },
          }
        }),
      }))
    },
    [],
  )

  const deleteWorkflow = useCallback((id: string) => {
    setState(prev => ({
      ...prev,
      workflows: prev.workflows.filter(saved => saved.id !== id),
    }))
  }, [])

  return { workflows: state.workflows, saveWorkflow, updateWorkflow, deleteWorkflow }
}
