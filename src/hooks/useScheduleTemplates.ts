import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { canViewScheduleTemplate, instantiateScheduleTemplate } from '../api/v1/templates';
import type {
  ScheduleTemplateV1,
  ScheduleInstantiationRequestV1,
  ScheduleInstantiationResultV1,
} from '../api/v1/templates';
import type { CalendarEventV1 } from '../api/v1/types';
import { fromLegacyEvents } from '../core/engine/adapters/fromLegacyEvents';
import type { LegacyEvent } from '../core/engine/adapters/fromLegacyEvents';
import { validateOperation } from '../core/engine/validation/validateOperation';
import type { OperationContext, ValidationResult } from '../core/engine/validation/validationTypes';
import type { EngineEvent } from '../core/engine/schema/eventSchema';
import { createId } from '../core/createId';
import type { WorksCalendarEvent } from '../types/events';
import type { CalendarRole } from '../WorksCalendar.types';
import type { EngineOpRunner, GetSavedEventPayload } from '../types/engineOps';

const DEFAULT_LIMITS = { previewMax: 200, createMax: 200 };

/** A schedule entry that would violate engine rules at the chosen anchor. */
export interface SchedulePreviewConflict {
  index: number;
  title: string;
  severity: ValidationResult['severity'];
  violations: ReadonlyArray<{ rule?: string | undefined; message?: string | undefined }>;
}

/** Result of `buildSchedulePreview`: the events the template would create, the
 *  ones that would conflict, and a user-facing error string (empty on success). */
export interface SchedulePreviewResult {
  generated: readonly CalendarEventV1[];
  conflicts: readonly SchedulePreviewConflict[];
  error: string;
}

export interface UseScheduleTemplatesParams {
  /** Host-supplied static schedule templates (validated by `canViewScheduleTemplate`
   *  / `instantiateScheduleTemplate` before use). */
  scheduleTemplates: readonly ScheduleTemplateV1[];
  scheduleInstantiationLimits?: { previewMax?: number; createMax?: number } | undefined;
  scheduleTemplateAdapter?: {
    listScheduleTemplates?: () => Promise<unknown>;
    createScheduleTemplate?: (template: Record<string, unknown>) => Promise<unknown>;
    deleteScheduleTemplate?: (templateId: string) => Promise<unknown>;
    [key: string]: unknown;
  } | undefined;
  onScheduleTemplateAnalytics?: ((payload: Record<string, unknown>) => void) | undefined;
  role?: CalendarRole | undefined;
  isOwner: boolean;
  engine: { state: { events: ReadonlyMap<string, EngineEvent> } };
  ownerBusinessHours: unknown;
  businessHours?: unknown;
  blockedWindows?: readonly unknown[] | undefined;
  applyEngineOp: EngineOpRunner;
  getSavedEventPayload: GetSavedEventPayload;
  onEventSave?: ((event: WorksCalendarEvent) => void) | undefined;
  onInstantiateSuccess: () => void;
}

export interface UseScheduleTemplatesReturn {
  templateError: string;
  visibleScheduleTemplates: ScheduleTemplateV1[];
  mergedScheduleTemplates: ScheduleTemplateV1[];
  buildSchedulePreview: (request: ScheduleInstantiationRequestV1) => SchedulePreviewResult;
  handleScheduleInstantiate: (request: ScheduleInstantiationRequestV1) => void;
  handleCreateScheduleTemplate: (template: Record<string, unknown>) => Promise<void>;
  handleDeleteScheduleTemplate: (templateId: string) => Promise<void>;
}

export function useScheduleTemplates({
  scheduleTemplates,
  scheduleInstantiationLimits,
  scheduleTemplateAdapter,
  onScheduleTemplateAnalytics,
  role,
  isOwner,
  engine,
  ownerBusinessHours,
  businessHours,
  blockedWindows,
  applyEngineOp,
  getSavedEventPayload,
  onEventSave,
  onInstantiateSuccess,
}: UseScheduleTemplatesParams): UseScheduleTemplatesReturn {
  const [remoteTemplates, setRemoteTemplates] = useState<ScheduleTemplateV1[]>([]);
  const [templateError, setTemplateError] = useState('');

  const resolvedLimits = useMemo(() => ({
    previewMax: Number.isFinite(scheduleInstantiationLimits?.previewMax)
      ? Math.max(1, Number(scheduleInstantiationLimits!.previewMax))
      : DEFAULT_LIMITS.previewMax,
    createMax: Number.isFinite(scheduleInstantiationLimits?.createMax)
      ? Math.max(1, Number(scheduleInstantiationLimits!.createMax))
      : DEFAULT_LIMITS.createMax,
  }), [scheduleInstantiationLimits]);

  const trackAnalytics = useCallback((event: string, payload: Record<string, unknown> = {}) => {
    onScheduleTemplateAnalytics?.({ event, at: new Date().toISOString(), ...payload });
  }, [onScheduleTemplateAnalytics]);

  const reloadRemoteTemplates = useCallback(async () => {
    if (!scheduleTemplateAdapter?.listScheduleTemplates) return;
    try {
      const templates = await scheduleTemplateAdapter.listScheduleTemplates();
      // Host-supplied template blobs from the adapter; shape-validated downstream.
      setRemoteTemplates(Array.isArray(templates) ? (templates as ScheduleTemplateV1[]) : []);
      setTemplateError('');
    } catch {
      setTemplateError('Unable to load schedule templates from adapter.');
    }
  }, [scheduleTemplateAdapter]);

  useEffect(() => { reloadRemoteTemplates(); }, [reloadRemoteTemplates]);

  const mergedScheduleTemplates = useMemo<ScheduleTemplateV1[]>(() => {
    const combined = [...scheduleTemplates, ...remoteTemplates];
    const byId = new Map<string, ScheduleTemplateV1>();
    combined.forEach(t => { if (t.id) byId.set(t.id, t); });
    return Array.from(byId.values());
  }, [scheduleTemplates, remoteTemplates]);

  const visibleScheduleTemplates = useMemo<ScheduleTemplateV1[]>(
    () => mergedScheduleTemplates.filter(t => canViewScheduleTemplate(t, role !== undefined ? { role, isOwner } : { isOwner })),
    [mergedScheduleTemplates, isOwner, role],
  );

  // Use a ref so buildSchedulePreview always reads the latest context values
  // without needing to be in its dependency array (avoids recreation on every engine tick).
  const previewCtxRef = useRef({ engine, ownerBusinessHours, businessHours, blockedWindows });
  previewCtxRef.current = { engine, ownerBusinessHours, businessHours, blockedWindows };

  const buildSchedulePreview = useCallback((request: ScheduleInstantiationRequestV1): SchedulePreviewResult => {
    const { engine: eng, ownerBusinessHours: ownerBH, businessHours: bh, blockedWindows: bw } = previewCtxRef.current;
    const startedAt = Date.now();
    const template = visibleScheduleTemplates.find(t => t.id === request.templateId);
    if (!template) return { generated: [], conflicts: [], error: 'Selected template was not found.' };
    if (!Array.isArray(template.entries) || template.entries.length === 0) {
      return { generated: [], conflicts: [], error: 'Selected template does not have valid entries.' };
    }

    const anchor = request.anchor instanceof Date ? request.anchor : new Date(request.anchor);
    if (Number.isNaN(anchor.getTime())) {
      return { generated: [], conflicts: [], error: 'Enter a valid anchor date/time.' };
    }

    let generated: CalendarEventV1[];
    try {
      generated = [...instantiateScheduleTemplate(template, { ...request, anchor }).generated];
    } catch {
      trackAnalytics('schedule_preview_failed', { reason: 'instantiate-throw', templateId: template.id });
      return { generated: [], conflicts: [], error: 'Unable to build schedule preview.' };
    }

    if (generated.length > resolvedLimits.previewMax) {
      trackAnalytics('schedule_preview_failed', {
        reason: 'preview-limit-exceeded', templateId: template.id,
        generatedCount: generated.length, previewMax: resolvedLimits.previewMax,
      });
      return {
        generated: [], conflicts: [],
        error: `This template would generate ${generated.length} events, which exceeds the preview limit of ${resolvedLimits.previewMax}.`,
      };
    }

    const ctx = {
      businessHours:  ownerBH ?? bh ?? null,
      blockedWindows: bw ?? [],
    } as unknown as OperationContext;
    const seededEvents = [...eng.state.events.values()];
    const conflicts: SchedulePreviewConflict[] = [];

    generated.forEach((ev, index) => {
      const start: Date | string = ev.start instanceof Date || typeof ev.start === 'string'
        ? ev.start : new Date(ev.start);
      const end: Date | string = ev.end instanceof Date || typeof ev.end === 'string'
        ? ev.end : new Date(ev.end as number);
      const legacy: LegacyEvent[] = [{
        id: `preview:${template.id}:${index}`,
        title: typeof ev.title === 'string' ? ev.title : '(untitled)',
        start, end,
        allDay: ev.allDay ?? false,
        resource: typeof ev.resource === 'string' ? ev.resource : null,
        category: typeof ev.category === 'string' ? ev.category : null,
        color: typeof ev.color === 'string' ? ev.color : null,
        status: typeof ev.status === 'string' ? ev.status : 'confirmed',
        rrule: typeof ev.rrule === 'string' ? ev.rrule : null,
        exdates: Array.isArray(ev.exdates) ? ev.exdates : [],
        meta: typeof ev.meta === 'object' && ev.meta ? ev.meta : {},
      }];
      const previewEvent = fromLegacyEvents(legacy)[0];
      if (previewEvent === undefined) return;
      const op = { type: 'create' as const, event: previewEvent };
      const validation = validateOperation(op, { ...ctx, events: seededEvents }, seededEvents);
      if (validation.violations.length > 0) {
        conflicts.push({
          index,
          title: ev.title,
          severity: validation.severity,
          violations: validation.violations.map(v => ({
            rule: typeof v.rule === 'string' ? v.rule : undefined,
            message: typeof v.message === 'string' ? v.message : undefined,
          })),
        });
      }
      seededEvents.push(previewEvent);
    });

    trackAnalytics('schedule_preview_built', {
      templateId: template.id,
      generatedCount: generated.length,
      conflictCount: conflicts.length,
      elapsedMs: Date.now() - startedAt,
    });
    const normalizedPreview = generated.map(ev => ({
      ...ev,
      end: ev.end instanceof Date || typeof ev.end === 'string' ? ev.end : new Date(ev.end ?? 0),
    }));
    return { generated: normalizedPreview, conflicts, error: '' };
  }, [resolvedLimits.previewMax, trackAnalytics, visibleScheduleTemplates]);

  const handleScheduleInstantiate = useCallback((request: ScheduleInstantiationRequestV1) => {
    const startedAt = Date.now();
    const template = visibleScheduleTemplates.find(t => t.id === request.templateId);
    if (!template || !Array.isArray(template.entries) || template.entries.length === 0) {
      trackAnalytics('schedule_instantiate_failed', {
        reason: 'template-missing-or-invalid',
        templateId: request.templateId ?? null,
      });
      return;
    }
    const anchor = request.anchor instanceof Date ? request.anchor : new Date(request.anchor);
    if (Number.isNaN(anchor.getTime())) {
      trackAnalytics('schedule_instantiate_failed', { reason: 'invalid-anchor', templateId: template.id });
      return;
    }
    let result: ScheduleInstantiationResultV1;
    try {
      result = instantiateScheduleTemplate(template, request);
    } catch {
      trackAnalytics('schedule_instantiate_failed', { reason: 'instantiate-throw', templateId: template.id });
      return;
    }
    if (result.generated.length > resolvedLimits.createMax) {
      trackAnalytics('schedule_instantiate_failed', {
        reason: 'create-limit-exceeded', templateId: template.id,
        generatedCount: result.generated.length, createMax: resolvedLimits.createMax,
      });
      return;
    }
    result.generated.forEach((ev, index) => {
      if (ev.start == null || ev.end == null) return;
      const start = ev.start instanceof Date ? ev.start : new Date(ev.start);
      const end   = ev.end   instanceof Date ? ev.end   : new Date(ev.end);
      const templateEventId = String(ev.id ?? createId(`template-${template.id}-${index}`));
      applyEngineOp(
        {
          type: 'create',
          event: {
            id: templateEventId,
            title: ev.title,
            start, end,
            allDay: ev.allDay ?? false,
            resourceId: ev.resource ?? null,
            category: ev.category ?? null,
            color: ev.color ?? null,
            status: ev.status ?? 'confirmed',
            rrule: ev.rrule ?? null,
            exdates: ev.exdates ?? [],
            meta: ev.meta ?? {},
          },
          source: 'template',
        },
        () => {
          const savedPayload = getSavedEventPayload(templateEventId, ev, { id: templateEventId });
          if (savedPayload) onEventSave?.(savedPayload);
        },
      );
    });
    trackAnalytics('schedule_instantiate_succeeded', {
      templateId: template.id,
      generatedCount: result.generated.length,
      elapsedMs: Date.now() - startedAt,
    });
    onInstantiateSuccess();
  }, [applyEngineOp, getSavedEventPayload, onEventSave, resolvedLimits.createMax, trackAnalytics, visibleScheduleTemplates, onInstantiateSuccess]);

  const handleCreateScheduleTemplate = useCallback(async (template: Record<string, unknown>) => {
    if (!scheduleTemplateAdapter?.createScheduleTemplate) return;
    try {
      await scheduleTemplateAdapter.createScheduleTemplate(template);
      await reloadRemoteTemplates();
      setTemplateError('');
    } catch {
      setTemplateError('Unable to create schedule template.');
    }
  }, [reloadRemoteTemplates, scheduleTemplateAdapter]);

  const handleDeleteScheduleTemplate = useCallback(async (templateId: string) => {
    if (!scheduleTemplateAdapter?.deleteScheduleTemplate) return;
    try {
      await scheduleTemplateAdapter.deleteScheduleTemplate(templateId);
      await reloadRemoteTemplates();
      setTemplateError('');
    } catch {
      setTemplateError('Unable to delete schedule template.');
    }
  }, [reloadRemoteTemplates, scheduleTemplateAdapter]);

  return {
    templateError,
    visibleScheduleTemplates,
    mergedScheduleTemplates,
    buildSchedulePreview,
    handleScheduleInstantiate,
    handleCreateScheduleTemplate,
    handleDeleteScheduleTemplate,
  };
}
