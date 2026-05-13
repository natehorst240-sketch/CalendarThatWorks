const NON_ACTIVE_APPROVAL_STAGES = new Set(['requested', 'pending_higher', 'denied']);

type AssetEvent = {
  resource?: unknown;
  start?: unknown;
  end?: unknown;
  status?: unknown;
  meta?: { approvalStage?: { stage?: unknown } | null | undefined } | null | undefined;
};

function overlapsInstant(ev: AssetEvent, at: Date) {
  if (!(ev?.start instanceof Date) || !(ev?.end instanceof Date)) return false;
  return ev.start <= at && ev.end >= at;
}

function isNonActiveBooking(ev: AssetEvent) {
  if (ev?.status === 'cancelled') return true;
  const stage = ev?.meta?.approvalStage?.stage;
  return typeof stage === 'string' ? NON_ACTIVE_APPROVAL_STAGES.has(stage) : false;
}

export function getAssetStatus(assetId: string, events: readonly AssetEvent[], now = new Date()) {
  const relevant = events.filter(ev => ev?.resource === assetId);

  const hasAssigned = relevant.some(ev => overlapsInstant(ev, now) && !isNonActiveBooking(ev));
  if (hasAssigned) return 'assigned';

  const hasRequested = relevant.some(ev =>
    ev?.status !== 'cancelled'
    && ev?.meta?.approvalStage?.stage === 'requested'
    && ev?.end instanceof Date
    && ev.end >= now,
  );
  if (hasRequested) return 'requested';

  return 'available';
}
