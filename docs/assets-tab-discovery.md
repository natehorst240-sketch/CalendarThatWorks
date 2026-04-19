# Assets Tab — Phase 0 Discovery

## Context

The Assets Tab is a proposed sixth view on WorksCalendar: a Gantt/resource timeline that shows "what is this asset doing right now?" Each asset occupies a horizontal lane; time flows left-to-right; pill bars span request date ranges. The view ships with a pluggable `LocationProvider` (so host apps can wire SkyRouter, Samsara, or custom telemetry into a per-asset live banner) and a 5-state request/approval workflow (Requested → Approved → Finalized, with Pending-Higher and Denied branches).

**Phase 0 goal.** Resolve the open design questions and pin down the TypeScript contracts before any view code is written. Recent merges on `feature/calendar_v2` already shipped multi-level grouping, a sort engine, schema-driven filters, and saved-view persistence — this discovery focuses on what's left: approval shape, LocationProvider lifecycle, conflict-check contract, categories config, and UX edges (overflow, denied pills, mobile, perf).

**Status.** Decisions captured; contracts drafted; ready for Phase 1 kickoff.

---

## Decisions

| # | Question | Decision | Rationale |
|---|---|---|---|
| 1 | Workflow shape | **`meta.approvalStage` field** | Zero breakage for existing hosts. `EventStatus` stays `confirmed`/`tentative`/`cancelled`; Assets view reads `meta.approvalStage`; other views ignore it. |
| 2 | LocationProvider v1 interface | **Polling + optional subscribe** | Polling is required (covers ManualLocationProvider and HTTP adapters); `subscribe?` is optional for push-capable adapters (Samsara). No breaking change needed later. |
| 3 | Pill overflow | **Auto-grow up to N, then `+more` badge** | Stack lanes up to configurable cap (default 4). Overflow opens a detail drawer for that time window. Keeps row heights predictable; detail on demand. |
| 4 | Denied pills | **Visible, faded, clickable → audit drawer** | Strikethrough + opacity ~0.4, stays in lane layout, click opens read-only audit detail (who denied, when, reason). Preserves institutional memory. |
| 5 | Mobile | **Responsive squish — keep Gantt layout** | Horizontal scroll stays; sticky column narrows; zoom defaults to Day. Documented known-tight UX on small screens; no fallback view. |
| 6 | Zoom floor (pill min-width) | **Deferred to Figma / visual QA** | Low-stakes visual decision; resolve during Phase 1 mockup review. Default starting point: 24px min, colored dot below that. |
| 7 | Performance budget (MVP) | **200 assets × ~2k requests × Quarter span** | Matches TimelineView's current virtualization envelope. No new perf work for MVP; re-evaluate for enterprise tier. |
| 8 | Categories config surface | **New "Categories" section in ConfigPanel** | Owner-configurable via existing ConfigPanel UI (alongside Theme/Feeds/SmartViews). Stored in calendar config; shared across views. Matches current pattern. |

---

## TypeScript Contracts

These are the canonical type shapes for Phase 1. On approval, they migrate into `src/types/assets.ts` and get re-exported from `src/index.d.ts`.

### 1. `ApprovalStage` — the 5-state workflow on `meta`

```ts
/**
 * Assets Tab approval workflow — lives at event.meta.approvalStage.
 * The existing event.status field is untouched. Views other than Assets
 * render events using status; Assets view reads approvalStage and falls
 * back to status when approvalStage is absent.
 */
export type ApprovalStageId =
  | 'requested'         // Translucent pill, "REQUESTED" label
  | 'approved'          // Solid pill (1 of 2 approvals), title as-is
  | 'finalized'         // Solid pill (2 of 2), "FINALIZED" label
  | 'pending_higher'    // Translucent + dashed border, split-decision tier-2
  | 'denied';           // Strikethrough + faded; stays visible; click → audit

export interface ApprovalStage {
  stage: ApprovalStageId;
  /** ISO timestamp of the most recent stage transition. */
  updatedAt: string;
  /**
   * Ordered audit trail. Host app appends; calendar renders in the detail
   * drawer. Calendar never mutates this array — it's read-only from the
   * view's perspective.
   */
  history: ApprovalHistoryEntry[];
  /**
   * Optional denormalized counts for fast pill rendering. Host may populate
   * to avoid scanning history on every render. Calendar recomputes from
   * history if absent.
   */
  counts?: {
    approvals: number;
    denials: number;
    requiredApprovals: number; // e.g. 2 for IHC two-tier
  };
}

export interface ApprovalHistoryEntry {
  /** 'submit' | 'approve' | 'deny' | 'downgrade' | 'finalize' */
  action: 'submit' | 'approve' | 'deny' | 'downgrade' | 'finalize';
  /** ISO timestamp. */
  at: string;
  /** Actor display name or id. Optional — host may redact. */
  actor?: string;
  /** Approval tier (1 or 2 for IHC-style; undefined for single-tier hosts). */
  tier?: number;
  /** Free-text rationale. Required on 'deny'; optional otherwise. */
  reason?: string;
}
```

**Host contract:** Calendar emits `onApprovalAction(event, action, payload)`; host mutates `meta.approvalStage` and echoes the updated event back via its normal save path. Calendar never writes `meta.approvalStage` itself.

---

### 2. `LocationProvider` — swappable live-location plugin

```ts
/**
 * Live per-asset location data. Rendered in the sticky-column banner.
 * Host can override the banner via a render prop; default renders `text`.
 */
export interface LocationData {
  /** Human-readable location string (e.g. "KPHX", "Depot 3", "In transit"). */
  text: string;
  /** Optional structured coordinates for hosts that want a map link. */
  coords?: { lat: number; lon: number };
  /** ISO timestamp — used to show staleness in the banner. */
  asOf: string;
  /** Provider-specific status flag — 'live' | 'stale' | 'unknown' | 'error'. */
  status: 'live' | 'stale' | 'unknown' | 'error';
  /** Optional provider-specific metadata (speed, heading, battery, etc). */
  meta?: Record<string, unknown>;
}

/**
 * LocationProvider — implemented by integrators (SkyRouter, Samsara,
 * custom HTTP, Manual). Shipped default is ManualLocationProvider which
 * reads from event metadata and never polls.
 *
 * Polling (fetchLocation + refreshIntervalMs) is required.
 * Subscribe (push updates) is optional for providers that support it.
 * Calendar uses subscribe when available and skips polling for that
 * resource; otherwise it polls at refreshIntervalMs.
 */
export interface LocationProvider {
  /** Stable id used for logs and debugging. */
  readonly id: string;

  /**
   * One-shot fetch for a single resource. Called on mount, on resource
   * visibility change, and on the polling interval when subscribe is
   * unavailable for this resource.
   */
  fetchLocation(resourceId: string, signal?: AbortSignal): Promise<LocationData>;

  /**
   * Polling cadence in ms. Applied per-resource when subscribe is
   * unavailable. Calendar clamps to a safe minimum (default 5000ms).
   */
  readonly refreshIntervalMs: number;

  /**
   * Optional push-update channel. When present, calendar calls
   * subscribe(resourceId, cb) instead of polling that resource. The
   * returned function must unsubscribe cleanly.
   */
  subscribe?(
    resourceId: string,
    onUpdate: (data: LocationData) => void
  ): () => void;

  /**
   * Optional lifecycle hook called once per provider instance when the
   * Assets view mounts. Use for auth handshakes, socket connection, etc.
   */
  init?(): Promise<void>;

  /**
   * Optional cleanup hook called on unmount or provider swap.
   */
  dispose?(): void;
}

/**
 * Default manual provider. Reads location from
 * event.meta.location (a LocationData object) or resource.meta.location.
 * No network. No polling. Returns status: 'unknown' if absent.
 */
export interface ManualLocationProviderOptions {
  /** Override the meta key location data is read from. Default 'location'. */
  metaKey?: string;
}
```

**Host contract:** Host passes a `LocationProvider` instance via the `locationProvider?` prop on WorksCalendar. If absent, calendar constructs `ManualLocationProvider` internally. Host can override the banner render via `renderAssetLocation?: (data: LocationData, resource: EngineResource) => ReactNode`.

---

### 3. `ConflictCheckResult` — submit-flow conflict contract

```ts
/**
 * Payload the host receives when the user submits a new request from the
 * Assets view. Host runs its own conflict query (DB, business rules,
 * overlapping approvals, etc) and returns ConflictCheckResult.
 */
export interface ConflictCheckRequest {
  resourceId: string;
  start: string;           // ISO
  end: string;             // ISO
  category: string;        // matches CategoriesConfig.categories[].id
  /** The draft event as it would be submitted (id may be absent). */
  draft: Omit<WorksCalendarEvent, 'id'> & { id?: string };
  /** Actor id/name for audit purposes. Host may ignore. */
  requestedBy?: string;
}

/**
 * Response the host returns to the calendar. If hasConflict is true,
 * calendar shows the ConflictModal with `conflicts` rendered in the body
 * and `actions` as the button row. User can confirm to submit anyway
 * (fires onRequestSubmit a second time with `force: true`).
 */
export interface ConflictCheckResult {
  hasConflict: boolean;
  /**
   * Conflicting events — calendar renders these in the modal. Minimal
   * fields; host may include additional meta for richer rendering via
   * the optional renderConflictBody render prop.
   */
  conflicts: ConflictingEvent[];
  /**
   * Optional warning-level messages that don't block submission but are
   * surfaced in the modal (e.g. "Resource is in scheduled maintenance").
   */
  warnings?: string[];
  /**
   * Optional action overrides. Defaults are Cancel + "Submit Anyway".
   * Host may suppress "Submit Anyway" for hard conflicts.
   */
  actions?: Array<{
    id: 'cancel' | 'force_submit' | string;
    label: string;
    variant?: 'primary' | 'danger' | 'secondary';
    /** If true, this action suppresses the submit (host-owned workflow). */
    cancelSubmit?: boolean;
  }>;
}

export interface ConflictingEvent {
  id: string;
  title: string;
  start: string;           // ISO
  end: string;             // ISO
  requestedBy?: string;
  stage?: ApprovalStageId;
  /** Resource id this conflict belongs to — may differ from draft's. */
  resourceId?: string;
}
```

**Host contract:** Calendar calls `onConflictCheck(request): Promise<ConflictCheckResult>` when the Submit form is submitted. No result → treat as no conflict. If `hasConflict`, calendar shows the modal; on user confirmation, calendar calls `onRequestSubmit(draft, { force: true })`.

---

### 4. `CategoriesConfig` — owner-configured categories

```ts
/**
 * Category definition. Owner configures via ConfigPanel → Categories tab.
 * Stored in calendar config (same persistence path as themes/feeds).
 * Categories drive pill hue on the Assets view and appear as a filter
 * dimension across all views.
 */
export interface CategoryDef {
  /** Stable id. Referenced by event.category. */
  id: string;
  /** Display label. */
  label: string;
  /** Hex color — drives pill hue. Required; ConfigPanel enforces. */
  color: string;
  /** Optional short description for the ConfigPanel and tooltips. */
  description?: string;
  /**
   * Optional — approver routing hint for the host app. Calendar does not
   * use this; it's passed through to onApprovalAction payloads.
   */
  approvalTier?: 1 | 2;
  /** Disabled categories stay in historical data but can't be selected new. */
  disabled?: boolean;
}

export interface CategoriesConfig {
  /** Ordered category list. Order drives legend + filter dropdown order. */
  categories: CategoryDef[];
  /**
   * Fallback category applied when event.category is unset or unknown.
   * Defaults to the first enabled category.
   */
  defaultCategoryId?: string;
  /**
   * Render style in pill: 'hue' (full fill) | 'stripe' (left edge) |
   * 'border' (thin border only). Default 'hue'.
   */
  pillStyle?: 'hue' | 'stripe' | 'border';
}

/**
 * Defaults shipped for aviation/ops use cases. Owners start from these
 * and edit via ConfigPanel. Categories are not per-view; they're
 * calendar-wide.
 */
export const DEFAULT_CATEGORIES: CategoryDef[] /* = [
  { id: 'training',    label: 'Training',    color: '#4C9AFF' },
  { id: 'pr',          label: 'PR',          color: '#9F7AEA' },
  { id: 'maintenance', label: 'Maintenance', color: '#F59E0B' },
  { id: 'coverage',    label: 'Coverage',    color: '#10B981' },
  { id: 'other',       label: 'Other',       color: '#6B7280' },
] */;
```

**Host contract:** Host passes `categoriesConfig?` via `onConfigSave()` payload like any other config section. Calendar reads from normalized config. If absent, calendar uses `DEFAULT_CATEGORIES`.

---

### 5. Extensions to existing exports (Phase 1 additions)

These are small extensions to types already shipped — they need to happen during Phase 1 Task 1, not Phase 2+.

```ts
// src/index.d.ts

// Add 'assets' to ViewType union
export type ViewType =
  | 'month' | 'week' | 'day' | 'agenda' | 'schedule' | 'timeline' | 'assets';

// Extend SavedView with the two Assets-view axes
export interface SavedView {
  // ...existing fields...
  groupBy: string | null;
  sortBy?: SortConfig[];        // NEW — multi-field sort persistence
  zoomLevel?: AssetsZoomLevel;  // NEW — only applied on Assets view
}

export type AssetsZoomLevel = 'day' | 'week' | 'month' | 'quarter';

// New props on WorksCalendar
export interface WorksCalendarProps {
  // ...existing props...
  locationProvider?: LocationProvider;
  categoriesConfig?: CategoriesConfig;
  onConflictCheck?: (request: ConflictCheckRequest) => Promise<ConflictCheckResult>;
  onApprovalAction?: (
    event: NormalizedEvent,
    action: ApprovalHistoryEntry['action'],
    payload?: { tier?: number; reason?: string }
  ) => void;
  renderAssetLocation?: (data: LocationData, resource: EngineResource) => React.ReactNode;
  renderConflictBody?: (result: ConflictCheckResult) => React.ReactNode;
}
```

---

## Reuse Inventory (unchanged from Phase 0 planning)

| Proposal Item | Existing Primitive | File |
|---|---|---|
| Row virtualization, sticky column, lane stacking | TimelineView internals (`assignLanes`, `rowOffsets`) | `src/views/TimelineView.jsx` |
| Collapsible grouping (up to 3 levels) | `useGrouping`, `groupRows`, group header rendering | `src/hooks/useGrouping.ts`, `src/grouping/groupRows.js` |
| Schema-driven filters | `DEFAULT_FILTER_SCHEMA`, `statusField`, `metaSelectField` | `src/filters/filterSchema.ts` |
| Saved presets with groupBy persistence | `useSavedViews` (extend with `sortBy` + `zoomLevel`) | `src/hooks/useSavedViews.*` |
| Multi-field sort tiebreakers | `sortEvents()` | `src/core/sortEngine.ts` |
| Resource model | `EngineResource` | `src/core/engine/schema/resourceSchema.ts` |
| Conflict detection primitives | `detectShiftConflicts()` (reference pattern) | `src/core/scheduleOverlap.js` |
| Config UI surface | `ConfigPanel` — add new "Categories" tab | `src/ui/ConfigPanel.jsx` |
| Theme tokens | Existing CSS vars — add `--pill-opacity-translucent`, `--pill-border-dashed` | `src/styles/tokens.css` |

---

## Open Items Deferred to Phase 1 Figma Review

1. **Pill min-width at Quarter zoom.** Default 24px with colored-dot fallback; confirm in mockups.
2. **Audit drawer layout.** Position (right-side slide, modal, or hover card), fields shown, action buttons (none? "re-open request"?).
3. **`+more` overflow badge interaction.** Click opens a time-windowed detail drawer; confirm shape.
4. **ConfigPanel Categories tab layout.** Drag-to-reorder, color picker style, approvalTier UI.
5. **Mobile squish thresholds.** Sticky column width at 320/480/768px; which controls hide first.

---

## Phase 1 Kickoff Checklist

- [ ] This document reviewed and signed off.
- [ ] Migrate contracts from this doc into `src/types/assets.ts` (new file).
- [ ] Extend `src/index.d.ts` with `ViewType += 'assets'`, `SavedView.sortBy` + `zoomLevel`, new WorksCalendarProps.
- [ ] Extend `normalizeSavedView()` to persist `sortBy` and `zoomLevel`.
- [ ] Add `{ id: 'assets', label: 'Assets' }` to `VIEWS` in `src/WorksCalendar.tsx:64`.
- [ ] Scaffold `src/views/AssetsView.jsx` (clone TimelineView skeleton).
- [ ] Scaffold `src/providers/ManualLocationProvider.ts`.
- [ ] Scaffold `src/ui/ConfigPanel.jsx` Categories tab.
- [ ] Figma mockups for the 5 deferred visual items above.

---

## Verification (discovery itself)

- Contracts compile in isolation: `tsc --noEmit docs/assets-tab-discovery.md` (after extraction to `src/types/assets.ts`).
- No runtime code added; no existing tests affected.
- Phase 1 sprint plan can reference these contracts without further clarification cycles.
