/**
 * WorkflowEdgeGuardPicker — popover shown after a new edge is drawn
 * in the builder canvas. The user picks a guard (`true`/`false`,
 * `approved`/`denied`, `default`), the modal commits the edge.
 *
 * Options are filtered to just those the source node can legally emit:
 *
 *   - `condition`  → true / false / default
 *   - `approval`   → approved / denied / default (+ `timeout` when slaMinutes set)
 *   - `notify`     → default
 *   - `terminal`   → (no outgoing edges; picker should not be invoked)
 *
 * Dismissal: Escape or click-outside calls `onCancel`. Picking an
 * option calls `onPick(guard)` — the host decides whether to persist.
 */
import { useEffect, useRef, type CSSProperties } from 'react'
import type { EdgeGuard, WorkflowNode } from '../core/workflow/workflowSchema'
import styles from './WorkflowEdgeGuardPicker.module.css'

export interface AnchorRect {
  readonly left: number
  readonly top: number
  readonly bottom: number
  readonly right: number
}

export interface WorkflowEdgeGuardPickerProps {
  readonly sourceType: WorkflowNode['type']
  /**
   * Whether the source approval has `slaMinutes > 0`. Only consulted
   * when `sourceType === 'approval'` — the `timeout` option is added
   * iff true, matching the validator's `isGuardLegal` rule.
   */
  readonly sourceHasSla?: boolean
  readonly anchorRect?: AnchorRect
  readonly onPick: (guard: EdgeGuard) => void
  readonly onCancel: () => void
}

const GUARD_LABELS: Readonly<Record<EdgeGuard, string>> = {
  'true': 'true',
  'false': 'false',
  'approved': 'approved',
  'denied': 'denied',
  'timeout': 'timeout (SLA)',
  'default': 'default (fallback)',
}

/**
 * Exported for unit tests + the canvas (which hides the handle on
 * terminal nodes so this returns [] for defensive callers only).
 *
 * `options.hasSla` unlocks the `timeout` option for approval sources.
 */
export function guardsForSource(
  sourceType: WorkflowNode['type'],
  options?: { readonly hasSla?: boolean },
): readonly EdgeGuard[] {
  switch (sourceType) {
    case 'condition': return ['true', 'false', 'default']
    case 'approval':
      return options?.hasSla
        ? ['approved', 'denied', 'timeout', 'default']
        : ['approved', 'denied', 'default']
    case 'notify':    return ['default']
    case 'terminal':  return []
  }
}

export function WorkflowEdgeGuardPicker(
  props: WorkflowEdgeGuardPickerProps,
): JSX.Element | null {
  const { sourceType, sourceHasSla, anchorRect, onPick, onCancel } = props
  const ref = useRef<HTMLDivElement | null>(null)
  const guards = guardsForSource(sourceType, { hasSla: sourceHasSla })

  // Escape + click-outside dismissal. Registered only while mounted;
  // parent unmounts the picker after the first pick or cancel.
  useEffect(() => {
    if (guards.length === 0) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCancel()
      }
    }
    const onDown = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onCancel()
      }
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onDown)
    }
  }, [guards.length, onCancel])

  // Initial focus on the first option so keyboard users can commit
  // with Enter immediately. `terminal` returns early above, so this
  // only runs when there's at least one option.
  useEffect(() => {
    if (guards.length === 0) return
    const first = ref.current?.querySelector<HTMLButtonElement>(
      'button[data-guard]',
    )
    first?.focus()
  }, [guards.length])

  if (guards.length === 0) return null

  const style: CSSProperties | undefined = anchorRect
    ? {
      position: 'fixed',
      top: anchorRect.bottom + 4,
      left: anchorRect.left,
    }
    : undefined

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Pick edge guard"
      className={styles.menu}
      data-testid="workflow-edge-guard-picker"
      style={style}
    >
      {guards.map(g => (
        <button
          key={g}
          type="button"
          role="menuitem"
          className={styles.menuItem}
          data-guard={g}
          onClick={e => {
            e.stopPropagation()
            onPick(g)
          }}
        >
          {GUARD_LABELS[g]}
        </button>
      ))}
    </div>
  )
}

export default WorkflowEdgeGuardPicker
