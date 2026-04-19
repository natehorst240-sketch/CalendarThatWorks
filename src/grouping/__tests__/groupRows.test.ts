import { describe, it, expect } from 'vitest';
import { groupRows } from '../groupRows';

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

  describe('multi-level (array of accessors)', () => {
    const nestedRows = [
      { id: 1, emp: { role: 'Nurse',  shift: 'Day'   } },
      { id: 2, emp: { role: 'Nurse',  shift: 'Day'   } },
      { id: 3, emp: { role: 'Nurse',  shift: 'Night' } },
      { id: 4, emp: { role: 'Doctor', shift: 'Day'   } },
      { id: 5, emp: { role: 'Doctor', shift: 'Night' } },
    ];
    const roleAcc  = (r) => r.emp.role;
    const shiftAcc = (r) => r.emp.shift;

    it('produces nested headers with depth metadata', () => {
      const { flatRows, groupOrder } = groupRows(nestedRows, {
        groupBy: ['role', 'shift'],
        fieldAccessor: [roleAcc, shiftAcc],
      });
      const headers = flatRows.filter(r => r._type === 'groupHeader');
      // 2 top-level (Nurse, Doctor) + 4 second-level (Nurse/Day, Nurse/Night, Doctor/Day, Doctor/Night)
      expect(headers).toHaveLength(6);
      const depths = headers.map(h => h.depth);
      expect(depths).toEqual([0, 1, 1, 0, 1, 1]);
      // groupOrder contains every path in traversal order
      expect(groupOrder).toContain('Nurse');
      expect(groupOrder).toContain('Nurse/Day');
      expect(groupOrder).toContain('Nurse/Night');
      expect(groupOrder).toContain('Doctor/Day');
    });

    it('collapsing a top-level path hides every descendant level', () => {
      const { flatRows } = groupRows(nestedRows, {
        groupBy: ['role', 'shift'],
        fieldAccessor: [roleAcc, shiftAcc],
        collapsedGroups: new Set(['Nurse']),
      });
      // No Nurse sub-headers, no Nurse rows
      expect(flatRows.find(r => r.groupKey === 'Nurse/Day')).toBeUndefined();
      expect(flatRows.find(r => !r._type && r.emp.role === 'Nurse')).toBeUndefined();
      // Doctor tree intact
      expect(flatRows.find(r => r.groupKey === 'Doctor/Day')).toBeDefined();
      expect(flatRows.filter(r => !r._type && r.emp.role === 'Doctor')).toHaveLength(2);
    });

    it('collapsing a nested path hides only its bucket', () => {
      const { flatRows } = groupRows(nestedRows, {
        groupBy: ['role', 'shift'],
        fieldAccessor: [roleAcc, shiftAcc],
        collapsedGroups: new Set(['Nurse/Day']),
      });
      // Nurse/Day header present (collapsed) but its rows hidden
      const dayHeader = flatRows.find(r => r.groupKey === 'Nurse/Day');
      expect(dayHeader.collapsed).toBe(true);
      expect(flatRows.filter(r => !r._type && r.emp.role === 'Nurse' && r.emp.shift === 'Day')).toHaveLength(0);
      // Nurse/Night unaffected — 1 row
      expect(flatRows.filter(r => !r._type && r.emp.role === 'Nurse' && r.emp.shift === 'Night')).toHaveLength(1);
    });

    it('parent header count reports leaf-row totals, not direct children', () => {
      const { flatRows } = groupRows(nestedRows, {
        groupBy: ['role', 'shift'],
        fieldAccessor: [roleAcc, shiftAcc],
      });
      const nurseHeader = flatRows.find(r => r.groupKey === 'Nurse');
      expect(nurseHeader.count).toBe(3); // Day: 2 + Night: 1
      const doctorHeader = flatRows.find(r => r.groupKey === 'Doctor');
      expect(doctorHeader.count).toBe(2);
    });
  });
});
