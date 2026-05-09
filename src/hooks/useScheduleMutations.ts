import { useCallback } from 'react';
import {
  buildCoverageMeta,
  buildOpenShiftPatch,
  buildShiftStatusMeta,
  findLinkedMirroredCoverage,
  findLinkedOpenShifts,
  resolveEventId,
} from '../core/scheduleMutations';
import { detectShiftConflicts, buildOpenShiftEvent } from '../core/scheduleOverlap';
import { normalizeScheduleKind, SCHEDULE_KINDS } from '../core/scheduleModel';
import { createId } from '../core/createId';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseValue = any;

type UseScheduleMutationsParams = {
  applyEngineOp: (op: LooseValue, callback?: (result: LooseValue) => void) => void;
  emitEventSave: (eventId: LooseValue, fallbackEvent?: LooseValue, fallbackPatch?: LooseValue) => void;
  getSavedEventPayload: (id: LooseValue, fallback?: LooseValue, patch?: LooseValue) => LooseValue;
  expandedEvents: LooseValue[];
  configuredEmployees: LooseValue[];
  onEventDelete?: ((eventId: string) => void) | undefined;
  onAvailabilitySave?: ((payload: LooseValue) => void) | undefined;
  onScheduleSave?: ((payload: LooseValue) => void) | undefined;
  onEmployeeAction?: ((employeeId: LooseValue, action: LooseValue) => void) | undefined;
  ownerConfig: LooseValue;
  setAvailabilityState: (state: LooseValue) => void;
  setScheduleEditorState: (state: LooseValue) => void;
};

export function useScheduleMutations({
  applyEngineOp,
  emitEventSave,
  getSavedEventPayload,
  expandedEvents,
  configuredEmployees,
  onEventDelete,
  onAvailabilitySave,
  onScheduleSave,
  onEmployeeAction,
  ownerConfig,
  setAvailabilityState,
  setScheduleEditorState,
}: UseScheduleMutationsParams) {
  const handleShiftStatusChange = useCallback((ev: LooseValue, status: LooseValue) => {
    const eventId = resolveEventId(ev);
    if (!eventId) return;
    const linkedOpenShifts = findLinkedOpenShifts(expandedEvents, ev);
    const primaryOpenShift = linkedOpenShifts[0] ?? null;
    const linkedMirroredCoverage = findLinkedMirroredCoverage(expandedEvents, ev);

    const newMeta = buildShiftStatusMeta(ev, { status, openShiftId: resolveEventId(primaryOpenShift) });
    applyEngineOp(
      { type: 'update', id: eventId, patch: { meta: newMeta }, source: 'api' },
      () => emitEventSave(eventId, ev, { meta: newMeta }),
    );

    if (!status) {
      linkedOpenShifts.forEach((openEv) => {
        const openId = resolveEventId(openEv);
        if (!openId) return;
        applyEngineOp({ type: 'delete', id: openId, source: 'api' }, () => onEventDelete?.(openId));
      });

      linkedMirroredCoverage.forEach((coverEv) => {
        const coverId = resolveEventId(coverEv);
        if (!coverId) return;
        applyEngineOp({ type: 'delete', id: coverId, source: 'api' }, () => onEventDelete?.(coverId));
      });
    }
  }, [applyEngineOp, emitEventSave, expandedEvents, onEventDelete]);

  const handleCoverageAssign = useCallback((ev: LooseValue, coveringEmployeeId: LooseValue) => {
    const eventId = resolveEventId(ev);
    if (!eventId) return;
    const normalizedCoveringEmployeeId = String(coveringEmployeeId ?? '');

    const openShiftCandidates = findLinkedOpenShifts(expandedEvents, ev);
    const primaryOpenShift = openShiftCandidates[0] ?? null;
    const mirroredCoverage = findLinkedMirroredCoverage(expandedEvents, ev);

    if (!normalizedCoveringEmployeeId) {
      const clearedMeta = { ...(ev.meta ?? {}), coveredBy: null as LooseValue };
      applyEngineOp(
        { type: 'update', id: eventId, patch: { meta: clearedMeta }, source: 'api' },
        () => emitEventSave(eventId, ev, { meta: clearedMeta }),
      );

      if (primaryOpenShift) {
        const openId = resolveEventId(primaryOpenShift);
        if (openId) {
          const openMeta = {
            ...(primaryOpenShift.meta ?? {}),
            coveredBy: null as LooseValue,
            status: 'open',
          };
          applyEngineOp(
            { type: 'update', id: openId, patch: { meta: openMeta }, source: 'api' },
            () => emitEventSave(openId, primaryOpenShift, { meta: openMeta }),
          );
        }
      }

      mirroredCoverage.forEach((coverEv) => {
        const coverId = resolveEventId(coverEv);
        if (!coverId) return;
        applyEngineOp({ type: 'delete', id: coverId, source: 'api' }, () => onEventDelete?.(coverId));
      });
      return;
    }

    // 1. Mark the shift as covered
    const newMeta = buildCoverageMeta(ev, normalizedCoveringEmployeeId, resolveEventId(primaryOpenShift));
    applyEngineOp(
      { type: 'update', id: eventId, patch: { meta: newMeta }, source: 'api' },
      () => emitEventSave(eventId, ev, { meta: newMeta }),
    );

    // 2. If there is a linked open-shift record, mark it as covered too
    if (primaryOpenShift) {
      const [openShiftEv, ...duplicateOpenShifts] = openShiftCandidates;
      if (openShiftEv === undefined) return;
      duplicateOpenShifts.forEach((duplicateOpenShift) => {
        const duplicateId = resolveEventId(duplicateOpenShift);
        if (!duplicateId) return;
        applyEngineOp({ type: 'delete', id: duplicateId, source: 'api' }, () => onEventDelete?.(duplicateId));
      });
      const openMeta = {
        ...(openShiftEv.meta ?? {}),
        coveredBy: normalizedCoveringEmployeeId,
        status:    'covered',
      };
      const openId = resolveEventId(openShiftEv);
      if (openId) {
        applyEngineOp(
          { type: 'update', id: openId, patch: { meta: openMeta }, source: 'api' },
          () => emitEventSave(openId, openShiftEv, { meta: openMeta }),
        );
      }
    }

    mirroredCoverage.slice(1).forEach((duplicateEv) => {
      const duplicateId = resolveEventId(duplicateEv);
      if (!duplicateId) return;
      applyEngineOp({ type: 'delete', id: duplicateId, source: 'api' }, () => onEventDelete?.(duplicateId));
    });

    // 3. Create or update the mirrored on-call event on the covering employee's row.
    //    Clamp to the PTO request window (meta.requestStart/End) when available so
    //    the coverage bar only spans the days actually needing coverage.
    const onCallCat = ownerConfig?.['onCallCategory'] ?? 'on-call';
    const shiftStart = ev.start instanceof Date ? ev.start : new Date(ev.start);
    const shiftEnd   = ev.end   instanceof Date ? ev.end   : new Date(ev.end);
    const requestStart = ev.meta?.requestStart ? new Date(ev.meta.requestStart) : shiftStart;
    const requestEnd   = ev.meta?.requestEnd   ? new Date(ev.meta.requestEnd)   : shiftEnd;
    const mirrorStart = requestStart > shiftStart ? requestStart : shiftStart;
    const mirrorEnd   = requestEnd   < shiftEnd   ? requestEnd   : shiftEnd;
    const mirroredPatch = {
      title:    `Covering: ${ev.title ?? 'Shift'}`,
      start:    mirrorStart,
      end:      mirrorEnd,
      category: onCallCat,
      resource: normalizedCoveringEmployeeId,
      meta: {
        kind:              SCHEDULE_KINDS.COVERING,
        sourceShiftId:     eventId,
        coveredEmployeeId: String(ev.resource ?? ev.employeeId ?? ''),
      },
    };
    const existingMirror = mirroredCoverage[0];
    if (existingMirror) {
      const mirrorId = resolveEventId(existingMirror);
      if (mirrorId) {
        applyEngineOp(
          { type: 'update', id: mirrorId, patch: mirroredPatch, source: 'api' },
          () => emitEventSave(mirrorId, existingMirror, mirroredPatch),
        );
      }
    } else {
      const mirrorId = createId('cover');
      applyEngineOp(
        { type: 'create', event: { ...mirroredPatch, id: mirrorId }, source: 'api' },
        () => emitEventSave(mirrorId, mirroredPatch, { id: mirrorId }),
      );
    }
  }, [applyEngineOp, emitEventSave, expandedEvents, onEventDelete, ownerConfig]);

  const handleEmployeeAction = useCallback((empId: LooseValue, actionInput: LooseValue) => {
    const emp = configuredEmployees.find((e: LooseValue) => String(e.id) === String(empId)) ?? { id: empId, name: empId };
    const actionPayload = typeof actionInput === 'string'
      ? { type: actionInput }
      : (actionInput ?? {});
    const action = actionPayload.type;
    if (!action) return;
    const AVAILABILITY_ACTIONS = new Set(['pto', 'unavailable', 'availability']);
    if (AVAILABILITY_ACTIONS.has(action)) {
      const initialEvent = action === 'availability'
        ? expandedEvents
          .filter((ev: LooseValue) => {
            const evKind = normalizeScheduleKind(ev?.kind ?? ev?.meta?.kind);
            const evCat  = String(ev?.category ?? '').toLowerCase();
            const resourceId = String(ev?.resource ?? ev?.resourceId ?? ev?.employeeId ?? '');
            return resourceId === String(empId) && (evKind === 'availability' || evCat === 'availability');
          })
          .sort((a: LooseValue, b: LooseValue) => {
            const aStart = a?.start ? new Date(a.start).getTime() : 0;
            const bStart = b?.start ? new Date(b.start).getTime() : 0;
            return bStart - aStart;
          })
          .map((ev: LooseValue) => ({ ...ev, id: ev?._eventId ?? ev?.id }))[0] ?? null
        : actionPayload.sourceShift
          ? {
            title: action === 'pto' ? 'PTO' : 'Unavailable',
            start: actionPayload.sourceShift.start,
            end: actionPayload.sourceShift.end,
            allDay: actionPayload.sourceShift.allDay ?? true,
            meta: actionPayload.sourceShift.meta ?? {},
          }
          : null;
      const initialStart = actionPayload.sourceShift?.start
        ? new Date(actionPayload.sourceShift.start)
        : new Date();
      setAvailabilityState({ emp, kind: action, start: initialStart, initialEvent });
    } else if (action === 'schedule') {
      setScheduleEditorState({ emp, start: new Date() });
    }
    onEmployeeAction?.(empId, actionInput);
  }, [configuredEmployees, expandedEvents, onEmployeeAction, setAvailabilityState, setScheduleEditorState]);

  /** Save an availability/PTO event through the engine then notify the host.
   *  Also runs overlap detection: any uncovered shift overlapping the PTO/
   *  unavailable window automatically gets an open-shift event created. */
  const handleAvailabilitySave = useCallback((availEv: LooseValue) => {
    const existingAvailability = expandedEvents.find(
      (ev: LooseValue) => String(ev._eventId ?? ev.id) === String(availEv.id),
    );
    const availabilityId = existingAvailability
      ? String(existingAvailability._eventId ?? existingAvailability.id)
      : String(availEv.id ?? createId('avail'));
    const saveOp = existingAvailability
      ? {
        type: 'update',
        id: availabilityId,
        patch: {
          title: availEv.title,
          start: availEv.start,
          end: availEv.end,
          allDay: availEv.allDay,
          category: availEv.category,
          color: availEv.color,
          resource: availEv.resource,
          resourceId: availEv.resource,
          meta: availEv.meta,
        },
        source: 'api',
      }
      : { type: 'create', event: { ...availEv, id: availabilityId }, source: 'api' };

    applyEngineOp(saveOp, () => {
      const savedPayload = getSavedEventPayload(availabilityId, availEv, { id: availabilityId });
      if (savedPayload) onAvailabilitySave?.(savedPayload);
    });

    const isLeave = availEv.kind === 'pto' || availEv.kind === 'unavailable';
    if (isLeave) {
      const onCallCat = ownerConfig?.['onCallCategory'] ?? 'on-call';
      const { conflictingEvents } = detectShiftConflicts({
        employeeId:    String(availEv.employeeId ?? availEv.resource ?? ''),
        requestStart:  availEv.start instanceof Date ? availEv.start : new Date(availEv.start),
        requestEnd:    availEv.end   instanceof Date ? availEv.end   : new Date(availEv.end),
        allEvents:     expandedEvents,
        onCallCategory: onCallCat,
      });
      conflictingEvents.forEach(shiftEv => {
        const shiftId = shiftEv._eventId ?? String(shiftEv.id ?? '');
        if (!shiftId) return;
        const existingOpenShifts = findLinkedOpenShifts(expandedEvents, shiftEv);
        existingOpenShifts.slice(1).forEach((duplicateOpenShift) => {
          const duplicateId = resolveEventId(duplicateOpenShift);
          if (!duplicateId) return;
          applyEngineOp({ type: 'delete', id: duplicateId, source: 'api' }, () => onEventDelete?.(duplicateId));
        });

        const openShiftPatch = buildOpenShiftPatch(existingOpenShifts[0], shiftEv, availEv.kind);
        const openShift = existingOpenShifts[0]
          ? { ...existingOpenShifts[0], ...openShiftPatch }
          : buildOpenShiftEvent({ shiftEvent: shiftEv, reason: availEv.kind });

        if (existingOpenShifts[0]) {
          const openId = resolveEventId(existingOpenShifts[0]);
          if (openId) {
            applyEngineOp(
              { type: 'update', id: openId, patch: openShiftPatch, source: 'api' },
              () => emitEventSave(openId, existingOpenShifts[0], openShiftPatch),
            );
          }
        } else {
          applyEngineOp(
            { type: 'create', event: openShift, source: 'api' },
            () => emitEventSave(openShift['id'], openShift),
          );
        }

        const updatedMeta = {
          ...(shiftEv.meta ?? {}),
          shiftStatus:  availEv.kind,
          openShiftId:  openShift['id'],
          coveredBy:    null as LooseValue,
          requestStart: availEv.start instanceof Date ? availEv.start.toISOString() : String(availEv.start),
          requestEnd:   availEv.end   instanceof Date ? availEv.end.toISOString()   : String(availEv.end),
        };
        applyEngineOp(
          { type: 'update', id: shiftId, patch: { meta: updatedMeta }, source: 'api' },
          () => emitEventSave(shiftId, shiftEv, { meta: updatedMeta }),
        );
      });
    }

    setAvailabilityState(null);
  }, [applyEngineOp, emitEventSave, getSavedEventPayload, onAvailabilitySave, onEventDelete, expandedEvents, ownerConfig, setAvailabilityState]);

  const handleScheduleEditorSave = useCallback((shiftEvOrArr: LooseValue) => {
    const events = Array.isArray(shiftEvOrArr) ? shiftEvOrArr : [shiftEvOrArr];
    events.forEach((ev: LooseValue, index: number) => {
      const scheduleId = String(ev.id ?? createId(`shift-${index}`));
      applyEngineOp(
        { type: 'create', event: { ...ev, id: scheduleId }, source: 'api' },
        () => {
          const savedPayload = getSavedEventPayload(scheduleId, ev, { id: scheduleId });
          if (savedPayload) onScheduleSave?.(savedPayload);
        },
      );
    });
    setScheduleEditorState(null);
  }, [applyEngineOp, getSavedEventPayload, onScheduleSave, setScheduleEditorState]);

  return {
    handleShiftStatusChange,
    handleCoverageAssign,
    handleEmployeeAction,
    handleAvailabilitySave,
    handleScheduleEditorSave,
  };
}
