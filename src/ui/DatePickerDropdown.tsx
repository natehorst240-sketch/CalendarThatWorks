/**
 * Compact date-picker dropdown for the calendar's top header band.
 *
 * Renders as a single button showing the active date label (formatted
 * per view — month / week / day). Clicking opens a month grid: prev /
 * next year navigation, twelve months in a 3×4 grid, plus a "Today"
 * link. Selecting a month sets the calendar's currentDate to the 1st
 * of that month and closes the dropdown.
 *
 * Replaces the prior multi-button cluster (<- / Today / -> / "June 2025")
 * to free top-bar real estate at mobile widths. Aligned with the Dispatch
 * board's single-row header pattern.
 */
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';

const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export interface DatePickerDropdownProps {
  /** Currently active date — drives the visible label + selected highlight. */
  readonly currentDate: Date;
  /** Pre-formatted label rendered on the closed button (e.g. "Jun 22 – 28, 2025"). */
  readonly label: string;
  /** Handler invoked when the user picks a month from the grid. */
  readonly onDateChange: (date: Date) => void;
  /** "Today" shortcut handler. */
  readonly onToday: () => void;
  /** Per-period nav arrows that keep working alongside the dropdown. */
  readonly onPrev: () => void;
  readonly onNext: () => void;
  /** aria-keyshortcuts hints to surface the existing j/k/t bindings. */
  readonly prevShortcut?: string;
  readonly nextShortcut?: string;
}

export function DatePickerDropdown({
  currentDate, label, onDateChange, onToday, onPrev, onNext,
  prevShortcut, nextShortcut,
}: DatePickerDropdownProps) {
  const [open, setOpen] = useState(false);
  // Year shown in the picker grid. Tracks currentDate while closed, but
  // the user can flip years independently while the dropdown is open.
  const [pickerYear, setPickerYear] = useState(() => currentDate.getFullYear());
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape — mirrors AppHeader's hamburger.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Re-sync the picker year whenever the dropdown is re-opened, so users
  // don't jump back to whatever year they were idly browsing last time.
  useEffect(() => {
    if (open) setPickerYear(currentDate.getFullYear());
  }, [open, currentDate]);

  const activeYear = currentDate.getFullYear();
  const activeMonth = currentDate.getMonth();

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <button
        type="button"
        onClick={onPrev}
        aria-label="Previous period"
        {...(prevShortcut ? { 'aria-keyshortcuts': prevShortcut } : {})}
        style={navBtnStyle}
      >
        <ChevronLeft size={14} aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        style={labelBtnStyle}
      >
        <span style={{ fontWeight: 700 }}>{label}</span>
        <ChevronDown size={12} aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={onNext}
        aria-label="Next period"
        {...(nextShortcut ? { 'aria-keyshortcuts': nextShortcut } : {})}
        style={navBtnStyle}
      >
        <ChevronRight size={14} aria-hidden="true" />
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Pick a month"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            zIndex: 200,
            minWidth: 240,
            background: 'var(--wc-surface, #fff)',
            border: '1px solid var(--wc-border, rgba(0,0,0,0.15))',
            borderRadius: 8,
            boxShadow: 'var(--wc-shadow, 0 8px 20px rgba(0,0,0,0.18))',
            padding: 8,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <button type="button" onClick={() => setPickerYear((y) => y - 1)} aria-label="Previous year" style={navBtnStyle}>
              <ChevronLeft size={14} aria-hidden="true" />
            </button>
            <span style={{ fontWeight: 700, fontSize: 13 }}>{pickerYear}</span>
            <button type="button" onClick={() => setPickerYear((y) => y + 1)} aria-label="Next year" style={navBtnStyle}>
              <ChevronRight size={14} aria-hidden="true" />
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
            {MONTH_LABELS.map((m, i) => {
              const isActive = pickerYear === activeYear && i === activeMonth;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    onDateChange(new Date(pickerYear, i, 1));
                    setOpen(false);
                  }}
                  style={{
                    height: 28,
                    border: 0,
                    borderRadius: 4,
                    background: isActive ? 'var(--wc-accent, #2563eb)' : 'transparent',
                    color: isActive ? '#fff' : 'inherit',
                    fontWeight: isActive ? 700 : 500,
                    cursor: 'pointer',
                    fontSize: 11,
                  }}
                >
                  {m}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => { onToday(); setOpen(false); }}
            style={{
              marginTop: 6,
              width: '100%',
              height: 26,
              border: '1px solid var(--wc-border, rgba(0,0,0,0.15))',
              borderRadius: 4,
              background: 'transparent',
              cursor: 'pointer',
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            Today
          </button>
        </div>
      )}
    </div>
  );
}

const navBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 24,
  height: 24,
  padding: 0,
  border: '1px solid var(--wc-border, rgba(0,0,0,0.15))',
  borderRadius: 4,
  background: 'transparent',
  cursor: 'pointer',
};

const labelBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  height: 24,
  padding: '0 8px',
  border: '1px solid var(--wc-border, rgba(0,0,0,0.15))',
  borderRadius: 4,
  background: 'var(--wc-surface-2, transparent)',
  cursor: 'pointer',
  fontSize: 12,
};
