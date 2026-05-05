# Works Calendar — Data Flow Diagrams

Three levels of DFD covering the full library. Context (Level 0) → subsystems
(Level 1) → internals of the four most complex subsystems (Level 2).

> **Architecture status**: Diagrams below reflect the **target architecture**
> after the three-sprint refactor (see CHANGELOG `[Unreleased]`). The key
> structural changes from the audit:
> - `CalendarEngine` is now the **sole** source of truth for view, cursor, and
>   base filter state. The legacy `useCalendar` hook and its parallel state are gone.
> - `useCalendarEngine` owns engine setup, undo/redo, and all mutation handlers —
>   `WorksCalendar.tsx` is now a pure UI shell.
> - `useOccurrences` deleted; all views use the engine's `getOccurrencesInRange`
>   read path exclusively.
> - `CalendarContextValue` is fully typed — no more `[key: string]: any` escape hatch.

---

## Level 0 — Context Diagram

The library as a single process interacting with the world.

```
┌─────────────────┐        raw events / config        ┌───────────────────────────┐
│   Host App      │ ────────────────────────────────► │                           │
│  (React tree)   │                                    │     WORKS CALENDAR        │
│                 │ ◄──────────────────────────────── │      LIBRARY              │
│                 │   rendered views / callbacks       │                           │
└─────────────────┘                                    └──────────┬────────────────┘
                                                                  │
                    ┌─────────────────────────────────────────────┤
                    ▼                                             ▼
         ┌──────────────────┐                       ┌────────────────────────┐
         │  Remote Data     │                       │  Browser Storage       │
         │  Source          │                       │  (localStorage)        │
         │  (REST / WS /    │                       │  • config.json         │
         │   Supabase / ICS)│                       │  • resource pools      │
         └──────────────────┘                       │  • profile / theme     │
                                                    └────────────────────────┘
                    ▼
         ┌──────────────────┐
         │  External        │
         │  Channels        │
         │  (Slack / email  │
         │   / webhooks)    │
         └──────────────────┘
```

**External entities**

| Entity | Data In | Data Out |
|---|---|---|
| Host App | `events[]`, `config`, adapter, filter schema, slot renderers | `visibleEvents[]`, callbacks (onClick, onSave, onDelete, onModeChange) |
| Remote Data Source | Adapter pull results (loadRange) or push (subscribe) | CRUD operations from SyncManager |
| Browser Storage | — | Persisted config, pools, profile, saved views |
| External Channels | — | Booking lifecycle notifications (approve, deny, cancel) |

---

## Level 1 — Subsystem Diagram

Seven major subsystems inside the library and the data flows between them.

```
                         ┌──────────────────────────────────────────────────────────────┐
                         │                    WORKS CALENDAR LIBRARY                    │
                         │                                                              │
  rawEvents[]  ─────────►│  ┌──────────────┐    EngineEvents     ┌──────────────────┐  │
  config       ─────────►│  │  1. ADAPTER  │ ─────────────────► │   2. CALENDAR    │  │
  adapter      ─────────►│  │   LAYER      │                     │     ENGINE       │  │
                         │  │              │ ◄───────────────── │                  │  │
                         │  │ RestAdapter  │   CRUD operations   │  CalendarState   │  │
                         │  │ WsAdapter    │                     │  (events Map,    │  │
                         │  │ SupabaseAdpt │                     │   assignments,   │  │
                         │  │ ICSAdapter   │                     │   deps, pools,   │  │
                         │  │ SyncManager  │                     │   filter, view,  │  │
                         │  └──────────────┘                     │   cursor)        │  │
                         │         │                             └────────┬─────────┘  │
                         │         │ AdapterChange                        │             │
                         │         ▼                                      │ CalendarState│
                         │  ┌──────────────┐                              │             │
                         │  │  EventBus    │                              ▼             │
                         │  │  (lifecycle  │                     ┌──────────────────┐  │
                         │  │   channels)  │                     │  3. OCCURRENCE   │  │
                         │  └──────┬───────┘                     │     EXPANSION    │  │
                         │         │                             │                  │  │
                         │         │ booking.*/assignment.*      │  expandOccurrences│ │
                         │         ▼                             │  (rrule → dates) │  │
                         │  ┌──────────────┐                     │                  │  │
                         │  │  External    │                     └────────┬─────────┘  │
                         │  │  Channels    │                              │             │
                         │  │  Slack/email │                              │ occurrences[]│
                         │  │  /webhooks   │                              ▼             │
                         │  └──────────────┘                     ┌──────────────────┐  │
                         │                                        │  4. FILTER &     │  │
  filterSchema ─────────►│                                        │     GROUPING     │  │
  filterState  ─────────►│                                        │                  │  │
                         │                                        │  filterEngine    │  │
                         │                                        │  conditionEngine │  │
                         │                                        │  groupRows       │  │
                         │                                        │  sortEngine      │  │
                         │                                        └────────┬─────────┘  │
                         │                                                 │             │
                         │                                                 │ visibleEvents│
                         │                                                 ▼             │
                         │  ┌──────────────┐                     ┌──────────────────┐  │
                         │  │  6. WORKFLOW │                     │   5. VIEW LAYER  │  │
                         │  │  & APPROVALS │ ◄─── transitions ──│                  │  │
                         │  │              │ ──── emit events ──►│  MonthView       │  │
                         │  │  WorkflowDSL │                     │  WeekView / Day  │  │
                         │  │  transitions │                     │  ScheduleView    │  │
                         │  │  auditChain  │                     │  AgendaView      │  │
                         │  │  holdRegistry│                     │  MapView         │  │
                         │  └──────────────┘                     │  AssetsView      │  │
                         │                                        │  DispatchView    │  │
  config.json  ─────────►│  ┌──────────────┐                     └──────────────────┘  │
  localStorage ◄─────────│  │  7. CONFIG & │                              │             │
                         │  │  PERSISTENCE │                              │ user actions │
                         │  │              │                              ▼             │
                         │  │  parseConfig │                     ┌──────────────────┐  │
                         │  │  profileStore│                     │  UI / FORMS      │  │
                         │  │  poolStore   │                     │  EventForm       │  │
                         │  │  savedViews  │ ─ config/theme ────►│  FilterBar       │  │
                         │  │  themeSystem │◄─ settings writes ──│  WorkflowBuilder │  │
                         │  └──────────────┘                     │  ConfigPanel     │  │
                         │                                        │  ExportButtons   │  │
                         │                                        └──────────────────┘  │
                         └──────────────────────────────────────────────────────────────┘
```

### Subsystem summary

| # | Subsystem | Key inputs | Key outputs |
|---|---|---|---|
| 1 | Adapter Layer | Remote events, config | `CalendarEventV1[]`, `AdapterChange` stream |
| 2 | Calendar Engine | `EngineOperation`, config | `CalendarState`, `OperationResult`, lifecycle emits |
| 3 | Occurrence Expansion | `EngineEvent[]`, date range | `EngineOccurrence[]` (rrule-expanded) |
| 4 | Filter & Grouping | Occurrences, filter state, schema | `visibleEvents[]`, grouped rows |
| 5 | View Layer | `visibleEvents[]`, cursor, view type | Rendered calendar; user event callbacks |
| 6 | Workflow & Approvals | Transition actions, workflow DSL | Updated `ApprovalStage`, audit trail, channel emits |
| 7 | Config & Persistence | `config.json`, localStorage | Parsed config, themes, pools, profile |

---

## Level 2 — Subsystem Internals

Detailed flows for all major subsystems: engine (2a), occurrence/filter (2b), adapter/sync (2c), workflow/approvals (2d), view layer (2e), config/persistence (2f), conflict engine (2g), requirements engine (2h), geo conflicts (2i), pool query DSL (2j).

---

### 2a — Calendar Engine + Orchestration Hook (Subsystems 1 + 2, post-Sprint-2/3)

```
  EngineOperation
  (type, eventId,
   newStart/End,        ┌─────────────────────────────────────────────────┐
   resource, meta)      │             CALENDAR ENGINE                     │
  ──────────────────── ►│                                                 │
                        │  resolvePoolOnSubmit()                          │
                        │    If op.resourcePoolId is set:                 │
                        │      scan pool members, pick next via strategy  │
                        │      rewrite op with concrete resourceId        │
                        │      prepare poolUpdate (cursor advance)        │
                        │                       │                         │
                        │                       ▼                         │
                        │  validateOperation()  ──► validateConstraints() │
                        │      ├── validateEvent()      (hard: reject)    │
                        │      ├── validateOverlap()    (hard)            │
                        │      ├── validateDependencies() (hard)          │
                        │      ├── validateWorkingHours() (soft: warn)    │
                        │      └── validateEventConstraints() (configurable)│
                        │                       │                         │
                        │              hard violation?                    │
                        │               YES ──► OperationResult{rejected} │
                        │               NO      │                         │
                        │              soft violation without override?   │
                        │               YES ──► OperationResult{pending-  │
                        │                       confirmation}             │
                        │               NO      │                         │
                        │                       ▼                         │
                        │  resolveOperationScope()                        │
                        │    (this-only / this+future / all-in-series)   │
                        │                       │                         │
                        │                       ▼                         │
                        │  buildOperation() + applyOperation()            │
                        │    → EventChange[]                              │
                        │      {created | updated | deleted}              │
                        │                       │                         │
                        │                       ▼                         │
                        │  beginTransaction() / commitTransaction()       │
                        │    new Map<id, EngineEvent> (immutable swap)    │
                        │    atomic pool cursor advance                   │
                        │                       │                         │
                        │                       ▼                         │
                        │  _emitBookingLifecycle()                        │
                        │    EventBus.emit(booking.requested | approved   │
                        │               | denied | cancelled | completed) │
                        │                       │                         │
                        │                       ▼                         │
                        │  _notify() → all StateListeners                 │
                        └─────────────────────────────────────────────────┘
                                               │
                    ┌──────────────────────────┼─────────────────────────┐
                    ▼                          ▼                         ▼
            OperationResult            CalendarState              EventBus payload
            {status,                   (new events Map,           → adapters (Slack,
             violations,               pools, same cursor)          email, webhooks)
             changes}

  UndoRedoManager wraps the engine:
    snapshot() before each mutation → TransactionHandle
    rollbackTo(handle) on Ctrl+Z  → restores events + pools
    re-apply stack on Ctrl+Y
```

---

### 2b — Occurrence Expansion & Filtering (Subsystems 3 + 4)

```
  CalendarState.events   cursor / view type
  (Map<id, EngineEvent>) (month | week | day | schedule …)
         │                        │
         └──────────┬─────────────┘
                    ▼
       getOccurrencesInRange(rangeStart, rangeEnd)
         │
         ├── For each EngineEvent:
         │     Non-recurring → pass through if overlaps range
         │     Has rrule     → expandRRule(start, rrule, exdates, range±7d)
         │                     → Date[] → EngineOccurrence[]
         │                     max 500 occurrences per series (guard)
         │
         ▼
       EngineOccurrence[]   (id, seriesId, start, end, title, resource, …)
         │
         ▼
  ┌────────────────────────────────────────────────────────┐
  │                  FILTER PIPELINE                       │
  │                                                        │
  │  applyFilters(occurrences, filterState, schema)        │
  │                                                        │
  │  For each FilterField in schema:                       │
  │    text / search  → title + category + resource match  │
  │    date-range     → isWithinInterval check             │
  │    multi-select   → Set membership (categories,        │
  │                     resources, sources)                │
  │    custom         → field.predicate(item, value)       │
  │                                                        │
  │  conditionEngine (AdvancedFilterBuilder):              │
  │    evaluates AND/OR condition trees against event      │
  │    meta fields using operators (eq, gt, contains, …)  │
  │                                                        │
  └───────────────────────┬────────────────────────────────┘
                          │
                          ▼
                  filtered events[]
                          │
                          ▼
  ┌────────────────────────────────────────────────────────┐
  │               GROUPING + SORT PIPELINE                 │
  │                                                        │
  │  sortEvents(events, sortConfig)                        │
  │    → stable sort by field asc/desc                     │
  │                                                        │
  │  groupRows(events, groupByConfig)                      │
  │    buildFieldAccessor(field) → value extractor         │
  │    group by 1–3 levels (category, resource, date, …)  │
  │    → GroupRow[] with children and header labels        │
  │                                                        │
  └───────────────────────┬────────────────────────────────┘
                          │
                          ▼
              grouped / sorted visibleEvents[]
              passed to active View component
```

---

### 2c — Adapter Layer & Sync (Subsystem 1)

```
  CalendarAdapter (interface)
  ┌────────────────────────────────────────────────────────────────┐
  │                                                                │
  │  Implementations:                                              │
  │  ┌────────────┐  ┌────────────┐  ┌───────────┐  ┌──────────┐│
  │  │RestAdapter │  │WsAdapter   │  │Supabase   │  │ICSAdapter││
  │  │loadRange() │  │subscribe() │  │Adapter    │  │importFeed││
  │  │createEvent │  │(WebSocket) │  │(realtime  │  │parseICS()││
  │  │updateEvent │  │            │  │ channel)  │  │          ││
  │  │deleteEvent │  │            │  │           │  │          ││
  │  └────────────┘  └────────────┘  └───────────┘  └──────────┘│
  └──────────────────────────┬─────────────────────────────────────┘
                             │ CalendarEventV1[]
                             ▼
  ┌──────────────────────────────────────────────────────────────┐
  │                      SYNC MANAGER                            │
  │                                                              │
  │  loadRange(start, end)                                       │
  │    → adapter.loadRange() → merge into events Map            │
  │                                                              │
  │  createEvent(ev) / updateEvent(id, patch) / deleteEvent(id) │
  │    1. Apply optimistically to local events Map               │
  │    2. Enqueue to SyncQueue (status: 'pending')               │
  │    3. Notify subscribers                                     │
  │    4. Call adapter in background                             │
  │       ✓ success → mark 'synced', replace with server copy   │
  │       ✗ conflict → conflictResolver(local, server)          │
  │          • 'server-wins' | 'client-wins' | 'latest-wins'    │
  │          • 'manual' → onConflict callback (UI modal)         │
  │       ✗ error → mark 'error', call onError, keep rollback   │
  │                  retry up to maxRetries with exp. backoff     │
  │                                                              │
  │  connectLive()                                               │
  │    → adapter.subscribe(AdapterChangeCallback)                │
  │    → insert/update/delete patched into local Map             │
  │    → reload replaces full Map                                │
  │                                                              │
  └──────────────────────────┬───────────────────────────────────┘
                             │ SyncState
                             │ { events: Map, syncStatuses: Map,
                             │   isSyncing, conflicts }
                             ▼
                     useSyncedCalendar hook
                     (React wrapper around SyncManager)
```

---

### 2d — Workflow & Approval System (Subsystem 6)

```
  User action         Workflow DSL        ApprovalStage
  (approve / deny /   (Workflow JSON)     (from event.meta)
   cancel / timeout)
        │                   │                   │
        └───────────────────┼───────────────────┘
                            ▼
  ┌─────────────────────────────────────────────────────────────┐
  │                  transitionApproval()                       │
  │                                                             │
  │  1. legalActionsFrom(currentStage) — guard illegal jumps    │
  │     (e.g. finalized → requested is blocked)                 │
  │                                                             │
  │  2. If workflow supplied:                                   │
  │     advance(workflowInstance, action) →                     │
  │       • auto-walk condition + notify nodes                  │
  │       • stop at approval node (→ awaiting)                  │
  │         or terminal node (→ completed / denied)             │
  │       • parallel branches: per-branch approval tracking     │
  │         join releases on quorum (requireAll / requireAny /  │
  │         requireCount)                                       │
  │       → WorkflowInstance (updated)                          │
  │       → WorkflowEmitEvent[] (node_entered, action_taken,   │
  │                               outcome_set, timer_scheduled) │
  │                                                             │
  │  3. appendAuditEntry(stage, action, actor, reason)          │
  │     → SHA-256 hash chain (tamper-evident audit trail)       │
  │                                                             │
  │  4. Return TransitionResult { ok, stage, workflowInstance } │
  └────────────────────┬────────────────────────────────────────┘
                       │
         ┌─────────────┼──────────────────┐
         ▼             ▼                  ▼
  Updated          WorkflowInstance    WorkflowEmitEvent[]
  ApprovalStage    (host persists       → EventBus channels
  (host writes     to event.meta)         booking.approved
   back to event)                         booking.denied
                                          booking.cancelled
                                          → channel adapters
                                            (Slack, email,
                                             webhooks)

  useWorkflowTicker (React hook):
    setInterval → tick(instance, workflow, now)
    → auto-fires 'timeout' actions when node deadline passed
    → calls onTimeout callback for host to persist result

  HoldRegistry (booking holds):
    acquireHold(resourceId, window, holderId, ttl)
      → blocks overlapping booking attempts with soft violation
    releaseHold(holdId) → on form close / submit
    findBlockingHold() → used by conflictEngine
```

---

### 2e — View Layer (Subsystem 5)

```
  visibleEvents[]        cursor           view type
  (grouped/sorted)       (currentDate)    'month'|'week'|'day'|'schedule'
         │                    │           'agenda'|'map'|'assets'|'dispatch'
         └────────────────────┼───────────────────────┘
                              ▼
  ┌─────────────────────────────────────────────────────────────────────┐
  │                       VIEW DISPATCH                                 │
  │  switch(view) → mount matching View component                       │
  └──────┬──────────┬──────────┬───────────┬──────────┬────────────────┘
         │          │          │           │          │
         ▼          ▼          ▼           ▼          ▼
      Month       Week        Day      Schedule    Agenda    Map/Assets/
      View        View        View      View        View    Dispatch…

  ┌─────────────────────────────────────────────────────────────────────┐
  │                    SHARED LAYOUT PIPELINE                           │
  │                                                                     │
  │  computeRange(cursor, view)                                         │
  │    → rangeStart / rangeEnd for the visible window                   │
  │                                                                     │
  │  layoutOverlaps(events) / layoutSpans(events)                       │
  │    → _col, _numCols per event (pill column assignment)              │
  │    → displayEndDay (all-day span clamping to view boundary)         │
  │                                                                     │
  │  groupRows(events, groupByConfig)  [if groupBy configured]          │
  │    → GroupRow[] with header labels + children                       │
  └──────────────────────────┬──────────────────────────────────────────┘
                             │ positioned event pills
                             ▼
  ┌─────────────────────────────────────────────────────────────────────┐
  │                      EVENT PILL RENDER                              │
  │                                                                     │
  │  data-wc-event-id="{id}"  (stable DOM attribute for tooling/tours)  │
  │  aria-label with full time range  (screen reader)                   │
  │                                                                     │
  │  renderEvent(event, opts)?  → host custom renderer                  │
  │    : default → title + EventStatusBadge + ApprovalDot               │
  │                                                                     │
  │  resolveColor(event, colorRules) → pill background                  │
  │    1. colorRules[].when(event) predicate  (host-supplied)           │
  │    2. colorRules[].field/value match                                │
  │    3. category default                                              │
  └──────────────┬──────────────────────────────┬───────────────────────┘
                 │ click                         │ hover / focus
                 ▼                               ▼
  ┌──────────────────────────┐     ┌─────────────────────────────────┐
  │  onClick callback        │     │  HoverCard portal               │
  │  → host onEventClick     │     │  renderHoverCard(event)?        │
  │  or open EventForm       │     │    : default HoverCard UI       │
  └──────────────────────────┘     │  edit · delete · move buttons   │
                                   │    → engine ops via applyOp     │
                                   └─────────────────────────────────┘
  ┌─────────────────────────────────────────────────────────────────────┐
  │                       DRAG & DROP                                   │
  │                                                                     │
  │  useDrag(event)                                                     │
  │    onDragStart → snapshot original position                         │
  │    onDragOver  → highlight target cell / row                        │
  │    onDrop      → compute newStart / newEnd from drop target         │
  │                                                                     │
  │  applyEngineOp({ type: 'MOVE', eventId, newStart, newEnd })         │
  │    → applyWithRecurringCheck (prompt: this / future / all)          │
  │    → engine dispatch → validation → commit                          │
  └─────────────────────────────────────────────────────────────────────┘

  View-specific layout notes:
    MonthView    — 7-col week grid; pills capped at row height
    WeekView     — time column (00:00–24:00); overlapping pills share width
    DayView      — same as WeekView, single resource column
    ScheduleView — one row per resource; horizontal time bars
    AgendaView   — date-grouped list; multi-day events repeat per covered day
    MapView      — pins at meta.coords; renders install hint without maplibre-gl
    AssetsView   — resource-centric grid; strictAssetFiltering applied post-filter
    DispatchView — board layout with status columns
```

---

### 2f — Config & Persistence (Subsystem 7)

```
  config.json / localStorage
         │
         ▼
  ┌─────────────────────────────────────────────────────────────────────┐
  │                     CONFIG LOAD PIPELINE                            │
  │                                                                     │
  │  loadConfig(storage?)                                               │
  │    → read raw JSON from localStorage  (key: 'wc_config')           │
  │    → merge missing keys from DEFAULT_CONFIG                         │
  │                                                                     │
  │  parseConfig(raw)                                                   │
  │    → CalendarConfig typed object                                    │
  │    → ParseConfigResult { config, warnings[] }                       │
  │                                                                     │
  │  validateConfig(config)                                             │
  │    → ValidateConfigResult { issues: ConfigIssue[] }                 │
  │    → severity: 'error' | 'warning' | 'info'                        │
  │                                                                     │
  │  resolveLabels(config)                                              │
  │    → ResolvedLabels  (human-readable strings for all resource ids)  │
  │                                                                     │
  │  applyProfilePreset(config, profileId)                              │
  │    → PROFILE_PRESETS[profileId] merged onto config                  │
  │    → ProfileId: 'ems' | 'aviation' | 'construction' | …            │
  └──────────────────────────┬──────────────────────────────────────────┘
                             │ CalendarConfig
            ┌────────────────┼───────────────────┐
            ▼                ▼                   ▼
  ┌──────────────────┐  ┌────────────────┐  ┌──────────────────────┐
  │   POOL STORE     │  │  SAVED VIEWS   │  │    THEME SYSTEM      │
  │                  │  │                │  │                      │
  │  loadPools()     │  │  useSavedViews │  │  normalizeTheme(id)  │
  │    localStorage  │  │  serialize     │  │    → ThemeId         │
  │    key: wc_pools │  │  Filters()     │  │                      │
  │    → ResourcePool│  │    → compact   │  │  resolveCssTheme(id) │
  │      []          │  │      JSON str  │  │    → CSS var block   │
  │                  │  │                │  │    injected to :root │
  │  savePools(pools)│  │  deserialize   │  │                      │
  │  clearPools()    │  │  Filters()     │  │  THEMES_BY_ID[]      │
  │                  │  │    → filter    │  │    13 built-in themes│
  │  validatePools() │  │      state     │  │    ThemeMeta+preview │
  │    → integrity   │  │                │  └──────────────────────┘
  │      report      │  │  Applying a    │
  └──────────────────┘  │  saved view:   │
                        │    replace     │
                        │    Filters()   │
                        │    cal.setView │
                        │    → engine    │
                        │      sync effs │
                        └────────────────┘
  Config writes back:
    saveConfig(config) → localStorage
    ConfigPanel (UI) → onUpdate callback → host persists
```

---

### 2g — Conflict Engine

```
  EvaluateConflictsInput
  { rules: ConflictRule[]            ← host-configured rule set
    events: ConflictEvent[]          ← full event set to check against
    candidateIds: string[]           ← event IDs being validated
    businessHours?: { days, start, end }
    holds?: HoldRegistry }
         │
         ▼
  ┌─────────────────────────────────────────────────────────────────────┐
  │                      evaluateConflicts()                            │
  │                                                                     │
  │  For each ConflictRule:                                             │
  │                                                                     │
  │  ┌──────────────────────────────────────────────────────────────┐  │
  │  │  ResourceOverlapRule     — same resource, overlapping time   │  │
  │  │  CategoryMutexRule       — mutual-exclusion category pair    │  │
  │  │  MinRestRule             — minimum gap between shifts        │  │
  │  │  CapacityOverflowRule    — resource over max capacity        │  │
  │  │  OutsideBusinessHoursRule— event outside configured hours    │  │
  │  │  PolicyViolationRule     — custom predicate function         │  │
  │  │  HoldConflictRule        — overlaps a live booking hold      │  │
  │  │  AvailabilityViolationRule— event during marked unavailability│  │
  │  └──────────────────────────────────────────────────────────────┘  │
  │                                                                     │
  │  Each rule returns:                                                 │
  │    conflictingIds: string[]     (the colliding event IDs)           │
  │    severity: 'hard' | 'soft'                                        │
  │    message: string                                                  │
  └──────────────────────────┬──────────────────────────────────────────┘
                             │
                             ▼
  ConflictEvaluationResult
  { conflictingEventIds: Set<string>   ← passed to CalendarContext
    violations: ConflictViolation[] }  ← per-rule detail

  Integration points:
    CalendarEngine.validateConstraints()
      → evaluateConflicts for hard severity  → reject OperationResult
      → evaluateConflicts for soft severity  → pending-confirmation result
    WorksCalendar conflictingEventIds prop (host-side pre-evaluation)
      → passed via CalendarContext → pills render conflict overlay styling
```

---

### 2h — Requirements Engine

```
  EvaluateRequirementsInput
  { requirements: ConfigRequirement[]   ← from CalendarConfig
    event: NormalizedEvent              ← event being saved / moved
    assignedResources: string[]         ← resources currently on the event
    availableResources: ConfigResource[] }
         │
         ▼
  ┌─────────────────────────────────────────────────────────────────────┐
  │                   evaluateRequirements()                            │
  │                                                                     │
  │  For each ConfigRequirement:                                        │
  │    { id · role · minCount · maxCount                                │
  │      severity: 'blocking' | 'warning' | 'info'                     │
  │      slots: ConfigRequirementSlot[] }                               │
  │                                                                     │
  │    → count assigned resources matching role                         │
  │    → compare against minCount / maxCount                            │
  │    → produce RequirementShortfall if outside bounds                 │
  └──────────────────────────┬──────────────────────────────────────────┘
                             │
                             ▼
  RequirementsEvaluation
  { met: boolean
    shortfalls: RequirementShortfall[]
      { requirementId · role · needed · assigned · severity } }

  ┌─────────────────────────────────────────────────────────────────────┐
  │                  gateEventRequirements()                            │
  │                                                                     │
  │  Wraps evaluateRequirements for use inside the engine:              │
  │    'blocking' shortfalls → hard violation  (reject operation)       │
  │    'warning'  shortfalls → soft violation  (warn, allow override)   │
  │    'info'     shortfalls → surface in UI only, never blocks         │
  │                                                                     │
  │  Called from CalendarEngine.validateConstraints()                   │
  │    after validateOverlap(), before applyOperation()                 │
  └─────────────────────────────────────────────────────────────────────┘
```

---

### 2i — Geo Conflict Engine

```
  GeoEventInput[]
  { id · start · end · resourceId
    location: LatLon }    ← resolved via location adapter (pre-step)
         │
         ▼
  ┌─────────────────────────────────────────────────────────────────────┐
  │                   evaluateGeoConflicts()                            │
  │                                                                     │
  │  geoConflictRules: GeoConflictRule[]                                │
  │                                                                     │
  │  GeoTravelFeasibilityRule:                                          │
  │    for each consecutive event pair on the same resource:            │
  │      gap         = event2.start − event1.end   (minutes)           │
  │      dist        = haversineKm(loc1, loc2)     (km)                │
  │      speedKmh    = rule.speedKmh  (default 80 — ground travel)     │
  │      travelTime  = dist / speedKmh × 60        (minutes)           │
  │      if travelTime > gap → infeasible → violation                   │
  └──────────────────────────┬──────────────────────────────────────────┘
                             │
                             ▼
  GeoConflictViolation[]
  { ruleId · resourceId
    event1Id · event2Id
    distanceKm · gapMinutes · travelMinutes
    message }

  Location resolution (pre-step, caller's responsibility):
    attachLocations(events, adapter)
      createStaticLocationAdapter({ resourceId: LatLon })
      createMetaPathLocationAdapter('meta.coords')
      createManualLocationProvider()    ← host-managed live positions

  ⚠ Not wired into CalendarEngine.validateConstraints().
    Host calls evaluateGeoConflicts after each engine commit and passes
    violations back as conflictingEventIds or renders them inline.
    The engine has no built-in location awareness.
```

---

### 2j — Pool Query DSL

```
  ResourcePool
  { id · name · type · strategy · members: string[]
    query?: ResourceQuery }     ← optional DSL filter on top of members
         │
         ▼  (called from resolvePoolOnSubmit — see 2a)
  ┌─────────────────────────────────────────────────────────────────────┐
  │                      evaluateQuery()                                │
  │                                                                     │
  │  QueryContext                                                       │
  │  { resources: ConfigResource[]                                      │
  │    locations?: Map<id, ResourceLocation>                            │
  │    capabilities?: Map<id, string[]>                                 │
  │    requestLocation?: LatLon     ← origin for distance clauses      │
  │    now?: Date }                                                     │
  │                                                                     │
  │  ResourceQuery clauses  (AND-combined):                             │
  │  ┌───────────────────────────────────────────────────────────────┐ │
  │  │  capability: string[]    → resource has all listed caps       │ │
  │  │  role: string            → resource.role matches              │ │
  │  │  withinDistance:         → haversineKm(resource, origin) ≤ N │ │
  │  │    { km|miles, from: DistanceFrom.requestLocation            │ │
  │  │                   | DistanceFrom.fixed(LatLon) }             │ │
  │  │  availableAt: DateRange  → not booked in window              │ │
  │  │  custom: (res, ctx) => boolean                               │ │
  │  └───────────────────────────────────────────────────────────────┘ │
  └──────────────────────────┬──────────────────────────────────────────┘
                             │
                             ▼
  QueryEvaluation
  { matched: string[]            ← resource IDs passing all clauses
    excluded: QueryExclusion[]   ← { resourceId · reason · clause } }

  Back in resolvePoolOnSubmit (2a):
    matched[] filtered to pool.members intersection
    → pick next via pool.strategy:
        'round-robin' → advance pool cursor (atomic, stored in engine state)
        'random'      → Math.random() pick from matched
        'least-busy'  → count current assignments, pick minimum
    → rewrite op.resourceId = winner
    → prepare poolUpdate for commitTransaction
```

---

## Level 3 — Process Internals

Detailed decomposition of the highest-complexity processes within Level 2 subsystems: validation pipeline (3a), React subscription chain (3b), MonthView layout (3c), WeekView/DayView time grid (3d), initialization sequence (3e), undo/redo (3f), SyncQueue retry/conflict (3g).

---

### 3a — Engine Validation Pipeline (full decomposition of 2a validateConstraints)

```
  EngineOperation  (after pool resolution in resolvePoolOnSubmit)
         │
         ▼
  validateOperation(op, state, config)
         │
         ├─ 1. validateEvent(op)
         │       required fields present? (id, title, start, end)
         │       start < end?
         │       → hard violation if fails
         │
         ├─ 2. validateOverlap(op, state.events)
         │       for same resource: does new interval overlap any existing?
         │       op.eventId excluded from check (allow move to same slot)
         │       → hard violation if overlap found
         │
         ├─ 3. validateDependencies(op, state.dependencies)
         │       MOVE or DELETE:
         │         successors (via _dependenciesByFromEvent):
         │           newEnd ≤ successor.start?  → hard if violated
         │         predecessors (via _dependenciesByToEvent):
         │           predecessor.end ≤ newStart? → hard if violated
         │       O(k) index lookup per direction
         │
         ├─ 4. gateEventRequirements(op, config.requirements)   [→ 2h]
         │       evaluateRequirements for each ConfigRequirement
         │       'blocking' shortfall → hard violation (reject)
         │       'warning'  shortfall → soft violation (warn, allow override)
         │       'info'     shortfall → surface in UI only
         │
         ├─ 5. evaluateConflicts(rules, allEvents, [candidateId])  [→ 2g]
         │       ResourceOverlapRule, CategoryMutexRule, MinRestRule,
         │       CapacityOverflowRule, OutsideBusinessHoursRule,
         │       PolicyViolationRule, HoldConflictRule,
         │       AvailabilityViolationRule
         │       rule.severity 'hard' → hard violation
         │       rule.severity 'soft' → soft violation
         │
         └─ 6. validateWorkingHours(op, config.businessHours)
                  event outside businessHours.days / .start / .end?
                  allDay events: skip
                  → soft violation (warn, allow override)

  Aggregation:
    any hard violation               → OperationResult { status: 'rejected',              violations }
    any soft (force flag not set)    → OperationResult { status: 'pending-confirmation',
                                         violations }
    none                             → proceed to resolveOperationScope()
                                         → buildOperation() → applyOperation()
                                         → beginTransaction() → commitTransaction()
```

---

### 3b — React Hook Subscription Chain

```
  CalendarEngine singleton
  (useRef — stable across renders, created once in useCalendarEngine)
         │
         │  engine.subscribe(listener)   [on mount]
         ▼
  StateListener registry   Set<(state: CalendarState) => void>
         │
         │  engine._notify(newState)     [after every commitTransaction()]
         ▼
  useCalendarEngine listener:
    engineVer.current++              ← useRef counter, triggers no render alone
    setEngineVer(engineVer.current)  ← useState setter → schedules re-render

         │  React re-render
         ▼
  useCalendarEngine re-runs:
    engine.getOccurrencesInRange(rangeStart, rangeEnd)
      → expandedEvents: NormalizedEvent[]
    engine.state.assignments → approvalRequestEvents
    → returned to WorksCalendar as stable-shaped object

         │  passed down
         ▼
  CalendarContext.Provider  (ctxValue — useMemo, recalculates on engineVer change)
  { renderEvent · renderHoverCard · colorRules · businessHours
    permissions · editMode · conflictingEventIds · displayTimezone }

         │  useContext(CalendarContext) in each View component
         ▼
  View component reads ctx.renderEvent, ctx.colorRules, etc.
  via typed dot-notation  (no bracket hacks — CalendarContextValue fully typed)

  Batching note:
    Multiple engine._notify() calls within one synchronous transaction
    are coalesced by React 18 automatic batching — one re-render per commit.
    Pool sync + event sync both notify; only one paint.
```

---

### 3c — MonthView Layout Algorithm

```
  visibleEvents[] for the month window
         │
         ▼
  1. Build week grid
       weeks[] = eachWeekOfInterval(monthStart, monthEnd, { weekStartsOn })
       each week = 7 DayCell components

  2. Partition per week
       allDayOrSpanning = events where allDay === true
                          OR span ≥ 1 calendar day
       timedSingle      = remaining (start/end on same calendar day)

  3. All-day / multi-day pill layout  (top band of each DayCell row)
       For each week:
         candidates = allDayOrSpanning events overlapping this week
         layoutSpans(candidates, weekStart, weekEnd)
           → sort by duration desc (longer events claim lower _row indexes)
           → greedy row assignment: _row = first row with no overlap
           → _colStart = max(displayStartDay, weekStart)
           → _colEnd   = min(displayEndDay,   weekEnd)
         maxVisibleRows = 3  (pills beyond row 2 → hidden)
         overflow = count hidden → "+N more" chip on DayCell
         chip click → opens AgendaView scoped to that date

  4. Timed event pill layout  (within individual DayCell body)
       For each day:
         timedForDay = timedSingle events on this day
         layoutOverlaps(timedForDay)
           → sort by start asc, duration desc
           → group by overlapping intervals
           → within each group: assign _col (0-based), _numCols
           → pill left  = (_col / _numCols) × 100%
           → pill width = (1 / _numCols) × 100%

  5. Render pass
       DayCell: all-day band (top, sticky height) + timed body (flex-grow)
       timed pill height = (durationMinutes / 60) × hourHeightPx
                           min 20px  (touch target floor)
       today cell: accent background
       out-of-month days: muted text + no event creates
```

---

### 3d — WeekView / DayView Time Grid

```
  visibleEvents[] for the week (or single day)
         │
         ▼
  1. Time column construction
       hourSlots = Array(24)     each slot = pixelsPerMinute × 60  (default 64px/hr)
       sticky time labels: '12 AM', '1 AM' … '11 PM'
       scrollable body: time grid + resource columns side by side

  2. Timed event pixel positioning
       For each event:
         topPx    = (start.getHours() × 60 + start.getMinutes()) × pixelsPerMinute
         heightPx = durationMinutes × pixelsPerMinute
                    floor: 20px  (ensures tap target even for 5-min events)

  3. Overlap resolution  (per resource/day column)
       layoutOverlaps(eventsInColumn)
         → sort by start asc
         → sweep-line: track active intervals
         → group into overlap clusters
         → within cluster: assign _col, _numCols
         → pill left  = colLeft + (_col / _numCols) × colWidth
         → pill width = colWidth / _numCols − 2px  (gap)

  4. All-day banner  (above scrollable grid, sticky)
       allDayEvents for the week → layoutSpans()
       row assignment identical to MonthView step 3

  5. Business hours shading
       businessHours.days / .start / .end  (from CalendarContext)
       cells outside hours → overlay div with dimmed bg
       visual only — enforcement is in validateWorkingHours (3a step 6)

  6. Current-time indicator
       redLine topPx = minutesSinceMidnight(now) × pixelsPerMinute
       updates every 60 s via useInterval
       rendered only when today falls within the view window
       z-index above pills, below hover card
```

---

### 3e — Config / Engine Initialization Sequence

```
  WorksCalendar mount
         │
  ┌──────┴──────────────────────────────────────────────────────────┐
  │  Synchronous init (render phase)                                │
  │                                                                 │
  │  useState: view = initialView ?? 'month'                        │
  │  useState: currentDate = new Date()                             │
  │  useState: filters = createInitialFilters(schema)              │
  │  useState: dayWindow = null                                     │
  │                                                                 │
  │  useMemo: allNormalized = normalizeEvents(events prop)          │
  │                                                                 │
  │  useCalendarEngine(allNormalized, options):                     │
  │    useRef: engine = new CalendarEngine()   (empty state)        │
  │    useRef: undoRedo = new UndoRedoManager(engine)               │
  └──────────────────────────┬──────────────────────────────────────┘
                             │ after mount (useEffect queue)
  ┌──────────────────────────▼──────────────────────────────────────┐
  │  Effect 1 — pool sync  [dep: rawPools from useOwnerConfig]      │
  │    loadPools() → ResourcePool[]                                 │
  │    engine.syncPools(pools)   ← pools now in CalendarState       │
  │    setEngineVer()            ← triggers first re-render         │
  └──────────────────────────┬──────────────────────────────────────┘
                             │
  ┌──────────────────────────▼──────────────────────────────────────┐
  │  Effect 2 — event sync  [dep: allNormalized]                    │
  │    engine.syncEvents(allNormalized)                             │
  │    setEngineVer()            ← triggers re-render               │
  └──────────────────────────┬──────────────────────────────────────┘
                             │
  ┌──────────────────────────▼──────────────────────────────────────┐
  │  Effect 3 — view sync   [dep: view]                             │
  │    engine.dispatch({ type: 'SET_VIEW', view })                  │
  └──────────────────────────┬──────────────────────────────────────┘
                             │
  ┌──────────────────────────▼──────────────────────────────────────┐
  │  Effect 4 — cursor sync  [dep: currentDate]                     │
  │    engine.dispatch({ type: 'NAVIGATE_TO', date: currentDate })  │
  └──────────────────────────┬──────────────────────────────────────┘
                             │  engine ready, UI rendered
                             ▼
  ⚠ Config gap: businessHours, requirements, conflict rules are
    passed as props and forwarded to validateConstraints() at
    operation time — NOT loaded into engine state at init.
    Engine validates against whatever config props are current
    at the moment of dispatch, not the config at mount.
    Safe for typical usage; a host that mutates config mid-session
    gets correct validation from the next op onward, not retroactively.
```

---

### 3f — Undo / Redo Snapshot Mechanism

```
  applyEngineOp() called  (before dispatching to engine)
         │
         ▼
  UndoRedoManager.snapshot()
    clone engine.state:
      events:      new Map(engine.state.events)       deep-copy entries
      assignments: new Map(engine.state.assignments)
      pools:       [...engine.state.pools]             shallow-copy array
      cursor:      { ...engine.state.cursor }
    push snapshot → undoStack[]
    clear redoStack[]          ← any redo branch is abandoned
    enforce max depth: pop oldest if undoStack.length > 50

         │ operation dispatched → committed → UI updated
         ▼
  ┌──────────────────────────────────────────────────────────────────┐
  │  Ctrl+Z  /  cal.undo()                                           │
  │                                                                  │
  │  if undoStack empty → no-op                                      │
  │  handle = undoStack.pop()                                        │
  │  redoStack.push(currentStateSnapshot)   ← preserve for redo     │
  │  engine.rollbackTo(handle)                                       │
  │    engine._state = handle.state                                  │
  │    engine._notify(restoredState)        ← triggers re-render     │
  └──────────────────────────────────────────────────────────────────┘

  ┌──────────────────────────────────────────────────────────────────┐
  │  Ctrl+Y  /  cal.redo()                                           │
  │                                                                  │
  │  if redoStack empty → no-op                                      │
  │  handle = redoStack.pop()                                        │
  │  undoStack.push(currentStateSnapshot)                            │
  │  engine.rollbackTo(handle)                                       │
  │    engine._notify(restoredState)        ← triggers re-render     │
  └──────────────────────────────────────────────────────────────────┘

  Snapshot scope:
    ✓  Events (create · move · edit · delete)
    ✓  Assignments (resource changes)
    ✓  Pool cursors (round-robin advance)
    ✗  View / cursor    (navigation is not undoable)
    ✗  Filter state     (filter changes are not undoable)
    ✗  Config / savedViews  (persistence layer, outside engine state)
    ✗  Adapter sync     (optimistic writes already in-flight stay in-flight)
```

---

### 3g — SyncQueue: Optimistic Update, Retry, and Conflict Resolution

```
  createEvent / updateEvent / deleteEvent called on SyncManager
         │
         ├─ 1. Optimistic apply  (synchronous)
         │      engine.applyOperation() immediately
         │      local Map updated → UI reflects change instantly
         │      SyncStatus for this id → 'pending'
         │
         ├─ 2. SyncQueue.enqueue({ op, adapterFn, retryCount: 0 })
         │
         └─ 3. Background flush  (async, queued via Promise microtask)
                   │
                   ▼
             adapterFn() call  (REST · WS · Supabase · ICS)
                   │
          ┌────────┴──────────────┐
          ✓ success               ✗ failure
          │                       │
          ▼                       ├─ transient / network error
     SyncStatus → 'synced'        │    retryCount < maxRetries (default 5)?
     replace local entry with     │      backoff: 2^retryCount × 1000 ms
     server copy                  │      re-enqueue with retryCount++
     (server-assigned id          │    else:
      replaces optimistic id      │      SyncStatus → 'error'
      on create)                  │      onSyncError(op, err) callback
                                  │      entry stays in local Map (not reverted)
                                  │      host decides: retry manually or discard
                                  │
                                  └─ conflict  (server version newer than local)
                                       conflictResolver(local, server):
                                         'server-wins'
                                           → revert optimistic change
                                           → apply server copy to local Map
                                         'client-wins'
                                           → force-push local version to adapter
                                           → re-enqueue with force flag
                                         'latest-wins'
                                           → compare updatedAt timestamps
                                           → pick newer, apply & re-sync
                                         'manual'
                                           → onConflict(local, server) callback
                                           → host surfaces resolution modal
                                           → user picks or merges version
                                           → resolved copy re-enqueued as update

  connectLive() parallel path:
    adapter.subscribe(AdapterChangeCallback)
      insert → merge into local Map (skip if id already 'pending' — local wins)
      update → apply if local SyncStatus is 'synced'  (don't clobber pending)
      delete → remove from local Map
      reload → replace full Map, reset all SyncStatuses to 'synced'
```

---

## Sprint Implementation Status

All six audit issues resolved across three sprints. See `CHANGELOG [Unreleased]` for details.

| # | Issue | Sprint | Status |
|---|-------|--------|--------|
| 1 | Duplicate recurrence expansion (`useOccurrences` deleted; engine read path only) | 3 | ✅ Done |
| 2 | `CalendarContext` typed as `any` → fully typed `CalendarContextValue` | 1 | ✅ Done |
| 3 | Dual state systems (`useCalendar` removed; engine is sole source of truth) | 3 | ✅ Done |
| 4 | Thin export wrapper (`exportToExcelLazy.ts` deleted; `excelExport.ts` exported directly) | 3 | ✅ Done |
| 5 | O(n) dependency lookups → `_dependenciesByFromEvent` / `_dependenciesByToEvent` indexes added | 1 | ✅ Done |
| 6 | `WorksCalendar.tsx` orchestration burden → extracted into `useCalendarEngine` hook | 2 | ✅ Done |
