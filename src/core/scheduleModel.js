/**
 * Canonical schedule model helpers.
 *
 * Normalized kinds:
 * - shift
 * - on-call
 * - open-shift
 * - covering
 */

export const SCHEDULE_KINDS = Object.freeze({
  SHIFT: 'shift',
  ON_CALL: 'on-call',
  OPEN_SHIFT: 'open-shift',
  COVERING: 'covering',
});

const KIND_ALIASES = Object.freeze({
  oncall: SCHEDULE_KINDS.ON_CALL,
  'on_call': SCHEDULE_KINDS.ON_CALL,
  openshift: SCHEDULE_KINDS.OPEN_SHIFT,
  'open_shift': SCHEDULE_KINDS.OPEN_SHIFT,
  'covering-shift': SCHEDULE_KINDS.COVERING,
});

export function normalizeScheduleKind(rawKind) {
  const normalized = String(rawKind ?? '').trim().toLowerCase();
  if (!normalized) return '';
  return KIND_ALIASES[normalized] ?? normalized;
}

export function isOpenShiftEvent(ev) {
  const kind = normalizeScheduleKind(ev?.meta?.kind ?? ev?.kind);
  const category = String(ev?.category ?? '').toLowerCase();
  return kind === SCHEDULE_KINDS.OPEN_SHIFT || category === SCHEDULE_KINDS.OPEN_SHIFT;
}

export function isCoveringEvent(ev) {
  const kind = normalizeScheduleKind(ev?.meta?.kind ?? ev?.kind);
  return kind === SCHEDULE_KINDS.COVERING;
}

export function isShiftOrOnCallEvent(ev, onCallCategory = 'on-call') {
  const kind = normalizeScheduleKind(ev?.meta?.kind ?? ev?.kind);
  const category = String(ev?.category ?? '').toLowerCase();
  return kind === SCHEDULE_KINDS.SHIFT
    || kind === SCHEDULE_KINDS.ON_CALL
    || ev?.meta?.onCall === true
    || category === String(onCallCategory).toLowerCase();
}

export function isCoveredShift(ev) {
  return !!ev?.meta?.coveredBy
    || ev?.meta?.status === 'covered'
    || ev?.meta?.shiftStatus === 'covered';
}
