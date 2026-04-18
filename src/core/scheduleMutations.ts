import { isCoveringEvent, isOpenShiftEvent } from './scheduleModel.js';

export function resolveEventId(ev) {
  return String(ev?._eventId ?? ev?.id ?? '');
}

export function findLinkedOpenShifts(events, shiftEvent) {
  const shiftId = resolveEventId(shiftEvent);
  if (!shiftId) return [];
  return events.filter((candidate) => {
    if (!isOpenShiftEvent(candidate)) return false;
    const candidateId = resolveEventId(candidate);
    const linkedById = shiftEvent?.meta?.openShiftId && candidateId === String(shiftEvent.meta.openShiftId);
    const linkedBySource = String(candidate?.meta?.sourceShiftId ?? '') === shiftId;
    return linkedById || linkedBySource;
  });
}

export function findLinkedMirroredCoverage(events, shiftEvent) {
  const shiftId = resolveEventId(shiftEvent);
  if (!shiftId) return [];
  return events.filter(
    (candidate) => isCoveringEvent(candidate)
      && String(candidate?.meta?.sourceShiftId ?? '') === shiftId,
  );
}

export function buildShiftStatusMeta(shiftEvent, { status, openShiftId }) {
  const nextMeta = { ...(shiftEvent?.meta ?? {}) };
  if (status) {
    nextMeta.shiftStatus = status;
    if (openShiftId) nextMeta.openShiftId = String(openShiftId);
  } else {
    delete nextMeta.shiftStatus;
    delete nextMeta.coveredBy;
    delete nextMeta.openShiftId;
  }
  return nextMeta;
}

export function buildCoverageMeta(shiftEvent, coveringEmployeeId, openShiftId) {
  return {
    ...(shiftEvent?.meta ?? {}),
    coveredBy: String(coveringEmployeeId),
    openShiftId: openShiftId ? String(openShiftId) : shiftEvent?.meta?.openShiftId,
  };
}

export function buildOpenShiftPatch(existingOpenShift, shiftEvent, reason) {
  const shiftId = resolveEventId(shiftEvent);
  return {
    title: `Open: ${shiftEvent?.title ?? 'Shift'}`,
    start: shiftEvent?.start instanceof Date ? shiftEvent.start : new Date(shiftEvent?.start),
    end: shiftEvent?.end instanceof Date ? shiftEvent.end : new Date(shiftEvent?.end),
    resource: null,
    meta: {
      ...(existingOpenShift?.meta ?? {}),
      kind: 'open-shift',
      sourceShiftId: shiftId,
      originalEmployeeId: String(shiftEvent?.resource ?? shiftEvent?.employeeId ?? ''),
      reason,
      coveredBy: null,
      status: 'open',
    },
  };
}
