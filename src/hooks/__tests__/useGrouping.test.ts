import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGrouping } from '../useGroupingRows.ts';

const rows = [
  { id: 1, emp: { role: 'Nurse' } },
  { id: 2, emp: { role: 'Nurse' } },
  { id: 3, emp: { role: 'Doctor' } },
];

const fieldAccessor = (row) => row.emp?.role ?? null;

describe('useGrouping', () => {
  it('returns identity flatRows when groupBy is null', () => {
    const { result } = renderHook(() => useGrouping(rows, {}));
    expect(result.current.flatRows).toBe(rows);
    expect(result.current.isGrouped).toBe(false);
  });

  it('returns grouped flatRows when groupBy is set', () => {
    const { result } = renderHook(() =>
      useGrouping(rows, { groupBy: 'role', fieldAccessor }),
    );
    expect(result.current.isGrouped).toBe(true);
    expect(result.current.groupOrder).toEqual(['Nurse', 'Doctor']);
    const headers = result.current.flatRows.filter(r => r._type === 'groupHeader');
    expect(headers.length).toBe(2);
  });

  it('toggleGroup adds key to collapsedGroups', () => {
    const { result } = renderHook(() =>
      useGrouping(rows, { groupBy: 'role', fieldAccessor }),
    );
    act(() => result.current.toggleGroup('Nurse'));
    expect(result.current.collapsedGroups.has('Nurse')).toBe(true);
    const nurseMembers = result.current.flatRows.filter(r => !r._type && r.emp?.role === 'Nurse');
    expect(nurseMembers.length).toBe(0);
  });

  it('toggleGroup removes key when already collapsed', () => {
    const { result } = renderHook(() =>
      useGrouping(rows, { groupBy: 'role', fieldAccessor }),
    );
    act(() => result.current.toggleGroup('Nurse'));
    act(() => result.current.toggleGroup('Nurse'));
    expect(result.current.collapsedGroups.has('Nurse')).toBe(false);
  });

  it('expandAll clears collapsedGroups', () => {
    const { result } = renderHook(() =>
      useGrouping(rows, { groupBy: 'role', fieldAccessor }),
    );
    act(() => result.current.toggleGroup('Nurse'));
    act(() => result.current.toggleGroup('Doctor'));
    act(() => result.current.expandAll());
    expect(result.current.collapsedGroups.size).toBe(0);
  });

  it('collapseAll collapses all groups', () => {
    const { result } = renderHook(() =>
      useGrouping(rows, { groupBy: 'role', fieldAccessor }),
    );
    act(() => result.current.collapseAll());
    expect(result.current.collapsedGroups.has('Nurse')).toBe(true);
    expect(result.current.collapsedGroups.has('Doctor')).toBe(true);
  });
});
