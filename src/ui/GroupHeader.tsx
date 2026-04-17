import { ChevronRight } from 'lucide-react'
import type { KeyboardEvent } from 'react'
import styles from '../styles/GroupHeader.module.css'

export type GroupHeaderProps = {
  label: string
  count: number
  depth: number
  collapsed: boolean
  onToggle: () => void
  /** ARIA tree position: 1-based index of this header among its siblings. */
  posInSet?: number
  /** ARIA tree position: total count of siblings at this level. */
  setSize?: number
  /** Field label for screen readers (e.g. "Location"). */
  fieldLabel?: string
  className?: string
  id?: string
}

const INDENT_PX_PER_LEVEL = 16

export default function GroupHeader({
  label,
  count,
  depth,
  collapsed,
  onToggle,
  posInSet,
  setSize,
  fieldLabel,
  className,
  id,
}: GroupHeaderProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onToggle()
    }
  }

  const paddingLeft = depth * INDENT_PX_PER_LEVEL
  const ariaLabel = fieldLabel
    ? `${fieldLabel}: ${label}, ${count} ${count === 1 ? 'event' : 'events'}`
    : undefined

  return (
    <div
      id={id}
      role="treeitem"
      tabIndex={0}
      aria-level={depth + 1}
      aria-expanded={!collapsed}
      aria-setsize={setSize}
      aria-posinset={posInSet}
      aria-label={ariaLabel}
      data-depth={depth}
      data-collapsed={collapsed || undefined}
      className={[styles.header, className].filter(Boolean).join(' ')}
      style={{ paddingLeft }}
      onClick={onToggle}
      onKeyDown={handleKeyDown}
    >
      <span
        className={styles.chevron}
        data-collapsed={collapsed || undefined}
        aria-hidden="true"
      >
        <ChevronRight size={14} />
      </span>
      <span className={styles.label}>{label}</span>
      <span className={styles.count} aria-hidden="true">
        {count}
      </span>
    </div>
  )
}
