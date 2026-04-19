import { describe, it, expect } from 'vitest';
import {
  VIEW_SCOPES,
  captureSavedViewFields,
  type SavedViewCaptureCtx,
} from '../viewScope';

const FULL_CTX: SavedViewCaptureCtx = {
  groupBy:         'role',
  sort:            [{ field: 'title', direction: 'asc' }],
  showAllGroups:   true,
  zoomLevel:       'week',
  collapsedGroups: new Set(['a']),
  selectedBaseIds: ['base-1'],
};

describe('captureSavedViewFields', () => {
  it('returns an empty object for views without persistedFields', () => {
    expect(captureSavedViewFields('month', FULL_CTX)).toEqual({});
    expect(captureSavedViewFields('week',  FULL_CTX)).toEqual({});
    expect(captureSavedViewFields('day',   FULL_CTX)).toEqual({});
  });

  it('picks only the fields declared on agenda scope', () => {
    expect(captureSavedViewFields('agenda', FULL_CTX)).toEqual({
      groupBy:       'role',
      sort:          FULL_CTX.sort,
      showAllGroups: true,
    });
  });

  it('picks only the fields declared on schedule scope', () => {
    expect(captureSavedViewFields('schedule', FULL_CTX)).toEqual({
      groupBy: 'role',
      sort:    FULL_CTX.sort,
    });
  });

  it('picks only selectedBaseIds on base scope', () => {
    expect(captureSavedViewFields('base', FULL_CTX)).toEqual({
      selectedBaseIds: ['base-1'],
    });
  });

  it('picks the assets-specific fields on assets scope', () => {
    expect(captureSavedViewFields('assets', FULL_CTX)).toEqual({
      groupBy:         'role',
      sort:            FULL_CTX.sort,
      zoomLevel:       'week',
      collapsedGroups: FULL_CTX.collapsedGroups,
    });
  });

  it('drops undefined entries', () => {
    expect(
      captureSavedViewFields('assets', {
        groupBy:         undefined,
        sort:            FULL_CTX.sort,
        zoomLevel:       undefined,
        collapsedGroups: FULL_CTX.collapsedGroups,
      }),
    ).toEqual({
      sort:            FULL_CTX.sort,
      collapsedGroups: FULL_CTX.collapsedGroups,
    });
  });

  it('preserves null (distinct from undefined) so callers can clear state', () => {
    expect(captureSavedViewFields('agenda', { groupBy: null, sort: null, showAllGroups: false }))
      .toEqual({ groupBy: null, sort: null, showAllGroups: false });
  });

  it('falls back to the month scope (empty) for unknown view ids', () => {
    expect(captureSavedViewFields('nope', FULL_CTX)).toEqual({});
  });

  it('registry lists each field exactly once per view', () => {
    for (const scope of Object.values(VIEW_SCOPES)) {
      const fields = scope.persistedFields ?? [];
      expect(new Set(fields).size).toBe(fields.length);
    }
  });
});
