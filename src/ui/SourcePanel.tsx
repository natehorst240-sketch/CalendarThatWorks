/**
 * SourcePanel — unified source management UI for the ConfigPanel "Feeds" tab.
 *
 * Replaces ICSFeedPanel. Shows two sections:
 *   • ICS Feeds    — URL-polled feeds with validate + refresh controls
 *   • CSV Datasets — event batches imported by the user
 *
 * Both source types share the same toggle/remove controls and a colour dot.
 *
 * Props:
 *   sources     — CalendarSource[]
 *   feedErrors  — { feed, err }[]  from useFeedEvents / useSourceAggregator
 *   onAdd       — (partial: Partial<CalendarSource>) => void
 *   onRemove    — (id: string) => void
 *   onUpdate    — (id: string, patch: Partial<CalendarSource>) => void
 *   onToggle    — (id: string) => void
 */
import { useState, useRef } from 'react';
import type { ChangeEvent, KeyboardEvent } from 'react';
import { format } from 'date-fns';
import {
  Plus, Trash2, RefreshCw, AlertCircle, CheckCircle,
  Link, FileSpreadsheet,
} from 'lucide-react';
import { fetchAndParseICS } from '../core/icalParser';
import type { WorksCalendarEvent } from '../types/events';
import styles from './ConfigPanel.module.css';

// ── Shared constants ──────────────────────────────────────────────────────────

const PRESET_COLORS = [
  '#3b82f6', '#10b981', '#ef4444', '#f59e0b',
  '#8b5cf6', '#06b6d4', '#f97316', '#ec4899',
];

const REFRESH_OPTIONS = [
  { label: '5 minutes',  value: 300_000   },
  { label: '15 minutes', value: 900_000   },
  { label: '30 minutes', value: 1_800_000 },
  { label: '1 hour',     value: 3_600_000 },
  { label: '4 hours',    value: 14_400_000 },
  { label: 'Manual',     value: null       },
];

type CalendarSource = {
  id: string;
  type: string;
  label?: string;
  color?: string;
  enabled?: boolean;
  url?: string;
  refreshInterval?: number | null;
  events?: WorksCalendarEvent[];
  importedAt?: string;
};

type FeedErrorEntry = {
  feed?: { url?: string };
  err?: unknown;
};


type FeedValidationState = {
  ok: true;
  count: number;
} | {
  ok: false;
  error: string;
  corsLikely: boolean;
  count?: undefined;
} | null;

function isValidationFailure(
  validation: FeedValidationState,
): validation is { ok: false; error: string; corsLikely: boolean; count?: undefined } {
  return validation != null && validation.ok === false;
}

type SourceHandlers = {
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, patch: Partial<CalendarSource>) => void;
};

function ColorDot({ color, size = 12, onClick }: { color: string; size?: number; onClick: () => void }) {
  return (
    <button
      title="Change colour"
      onClick={onClick}
      style={{
        background: 'none', border: 'none', cursor: 'pointer',
        padding: 0, display: 'flex', alignItems: 'center', flexShrink: 0,
      }}
    >
      <span style={{
        display: 'inline-block',
        width: size, height: size,
        borderRadius: '50%',
        background: color,
      }} />
    </button>
  );
}

function ToggleSwitch({ checked, onChange, title }: { checked: boolean; onChange: () => void; title: string }) {
  return (
    <label
      className={styles.toggle}
      style={{ cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center' }}
      title={title}
    >
      <input type="checkbox" checked={checked} onChange={onChange} style={{ display: 'none' }} />
      <span className={styles.toggleTrack} />
    </label>
  );
}

function RemoveBtn({ onClick, title = 'Remove' }: { onClick: () => void; title?: string }) {
  return (
    <button
      className={styles.removeBtn}
      onClick={onClick}
      title={title}
      style={{ flexShrink: 0 }}
    >
      <Trash2 size={13} />
    </button>
  );
}

function rowStyle(enabled: boolean) {
  return {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '9px 10px',
    background: 'var(--wc-surface)',
    border: '1px solid var(--wc-border)',
    borderRadius: 'var(--wc-radius-sm)',
    opacity: enabled ? 1 : 0.55,
  };
}

function isSourceEnabled(source: CalendarSource): boolean {
  return source.enabled ?? true;
}

// ── ICS feed row ──────────────────────────────────────────────────────────────

function IcsFeedRow({ source, error, onToggle, onRemove, onUpdate }: { source: CalendarSource; error?: unknown } & SourceHandlers) {
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState(source.label ?? '');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const enabled = isSourceEnabled(source);

  function commitEdit() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== source.label) onUpdate(source.id, { label: trimmed });
    else setDraft(source.label ?? '');
    setEditing(false);
  }

  const statusIcon = !enabled
    ? null
    : error
      ? <AlertCircle size={14} color="var(--wc-danger)" aria-label={error instanceof Error ? error.message : 'Feed error'} />
      : <CheckCircle size={14} color="var(--wc-success, #10b981)" />;

  return (
    <div style={rowStyle(enabled)}>
      <ColorDot
        color={source.color ?? PRESET_COLORS[0]}
        onClick={() => {
          const currentColor = source.color ?? PRESET_COLORS[0];
          const idx = PRESET_COLORS.indexOf(currentColor);
          onUpdate(source.id, { color: PRESET_COLORS[(idx + 1) % PRESET_COLORS.length] });
        }}
      />

      <div style={{ flex: 1, minWidth: 0 }}>
        {editing ? (
          <input
            ref={inputRef}
            autoFocus
            className={styles.input}
            value={draft}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setDraft(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
              if (e.key === 'Enter') commitEdit();
              if (e.key === 'Escape') {
                setDraft(source.label ?? '');
                setEditing(false);
              }
            }}
            style={{ width: '100%', padding: '3px 6px', fontSize: 12 }}
          />
        ) : (
          <button
            onClick={() => {
              setEditing(true);
              setDraft(source.label ?? '');
            }}
            title="Click to rename"
            style={{
              background: 'none', border: 'none', cursor: 'text',
              padding: 0, textAlign: 'left', width: '100%',
              fontSize: 13, fontWeight: 500, color: 'var(--wc-text)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}
          >
            {source.label || <span style={{ color: 'var(--wc-text-muted)', fontStyle: 'italic' }}>Unnamed feed</span>}
          </button>
        )}
        <div style={{
          fontSize: 11, color: 'var(--wc-text-muted)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 1,
        }}>
          {source.url}
        </div>
      </div>

      <div style={{ flexShrink: 0 }}>{statusIcon}</div>

      <ToggleSwitch
        checked={enabled}
        onChange={() => onToggle(source.id)}
        title={enabled ? 'Disable feed' : 'Enable feed'}
      />

      <RemoveBtn onClick={() => onRemove(source.id)} title="Remove feed" />
    </div>
  );
}

// ── CSV dataset row ───────────────────────────────────────────────────────────

function CsvDatasetRow({ source, onToggle, onRemove, onUpdate }: { source: CalendarSource } & SourceHandlers) {
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState(source.label ?? '');
  const enabled = isSourceEnabled(source);

  function commitEdit() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== source.label) onUpdate(source.id, { label: trimmed });
    else setDraft(source.label ?? '');
    setEditing(false);
  }

  const count      = source.events?.length ?? 0;
  const importedAt = source.importedAt ? _fmtDate(source.importedAt) : null;

  return (
    <div style={rowStyle(enabled)}>
      <ColorDot
        color={source.color ?? '#8b5cf6'}
        onClick={() => {
          const currentColor = source.color ?? PRESET_COLORS[0];
          const idx = PRESET_COLORS.indexOf(currentColor);
          onUpdate(source.id, { color: PRESET_COLORS[(idx + 1) % PRESET_COLORS.length] });
        }}
      />

      <div style={{ flex: 1, minWidth: 0 }}>
        {editing ? (
          <input
            autoFocus
            className={styles.input}
            value={draft}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setDraft(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
              if (e.key === 'Enter') commitEdit();
              if (e.key === 'Escape') {
                setDraft(source.label ?? '');
                setEditing(false);
              }
            }}
            style={{ width: '100%', padding: '3px 6px', fontSize: 12 }}
          />
        ) : (
          <button
            onClick={() => {
              setEditing(true);
              setDraft(source.label ?? '');
            }}
            title="Click to rename"
            style={{
              background: 'none', border: 'none', cursor: 'text',
              padding: 0, textAlign: 'left', width: '100%',
              fontSize: 13, fontWeight: 500, color: 'var(--wc-text)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}
          >
            {source.label || <span style={{ color: 'var(--wc-text-muted)', fontStyle: 'italic' }}>Unnamed dataset</span>}
          </button>
        )}
        <div style={{ fontSize: 11, color: 'var(--wc-text-muted)', marginTop: 1 }}>
          {count} event{count !== 1 ? 's' : ''}
          {importedAt && <span> · imported {importedAt}</span>}
        </div>
      </div>

      <ToggleSwitch
        checked={enabled}
        onChange={() => onToggle(source.id)}
        title={enabled ? 'Hide these events' : 'Show these events'}
      />

      <RemoveBtn onClick={() => onRemove(source.id)} title="Remove dataset" />
    </div>
  );
}

// ── Add ICS feed form ─────────────────────────────────────────────────────────

function AddFeedForm({ onAdd }: { onAdd: (source: Partial<CalendarSource>) => void }) {
  const [open,            setOpen]            = useState(false);
  const [url,             setUrl]             = useState('');
  const [label,           setLabel]           = useState('');
  const [color,           setColor]           = useState(PRESET_COLORS[0]);
  const [refreshInterval, setRefreshInterval] = useState<number | null>(300_000);
  const [validating,      setValidating]      = useState(false);
  const [validation,      setValidation]      = useState<FeedValidationState>(null);

  function reset() {
    setUrl(''); setLabel(''); setColor(PRESET_COLORS[0]);
    setRefreshInterval(300_000); setValidation(null); setOpen(false);
  }

  async function validate() {
    const trimmed = url.trim();
    if (!trimmed) return;
    setValidating(true);
    setValidation(null);
    try {
      const events = await fetchAndParseICS(trimmed);
      if (!label) setLabel(_suggestLabel(trimmed));
      setValidation({ ok: true, count: events.length });
    } catch (err: unknown) {
      const isCors = ['cors', 'fetch', 'network', 'failed'].some(
        w => (err instanceof Error ? err.message : String(err)).toLowerCase().includes(w),
      );
      setValidation({ ok: false, error: err instanceof Error ? err.message : String(err), corsLikely: isCors });
    } finally {
      setValidating(false);
    }
  }

  function submit() {
    const trimmed = url.trim();
    if (!trimmed) return;
    onAdd({
      type:  'ics',
      url:   trimmed,
      label: label.trim() || _suggestLabel(trimmed),
      color,
      refreshInterval: refreshInterval ?? undefined,
    });
    reset();
  }

  if (!open) {
    return (
      <button className={styles.addFieldBtn} onClick={() => setOpen(true)}>
        <Plus size={13} /> Add iCal feed
      </button>
    );
  }

  const canSubmit = !!url.trim();

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 10,
      padding: 14, background: 'var(--wc-surface)',
      border: '1px solid var(--wc-border)', borderRadius: 'var(--wc-radius-sm)',
    }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--wc-text)', display: 'flex', alignItems: 'center', gap: 6 }}>
        <Link size={12} /> Add iCal Feed
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        <input
          className={styles.input}
          style={{ flex: 1, fontSize: 12 }}
          type="url"
          value={url}
          onChange={e => { setUrl(e.target.value); setValidation(null); }}
          placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"
          onKeyDown={e => e.key === 'Enter' && validate()}
        />
        <button
          onClick={validate}
          disabled={!url.trim() || validating}
          style={{
            padding: '7px 10px', fontSize: 12, fontWeight: 500,
            background: 'var(--wc-accent)', color: '#fff',
            border: 'none', borderRadius: 'var(--wc-radius-sm)',
            cursor: url.trim() && !validating ? 'pointer' : 'not-allowed',
            opacity: !url.trim() || validating ? 0.6 : 1,
            display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
          }}
        >
          <RefreshCw size={12} className={validating ? 'wc-spin' : undefined} />
          {validating ? 'Checking…' : 'Validate'}
        </button>
      </div>

      {validation && (
        <div style={{
          fontSize: 12, padding: '6px 10px', borderRadius: 6,
          background: validation.ok
            ? 'color-mix(in srgb, #10b981 12%, transparent)'
            : 'color-mix(in srgb, var(--wc-danger) 10%, transparent)',
          color: validation.ok ? '#065f46' : 'var(--wc-danger)',
          display: 'flex', alignItems: 'flex-start', gap: 6,
        }}>
          {validation.ok
            ? <CheckCircle size={13} style={{ marginTop: 1, flexShrink: 0 }} />
            : <AlertCircle size={13} style={{ marginTop: 1, flexShrink: 0 }} />}
          <span>
            {validation.ok
              ? `Found ${validation.count} event${validation.count === 1 ? '' : 's'} — feed looks good.`
              : isValidationFailure(validation) && validation.corsLikely
                ? `Could not verify from browser (${validation.error}). This may be a CORS restriction — you can still add the feed and it may work.`
                : isValidationFailure(validation)
                  ? `Error: ${validation.error}`
                  : 'Unable to validate feed.'}
          </span>
        </div>
      )}

      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 11, color: 'var(--wc-text-muted)', fontWeight: 500 }}>Feed name</span>
        <input
          className={styles.input}
          style={{ fontSize: 12 }}
          type="text"
          value={label}
          onChange={e => setLabel(e.target.value)}
          placeholder="My Work Calendar"
        />
      </label>

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 11, color: 'var(--wc-text-muted)', fontWeight: 500 }}>Color</span>
          <div style={{ display: 'flex', gap: 5 }}>
            {PRESET_COLORS.map(c => (
              <button
                key={c} onClick={() => setColor(c)} title={c}
                style={{
                  width: 20, height: 20, borderRadius: '50%', background: c, border: 'none',
                  cursor: 'pointer', flexShrink: 0,
                  outline: color === c ? `2px solid ${c}` : '2px solid transparent',
                  outlineOffset: 2,
                }}
              />
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
          <span style={{ fontSize: 11, color: 'var(--wc-text-muted)', fontWeight: 500 }}>Refresh every</span>
          <select
            className={styles.select}
            style={{ fontSize: 12 }}
            value={refreshInterval ?? 'null'}
            onChange={e => setRefreshInterval(e.target.value === 'null' ? null : +e.target.value)}
          >
            {REFRESH_OPTIONS.map(o => (
              <option key={String(o.value)} value={String(o.value)}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 2 }}>
        <button
          onClick={reset}
          style={{
            padding: '6px 14px', fontSize: 12,
            background: 'var(--wc-surface-2)', color: 'var(--wc-text)',
            border: '1px solid var(--wc-border)', borderRadius: 'var(--wc-radius-sm)',
            cursor: 'pointer',
          }}
        >Cancel</button>
        <button
          onClick={submit} disabled={!canSubmit}
          style={{
            padding: '6px 14px', fontSize: 12, fontWeight: 600,
            background: 'var(--wc-accent)', color: '#fff',
            border: 'none', borderRadius: 'var(--wc-radius-sm)',
            cursor: canSubmit ? 'pointer' : 'not-allowed',
            opacity: canSubmit ? 1 : 0.6,
          }}
        >Add Feed</button>
      </div>
    </div>
  );
}

// ── Section heading ───────────────────────────────────────────────────────────

function SectionHeading({
  icon: Icon,
  label,
  count,
  errors = 0,
}: {
  icon: typeof Link;
  label: string;
  count?: number;
  errors?: number;
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      fontSize: 11, fontWeight: 600, color: 'var(--wc-text-muted)',
      textTransform: 'uppercase', letterSpacing: '0.05em',
      marginBottom: 6,
    }}>
      <Icon size={12} />
      {label}
      {count != null && (
        <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
          ({count})
        </span>
      )}
      {errors > 0 && (
        <span style={{ color: 'var(--wc-danger)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
          · {errors} error{errors > 1 ? 's' : ''}
        </span>
      )}
    </div>
  );
}

// ── Panel ─────────────────────────────────────────────────────────────────────

type SourcePanelProps = {
  sources?: Array<Partial<CalendarSource>>;
  feedErrors?: unknown[];
  onAdd: (source: Partial<CalendarSource>) => void;
  onRemove: (id: string) => void;
  onToggle: (id: string) => void;
  onUpdate: (id: string, patch: Partial<CalendarSource>) => void;
};

export default function SourcePanel({ sources, feedErrors, onAdd, onRemove, onToggle, onUpdate }: SourcePanelProps) {
  const normalizedSources = (sources ?? []) as CalendarSource[];
  const icsSources = normalizedSources.filter((s: CalendarSource) => s.type === 'ics');
  const csvSources = normalizedSources.filter((s: CalendarSource) => s.type === 'csv');

  const errorByUrl = Object.fromEntries(
    (feedErrors ?? [])
      .map((entry) => {
        const value = entry as FeedErrorEntry;
        const url = value.feed?.url ?? '';
        return [url, value.err] as const;
      })
      .filter((entry): entry is readonly [string, unknown] => entry[0] !== ''),
  );

  const icsErrors = icsSources.filter((s: CalendarSource) => {
    const enabled = isSourceEnabled(s);
    const sourceUrl = s.url ?? '';
    return enabled && !!sourceUrl && !!errorByUrl[sourceUrl];
  }).length;

  const hasSources = icsSources.length > 0 || csvSources.length > 0;

  return (
    <div className={styles.section}>
      <p className={styles.sectionDesc}>
        Combine iCal feeds and imported CSV datasets into one calendar.
        Toggle any source to show or hide its events instantly.
        {hasSources && (
          <span style={{ marginLeft: 6 }}>
            {normalizedSources.filter((s: CalendarSource) => isSourceEnabled(s)).length} of {normalizedSources.length} active.
          </span>
        )}
      </p>

      {/* ── ICS Feeds ── */}
      <div style={{ marginBottom: 16 }}>
        <SectionHeading
          icon={Link}
          label="iCal Feeds"
          count={icsSources.length || undefined}
          errors={icsErrors}
        />

        {icsSources.length === 0 ? (
          <div style={{
            padding: '16px', textAlign: 'center',
            border: '1px dashed var(--wc-border)',
            borderRadius: 'var(--wc-radius-sm)',
            color: 'var(--wc-text-muted)', fontSize: 12, marginBottom: 8,
          }}>
            No feeds connected. Add an iCal URL below.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
            {icsSources.map((src: CalendarSource) => {
              const enabled = isSourceEnabled(src);
              const sourceUrl = src.url ?? '';
              return (
                <IcsFeedRow
                  key={src.id}
                  source={src}
                  error={enabled && sourceUrl ? errorByUrl[sourceUrl] : undefined}
                  onToggle={onToggle}
                  onRemove={onRemove}
                  onUpdate={onUpdate}
                />
              );
            })}
          </div>
        )}

        <AddFeedForm onAdd={onAdd} />
      </div>

      {/* ── CSV Datasets ── */}
      {csvSources.length > 0 && (
        <div>
          <SectionHeading
            icon={FileSpreadsheet}
            label="CSV Datasets"
            count={csvSources.length}
            errors={0}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {csvSources.map((src: CalendarSource) => (
              <CsvDatasetRow
                key={src.id}
                source={src}
                onToggle={onToggle}
                onRemove={onRemove}
                onUpdate={onUpdate}
              />
            ))}
          </div>
        </div>
      )}

      <p style={{ fontSize: 11, color: 'var(--wc-text-muted)', margin: '12px 0 0' }}>
        Tip: use <strong>webcal://</strong> or <strong>https://</strong> ICS URLs from Google Calendar,
        Outlook, or Apple Calendar. CSV events can be re-imported at any time.
      </p>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _suggestLabel(url: string): string {
  try {
    const u = new URL(url.replace(/^webcal:/, 'https:'));
    return u.hostname.replace(/^(www|calendar)\./, '');
  } catch {
    return url;
  }
}

function _fmtDate(iso: string): string {
  try { return format(new Date(iso), 'MMM d, yyyy'); } catch { return ''; }
}
