import { describe, it, expect } from 'vitest';
import { groupRows } from '../groupRows.js';

const rows = [
  { id: 1, emp: { role: 'Nurse' } },
  { id: 2, emp: { role: 'Nurse' } },
  { id: 3, emp: { role: 'Doctor' } },
  { id: 4, emp: { role: 'Doctor' } },
  { id: 5, emp: { role: 'Nurse' } },
  { id: 6, emp: { role: null } },
];

const fieldAccessor = (row) => row.emp?.role ?? null;

describe('groupRows', () => {
  it('groups rows by field value', () => {
    const { flatRows, groupOrder } = groupRows(rows, { groupBy: 'role', fieldAccessor });
    expect(groupOrder).toEqual(['Nurse', 'Doctor', '(Ungrouped)']);
    expect(flatRows.filter(r => r._type === 'groupHeader').length).toBe(3);
    expect(flatRows.filter(r => !r._type).length).toBe(6);
  });

  it('interleaves headers and members correctly', () => {
    const { flatRows } = groupRows(rows, { groupBy: 'role', fieldAccessor });
    const nurseHeader = flatRows.find(r => r._type === 'groupHeader' && r.groupKey === 'Nurse');
    expect(nurseHeader).toBeDefined();
    expect(nurseHeader.count).toBe(3);
    const doctorHeader = flatRows.find(r => r._type === 'groupHeader' && r.groupKey === 'Doctor');
    expect(doctorHeader.count).toBe(2);
  });

  it('collapsed group keeps header but omits members', () => {
    const { flatRows } = groupRows(rows, {
      groupBy: 'role',
      fieldAccessor,
      collapsedGroups: new Set(['Nurse']),
    });
    const nurseHeader = flatRows.find(r => r._type === 'groupHeader' && r.groupKey === 'Nurse');
    expect(nurseHeader.collapsed).toBe(true);
    const nurseMembers = flatRows.filter(r => !r._type && r.emp?.role === 'Nurse');
    expect(nurseMembers.length).toBe(0);
    // Doctor members still present
    expect(flatRows.filter(r => !r._type && r.emp?.role === 'Doctor').length).toBe(2);
  });

  it('null/undefined values go to (Ungrouped) sorted last', () => {
    const { groupOrder, flatRows } = groupRows(rows, { groupBy: 'role', fieldAccessor });
    expect(groupOrder[groupOrder.length - 1]).toBe('(Ungrouped)');
    const ungrouped = flatRows.find(r => r._type === 'groupHeader' && r.groupKey === '(Ungrouped)');
    expect(ungrouped.count).toBe(1);
  });

  it('returns empty flatRows and groupOrder for empty input', () => {
    const { flatRows, groupOrder } = groupRows([], { groupBy: 'role', fieldAccessor });
    expect(flatRows).toEqual([]);
    expect(groupOrder).toEqual([]);
  });

  it('returns identity (same reference) when groupBy is not set', () => {
    const { flatRows } = groupRows(rows, {});
    expect(flatRows).toBe(rows);
  });

  it('groupOrder reflects insertion order among non-ungrouped keys', () => {
    const { groupOrder } = groupRows(rows, { groupBy: 'role', fieldAccessor });
    expect(groupOrder[0]).toBe('Nurse');
    expect(groupOrder[1]).toBe('Doctor');
  });
});
