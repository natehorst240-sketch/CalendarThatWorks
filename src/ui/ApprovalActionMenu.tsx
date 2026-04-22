/**
 * ApprovalActionMenu — ticket #134-15.
 *
 * Inline action menu rendered next to an approval pill (AssetsView) or in
 * the AuditDrawer header. The action list is owner-configurable via
 * `config.approvals.rules[stage].allow`; button copy comes from
 * `config.approvals.labels`.
 *
 * The calendar never mutates `event.meta.approvalStage` — this component
 * fires `onAction(actionId)` and the host persists the new stage + history
 * entry, then re-renders with the updated event.
 */
import { useEffect, useRef, type CSSProperties } from 'react';
import styles from './ApprovalActionMenu.module.css';

const DEFAULT_LABELS = {
  approve:  'Approve',
  deny:     'Deny',
  finalize: 'Finalize',
  revoke:   'Revoke',
};

/**
 * Resolves the allowed actions for a given stage from the owner-configured
 * approvals block. Returns [] when the feature is disabled, the stage is
 * unknown, or the stage has no rules.
 */
export function allowedActionsFor(stage: string, approvalsConfig: any): string[] {
  if (!approvalsConfig || approvalsConfig.enabled !== true) return [];
  const stageRule = approvalsConfig.rules?.[stage];
  const allow = Array.isArray(stageRule?.allow) ? stageRule.allow : [];
  return allow;
}

/**
 * `variant: 'popover'` (default) renders as a fixed-position overlay anchored
 * to `anchorRect` with Escape + click-outside dismissal — used by the pill
 * caret. `variant: 'inline'` renders statically, meant for embedding inside
 * another dialog (the AuditDrawer uses this).
 */
export default function ApprovalActionMenu({
  stage,
  approvalsConfig,
  onAction,
  onClose,
  labelledBy,
  anchorRect,
  variant = 'popover',
}: any) {
  const ref = useRef<HTMLDivElement | null>(null);
  const actions = allowedActionsFor(stage, approvalsConfig);

  useEffect(() => {
    if (variant !== 'popover' || actions.length === 0) return;
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose?.(); };
    const onDown = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose?.();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onDown);
    };
  }, [variant, actions.length, onClose]);

  if (actions.length === 0) return null;
  const labels = approvalsConfig?.labels ?? {};

  const style: CSSProperties | undefined = variant === 'popover' && anchorRect
    ? {
        position: 'fixed',
        top:  (anchorRect.bottom ?? 0) + 4,
        left: anchorRect.left ?? 0,
      }
    : undefined;

  return (
    <div
      ref={ref}
      role="menu"
      aria-labelledby={labelledBy}
      className={[
        styles.menu,
        variant === 'inline' ? styles.menuInline : '',
      ].filter(Boolean).join(' ')}
      data-testid="approval-action-menu"
      data-variant={variant}
      style={style}
    >
      {actions.map((action: string) => (
        <button
          key={action}
          type="button"
          role="menuitem"
          className={styles.menuItem}
          data-action={action}
          onClick={(e) => {
            e.stopPropagation();
            onAction?.(action);
            onClose?.();
          }}
        >
          {labels[action] ?? DEFAULT_LABELS[action as keyof typeof DEFAULT_LABELS] ?? action}
        </button>
      ))}
    </div>
  );
}
