/**
 * Demo profile registry — drives the Landing-page profile switcher and
 * the approval-action gating in App.tsx.
 *
 * `permissionRole` maps to the calendar's existing `usePermissions`
 * roles (admin / user / readonly) — switching profiles visibly changes
 * the Add button, hover-card edit pen, drag affordances, etc.
 *
 * `approval` is a finer-grained capability set used by the demo's
 * approval handler so the hierarchy actually has teeth: a dispatcher
 * can request but not approve; a base supervisor can approve but not
 * finalize; ops manager can do everything; read-only sees the queue
 * but can't act.
 */

export type DemoPermissionRole = 'admin' | 'user' | 'readonly';

export interface DemoApprovalCaps {
  /** Can submit a new approval request (e.g. aircraft request, asset request). */
  canRequest:  boolean;
  /** Can move a request from `requested` → `approved` (first-tier sign-off). */
  canApprove:  boolean;
  /** Can move from `approved` → `finalized` (second-tier sign-off). */
  canFinalize: boolean;
  /** Can deny a request at any pre-finalized stage. */
  canDeny:     boolean;
  /** Can revoke a finalized approval (rare; ops manager only). */
  canRevoke:   boolean;
}

export interface DemoProfile {
  readonly id: string;
  readonly name: string;
  readonly role: string;
  readonly base: string;
  readonly initials: string;
  readonly avatarFrom: string;
  readonly avatarTo: string;
  /** Maps to usePermissions for general read/write capabilities. */
  readonly permissionRole: DemoPermissionRole;
  readonly approval: DemoApprovalCaps;
  /** One-liner shown under the name in the profile card and dropdown. */
  readonly summary: string;
}

export const USER_PROFILES: readonly DemoProfile[] = [
  {
    id:              'ops-manager',
    name:            'Sarah Foster',
    role:            'Ops Manager',
    base:            'Seattle (Hub)',
    initials:        'SF',
    avatarFrom:      '#fdba74',
    avatarTo:        '#c2410c',
    permissionRole:  'admin',
    summary:         'Full approval rights · can finalize and revoke',
    approval: {
      canRequest:  true,
      canApprove:  true,
      canFinalize: true,
      canDeny:     true,
      canRevoke:   true,
    },
  },
  {
    id:              'base-supervisor',
    name:            'Capt. James Wright',
    role:            'Base Supervisor',
    base:            'Seattle (Hub)',
    initials:        'JW',
    avatarFrom:      '#93c5fd',
    avatarTo:        '#2563eb',
    permissionRole:  'user',
    summary:         'First-tier approval · escalates to ops for finalize',
    approval: {
      canRequest:  true,
      canApprove:  true,
      canFinalize: false,
      canDeny:     true,
      canRevoke:   false,
    },
  },
  {
    id:              'dispatcher',
    name:            'Marcus Chen',
    role:            'Dispatcher',
    base:            'Seattle (Hub)',
    initials:        'MC',
    avatarFrom:      '#bbf7d0',
    avatarTo:        '#15803d',
    permissionRole:  'user',
    summary:         'Submits requests · cannot approve or finalize',
    approval: {
      canRequest:  true,
      canApprove:  false,
      canFinalize: false,
      canDeny:     false,
      canRevoke:   false,
    },
  },
  {
    id:              'auditor',
    name:            'Diane Patel',
    role:            'Auditor',
    base:            'Read-only',
    initials:        'DP',
    avatarFrom:      '#e9d5ff',
    avatarTo:        '#7e22ce',
    permissionRole:  'readonly',
    summary:         'Sees the queue · cannot edit or act on approvals',
    approval: {
      canRequest:  false,
      canApprove:  false,
      canFinalize: false,
      canDeny:     false,
      canRevoke:   false,
    },
  },
];

export const DEFAULT_PROFILE_ID = USER_PROFILES[0]!.id;

export function findProfile(id: string): DemoProfile {
  return USER_PROFILES.find(p => p.id === id) ?? USER_PROFILES[0]!;
}

/**
 * Demo simulation: pretend a request was submitted by whichever profile id
 * "would" submit that category. Drives the "My requests" card so each role
 * sees a relevant queue without needing real per-event submitter tracking.
 *
 *   aircraft-request, asset-request → dispatcher
 *   maintenance                     → base-supervisor (mechanic lives here)
 *   anything else                   → dispatcher (safe default)
 */
export function simulatedRequesterIdFor(category: string): string {
  if (category === 'maintenance') return 'base-supervisor';
  return 'dispatcher';
}

/**
 * Given an event's approval stage and the active profile, return whether
 * that event is currently waiting on the profile to take an action.
 *
 *   requested  →  someone with canApprove
 *   approved   →  someone with canFinalize
 *   finalized  →  nobody (terminal)
 *   denied     →  nobody (terminal)
 */
export function isAwaitingProfile(stage: string | null | undefined, profile: DemoProfile): boolean {
  if (stage === 'requested') return profile.approval.canApprove;
  if (stage === 'approved')  return profile.approval.canFinalize;
  return false;
}

/**
 * Approval action -> required capability key. Used by the demo's
 * onApprovalAction handler to gate transitions on the active profile.
 */
export const APPROVAL_ACTION_CAP: Readonly<Record<string, keyof DemoApprovalCaps>> = {
  approve:  'canApprove',
  finalize: 'canFinalize',
  deny:     'canDeny',
  revoke:   'canRevoke',
};
