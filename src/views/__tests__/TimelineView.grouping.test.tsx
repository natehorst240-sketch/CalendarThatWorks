import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import TimelineView from '../TimelineView';
import { CalendarContext } from '../../core/CalendarContext';

const currentDate = new Date(2026, 3, 1); // April 2026

const employees = [
  { id: 'nurse-1', name: 'Alice Chen',  role: 'Nurse'  },
  { id: 'nurse-2', name: 'Bob Smith',   role: 'Nurse'  },
  { id: 'doc-1',   name: 'Carol Jones', role: 'Doctor' },
];

function renderTimeline(props = {}) {
  return render(
    <CalendarContext.Provider value={null}>
      <TimelineView
        currentDate={currentDate}
        events={[]}
        employees={employees}
        onEventClick={vi.fn()}
        {...props}
      />
    </CalendarContext.Provider>,
  );
}

describe('TimelineView grouping', () => {
  it('renders group headers with expand/collapse buttons when groupBy is set', () => {
    renderTimeline({ groupBy: 'role' });
    expect(
      screen.getByRole('button', { name: /Collapse group Nurse/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Collapse group Doctor/i }),
    ).toBeInTheDocument();
  });

  it('shows correct member count badges (2 Nurses, 1 Doctor)', () => {
    renderTimeline({ groupBy: 'role' });
    const nurseBtn = screen.getByRole('button', { name: /Collapse group Nurse/i });
    expect(nurseBtn).toHaveTextContent('2');
    const doctorBtn = screen.getByRole('button', { name: /Collapse group Doctor/i });
    expect(doctorBtn).toHaveTextContent('1');
  });

  it('collapse hides member rows while keeping the header visible', () => {
    renderTimeline({ groupBy: 'role' });
    // All employees visible initially
    expect(screen.getByRole('rowheader', { name: 'Alice Chen' })).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: 'Bob Smith' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Collapse group Nurse/i }));

    // Nurse members hidden
    expect(screen.queryByRole('rowheader', { name: 'Alice Chen' })).not.toBeInTheDocument();
    expect(screen.queryByRole('rowheader', { name: 'Bob Smith' })).not.toBeInTheDocument();
    // Group header still present
    expect(screen.getByText('Nurse')).toBeInTheDocument();
    // Doctor member unaffected
    expect(screen.getByRole('rowheader', { name: 'Carol Jones' })).toBeInTheDocument();
  });

  it('expand restores member rows after collapse', () => {
    renderTimeline({ groupBy: 'role' });
    fireEvent.click(screen.getByRole('button', { name: /Collapse group Nurse/i }));
    fireEvent.click(screen.getByRole('button', { name: /Expand group Nurse/i }));

    expect(screen.getByRole('rowheader', { name: 'Alice Chen' })).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: 'Bob Smith' })).toBeInTheDocument();
  });

  it('supports multi-level groupBy arrays with nested headers', () => {
    const multiEmployees = [
      { id: 'a', name: 'Alice', role: 'Nurse',  shift: 'Day'   },
      { id: 'b', name: 'Bob',   role: 'Nurse',  shift: 'Day'   },
      { id: 'c', name: 'Carol', role: 'Nurse',  shift: 'Night' },
      { id: 'd', name: 'Dan',   role: 'Doctor', shift: 'Day'   },
    ];
    render(
      <CalendarContext.Provider value={null}>
        <TimelineView
          currentDate={currentDate}
          events={[]}
          employees={multiEmployees}
          onEventClick={vi.fn()}
          groupBy={['role', 'shift']}
        />
      </CalendarContext.Provider>,
    );
    // Top-level role headers
    expect(screen.getByRole('button', { name: /Collapse group Nurse/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Collapse group Doctor/i })).toBeInTheDocument();
    // Nested shift headers — 'Day' appears under both Nurse and Doctor
    expect(screen.getAllByRole('button', { name: /Collapse group Day/i }).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole('button', { name: /Collapse group Night/i })).toBeInTheDocument();
  });

  it('collapsing a parent group hides its nested headers and members', () => {
    const multiEmployees = [
      { id: 'a', name: 'Alice', role: 'Nurse',  shift: 'Day'   },
      { id: 'b', name: 'Bob',   role: 'Nurse',  shift: 'Night' },
      { id: 'c', name: 'Dan',   role: 'Doctor', shift: 'Day'   },
    ];
    render(
      <CalendarContext.Provider value={null}>
        <TimelineView
          currentDate={currentDate}
          events={[]}
          employees={multiEmployees}
          onEventClick={vi.fn()}
          groupBy={['role', 'shift']}
        />
      </CalendarContext.Provider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Collapse group Nurse/i }));
    // Nurse's nested shift headers gone
    expect(screen.queryByRole('button', { name: /Collapse group Night/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('rowheader', { name: 'Alice' })).not.toBeInTheDocument();
    expect(screen.queryByRole('rowheader', { name: 'Bob' })).not.toBeInTheDocument();
    // Doctor side unaffected
    expect(screen.getByRole('rowheader', { name: 'Dan' })).toBeInTheDocument();
  });

  describe('DnD row reassignment', () => {
    function dragAndDrop(source, target) {
      const dt = {
        effectAllowed: '',
        dropEffect: '',
        _data: {},
        setData(k, v) { this._data[k] = v; },
        getData(k) { return this._data[k]; },
      };
      fireEvent.dragStart(source, { dataTransfer: dt });
      fireEvent.dragOver(target, { dataTransfer: dt });
      fireEvent.drop(target, { dataTransfer: dt });
      fireEvent.dragEnd(source, { dataTransfer: dt });
    }

    const shiftDay = new Date(2026, 3, 5, 9);
    const shiftEnd = new Date(2026, 3, 5, 17);
    const evts = [
      { id: 'shift-1', title: 'Alice Shift', start: shiftDay, end: shiftEnd, resource: 'nurse-1' },
    ];

    it('dragging an event from one employee row to another calls onEventGroupChange', () => {
      const onEventGroupChange = vi.fn();
      render(
        <CalendarContext.Provider value={null}>
          <TimelineView
            currentDate={currentDate}
            events={evts}
            employees={employees}
            onEventClick={vi.fn()}
            onEventGroupChange={onEventGroupChange}
          />
        </CalendarContext.Provider>,
      );

      const source = screen.getByRole('button', { name: /Alice Shift/i });
      expect(source).toHaveAttribute('draggable', 'true');

      // Target row = Bob Smith's row.  Find via the rowheader and walk up.
      const bobHeader = screen.getByRole('rowheader', { name: 'Bob Smith' });
      const bobRow = bobHeader.closest('[role="row"]');
      expect(bobRow).toBeTruthy();

      dragAndDrop(source, bobRow);

      expect(onEventGroupChange).toHaveBeenCalledTimes(1);
      const [evArg, patchArg] = onEventGroupChange.mock.calls[0];
      expect(evArg.id).toBe('shift-1');
      expect(patchArg).toEqual({ resource: 'nurse-2' });
    });

    it('dropping onto the same row does not fire onEventGroupChange', () => {
      const onEventGroupChange = vi.fn();
      render(
        <CalendarContext.Provider value={null}>
          <TimelineView
            currentDate={currentDate}
            events={evts}
            employees={employees}
            onEventClick={vi.fn()}
            onEventGroupChange={onEventGroupChange}
          />
        </CalendarContext.Provider>,
      );

      const source = screen.getByRole('button', { name: /Alice Shift/i });
      const aliceRow = screen.getByRole('rowheader', { name: 'Alice Chen' }).closest('[role="row"]');
      dragAndDrop(source, aliceRow);

      expect(onEventGroupChange).not.toHaveBeenCalled();
    });

    it('events are not draggable when onEventGroupChange is absent', () => {
      render(
        <CalendarContext.Provider value={null}>
          <TimelineView
            currentDate={currentDate}
            events={evts}
            employees={employees}
            onEventClick={vi.fn()}
          />
        </CalendarContext.Provider>,
      );
      const source = screen.getByRole('button', { name: /Alice Shift/i });
      expect(source).not.toHaveAttribute('draggable', 'true');
    });
  });

  it('renders no group headers when groupBy is not set (backward compat)', () => {
    renderTimeline();
    expect(
      screen.queryByRole('button', { name: /Collapse group/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Expand group/i }),
    ).not.toBeInTheDocument();
    // All employees still shown as plain rows
    expect(screen.getByRole('rowheader', { name: 'Alice Chen' })).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: 'Bob Smith' })).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: 'Carol Jones' })).toBeInTheDocument();
  });
});
