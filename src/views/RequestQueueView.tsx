/**
 * RequestQueueView — sprint #424 week 3.
 *
 * The calendar grid shows scheduled events; the readiness board shows
 * who can launch. Neither answers "what's waiting on me?" — i.e. which
 * requests still need approval. This view does.
 *
 * Each row is one event whose `meta.approvalStage.stage` lives in the
 * lifecycle (default: `requested` + `pending_higher`; togglable via
 * the stage filter strip). Rows surface:
 *   - title + when + who's asking + which resource
 *   - the current lifecycle badge (week 1) so the queue reads the same
 *     vocabulary as the rest of the UI
 *   - the legal action menu (Approve / Deny / Finalize / Revoke), wired
 *     to the same `onApprovalAction` callback AssetsView already uses
 *     so hosts have one entry point
 *
 * Approve / Deny actions feed back through the standard
 * `transitionApproval` reducer; this view is purely presentational.
 */
import { useMemo, useState, type CSSProperties } from 'react';
import { format } from 'date-fns';
import { CheckCircle2, ChevronDown, Clock, Inbox, User, XCircle } from 'lucide-react';
import EventStatusBadge from '../ui/EventStatusBadge';
import ApprovalActionMenu, { allowedActionsFor } from '../ui/ApprovalActionMenu';
import { lifecycleFromApprovalStage } from '../core/approvals/lifecycleFromApprovalStage';
import type { ApprovalStage, ApprovalStageId } from '../types/assets';
import styles from './RequestQueueView.module.css';

type LooseEvent = {
  id?: string | number;
  start?: string | Date;
  end?: string | Date;
  resource?: string | number | null;
  category?: string | null;
  title?: string;
  meta?: Record<string, unknown> | null | undefined;
  [k: string]: unknown;
};

export type RequestQueueViewProps = {
  events: LooseEvent[];
  approvalsConfig?: Record<string, unknown> | undefined;
  /**
   * Wired by WorksCalendar to `onApprovalAction` so the queue uses the
   * same reducer pipeline as AssetsView and AuditDrawer. Receives the
   * raw event + the action id (`approve | deny | finalize | revoke`).
   */
  onApprovalAction?: ((event: LooseEvent, action: string) => void | Promise<void>) | undefined;
  /** Click-through to the standard event detail / hover card. */
  onEventClick?: ((event: LooseEvent) => void) | undefined;
  /** Optional map of resource id → display label (employees, assets…). */
  resolveResourceLabel?: ((resourceId: string) => string | null | undefined) | undefined;
  /** UI label override; defaults to "Requests". */
  label?: string;
};

type StageFilterId = 'open' | 'all' | ApprovalStageId;

const OPEN_STAGES: readonly ApprovalStageId[] = ['requested', 'pending_higher'];
const ALL_STAGES: readonly ApprovalStageId[] = [
  'requested', 'pending_higher', 'approved', 'finalized', 'denied',
];

const STAGE_LABEL: Record<ApprovalStageId, string> = {
  requested:      'Requested',
  pending_higher: 'Pending higher',
  approved:       'Approved',
  finalized:      'Finalized',
  denied:         'Denied',
};

function readApprovalStage(ev: LooseEvent): ApprovalStage | null {
  const raw = (ev.meta as { approvalStage?: ApprovalStage } | null | undefined)?.approvalStage;
  if (!raw || typeof raw.stage !== 'string') return null;
  return raw;
}

function readRequester(ev: LooseEvent): string | null {
  // Hosts may stash the requester on either `meta.requestedBy` or in the
  // approval history; surface the first non-empty source.
  const direct = (ev.meta as { requestedBy?: unknown } | null | undefined)?.requestedBy;
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  const stage = readApprovalStage(ev);
  const submit = stage?.history?.find(h => h.action === 'submit');
  return submit?.actor ?? null;
}

function toDate(v: string | Date | undefined): Date | null {
  if (!v) return null;
  return v instanceof Date ? v : new Date(v);
}

export default function RequestQueueView({
  events,
  approvalsConfig,
  onApprovalAction,
  onEventClick,
  resolveResourceLabel,
  label = 'Requests',
}: RequestQueueViewProps) {
  const [stageFilter, setStageFilter] = useState<StageFilterId>('open');
  const [actionMenu, setActionMenu] = useState<{
    eventId: string;
    stage: ApprovalStageId;
    anchorRect: DOMRect;
  } | null>(null);

  const rows = useMemo(() => {
    const allowedStages: ReadonlySet<ApprovalStageId> = new Set(
      stageFilter === 'open' ? OPEN_STAGES
      : stageFilter === 'all' ? ALL_STAGES
      : [stageFilter],
    );
    const out: { ev: LooseEvent; stage: ApprovalStage }[] = [];
    for (const ev of events) {
      const stage = readApprovalStage(ev);
      if (!stage) continue;
      if (!allowedStages.has(stage.stage)) continue;
      out.push({ ev, stage });
    }
    out.sort((a, b) => {
      const at = new Date(a.stage.updatedAt).getTime();
      const bt = new Date(b.stage.updatedAt).getTime();
      return bt - at;
    });
    return out;
  }, [events, stageFilter]);

  const counts = useMemo(() => {
    const c: Record<StageFilterId, number> = {
      open: 0, all: 0,
      requested: 0, pending_higher: 0, approved: 0, finalized: 0, denied: 0,
    };
    for (const ev of events) {
      const stage = readApprovalStage(ev);
      if (!stage) continue;
      c.all += 1;
      c[stage.stage] += 1;
      if (stage.stage === 'requested' || stage.stage === 'pending_higher') c.open += 1;
    }
    return c;
  }, [events]);

  const menuAnchorStyle: CSSProperties | undefined = actionMenu?.anchorRect
    ? {
        position: 'fixed',
        top:  actionMenu.anchorRect.bottom + 4,
        left: actionMenu.anchorRect.left,
      }
    : undefined;

  return (
    <div className={styles['root']} role="region" aria-label="Request queue">
      <div className={styles['toolbar']}>
        <div className={styles['title']}>
          <Inbox size={14} aria-hidden="true" />
          <span className={styles['titleLabel']}>{label}</span>
          <span className={styles['titleHint']}>
            {counts.open} waiting · {counts.all} total
          </span>
        </div>
        <div className={styles['filters']} role="tablist" aria-label="Filter by stage">
          {(['open', 'all', ...ALL_STAGES] as StageFilterId[]).map(id => {
            const labelStr = id === 'open' ? 'Open'
              : id === 'all' ? 'All'
              : STAGE_LABEL[id];
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={stageFilter === id}
                className={[
                  styles['filterChip'],
                  stageFilter === id && styles['filterChipActive'],
                ].filter(Boolean).join(' ')}
                onClick={() => setStageFilter(id)}
              >
                <span>{labelStr}</span>
                <span className={styles['filterCount']}>{counts[id]}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className={styles['scroll']}>
        {rows.length === 0 ? (
          <div className={styles['emptyState']}>
            <Inbox size={28} aria-hidden="true" />
            <p>No {stageFilter === 'open' ? 'open' : ''} requests.</p>
            <p className={styles['emptyHint']}>
              {stageFilter === 'open'
                ? 'When a request is submitted it lands here for approval.'
                : 'Try a different stage filter.'}
            </p>
          </div>
        ) : (
          <table className={styles['table']} role="grid" aria-label="Pending requests">
            <thead>
              <tr>
                <th scope="col">Request</th>
                <th scope="col">When</th>
                <th scope="col">Requester</th>
                <th scope="col">Resource</th>
                <th scope="col">Stage</th>
                <th scope="col" className={styles['actionCol']}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ ev, stage }) => {
                const evId = String(ev.id ?? '');
                const startDate = toDate(ev.start);
                const endDate   = toDate(ev.end);
                const whenLabel = startDate
                  ? endDate && endDate.getTime() !== startDate.getTime()
                    ? `${format(startDate, 'EEE MMM d, h:mm a')} – ${format(endDate, 'h:mm a')}`
                    : format(startDate, 'EEE MMM d, h:mm a')
                  : '—';
                const requester = readRequester(ev);
                const resourceId = ev.resource != null ? String(ev.resource) : null;
                const resourceLabel = resourceId
                  ? resolveResourceLabel?.(resourceId) ?? resourceId
                  : '—';
                const lifecycle = lifecycleFromApprovalStage(stage.stage);
                const actions = allowedActionsFor(stage.stage, approvalsConfig);
                const hasActions = actions.length > 0 && !!onApprovalAction;
                const isMenuOpen = actionMenu?.eventId === evId;

                return (
                  <tr
                    key={evId}
                    data-stage={stage.stage}
                    className={styles['row']}
                  >
                    <td>
                      <button
                        type="button"
                        className={styles['titleCell']}
                        onClick={() => onEventClick?.(ev)}
                      >
                        <span className={styles['eventTitle']}>{ev.title ?? '(untitled request)'}</span>
                        {ev.category && (
                          <span className={styles['eventCategory']}>{ev.category}</span>
                        )}
                      </button>
                    </td>
                    <td>
                      <div className={styles['cellWithIcon']}>
                        <Clock size={11} aria-hidden="true" />
                        <span>{whenLabel}</span>
                      </div>
                    </td>
                    <td>
                      <div className={styles['cellWithIcon']}>
                        <User size={11} aria-hidden="true" />
                        <span>{requester ?? '—'}</span>
                      </div>
                    </td>
                    <td>{resourceLabel}</td>
                    <td>
                      <div className={styles['stageCell']}>
                        <span
                          className={[styles['stagePill'], styles[`stage_${stage.stage}`]].join(' ')}
                          title={`Stage: ${STAGE_LABEL[stage.stage]}`}
                        >
                          {STAGE_LABEL[stage.stage]}
                        </span>
                        {lifecycle && (
                          <EventStatusBadge lifecycle={lifecycle} />
                        )}
                      </div>
                    </td>
                    <td className={styles['actionCol']}>
                      {hasActions && (stage.stage === 'requested' || stage.stage === 'pending_higher')
                        ? (
                          <div className={styles['actionGroup']}>
                            {actions.includes('approve') && (
                              <button
                                type="button"
                                className={[styles['actionBtn'], styles['actionApprove']].join(' ')}
                                onClick={() => onApprovalAction!(ev, 'approve')}
                                title="Approve request"
                              >
                                <CheckCircle2 size={12} aria-hidden="true" />
                                <span>Approve</span>
                              </button>
                            )}
                            {actions.includes('deny') && (
                              <button
                                type="button"
                                className={[styles['actionBtn'], styles['actionDeny']].join(' ')}
                                onClick={() => {
                                  // Deny requires a reason — collect it inline so the
                                  // queue stays a one-click flow without a custom
                                  // dialog. Hosts can intercept onApprovalAction to
                                  // route through their own UI if they prefer.
                                  const reason = window.prompt('Reason for denial:');
                                  if (!reason || !reason.trim()) return;
                                  Promise.resolve(
                                    onApprovalAction!({
                                      ...ev,
                                      meta: {
                                        ...(ev.meta ?? {}),
                                        __denyReason: reason.trim(),
                                      },
                                    }, 'deny'),
                                  ).catch(() => { /* host surfaces its own errors */ });
                                }}
                                title="Deny request"
                              >
                                <XCircle size={12} aria-hidden="true" />
                                <span>Deny</span>
                              </button>
                            )}
                            {actions.length > 2 && (
                              <button
                                type="button"
                                className={styles['moreBtn']}
                                aria-haspopup="menu"
                                aria-expanded={isMenuOpen}
                                onClick={(e) => {
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  setActionMenu(isMenuOpen
                                    ? null
                                    : { eventId: evId, stage: stage.stage, anchorRect: rect });
                                }}
                                title="More actions"
                              >
                                <ChevronDown size={12} aria-hidden="true" />
                              </button>
                            )}
                          </div>
                        )
                        : hasActions
                          ? (
                            <button
                              type="button"
                              className={styles['moreBtn']}
                              aria-haspopup="menu"
                              aria-expanded={isMenuOpen}
                              onClick={(e) => {
                                const rect = e.currentTarget.getBoundingClientRect();
                                setActionMenu(isMenuOpen
                                  ? null
                                  : { eventId: evId, stage: stage.stage, anchorRect: rect });
                              }}
                            >
                              <span>Actions</span>
                              <ChevronDown size={12} aria-hidden="true" />
                            </button>
                          )
                          : <span className={styles['actionMuted']}>—</span>
                      }
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {actionMenu && menuAnchorStyle && (
        <div style={menuAnchorStyle}>
          <ApprovalActionMenu
            stage={actionMenu.stage}
            approvalsConfig={approvalsConfig}
            anchorRect={actionMenu.anchorRect}
            onAction={(action: string) => {
              const target = events.find(e => String(e.id ?? '') === actionMenu.eventId);
              if (target) onApprovalAction?.(target, action);
              setActionMenu(null);
            }}
            onClose={() => setActionMenu(null)}
          />
        </div>
      )}
    </div>
  );
}
