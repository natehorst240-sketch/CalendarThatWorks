/* eslint-disable @typescript-eslint/no-explicit-any -- TODO: remove as types are tightened */
import type { RefObject } from 'react';
import HoverCard from './HoverCard';
import EventForm from './EventForm';
import AssetRequestForm from './AssetRequestForm';
import AvailabilityForm from './AvailabilityForm';
import ScheduleEditorForm from './ScheduleEditorForm';
import ImportZone from './ImportZone';
import ScheduleTemplateDialog from './ScheduleTemplateDialog';
import RecurringScopeDialog from '../ui/RecurringScopeDialog';
import ValidationAlert from './ValidationAlert';
import ConfigPanel from './ConfigPanel';
import KeyboardHelpOverlay from './KeyboardHelpOverlay';
import ScreenReaderAnnouncer from './ScreenReaderAnnouncer';
import InlineEventEditor from './InlineEventEditor';
import type { AnnouncerRef } from './ScreenReaderAnnouncer';

type LooseValue = any;

export interface CalendarModalsProps {
  // ── HoverCard ──
  selectedEvent: LooseValue | null;
  setSelectedEvent: (ev: LooseValue | null) => void;
  renderHoverCard?: ((event: LooseValue, onClose: () => void) => LooseValue) | null | undefined;
  ownerConfig: Record<string, unknown>;
  notes: Record<string, unknown>;
  onNoteSave?: ((note: Record<string, unknown>) => void) | null | undefined;
  onNoteDelete?: ((noteId: string) => void) | null | undefined;
  canEditEvent: boolean;
  handleEditFromHoverCard: (ev: LooseValue) => void;
  resolveResourceLabel?: LooseValue;

  // ── EventForm ──
  formEvent: LooseValue | null;
  setFormEvent: (ev: LooseValue | null) => void;
  canAddEvent: boolean;
  eventFormCats: string[];
  eventOptions: { categories: LooseValue[]; addCategory: LooseValue };
  handleEventSave: (ev: LooseValue) => void;
  handleEventDelete: LooseValue | null;
  onEventDelete?: LooseValue;
  canDeleteEvent: boolean;
  permissions: LooseValue;
  canManageOptions: boolean;
  maintenanceRules?: LooseValue;
  checkEventConflicts: LooseValue;
  handleLiveConflicts: (ids: readonly string[] | null) => void;
  resolvedAssetRequestCategories: LooseValue[];
  rawPools: LooseValue[];
  hideEventTemplates: boolean;
  eventResourceSuggestions?: LooseValue;

  // ── AssetRequestForm ──
  assetRequestOpen: boolean;
  setAssetRequestOpen: (v: boolean) => void;
  canRequestAsset: boolean;
  effectiveAssets: LooseValue;
  currentDate: Date;
  requirementTemplates?: LooseValue;

  // ── AvailabilityForm ──
  availabilityState: LooseValue | null;
  setAvailabilityState: (v: LooseValue | null) => void;
  handleAvailabilitySave: LooseValue;

  // ── ScheduleEditorForm ──
  scheduleEditorState: LooseValue | null;
  setScheduleEditorState: (v: LooseValue | null) => void;
  onCallCategory: string;
  handleScheduleEditorSave: LooseValue;

  // ── ImportZone ──
  importOpen: boolean;
  setImportOpen: (v: boolean) => void;
  handleImport: (imported: LooseValue, meta: LooseValue) => void;

  // ── ScheduleTemplateDialog ──
  scheduleOpen: boolean;
  setScheduleOpen: (v: boolean) => void;
  visibleScheduleTemplates: LooseValue[];
  buildSchedulePreview: (request: LooseValue) => LooseValue;
  handleScheduleInstantiate: (request: LooseValue) => void;

  // ── RecurringScopeDialog / ValidationAlert ──
  recurringPrompt: LooseValue | null;
  pendingAlert: LooseValue | null;
  setPendingAlert: (v: LooseValue | null) => void;

  // ── ConfigPanel ──
  configOpen: boolean;
  calendarId: string;
  categories: string[];
  resources: string[];
  schema: LooseValue[];
  expandedEvents: LooseValue[];
  configInitialTab?: string | undefined;
  smartViewEditId?: string | undefined;
  updateConfig: LooseValue;
  closeConfig: () => void;
  showSetupLanding: boolean;
  handleReopenSetup: () => void;
  savedViews: {
    views: LooseValue[];
    updateView: LooseValue;
    deleteView: LooseValue;
    toggleStripVisibility: LooseValue;
    saveView: LooseValue;
  };
  handleDeleteView: (id: LooseValue) => void;
  isOwner: boolean;
  openConfigToTab: (tab: string, opts?: LooseValue) => void;
  sourceStore: { sources: LooseValue[]; addSource: LooseValue; removeSource: LooseValue; toggleSource: LooseValue; updateSource: LooseValue };
  feedErrors: LooseValue;
  isFetchingFeeds: boolean;
  mergedScheduleTemplates: LooseValue[];
  handleCreateScheduleTemplate?: LooseValue;
  handleDeleteScheduleTemplate?: LooseValue;
  templateError: string;
  onEmployeeAdd?: LooseValue;
  onEmployeeDelete?: LooseValue;
  canManagePeople: boolean;

  // ── KeyboardHelpOverlay ──
  helpOpen: boolean;
  setHelpOpen: (v: boolean) => void;
  assetsLabel: string;

  // ── ScreenReaderAnnouncer ──
  announcerRef: RefObject<AnnouncerRef | null>;

  // ── InlineEventEditor ──
  inlineEditTarget: LooseValue | null;
  setInlineEditTarget: (v: LooseValue | null) => void;
  handleInlineSave: LooseValue;
  handleInlineDelete?: LooseValue;
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
        (renderHoverCard && renderHoverCard(selectedEvent, () => setSelectedEvent(null))) ?? (
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
      )}

      {/* ── Asset request form ── */}
      {assetRequestOpen && canRequestAsset && canAddEvent && (
        <AssetRequestForm
          assets={effectiveAssets}
          categories={resolvedAssetRequestCategories}
          initialStart={currentDate}
          initialAssetId={undefined}
          requirementTemplates={requirementTemplates}
          onSubmit={(payload: LooseValue) => {
            handleEventSave(payload);
            setAssetRequestOpen(false);
          }}
          onClose={() => setAssetRequestOpen(false)}
        />
      )}

      {/* ── Availability / PTO form ── */}
      {availabilityState && (
        <AvailabilityForm
          emp={availabilityState.emp}
          kind={availabilityState.kind}
          initialStart={availabilityState.start}
          initialEvent={availabilityState.initialEvent}
          onSave={handleAvailabilitySave}
          onClose={() => setAvailabilityState(null)}
        />
      )}

      {/* ── Schedule editor form ── */}
      {scheduleEditorState && (
        <ScheduleEditorForm
          emp={scheduleEditorState.emp}
          initialStart={scheduleEditorState.start}
          initialEnd={scheduleEditorState.end}
          onCallCategory={onCallCategory}
          onSave={handleScheduleEditorSave}
          onClose={() => setScheduleEditorState(null)}
        />
      )}

      {/* ── Import zone ── */}
      {importOpen && (
        <ImportZone onImport={handleImport} onClose={() => setImportOpen(false)} />
      )}

      {/* ── Schedule templates ── */}
      {scheduleOpen && (
        <ScheduleTemplateDialog
          templates={visibleScheduleTemplates}
          onPreview={buildSchedulePreview}
          onInstantiate={handleScheduleInstantiate}
          onClose={() => setScheduleOpen(false)}
        />
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
          feedErrors={feedErrors}
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
      )}

      {/* ── Keyboard shortcuts cheat sheet ── */}
      {helpOpen && (
        <KeyboardHelpOverlay onClose={() => setHelpOpen(false)} assetsLabel={assetsLabel} />
      )}

      {/* ── Screen reader live region ── */}
      <ScreenReaderAnnouncer ref={announcerRef as LooseValue} />

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
