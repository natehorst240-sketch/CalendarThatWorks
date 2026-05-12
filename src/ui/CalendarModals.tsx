import { lazy, Suspense } from 'react';
import type { RefObject, ReactNode, ComponentProps } from 'react';
import { useSourceStore } from '../hooks/useSourceStore';
import HoverCard from './HoverCard';
import RecurringScopeDialog from '../ui/RecurringScopeDialog';
import ValidationAlert from './ValidationAlert';
import KeyboardHelpOverlay from './KeyboardHelpOverlay';
import ScreenReaderAnnouncer from './ScreenReaderAnnouncer';
import InlineEventEditor from './InlineEventEditor';

const ConfigPanel          = lazy(() => import('./ConfigPanel'));
const ImportZone           = lazy(() => import('./ImportZone'));
const EventForm            = lazy(() => import('./EventForm'));
const AssetRequestForm     = lazy(() => import('./AssetRequestForm'));
const AvailabilityForm     = lazy(() => import('./AvailabilityForm'));
const ScheduleEditorForm   = lazy(() => import('./ScheduleEditorForm'));
const ScheduleTemplateDialog = lazy(() => import('./ScheduleTemplateDialog'));
import type { AnnouncerRef } from './ScreenReaderAnnouncer';
import type { NormalizedEvent, WorksCalendarEvent } from '../types/events';
import type { OwnerConfig, EmployeeRecord, EmployeeId } from '../WorksCalendar.types';
import type {
  FormEventDraft,
  InlineEditTarget,
  AvailabilityModalState,
  ScheduleEditorModalState,
} from '../hooks/useModalState';
import type { MutationEventInput } from '../types/engineOps';
import type { PendingAlert, RecurringPrompt } from '../hooks/useCalendarEngine';
import type {
  ScheduleTemplateV1,
  ScheduleInstantiationRequestV1,
} from '../api/v1/templates';
import type { SchedulePreviewResult } from '../hooks/useScheduleTemplates';
import type { PermissionCaps } from '../types/ui';
import type { MaintenanceRule } from '../types/maintenance';
import type { InlineEventPatch } from '../hooks/useEventMutations';
import type { ConflictEvaluationResult } from '../core/conflictEngine';
import type { ResourcePool } from '../core/pools/resourcePoolSchema';
import type { FilterField } from '../filters/filterSchema';
import type { SavedView } from '../hooks/useSavedViews';

export interface CalendarModalsProps {
  // ── HoverCard ──
  selectedEvent: NormalizedEvent | null;
  setSelectedEvent: (ev: NormalizedEvent | null) => void;
  renderHoverCard?: ((event: WorksCalendarEvent, onClose: () => void) => ReactNode) | null | undefined;
  ownerConfig: Record<string, unknown>;
  notes: Record<string, unknown>;
  onNoteSave?: ((note: Record<string, unknown>) => void) | null | undefined;
  onNoteDelete?: ((noteId: string) => void) | null | undefined;
  canEditEvent: boolean;
  handleEditFromHoverCard: (ev: NormalizedEvent) => void;
  resolveResourceLabel?: ((resourceId: string) => string) | undefined;

  // ── EventForm ──
  formEvent: FormEventDraft | null;
  setFormEvent: (ev: FormEventDraft | null) => void;
  canAddEvent: boolean;
  eventFormCats: string[];
  eventOptions: { categories: string[]; addCategory: (cat: string) => void };
  handleEventSave: (ev: MutationEventInput) => void;
  handleEventDelete: ((id: string) => void) | null;
  onEventDelete?: ((eventId: string) => void) | undefined;
  canDeleteEvent: boolean;
  permissions: PermissionCaps;
  canManageOptions: boolean;
  maintenanceRules?: readonly MaintenanceRule[] | undefined;
  checkEventConflicts: (proposed: MutationEventInput) => ConflictEvaluationResult | null;
  handleLiveConflicts: (ids: readonly string[] | null) => void;
  resolvedAssetRequestCategories: Array<{ id: string; label: string; color: string | undefined }>;
  rawPools: ResourcePool[];
  hideEventTemplates: boolean;
  eventResourceSuggestions?: unknown;

  // ── AssetRequestForm ──
  assetRequestOpen: boolean;
  setAssetRequestOpen: (v: boolean) => void;
  canRequestAsset: boolean;
  effectiveAssets: Array<{ id: string; label: string; group?: string | undefined; meta?: Record<string, unknown> | undefined }> | undefined;
  currentDate: Date;
  requirementTemplates?: unknown;

  // ── AvailabilityForm ──
  availabilityState: AvailabilityModalState | null;
  setAvailabilityState: (v: AvailabilityModalState | null) => void;
  handleAvailabilitySave: (ev: MutationEventInput) => void;

  // ── ScheduleEditorForm ──
  scheduleEditorState: ScheduleEditorModalState | null;
  setScheduleEditorState: (v: ScheduleEditorModalState | null) => void;
  onCallCategory: string;
  handleScheduleEditorSave: (ev: MutationEventInput | MutationEventInput[]) => void;

  // ── ImportZone ──
  importOpen: boolean;
  setImportOpen: (v: boolean) => void;
  handleImport: (imported: unknown, meta: unknown) => void;

  // ── ScheduleTemplateDialog ──
  scheduleOpen: boolean;
  setScheduleOpen: (v: boolean) => void;
  visibleScheduleTemplates: ScheduleTemplateV1[];
  buildSchedulePreview: (request: ScheduleInstantiationRequestV1) => SchedulePreviewResult;
  handleScheduleInstantiate: (request: ScheduleInstantiationRequestV1) => void;

  // ── RecurringScopeDialog / ValidationAlert ──
  recurringPrompt: RecurringPrompt | null;
  pendingAlert: PendingAlert | null;
  setPendingAlert: (v: PendingAlert | null) => void;

  // ── ConfigPanel ──
  configOpen: boolean;
  calendarId: string;
  categories: string[];
  resources: string[];
  schema: FilterField[];
  expandedEvents: NormalizedEvent[];
  configInitialTab?: string | undefined;
  smartViewEditId?: string | undefined;
  updateConfig: (updater: OwnerConfig | ((prev: OwnerConfig) => OwnerConfig)) => void;
  closeConfig: () => void;
  showSetupLanding: boolean;
  handleReopenSetup: () => void;
  savedViews: {
    views: SavedView[];
    updateView: (id: string, patch: Partial<SavedView>) => void;
    deleteView: (id: string) => void;
    toggleStripVisibility: (id: string) => void;
    saveView: (name: string, filters: Record<string, unknown>, opts?: Record<string, unknown>) => SavedView;
  };
  handleDeleteView: (id: string) => void;
  isOwner: boolean;
  openConfigToTab: (tab: string | null, opts?: { smartViewEditId?: string | null | undefined }) => void;
  sourceStore: ReturnType<typeof useSourceStore>;
  feedErrors: ReadonlyArray<{ feed: Record<string, unknown>; err: unknown }>;
  isFetchingFeeds: boolean;
  mergedScheduleTemplates: ScheduleTemplateV1[];
  handleCreateScheduleTemplate?: ((template: Record<string, unknown>) => Promise<void>) | undefined;
  handleDeleteScheduleTemplate?: ((templateId: string) => Promise<void>) | undefined;
  templateError: string;
  onEmployeeAdd?: ((member: EmployeeRecord) => void) | undefined;
  onEmployeeDelete?: ((id: EmployeeId) => void) | undefined;
  canManagePeople: boolean;

  // ── KeyboardHelpOverlay ──
  helpOpen: boolean;
  setHelpOpen: (v: boolean) => void;
  assetsLabel: string;

  // ── ScreenReaderAnnouncer ──
  announcerRef: RefObject<AnnouncerRef | null>;

  // ── InlineEventEditor ──
  inlineEditTarget: InlineEditTarget | null;
  setInlineEditTarget: (v: InlineEditTarget | null) => void;
  handleInlineSave: (patch: InlineEventPatch) => void;
  handleInlineDelete?: (() => void) | undefined;
}

export default function CalendarModals({
  selectedEvent, setSelectedEvent, renderHoverCard, ownerConfig, notes,
  onNoteSave, onNoteDelete, canEditEvent, handleEditFromHoverCard, resolveResourceLabel,
  formEvent, setFormEvent, canAddEvent, eventFormCats, eventOptions, handleEventSave,
  handleEventDelete, onEventDelete, canDeleteEvent, permissions, canManageOptions,
  maintenanceRules, checkEventConflicts, handleLiveConflicts, resolvedAssetRequestCategories,
  rawPools, hideEventTemplates, eventResourceSuggestions,
  assetRequestOpen, setAssetRequestOpen, canRequestAsset, effectiveAssets, currentDate,
  requirementTemplates,
  availabilityState, setAvailabilityState, handleAvailabilitySave,
  scheduleEditorState, setScheduleEditorState, onCallCategory, handleScheduleEditorSave,
  importOpen, setImportOpen, handleImport,
  scheduleOpen, setScheduleOpen, visibleScheduleTemplates, buildSchedulePreview,
  handleScheduleInstantiate,
  recurringPrompt, pendingAlert, setPendingAlert,
  configOpen, calendarId, categories, resources, schema, expandedEvents, configInitialTab,
  smartViewEditId, updateConfig, closeConfig, showSetupLanding, handleReopenSetup,
  savedViews, handleDeleteView, isOwner, openConfigToTab: _openConfigToTab, sourceStore, feedErrors,
  isFetchingFeeds, mergedScheduleTemplates, handleCreateScheduleTemplate,
  handleDeleteScheduleTemplate, templateError, onEmployeeAdd, onEmployeeDelete, canManagePeople,
  helpOpen, setHelpOpen, assetsLabel,
  announcerRef,
  inlineEditTarget, setInlineEditTarget, handleInlineSave, handleInlineDelete,
}: CalendarModalsProps) {
  return (
    <>
      {/* ── Hover card ── */}
      {selectedEvent && (
        (renderHoverCard && renderHoverCard(selectedEvent as unknown as WorksCalendarEvent, () => setSelectedEvent(null))) ?? (
          <HoverCard
            event={selectedEvent}
            config={ownerConfig}
            note={notes[selectedEvent.id]}
            onClose={() => setSelectedEvent(null)}
            onNoteSave={onNoteSave}
            onNoteDelete={onNoteDelete}
            onEdit={(isOwner || canEditEvent) ? handleEditFromHoverCard : null}
            anchor={null}
            resolveResourceLabel={resolveResourceLabel}
          />
        )
      )}

      {/* ── Event form ── */}
      {formEvent !== null && canAddEvent && (
        <Suspense fallback={null}>
          <EventForm
            event={formEvent.id || formEvent.resourcePoolId ? formEvent : null}
            config={ownerConfig}
            categories={[...eventFormCats, ...eventOptions.categories]}
            onSave={handleEventSave}
            onDelete={(onEventDelete && canDeleteEvent) ? handleEventDelete : null}
            onClose={() => { setFormEvent(null); handleLiveConflicts(null); }}
            permissions={permissions}
            onAddCategory={canManageOptions ? eventOptions.addCategory : undefined}
            maintenanceRules={maintenanceRules}
            onCheckConflicts={checkEventConflicts}
            onLiveConflictsChange={handleLiveConflicts}
            approvalCategories={resolvedAssetRequestCategories}
            pools={rawPools}
            hideTemplates={hideEventTemplates}
            resourceSuggestions={eventResourceSuggestions}
          />
        </Suspense>
      )}

      {/* ── Asset request form ── */}
      {assetRequestOpen && canRequestAsset && canAddEvent && (
        <Suspense fallback={null}>
          <AssetRequestForm
            assets={effectiveAssets ?? []}
            categories={resolvedAssetRequestCategories}
            initialStart={currentDate}
            initialAssetId={undefined}
            requirementTemplates={requirementTemplates as ComponentProps<typeof AssetRequestForm>['requirementTemplates']}
            onSubmit={(payload) => {
              handleEventSave(payload as MutationEventInput);
              setAssetRequestOpen(false);
            }}
            onClose={() => setAssetRequestOpen(false)}
          />
        </Suspense>
      )}

      {/* ── Availability / PTO form ── */}
      {availabilityState && (
        <Suspense fallback={null}>
          <AvailabilityForm
            emp={availabilityState.emp}
            kind={availabilityState.kind}
            initialStart={availabilityState.start}
            initialEvent={availabilityState.initialEvent}
            onSave={handleAvailabilitySave}
            onClose={() => setAvailabilityState(null)}
          />
        </Suspense>
      )}

      {/* ── Schedule editor form ── */}
      {scheduleEditorState && (
        <Suspense fallback={null}>
          <ScheduleEditorForm {...({
            emp: scheduleEditorState.emp,
            initialStart: scheduleEditorState.start,
            initialEnd: scheduleEditorState.end,
            onCallCategory,
            onSave: handleScheduleEditorSave,
            onClose: () => setScheduleEditorState(null),
          } as unknown as ComponentProps<typeof ScheduleEditorForm>)} />
        </Suspense>
      )}

      {/* ── Import zone ── */}
      {importOpen && (
        <Suspense fallback={null}>
          <ImportZone onImport={handleImport} onClose={() => setImportOpen(false)} />
        </Suspense>
      )}

      {/* ── Schedule templates ── */}
      {scheduleOpen && (
        <Suspense fallback={null}>
          <ScheduleTemplateDialog
            templates={visibleScheduleTemplates as unknown as ComponentProps<typeof ScheduleTemplateDialog>['templates']}
            onPreview={buildSchedulePreview as unknown as ComponentProps<typeof ScheduleTemplateDialog>['onPreview']}
            onInstantiate={handleScheduleInstantiate}
            onClose={() => setScheduleOpen(false)}
          />
        </Suspense>
      )}

      {/* ── Recurring scope picker ── */}
      {recurringPrompt && (
        <RecurringScopeDialog
          actionLabel={recurringPrompt.actionLabel}
          onConfirm={recurringPrompt.onConfirm}
          onCancel={recurringPrompt.onCancel}
        />
      )}

      {/* ── Validation alert ── */}
      {pendingAlert && (
        <ValidationAlert
          violations={pendingAlert.violations}
          isHard={pendingAlert.isHard}
          onConfirm={pendingAlert.onConfirm ? () => {
            const commit = pendingAlert.onConfirm;
            setPendingAlert(null);
            if (commit) commit();
          } : null}
          onCancel={() => setPendingAlert(null)}
        />
      )}

      {/* ── Owner config panel ── */}
      {configOpen && (
        <Suspense fallback={null}>
          <ConfigPanel
            config={ownerConfig}
            calendarId={calendarId}
            categories={categories}
            resources={resources}
            schema={schema}
            items={expandedEvents}
            initialTab={configInitialTab}
            initialSmartViewEditId={smartViewEditId}
            onUpdate={updateConfig}
            onClose={closeConfig}
            onReopenSetup={showSetupLanding ? handleReopenSetup : undefined}
            onSaveView={(name, filters, opts) => savedViews.saveView(name, filters, opts)}
            savedViews={savedViews.views}
            onUpdateView={savedViews.updateView}
            onDeleteView={handleDeleteView}
            onEmployeeAdd={canManagePeople ? onEmployeeAdd : undefined}
            onEmployeeDelete={canManagePeople ? onEmployeeDelete : undefined}
            sources={sourceStore.sources}
            feedErrors={[...feedErrors]}
            isFetchingFeeds={isFetchingFeeds}
            onAddSource={sourceStore.addSource}
            onRemoveSource={sourceStore.removeSource}
            onToggleSource={sourceStore.toggleSource}
            onUpdateSource={sourceStore.updateSource}
            scheduleTemplates={mergedScheduleTemplates}
            onCreateScheduleTemplate={isOwner && !!handleCreateScheduleTemplate ? handleCreateScheduleTemplate : undefined}
            onDeleteScheduleTemplate={isOwner && !!handleDeleteScheduleTemplate ? handleDeleteScheduleTemplate : undefined}
            scheduleTemplateError={templateError}
          />
        </Suspense>
      )}

      {/* ── Keyboard shortcuts cheat sheet ── */}
      {helpOpen && (
        <KeyboardHelpOverlay onClose={() => setHelpOpen(false)} assetsLabel={assetsLabel} />
      )}

      {/* ── Screen reader live region ── */}
      <ScreenReaderAnnouncer ref={announcerRef as RefObject<AnnouncerRef>} />

      {/* ── Inline event editor (edit mode) ── */}
      {inlineEditTarget && (
        <InlineEventEditor
          key={`${inlineEditTarget.event?._eventId ?? inlineEditTarget.event?.id ?? 'inline'}-${inlineEditTarget.event?.id ?? 'event'}`}
          event={inlineEditTarget.event}
          x={inlineEditTarget.x}
          y={inlineEditTarget.y}
          onSave={handleInlineSave}
          onDelete={onEventDelete ? handleInlineDelete : undefined}
          onClose={() => setInlineEditTarget(null)}
        />
      )}
    </>
  );
}
