/**
 * CSVImportDialog — 3-step CSV import: drop → map columns → preview & import.
 *
 * Steps:
 *   'drop'    — file drop zone
 *   'map'     — column-to-field mapping form
 *   'preview' — mapped events list with select-all and import button
 *
 * Props:
 *   onImport(events) — called with the final event array
 *   onClose()        — dismiss the dialog
 */
import { useState, useRef } from 'react';
import { format } from 'date-fns';
import { Upload, ChevronLeft, ChevronRight, Save, Trash2, AlertCircle, CheckCircle } from 'lucide-react';
import {
  parseCSV,
  suggestMapping,
  mapToEvents,
  loadPresets,
  savePreset,
  deletePreset,
  EVENT_FIELDS,
  DATE_FORMATS,
} from '../core/csvParser';
import styles from './ImportZone.module.css';
import pStyles from './ImportPreview.module.css';

// ── Step 1: Drop zone ─────────────────────────────────────────────────────────

function DropStep({ onFile, onClose }: any) {
  const [dragging, setDragging] = useState(false);
  const [error,    setError]    = useState(null);
  const inputRef = useRef(null);

  function processFile(file) {
    if (!file) return;
    if (!file.name?.toLowerCase().endsWith('.csv') && file.type !== 'text/csv') {
      setError('Please choose a .csv file.');
      return;
    }
    setError(null);
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const { headers, rows } = parseCSV(e.target.result);
        if (!headers.length) { setError('No columns detected in this file.'); return; }
        if (!rows.length)    { setError('No data rows found (file has headers but no data).'); return; }
        onFile({ filename: file.name, headers, rows });
      } catch (err: any) {
        setError(`Could not read file: ${err.message}`);
      }
    };
    reader.onerror = () => setError('Could not read file.');
    reader.readAsText(file);
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={[styles.zone, dragging && styles.dragging].filter(Boolean).join(' ')}
        onClick={e => e.stopPropagation()}
        onDrop={e => { e.preventDefault(); setDragging(false); processFile(e.dataTransfer.files[0]); }}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDragEnter={e => { e.preventDefault(); setDragging(true); }}
      >
        <div className={styles.iconWrap}><Upload size={32} /></div>
        <h2 className={styles.heading}>Import from CSV</h2>
        <p className={styles.hint}>
          Drag &amp; drop a <code>.csv</code> spreadsheet here, or click to browse.
          <br />Column headers are detected automatically.
        </p>

        {error && <p className={styles.error}>{error}</p>}

        <button className={styles.browseBtn} onClick={() => inputRef.current?.click()}>
          Choose File
        </button>
        <input
          ref={inputRef} type="file" accept=".csv,text/csv"
          className={styles.hiddenInput}
          onChange={e => processFile(e.target.files[0])}
        />
        <button className={styles.cancelLink} onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}

// ── Step 2: Column mapping ────────────────────────────────────────────────────

const SKIP = '';

function MapStep({ filename, headers, rows, onBack, onNext }: any) {
  const [mapping,     setMapping]     = useState(() => suggestMapping(headers));
  const [dateFormat,  setDateFormat]  = useState('auto');
  const [presets,     setPresets]     = useState(() => loadPresets());
  const [presetName,  setPresetName]  = useState('');
  const [savingPreset, setSavingPreset] = useState(false);

  function setField(field, header) {
    setMapping(m => ({ ...m, [field]: header }));
  }

  function applyPreset(preset) {
    setMapping(preset.mapping);
    setDateFormat(preset.dateFormat ?? 'auto');
  }

  function handleSavePreset() {
    const name = presetName.trim();
    if (!name) return;
    const preset = {
      id: `preset-${Date.now()}`,
      name,
      mapping,
      dateFormat,
    };
    savePreset(preset);
    setPresets(loadPresets());
    setPresetName('');
    setSavingPreset(false);
  }

  function handleDeletePreset(id) {
    deletePreset(id);
    setPresets(loadPresets());
  }

  function handleNext() {
    const { events, errors } = mapToEvents(rows, mapping, dateFormat);
    onNext({ events, errors, mapping, dateFormat });
  }

  const requiredMapped = EVENT_FIELDS
    .filter(f => f.required)
    .every(f => mapping[f.key]);

  // Preview first 3 rows with current mapping applied
  const previewRows = rows.slice(0, 3);

  return (
    <div className={styles.overlay} onClick={e => e.stopPropagation()}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--wc-bg, #fff)',
          borderRadius: 'var(--wc-radius, 16px)',
          width: 'min(680px, 96vw)',
          maxHeight: '90vh',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 20px 60px rgba(0,0,0,.25)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid var(--wc-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--wc-text)' }}>Map Columns</div>
            <div style={{ fontSize: 12, color: 'var(--wc-text-muted)', marginTop: 2 }}>
              {filename} · {rows.length} row{rows.length !== 1 ? 's' : ''}
            </div>
          </div>
          {/* Preset controls */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {presets.length > 0 && (
              <select
                onChange={e => {
                  const p = presets.find(x => x.id === e.target.value);
                  if (p) applyPreset(p);
                  e.target.value = '';
                }}
                defaultValue=""
                style={{
                  padding: '5px 8px', fontSize: 12, border: '1px solid var(--wc-border)',
                  borderRadius: 6, background: 'var(--wc-surface)', color: 'var(--wc-text)',
                  cursor: 'pointer',
                }}
              >
                <option value="" disabled>Load preset…</option>
                {presets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            )}
            {savingPreset ? (
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  autoFocus
                  value={presetName}
                  onChange={e => setPresetName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSavePreset(); if (e.key === 'Escape') setSavingPreset(false); }}
                  placeholder="Preset name…"
                  style={{
                    padding: '5px 8px', fontSize: 12, border: '1px solid var(--wc-border)',
                    borderRadius: 6, background: 'var(--wc-surface)', color: 'var(--wc-text)', width: 120,
                  }}
                />
                <button onClick={handleSavePreset} title="Save preset" style={btnStyle('#10b981')}>
                  <Save size={12} />
                </button>
                <button onClick={() => setSavingPreset(false)} title="Cancel" style={btnStyle('#94a3b8')}>×</button>
              </div>
            ) : (
              <button onClick={() => setSavingPreset(true)} title="Save mapping as preset" style={btnStyle('var(--wc-accent)')}>
                <Save size={12} /> Save preset
              </button>
            )}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Field mapping table */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--wc-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
              Column mapping
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {EVENT_FIELDS.map(field => (
                <div key={field.key} style={{
                  display: 'grid', gridTemplateColumns: '140px 1fr', alignItems: 'center',
                  gap: 12, padding: '6px 10px',
                  background: mapping[field.key] ? 'color-mix(in srgb, var(--wc-accent) 5%, transparent)' : 'var(--wc-surface)',
                  borderRadius: 6,
                  border: '1px solid ' + (mapping[field.key] ? 'color-mix(in srgb, var(--wc-accent) 30%, transparent)' : 'var(--wc-border)'),
                }}>
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--wc-text)' }}>
                      {field.label}
                      {field.required && <span style={{ color: 'var(--wc-danger)', marginLeft: 2 }}>*</span>}
                    </span>
                    <div style={{ fontSize: 10, color: 'var(--wc-text-muted)', marginTop: 1 }}>{field.hint}</div>
                  </div>
                  <select
                    value={mapping[field.key] ?? SKIP}
                    onChange={e => setField(field.key, e.target.value)}
                    style={{
                      padding: '5px 8px', fontSize: 12, width: '100%',
                      border: '1px solid var(--wc-border)', borderRadius: 6,
                      background: 'var(--wc-bg)', color: 'var(--wc-text)',
                    }}
                  >
                    <option value={SKIP}>── skip ──</option>
                    {headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>

          {/* Date format */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 13, color: 'var(--wc-text)', fontWeight: 500, flexShrink: 0 }}>Date format</span>
            <select
              value={dateFormat}
              onChange={e => setDateFormat(e.target.value)}
              style={{
                padding: '5px 8px', fontSize: 12, flex: 1,
                border: '1px solid var(--wc-border)', borderRadius: 6,
                background: 'var(--wc-bg)', color: 'var(--wc-text)',
              }}
            >
              {DATE_FORMATS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </div>

          {/* Raw data preview */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--wc-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
              First {previewRows.length} rows
            </div>
            <div style={{ overflowX: 'auto', borderRadius: 6, border: '1px solid var(--wc-border)' }}>
              <table style={{ fontSize: 11, borderCollapse: 'collapse', width: '100%' }}>
                <thead>
                  <tr style={{ background: 'var(--wc-surface)' }}>
                    {headers.map(h => (
                      <th key={h} style={{
                        padding: '6px 10px', textAlign: 'left', fontWeight: 600,
                        color: Object.values(mapping).includes(h) ? 'var(--wc-accent)' : 'var(--wc-text-muted)',
                        borderBottom: '1px solid var(--wc-border)', whiteSpace: 'nowrap',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--wc-border)' }}>
                      {headers.map(h => (
                        <td key={h} style={{
                          padding: '5px 10px', color: 'var(--wc-text)',
                          maxWidth: 160, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>
                          {row[h] || <span style={{ color: 'var(--wc-text-muted)' }}>—</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Saved presets list (with delete) */}
          {presets.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--wc-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                Saved presets
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {presets.map(p => (
                  <div key={p.id} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '4px 8px', borderRadius: 6,
                    border: '1px solid var(--wc-border)', background: 'var(--wc-surface)', fontSize: 12,
                  }}>
                    <button onClick={() => applyPreset(p)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--wc-text)', fontSize: 12 }}>{p.name}</button>
                    <button onClick={() => handleDeletePreset(p.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--wc-danger)', padding: 0, display: 'flex' }}>
                      <Trash2 size={11} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 20px', borderTop: '1px solid var(--wc-border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          flexShrink: 0, background: 'var(--wc-surface)',
        }}>
          <button onClick={onBack} style={{ ...btnStyle('var(--wc-text-muted)'), background: 'none', border: '1px solid var(--wc-border)' }}>
            <ChevronLeft size={13} /> Back
          </button>
          {!requiredMapped && (
            <span style={{ fontSize: 12, color: 'var(--wc-danger)' }}>
              Map Title and Start columns to continue.
            </span>
          )}
          <button
            onClick={handleNext}
            disabled={!requiredMapped}
            style={{ ...btnStyle('var(--wc-accent)'), opacity: requiredMapped ? 1 : 0.5, cursor: requiredMapped ? 'pointer' : 'not-allowed' }}
          >
            Preview import <ChevronRight size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Step 3: Preview & import ──────────────────────────────────────────────────

function PreviewStep({ events, errors, onBack, onImport, onClose }: any) {
  const [selected, setSelected] = useState(() => new Set(events.map((_, i) => i)));

  function toggle(i) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === events.length) setSelected(new Set());
    else setSelected(new Set(events.map((_, i) => i)));
  }

  function handleImport() {
    const toImport = events.filter((_, i) => selected.has(i));
    onImport(toImport);
    onClose();
  }

  const allSelected = selected.size === events.length;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={pStyles.dialog} onClick={e => e.stopPropagation()}>
        <div className={pStyles.header}>
          <h2 className={pStyles.title}>Preview Import</h2>
          <span className={pStyles.count}>
            {events.length} event{events.length !== 1 ? 's' : ''} ready
            {errors.length > 0 && (
              <span style={{ marginLeft: 8, color: '#ef4444' }}>
                · {errors.length} row{errors.length !== 1 ? 's' : ''} skipped
              </span>
            )}
          </span>
          <button className={pStyles.closeBtn} onClick={onClose}>×</button>
        </div>

        {/* Parse errors */}
        {errors.length > 0 && (
          <div style={{
            margin: '0 16px', padding: '10px 12px', borderRadius: 8,
            background: '#fee2e2', border: '1px solid #fca5a5',
            display: 'flex', flexDirection: 'column', gap: 4,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: '#991b1b' }}>
              <AlertCircle size={13} /> {errors.length} row{errors.length > 1 ? 's' : ''} could not be parsed
            </div>
            {errors.slice(0, 3).map((e, i) => (
              <div key={i} style={{ fontSize: 11, color: '#7f1d1d' }}>
                Row {e.index}: {e.message}
              </div>
            ))}
            {errors.length > 3 && <div style={{ fontSize: 11, color: '#7f1d1d' }}>…and {errors.length - 3} more</div>}
          </div>
        )}

        <div className={pStyles.toolbar}>
          <label className={pStyles.selectAll}>
            <input type="checkbox" checked={allSelected} onChange={toggleAll} />
            {allSelected ? 'Deselect all' : 'Select all'}
          </label>
          <span className={pStyles.selectedCount}>{selected.size} selected</span>
        </div>

        <div className={pStyles.list}>
          {events.map((ev, i) => {
            const start = ev.start instanceof Date ? ev.start : new Date(ev.start);
            return (
              <label key={i} className={[pStyles.item, selected.has(i) && pStyles.itemSelected].filter(Boolean).join(' ')}>
                <input type="checkbox" checked={selected.has(i)} onChange={() => toggle(i)} className={pStyles.checkbox} />
                <div className={pStyles.evInfo}>
                  <span className={pStyles.evTitle}>{ev.title}</span>
                  <span className={pStyles.evDate}>
                    {_fmtDate(start)}
                    {ev.category && ` · ${ev.category}`}
                    {ev.resource && ` · ${ev.resource}`}
                    {ev.status && ev.status !== 'confirmed' && (
                      <span className={pStyles.statusBadge} data-status={ev.status}>{ev.status}</span>
                    )}
                  </span>
                </div>
              </label>
            );
          })}
        </div>

        <div className={pStyles.footer}>
          <button onClick={onBack} style={{ ...btnStyle('var(--wc-text-muted)'), background: 'none', border: '1px solid var(--wc-border)' }}>
            <ChevronLeft size={13} /> Back
          </button>
          <button className={pStyles.importBtn} onClick={handleImport} disabled={selected.size === 0}>
            <CheckCircle size={13} /> Import {selected.size > 0 ? selected.size : ''} event{selected.size !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main dialog ───────────────────────────────────────────────────────────────

export default function CSVImportDialog({ onImport, onClose }: any) {
  const [step, setStep] = useState('drop'); // 'drop' | 'map' | 'preview'
  const [fileData, setFileData]     = useState(null); // { filename, headers, rows }
  const [mappedData, setMappedData] = useState(null); // { events, errors }

  if (step === 'drop') {
    return (
      <DropStep
        onFile={data => { setFileData(data); setStep('map'); }}
        onClose={onClose}
      />
    );
  }

  if (step === 'map') {
    return (
      <MapStep
        {...fileData}
        onBack={() => setStep('drop')}
        onNext={data => { setMappedData(data); setStep('preview'); }}
      />
    );
  }

  return (
    <PreviewStep
      {...mappedData}
      onBack={() => setStep('map')}
      onImport={(events) => onImport(events, { label: fileData?.filename })}
      onClose={onClose}
    />
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _fmtDate(d) {
  try { return format(d, 'MMM d, yyyy'); } catch { return '—'; }
}

function btnStyle(bg) {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    padding: '7px 14px', fontSize: 12, fontWeight: 600,
    background: bg, color: '#fff', border: 'none',
    borderRadius: 'var(--wc-radius-sm, 8px)', cursor: 'pointer',
  };
}
