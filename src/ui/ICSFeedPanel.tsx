/**
 * ICSFeedPanel — feed management UI for the ConfigPanel "Feeds" tab.
 *
 * Props:
 *   feeds       — StoredFeed[]
 *   feedErrors  — { feed: ICalFeed, err: Error }[]  from useFeedEvents
 *   onAdd       — (partial: Partial<StoredFeed>) => void
 *   onRemove    — (id: string) => void
 *   onUpdate    — (id: string, patch: Partial<StoredFeed>) => void
 *   onToggle    — (id: string) => void
 */
import { useState, useRef, type ChangeEvent, type KeyboardEvent } from 'react';
import { Plus, Trash2, RefreshCw, AlertCircle, CheckCircle, Link } from 'lucide-react';
import { fetchAndParseICS } from '../core/icalParser';
import styles from './ConfigPanel.module.css';

// ── Constants ──────────────────────────────────────────────────────────────────

const PRESET_COLORS = [
  '#3b82f6', '#10b981', '#ef4444', '#f59e0b',
  '#8b5cf6', '#06b6d4', '#f97316', '#ec4899',
];

const REFRESH_OPTIONS = [
  { label: '5 minutes',  value: 300_000  },
  { label: '15 minutes', value: 900_000  },
  { label: '30 minutes', value: 1_800_000 },
  { label: '1 hour',     value: 3_600_000 },
  { label: '4 hours',    value: 14_400_000 },
  { label: 'Manual',     value: null       },
];

type FeedValidationState = {
  ok: boolean;
  count?: number;
  error?: string;
  corsLikely?: boolean;
} | null;

function colorDot(color: string, size = 10) {
  return (
    <span style={{
      display: 'inline-block',
      width: size, height: size,
      borderRadius: '50%',
      background: color,
      flexShrink: 0,
    }} />
  );
}

// ── Feed row ──────────────────────────────────────────────────────────────────

function FeedRow({ feed, error, onToggle, onRemove, onUpdate }: any) {
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState(feed.label);
  const inputRef = useRef(null);

  function commitEdit() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== feed.label) onUpdate(feed.id, { label: trimmed });
    else setDraft(feed.label);
    setEditing(false);
  }

  const statusIcon = !feed.enabled
    ? null
    : error
      ? <AlertCircle size={14} color="var(--wc-danger)" aria-label={error.message} />
      : <CheckCircle size={14} color="var(--wc-success, #10b981)" />;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '9px 10px',
      background: 'var(--wc-surface)',
      border: '1px solid var(--wc-border)',
      borderRadius: 'var(--wc-radius-sm)',
      opacity: feed.enabled ? 1 : 0.55,
    }}>
      {/* Color dot — click to cycle through presets */}
      <button
        title="Change colour"
        onClick={() => {
          const idx = PRESET_COLORS.indexOf(feed.color);
          onUpdate(feed.id, { color: PRESET_COLORS[(idx + 1) % PRESET_COLORS.length] });
        }}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          padding: 0, display: 'flex', alignItems: 'center', flexShrink: 0,
        }}
      >
        {colorDot(feed.color, 12)}
      </button>

      {/* Name — click to edit */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {editing ? (
          <input
            ref={inputRef}
            autoFocus
            className={styles.input}
            value={draft}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setDraft(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') { setDraft(feed.label); setEditing(false); } }}
            style={{ width: '100%', padding: '3px 6px', fontSize: 12 }}
          />
        ) : (
          <button
            onClick={() => { setEditing(true); setDraft(feed.label); }}
            title="Click to rename"
            style={{
              background: 'none', border: 'none', cursor: 'text',
              padding: 0, textAlign: 'left', width: '100%',
              fontSize: 13, fontWeight: 500, color: 'var(--wc-text)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}
          >
            {feed.label || <span style={{ color: 'var(--wc-text-muted)', fontStyle: 'italic' }}>Unnamed feed</span>}
          </button>
        )}
        <div style={{
          fontSize: 11, color: 'var(--wc-text-muted)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          marginTop: 1,
        }}>
          {feed.url}
        </div>
      </div>

      {/* Status */}
      <div style={{ flexShrink: 0 }}>{statusIcon}</div>

      {/* Enable toggle */}
      <label style={{ cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center' }} title={feed.enabled ? 'Disable feed' : 'Enable feed'}>
        <input type="checkbox" checked={feed.enabled} onChange={() => onToggle(feed.id)} style={{ display: 'none' }} />
        <span className={styles.toggleTrack} />
      </label>

      {/* Remove */}
      <button className={styles.removeBtn} onClick={() => onRemove(feed.id)} title="Remove feed" style={{ flexShrink: 0 }}>
        <Trash2 size={13} />
      </button>
    </div>
  );
}

// ── Add feed form ─────────────────────────────────────────────────────────────

function AddFeedForm({ onAdd }: any) {
  const [open,            setOpen]            = useState(false);
  const [url,             setUrl]             = useState('');
  const [label,           setLabel]           = useState('');
  const [color,           setColor]           = useState(PRESET_COLORS[0]);
  const [refreshInterval, setRefreshInterval] = useState<number | null>(300_000);
  const [validating,      setValidating]      = useState(false);
  const [validation,      setValidation]      = useState<FeedValidationState>(null);

  function reset() {
    setUrl(''); setLabel(''); setColor(PRESET_COLORS[0]);
    setRefreshInterval(300_000); setValidation(null);
    setOpen(false);
  }

  async function validate() {
    const trimmed = url.trim();
    if (!trimmed) return;
    setValidating(true);
    setValidation(null);
    try {
      const events = await fetchAndParseICS(trimmed);
      // Try to extract a calendar name from the feed URL as a label suggestion
      const suggested = label || _suggestLabel(trimmed);
      if (!label) setLabel(suggested);
      setValidation({ ok: true, count: events.length });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      // CORS failures are expected for some feeds — still allow adding with a warning
      const lowered = message.toLowerCase();
      const isCors = lowered.includes('cors') ||
                     lowered.includes('fetch') ||
                     lowered.includes('network') ||
                     lowered.includes('failed');
      setValidation({ ok: false, count: null, error: message, corsLikely: isCors });
    } finally {
      setValidating(false);
    }
  }

  function submit() {
    const trimmed = url.trim();
    if (!trimmed) return;
    onAdd({
      url: trimmed,
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
      border: '1px solid var(--wc-border)',
      borderRadius: 'var(--wc-radius-sm)',
    }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--wc-text)', display: 'flex', alignItems: 'center', gap: 6 }}>
        <Link size={12} /> Add iCal Feed
      </div>

      {/* URL input + validate */}
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          className={styles.input}
          style={{ flex: 1, fontSize: 12 }}
          type="url"
          value={url}
          onChange={(e: ChangeEvent<HTMLInputElement>) => { setUrl(e.target.value); setValidation(null); }}
          placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"
          onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && validate()}
        />
        <button
          onClick={validate}
          disabled={!url.trim() || validating}
          title="Fetch and validate the feed URL"
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

      {/* Validation result */}
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
              : validation.corsLikely
                ? `Could not verify from browser (${validation.error ?? 'Unknown error'}). This may be a CORS restriction — you can still add the feed and it may work.`
                : `Error: ${validation.error ?? 'Unknown error'}`}
          </span>
        </div>
      )}

      {/* Name */}
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 11, color: 'var(--wc-text-muted)', fontWeight: 500 }}>Feed name</span>
        <input
          className={styles.input}
          style={{ fontSize: 12 }}
          type="text"
          value={label}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setLabel(e.target.value)}
          placeholder="My Work Calendar"
        />
      </label>

      {/* Color + refresh */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 11, color: 'var(--wc-text-muted)', fontWeight: 500 }}>Color</span>
          <div style={{ display: 'flex', gap: 5 }}>
            {PRESET_COLORS.map(c => (
              <button
                key={c}
                onClick={() => setColor(c)}
                title={c}
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
            onChange={(e: ChangeEvent<HTMLSelectElement>) => setRefreshInterval(e.target.value === 'null' ? null : +e.target.value)}
          >
            {REFRESH_OPTIONS.map(o => (
              <option key={String(o.value)} value={String(o.value)}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 2 }}>
        <button
          onClick={reset}
          style={{
            padding: '6px 14px', fontSize: 12,
            background: 'var(--wc-surface-2)', color: 'var(--wc-text)',
            border: '1px solid var(--wc-border)', borderRadius: 'var(--wc-radius-sm)',
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={!canSubmit}
          style={{
            padding: '6px 14px', fontSize: 12, fontWeight: 600,
            background: 'var(--wc-accent)', color: '#fff',
            border: 'none', borderRadius: 'var(--wc-radius-sm)',
            cursor: canSubmit ? 'pointer' : 'not-allowed',
            opacity: canSubmit ? 1 : 0.6,
          }}
        >
          Add Feed
        </button>
      </div>
    </div>
  );
}

// ── Panel ─────────────────────────────────────────────────────────────────────

export default function ICSFeedPanel({ feeds, feedErrors, onAdd, onRemove, onToggle, onUpdate }: any) {
  // Build a quick error lookup by URL
  const errorByUrl = Object.fromEntries(
    (feedErrors ?? []).map(({ feed, err }: { feed: { url: string }; err: Error }) => [feed.url, err])
  );

  const enabledCount  = feeds.filter((f: any) => f.enabled).length;
  const errorCount    = Object.keys(errorByUrl).length;

  return (
    <div className={styles.section}>
      <p className={styles.sectionDesc}>
        Connect iCal feeds (Google Calendar, Outlook, ICS URLs) to pull events from external sources.
        {feeds.length > 0 && (
          <span style={{ marginLeft: 6 }}>
            {enabledCount} active{errorCount > 0 && <span style={{ color: 'var(--wc-danger)' }}>, {errorCount} error{errorCount > 1 ? 's' : ''}</span>}.
          </span>
        )}
      </p>

      {/* Feed list */}
      {feeds.length === 0 ? (
        <div style={{
          padding: '24px 16px', textAlign: 'center',
          border: '1px dashed var(--wc-border)',
          borderRadius: 'var(--wc-radius-sm)',
          color: 'var(--wc-text-muted)', fontSize: 13,
        }}>
          No feeds connected yet. Add an iCal URL below.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {feeds.map((feed: any) => (
            <FeedRow
              key={feed.id}
              feed={feed}
              error={feed.enabled ? errorByUrl[feed.url] : undefined}
              onToggle={onToggle}
              onRemove={onRemove}
              onUpdate={onUpdate}
            />
          ))}
        </div>
      )}

      {/* Add form */}
      <AddFeedForm onAdd={onAdd} />

      {/* Help note */}
      <p style={{ fontSize: 11, color: 'var(--wc-text-muted)', margin: 0 }}>
        Tip: use the <strong>webcal://</strong> or <strong>https://</strong> ICS URL from Google Calendar,
        Outlook, Apple Calendar, or any RFC 5545-compliant feed.
      </p>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _suggestLabel(url: string) {
  try {
    const u = new URL(url.replace(/^webcal:/, 'https:'));
    // Strip common ICS path suffixes to get a readable hostname
    return u.hostname.replace(/^(www|calendar)\./, '');
  } catch {
    return url;
  }
}
