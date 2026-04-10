import { useState } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import { FIELD_TYPES } from '../core/configSchema.js';
import { useFocusTrap } from '../hooks/useFocusTrap.js';
import ICSFeedPanel from './ICSFeedPanel.jsx';
import styles from './ConfigPanel.module.css';

const TABS = [
  { id: 'hoverCard',   label: 'Hover Card' },
  { id: 'eventFields', label: 'Event Fields' },
  { id: 'display',     label: 'Display' },
  { id: 'feeds',       label: 'Feeds' },
  { id: 'access',      label: 'Access' },
];

export default function ConfigPanel({
  config, categories, onUpdate, onClose,
  // ICS feed props (optional — omitted when owner has no feed store)
  feeds, feedErrors, onAddFeed, onRemoveFeed, onToggleFeed, onUpdateFeed,
}) {
  const [tab, setTab] = useState('hoverCard');
  const trapRef = useFocusTrap(onClose);

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div ref={trapRef} className={styles.panel} role="dialog" aria-modal="true" aria-label="Calendar settings">
        <div className={styles.panelHead}>
          <h2 className={styles.panelTitle}>Calendar Settings</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close settings">
            <X size={18} />
          </button>
        </div>

        <div className={styles.tabBar}>
          {TABS.map(t => (
            <button
              key={t.id}
              className={[styles.tab, tab === t.id && styles.activeTab].filter(Boolean).join(' ')}
              onClick={() => setTab(t.id)}
            >{t.label}</button>
          ))}
        </div>

        <div className={styles.body}>
          {tab === 'hoverCard'   && <HoverCardTab   config={config} onUpdate={onUpdate} />}
          {tab === 'eventFields' && <EventFieldsTab config={config} categories={categories} onUpdate={onUpdate} />}
          {tab === 'display'     && <DisplayTab     config={config} onUpdate={onUpdate} />}
          {tab === 'feeds'       && (
            <ICSFeedPanel
              feeds={feeds ?? []}
              feedErrors={feedErrors ?? []}
              onAdd={onAddFeed}
              onRemove={onRemoveFeed}
              onToggle={onToggleFeed}
              onUpdate={onUpdateFeed}
            />
          )}
          {tab === 'access'      && <AccessTab      config={config} onUpdate={onUpdate} />}
        </div>
      </div>
    </div>
  );
}

/* ----- HoverCard tab ----- */
function HoverCardTab({ config, onUpdate }) {
  const hc = config.hoverCard;
  const toggle = (key) =>
    onUpdate(c => ({ ...c, hoverCard: { ...c.hoverCard, [key]: !c.hoverCard[key] } }));

  const fields = [
    { key: 'showTime',     label: 'Time' },
    { key: 'showCategory', label: 'Category' },
    { key: 'showResource', label: 'Resource' },
    { key: 'showMeta',     label: 'Custom fields (meta)' },
    { key: 'showNotes',    label: 'Notes' },
  ];

  return (
    <div className={styles.section}>
      <p className={styles.sectionDesc}>Choose which fields are visible in the event hover card.</p>
      {fields.map(f => (
        <label key={f.key} className={styles.toggle}>
          <span>{f.label}</span>
          <input type="checkbox" checked={!!hc[f.key]} onChange={() => toggle(f.key)} />
          <span className={styles.toggleTrack} />
        </label>
      ))}
    </div>
  );
}

/* ----- EventFields tab ----- */
function EventFieldsTab({ config, categories, onUpdate }) {
  const [selCat, setSelCat] = useState(categories[0] || '');
  const [newCat, setNewCat] = useState('');

  const fields = config.eventFields?.[selCat] || [];

  function addField() {
    onUpdate(c => ({
      ...c,
      eventFields: {
        ...c.eventFields,
        [selCat]: [...(c.eventFields?.[selCat] || []), { name: '', type: 'text', required: false, options: '' }],
      },
    }));
  }

  function updateField(idx, patch) {
    onUpdate(c => {
      const arr = [...(c.eventFields?.[selCat] || [])];
      arr[idx] = { ...arr[idx], ...patch };
      return { ...c, eventFields: { ...c.eventFields, [selCat]: arr } };
    });
  }

  function removeField(idx) {
    onUpdate(c => {
      const arr = (c.eventFields?.[selCat] || []).filter((_, i) => i !== idx);
      return { ...c, eventFields: { ...c.eventFields, [selCat]: arr } };
    });
  }

  function addCategory() {
    const cat = newCat.trim();
    if (!cat) return;
    setSelCat(cat);
    setNewCat('');
    onUpdate(c => ({ ...c, eventFields: { ...c.eventFields, [cat]: [] } }));
  }

  const allCats = Array.from(new Set([...categories, ...Object.keys(config.eventFields || {})]));

  return (
    <div className={styles.section}>
      <p className={styles.sectionDesc}>Define custom fields per category. These appear in the event add/edit form.</p>

      <div className={styles.catRow}>
        <select className={styles.select} value={selCat} onChange={e => setSelCat(e.target.value)}>
          {allCats.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <input className={styles.input} value={newCat} onChange={e => setNewCat(e.target.value)}
          placeholder="New category…" onKeyDown={e => e.key === 'Enter' && addCategory()} />
        <button className={styles.addBtn} onClick={addCategory}><Plus size={14} /></button>
      </div>

      {selCat && (
        <>
          {fields.map((f, i) => (
            <div key={i} className={styles.fieldRow}>
              <input className={styles.input} value={f.name}
                onChange={e => updateField(i, { name: e.target.value })} placeholder="Field name" />
              <select className={styles.select} value={f.type}
                onChange={e => updateField(i, { type: e.target.value })}>
                {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              {f.type === 'select' && (
                <input className={styles.input} value={f.options || ''}
                  onChange={e => updateField(i, { options: e.target.value })}
                  placeholder="Option 1, Option 2, …" />
              )}
              <label className={styles.reqLabel}>
                <input type="checkbox" checked={!!f.required} onChange={e => updateField(i, { required: e.target.checked })} />
                Required
              </label>
              <button className={styles.removeBtn} onClick={() => removeField(i)}><Trash2 size={13} /></button>
            </div>
          ))}
          <button className={styles.addFieldBtn} onClick={addField}><Plus size={13} /> Add field</button>
        </>
      )}
    </div>
  );
}

/* ----- Display tab ----- */
function DisplayTab({ config, onUpdate }) {
  const d = config.display;
  const set = (key, val) => onUpdate(c => ({ ...c, display: { ...c.display, [key]: val } }));

  return (
    <div className={styles.section}>
      <label className={styles.formRow}>
        <span>Default view</span>
        <select className={styles.select} value={d.defaultView} onChange={e => set('defaultView', e.target.value)}>
          {['month','week','day','agenda','schedule','timeline'].map(v => <option key={v} value={v}>{v.charAt(0).toUpperCase() + v.slice(1)}</option>)}
        </select>
      </label>
      <label className={styles.formRow}>
        <span>Week starts on</span>
        <select className={styles.select} value={d.weekStartDay} onChange={e => set('weekStartDay', +e.target.value)}>
          <option value={0}>Sunday</option>
          <option value={1}>Monday</option>
        </select>
      </label>
      <label className={styles.formRow}>
        <span>Day view start (hour)</span>
        <input type="number" className={styles.input} min={0} max={23} value={d.dayStart}
          onChange={e => set('dayStart', +e.target.value)} style={{ width: 72 }} />
      </label>
      <label className={styles.formRow}>
        <span>Day view end (hour)</span>
        <input type="number" className={styles.input} min={1} max={24} value={d.dayEnd}
          onChange={e => set('dayEnd', +e.target.value)} style={{ width: 72 }} />
      </label>
      <label className={styles.toggle}>
        <span>Show week numbers</span>
        <input type="checkbox" checked={!!d.showWeekNumbers}
          onChange={e => set('showWeekNumbers', e.target.checked)} />
        <span className={styles.toggleTrack} />
      </label>
    </div>
  );
}

/* ----- Access tab ----- */
function AccessTab({ config, onUpdate }) {
  return (
    <div className={styles.section}>
      <p className={styles.sectionDesc}>Optionally require a password to view this calendar.</p>
      <label className={styles.formRow}>
        <span>Viewer password</span>
        <input type="password" className={styles.input}
          value={config.access?.viewerPassword || ''}
          onChange={e => onUpdate(c => ({ ...c, access: { ...c.access, viewerPassword: e.target.value } }))}
          placeholder="Leave blank for open access" />
      </label>
    </div>
  );
}
