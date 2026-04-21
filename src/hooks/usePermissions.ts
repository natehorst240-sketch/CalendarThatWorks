/**
 * usePermissions — maps a role string to a capabilities object.
 *
 * Roles:
 *   'admin'    — full access: manage people, configure options, add/edit/delete events
 *   'user'     — can add/edit/delete events and apply saved views; cannot manage people or options
 *   'readonly' — view only; all writes disabled
 */

export const ROLES = /** @type {const} */ (['admin', 'user', 'readonly']);
type Role = 'admin' | 'user' | 'readonly';

export type PermissionCaps = {
  canAddEvent: boolean;
  canEditEvent: boolean;
  canDeleteEvent: boolean;
  canDrag: boolean;
  canManagePeople: boolean;
  canManageOptions: boolean;
  canManageSavedViews: boolean;
};

const CAPS: Record<Role, PermissionCaps> = {
  admin: {
    canAddEvent:         true,
    canEditEvent:        true,
    canDeleteEvent:      true,
    canDrag:             true,
    canManagePeople:     true,
    canManageOptions:    true,   // add/remove category options
    canManageSavedViews: true,
  },
  user: {
    canAddEvent:         true,
    canEditEvent:        true,
    canDeleteEvent:      true,
    canDrag:             true,
    canManagePeople:     false,
    canManageOptions:    false,
    canManageSavedViews: true,
  },
  readonly: {
    canAddEvent:         false,
    canEditEvent:        false,
    canDeleteEvent:      false,
    canDrag:             false,
    canManagePeople:     false,
    canManageOptions:    false,
    canManageSavedViews: false,
  },
};

export function usePermissions(role: string = 'admin'): PermissionCaps {
  return CAPS[(role in CAPS ? role : 'admin') as Role];
}
