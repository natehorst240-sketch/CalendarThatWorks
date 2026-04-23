/**
 * ImportZone — drag-and-drop + file-picker for .ics and .csv imports.
 *
 * .ics files → parsed and shown in ImportPreview for confirmation.
 * .csv files → routed to CSVImportDialog for column mapping + preview.
 */
import { useState, useRef, type ChangeEvent, type DragEvent } from 'react';
import { Upload } from 'lucide-react';
import { parseICS } from '../core/icalParser';
import type { WorksCalendarEvent } from '../types/events';
import ImportPreview from './ImportPreview';
import CSVImportDialog from './CSVImportDialog';
import styles from './ImportZone.module.css';

type ImportedEvent = {
  id?: string;
  title: string;
  start: Date | string;
  end?: Date | string;
  category?: string;
  resource?: string;
  status?: string;
  color?: string;
  allDay?: boolean;
  meta?: Record<string, unknown>;
};

type ImportZoneProps = {
  onImport: (events: ImportedEvent[], metadata?: { label?: string }) => void;
  onClose: () => void;
};

export default function ImportZone({ onImport, onClose }: ImportZoneProps) {
  const [dragging, setDragging] = useState(false);
  const [parsed, setParsed] = useState<ImportedEvent[] | null>(null); // ICS parsed events
  const [csvMode, setCsvMode] = useState(false); // switch to CSV dialog
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  function processFile(file: File | undefined): void {
    if (!file) return;
    setError(null);

    const name = file.name?.toLowerCase() ?? '';
    const isCSV = name.endsWith('.csv') || file.type === 'text/csv';
    const isICS = name.endsWith('.ics') || file.type?.includes('calendar');

    if (isCSV) {
      setCsvMode(true);
      return;
    }

    if (!isICS) {
      setError('Please choose a .ics or .csv file.');
      return;
    }

    // ICS path (original behaviour)
    const reader = new FileReader();
    reader.onload = (e: ProgressEvent<FileReader>) => {
      try {
        const text = typeof e.target?.result === 'string' ? e.target.result : '';
        const events = parseICS(text);
        if (!events.length) { setError('No events found in this file.'); return; }
        setParsed(events as ImportedEvent[]);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        setError(`Could not parse file: ${message}`);
      }
    };
    reader.onerror = () => setError('Could not read file.');
    reader.readAsText(file);
  }

  // ICS preview
  if (parsed) {
    return <ImportPreview events={parsed as WorksCalendarEvent[]} onImport={onImport} onClose={onClose} />;
  }

  // CSV multi-step dialog — mounts fresh with its own file picker
  if (csvMode) {
    return <CSVImportDialog onImport={onImport} onClose={onClose} />;
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={[styles.zone, dragging && styles.dragging].filter(Boolean).join(' ')}
        onClick={e => e.stopPropagation()}
        onDrop={(e: DragEvent<HTMLDivElement>) => {
          e.preventDefault();
          setDragging(false);
          processFile(e.dataTransfer.files?.[0]);
        }}
        onDragOver={(e: DragEvent<HTMLDivElement>) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDragEnter={(e: DragEvent<HTMLDivElement>) => { e.preventDefault(); setDragging(true); }}
      >
        <div className={styles.iconWrap}>
          <Upload size={32} />
        </div>
        <h2 className={styles.heading}>Import Events</h2>
        <p className={styles.hint}>
          Drag &amp; drop a <code>.ics</code> or <code>.csv</code> file here,
          or choose the format below.
        </p>

        {error && <p className={styles.error}>{error}</p>}

        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <button
            className={styles.browseBtn}
            onClick={() => {
              if (inputRef.current) {
                inputRef.current.accept = '.ics,text/calendar';
                inputRef.current.click();
              }
            }}
          >
            iCal / ICS
          </button>
          <button
            className={styles.browseBtn}
            style={{ background: 'var(--wc-text-muted, #64748b)' }}
            onClick={() => {
              if (inputRef.current) {
                inputRef.current.accept = '.csv,text/csv';
                inputRef.current.click();
              }
            }}
          >
            CSV Spreadsheet
          </button>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept=".ics,.csv,text/calendar,text/csv"
          className={styles.hiddenInput}
          onChange={(e: ChangeEvent<HTMLInputElement>) => processFile(e.currentTarget.files?.[0])}
        />

        <button className={styles.cancelLink} onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}
