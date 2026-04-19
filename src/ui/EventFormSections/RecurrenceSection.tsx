import styles from '../EventForm.module.css';

const RECURRENCE_PRESETS = [
  { id: 'none',        label: 'Does not repeat'       },
  { id: 'daily',       label: 'Daily'                 },
  { id: 'weekdays',    label: 'Weekdays (Mon–Fri)'    },
  { id: 'weekly',      label: 'Weekly on start day'   },
  { id: 'monthlyDate', label: 'Monthly on start date' },
  { id: 'custom',      label: 'Custom RRULE'          },
];

/**
 * RecurrenceSection — recurrence preset selector + custom RRULE input.
 *
 * Props:
 *   preset              string   — current preset id
 *   customRrule         string   — raw RRULE string (used when preset='custom')
 *   onPresetChange      (id) => void
 *   onCustomRruleChange (str) => void
 */
export function RecurrenceSection({ preset, customRrule, onPresetChange, onCustomRruleChange }: any) {
  function handlePresetChange(e) {
    const next = e.target.value;
    onPresetChange(next);
    if (next !== 'custom') onCustomRruleChange('');
  }

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor="ef-repeat">Repeat</label>
      <select
        id="ef-repeat"
        className={styles.select}
        value={preset}
        onChange={handlePresetChange}
      >
        {RECURRENCE_PRESETS.map(p => (
          <option key={p.id} value={p.id}>{p.label}</option>
        ))}
      </select>
      {preset === 'custom' && (
        <input
          id="ef-repeat-custom"
          aria-label="Custom RRULE string"
          className={styles.input}
          value={customRrule}
          onChange={e => onCustomRruleChange(e.target.value)}
          placeholder="FREQ=WEEKLY;BYDAY=MO,WE,FR"
        />
      )}
      <span className={styles.helperText}>Uses RFC5545 RRULE format internally.</span>
    </div>
  );
}
