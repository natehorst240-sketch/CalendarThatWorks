import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSavedWorkflows } from '../useSavedWorkflows'
import { singleApproverWorkflow } from '../../core/workflow/templates'
import type { Workflow, WorkflowLayout } from '../../core/workflow/workflowSchema'

const CAL_ID = 'test-cal'
const KEY = `wc-saved-workflows-${CAL_ID}`

const layout: WorkflowLayout = {
  workflowId: singleApproverWorkflow.id,
  workflowVersion: singleApproverWorkflow.version,
  positions: { approve: { x: 40, y: 40 } },
}

beforeEach(() => {
  localStorage.clear()
})

describe('useSavedWorkflows — save / update / delete', () => {
  it('starts empty for a fresh calendar id', () => {
    const { result } = renderHook(() => useSavedWorkflows(CAL_ID))
    expect(result.current.workflows).toEqual([])
  })

  it('saveWorkflow appends, assigns an id, and persists to localStorage', () => {
    const { result } = renderHook(() => useSavedWorkflows(CAL_ID))
    let returned: ReturnType<typeof result.current.saveWorkflow> | undefined
    act(() => {
      returned = result.current.saveWorkflow('My flow', singleApproverWorkflow, layout)
    })
    expect(result.current.workflows.length).toBe(1)
    expect(returned!.id).toMatch(/^wf-/)
    expect(returned!.name).toBe('My flow')
    expect(returned!.workflow.id).toBe(singleApproverWorkflow.id)
    // layout coords survive
    expect(returned!.layout.positions['approve']).toEqual({ x: 40, y: 40 })

    const raw = localStorage.getItem(KEY)!
    expect(raw).toBeTruthy()
    const parsed = JSON.parse(raw)
    expect(parsed.version).toBe(1)
    expect(parsed.workflows).toHaveLength(1)
  })

  it('reloads persisted workflows when remounted with the same calendar id', () => {
    const { result, unmount } = renderHook(() => useSavedWorkflows(CAL_ID))
    act(() => {
      result.current.saveWorkflow('My flow', singleApproverWorkflow, layout)
    })
    unmount()

    const { result: r2 } = renderHook(() => useSavedWorkflows(CAL_ID))
    expect(r2.current.workflows).toHaveLength(1)
    expect(r2.current.workflows[0].name!).toBe('My flow')
  })

  it('isolates storage per calendar id', () => {
    const { result: a } = renderHook(() => useSavedWorkflows('cal-a'))
    act(() => {
      a.current.saveWorkflow('for A', singleApproverWorkflow, layout)
    })
    const { result: b } = renderHook(() => useSavedWorkflows('cal-b'))
    expect(b.current.workflows).toEqual([])
  })

  it('switching calendarId never writes the old calendar\'s workflows under the new key', () => {
    // Regression: with the reload + persist effects both keyed on
    // calendarId, the persist effect would fire once with the NEW id
    // but the STALE workflows state — briefly writing calendar A's
    // workflows under calendar B's storage key before the reload
    // effect's setState settled. A follow-up write corrects it, but
    // if the component unmounts (or the follow-up write fails) the
    // corruption sticks. Spy has to be installed before renderHook so
    // we can retrospectively inspect every write during the swap.
    const setSpy = vi.spyOn(localStorage, 'setItem')
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useSavedWorkflows(id),
      { initialProps: { id: 'cal-a' } },
    )
    act(() => {
      result.current.saveWorkflow('for A', singleApproverWorkflow, layout)
    })
    setSpy.mockClear()
    rerender({ id: 'cal-b' })

    // Every setItem call targeting cal-b must NOT carry A's workflows
    // (i.e. must not contain the name "for A") — asserting no
    // cross-contamination even in the intermediate render pass.
    const bWrites = setSpy.mock.calls.filter(
      ([key]) => key === 'wc-saved-workflows-cal-b',
    )
    for (const [, value] of bWrites) {
      expect(value as string).not.toContain('for A')
    }
    setSpy.mockRestore()

    // End state: hook reports empty for B, A is untouched.
    expect(result.current.workflows).toEqual([])
    expect(JSON.parse(localStorage.getItem('wc-saved-workflows-cal-a')!).workflows).toHaveLength(1)
  })

  it('saves made after a calendarId switch persist under the new calendar\'s key', () => {
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useSavedWorkflows(id),
      { initialProps: { id: 'cal-a' } },
    )
    act(() => {
      result.current.saveWorkflow('for A', singleApproverWorkflow, layout)
    })
    rerender({ id: 'cal-b' })
    act(() => {
      result.current.saveWorkflow('for B', singleApproverWorkflow, layout)
    })
    const aWorkflows = JSON.parse(localStorage.getItem('wc-saved-workflows-cal-a')!).workflows
    const bWorkflows = JSON.parse(localStorage.getItem('wc-saved-workflows-cal-b')!).workflows
    expect(aWorkflows.map((w: { name: string }) => w.name)).toEqual(['for A'])
    expect(bWorkflows.map((w: { name: string }) => w.name)).toEqual(['for B'])
  })

  it('updateWorkflow bumps workflow.version and keeps layout.workflowVersion aligned', () => {
    const { result } = renderHook(() => useSavedWorkflows(CAL_ID))
    let saved: ReturnType<typeof result.current.saveWorkflow> | undefined
    act(() => {
      saved = result.current.saveWorkflow('v1', singleApproverWorkflow, layout)
    })
    const originalVersion = saved!.workflow.version

    const mutated: Workflow = {
      ...saved!.workflow,
      nodes: [
        ...saved!.workflow.nodes,
        { id: 'extra', type: 'terminal', outcome: 'cancelled' },
      ],
    }
    act(() => {
      result.current.updateWorkflow(saved!.id, { workflow: mutated })
    })

    const updated = result.current.workflows[0]
    expect(updated!.workflow.version).toBe(originalVersion + 1)
    expect(updated!.layout.workflowVersion).toBe(originalVersion + 1)
    expect(updated!.workflow.nodes.some(n => n.id === 'extra')).toBe(true)
  })

  it('updateWorkflow with only a layout patch does NOT bump version', () => {
    const { result } = renderHook(() => useSavedWorkflows(CAL_ID))
    let saved: ReturnType<typeof result.current.saveWorkflow> | undefined
    act(() => {
      saved = result.current.saveWorkflow('v1', singleApproverWorkflow, layout)
    })
    const originalVersion = saved!.workflow.version

    const nextLayout: WorkflowLayout = {
      workflowId: saved!.workflow.id,
      workflowVersion: saved!.workflow.version,
      positions: { approve: { x: 200, y: 200 } },
    }
    act(() => {
      result.current.updateWorkflow(saved!.id, { layout: nextLayout })
    })

    const updated = result.current.workflows[0]
    expect(updated!.workflow.version).toBe(originalVersion)
    expect(updated!.layout.positions['approve']).toEqual({ x: 200, y: 200 })
  })

  it('updateWorkflow can rename without touching version', () => {
    const { result } = renderHook(() => useSavedWorkflows(CAL_ID))
    let saved: ReturnType<typeof result.current.saveWorkflow> | undefined
    act(() => {
      saved = result.current.saveWorkflow('old', singleApproverWorkflow, layout)
    })
    const originalVersion = saved!.workflow.version

    act(() => {
      result.current.updateWorkflow(saved!.id, { name: 'renamed' })
    })

    expect(result.current.workflows[0].name!).toBe('renamed')
    expect(result.current.workflows[0].workflow.version!).toBe(originalVersion)
  })

  it('deleteWorkflow removes the matching entry', () => {
    const { result } = renderHook(() => useSavedWorkflows(CAL_ID))
    let saved: ReturnType<typeof result.current.saveWorkflow> | undefined
    act(() => {
      result.current.saveWorkflow('keep', singleApproverWorkflow, layout)
      saved = result.current.saveWorkflow('drop', singleApproverWorkflow, layout)
    })
    expect(result.current.workflows).toHaveLength(2)
    act(() => {
      result.current.deleteWorkflow(saved!.id)
    })
    expect(result.current.workflows).toHaveLength(1)
    expect(result.current.workflows[0].name!).toBe('keep')
  })
})

describe('useSavedWorkflows — storage hygiene', () => {
  it('ignores payloads with an unknown version', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ version: 99, workflows: [{ id: 'x' }] }),
    )
    const { result } = renderHook(() => useSavedWorkflows(CAL_ID))
    expect(result.current.workflows).toEqual([])
  })

  it('ignores malformed JSON', () => {
    localStorage.setItem(KEY, 'not-json')
    const { result } = renderHook(() => useSavedWorkflows(CAL_ID))
    expect(result.current.workflows).toEqual([])
  })

  it('filters out entries missing required fields', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        version: 1,
        workflows: [
          { id: 'ok', name: 'good', createdAt: '2026-04-20', workflow: singleApproverWorkflow, layout },
          { id: 'bad' /* missing name, workflow, layout */ },
        ],
      }),
    )
    const { result } = renderHook(() => useSavedWorkflows(CAL_ID))
    expect(result.current.workflows).toHaveLength(1)
    expect(result.current.workflows[0].id!).toBe('ok')
  })
})
