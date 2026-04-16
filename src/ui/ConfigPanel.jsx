import { useEffect, useRef, useState } from 'react';
import { X, Plus, Trash2, Check, Camera, Pencil } from 'lucide-react';
import { FIELD_TYPES } from '../core/configSchema.js';
import { useFocusTrap } from '../hooks/useFocusTrap.js';
import { serializeFilters } from '../hooks/useSavedViews.js';
import { THEMES } from '../styles/themes.js';
import SourcePanel from './SourcePanel.jsx';
import ThemeCustomizer from './ThemeCustomizer.jsx';
import AdvancedFilterBuilder from './AdvancedFilterBuilder.jsx';
import styles from './ConfigPanel.module.css';

const TABS = [
  { id: 'setup',       label: 'Setup' },
  { id: 'hoverCard',   label: 'Hover Card' },
  { id: 'eventFields', label: 'Event Fields' },
  { id: 'display',     label: 'Display' },
  { id: 'theme',       label: 'Theme' },
  { id: 'feeds',       label: 'Feeds' },
  { id: 'templates',   label: 'Templates' },
  { id: 'smartViews',  label: 'Smart Views' },
  { id: 'team',        label: 'Employees' },
  { id: 'access',      label: 'Access' },
];

export default function ConfigPanel({
  config, categories, resources, schema, items, onUpdate, onClose, onSaveView,
  savedViews, onUpdateView, onDeleteView,
  // Source store props (optional — omitted when owner has no source store)
  sources, feedErrors, onAddSource, onRemoveSource, onToggleSource, onUpdateSource,
  scheduleTemplates, onCreateScheduleTemplate, onDeleteScheduleTemplate, scheduleTemplateError,
}) {
  const [tab, setTab] = useState('setup');
  const trapRef = useFocusTrap(onClose);
  const tabRefs = useRef({});

  useEffect(() => {
    tabRefs.current[tab]?.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
      behavior: 'smooth',
    });
  }, [tab]);

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div ref={trapRef} className={styles.panel} role="dialog" aria-modal="true" aria-label="Calendar settings">
        <div className={styles.panelHead}>
          <h2 className={styles.panelTitle}>Calendar Settings</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close settings">
            <X size={18} />
          </button>
        </div>

        <div className={styles.tabBar} role="tablist" aria-label="Calendar settings sections">
          {TABS.map(t => (
            <button
              key={t.id}
              ref={(node) => {
                if (node) tabRefs.current[t.id] = node;
              }}
              className={[styles.tab, tab === t.id && styles.activeTab].filter(Boolean).join(' ')}
              onClick={() => setTab(t.id)}
              role="tab"
              aria-selected={tab === t.id}
            >{t.label}</button>
          ))}
        </div>

        <div className={styles.body}>
          {tab === 'setup'       && <SetupTab config={config} onUpdate={onUpdate} />}
          {tab === 'hoverCard'   && <HoverCardTab   config={config} onUpdate={onUpdate} />}
          {tab === 'eventFields' && <EventFieldsTab config={config} categories={categories} onUpdate={onUpdate} />}
          {tab === 'display'     && <DisplayTab     config={config} onUpdate={onUpdate} />}
          {tab === 'theme'       && <ThemeCustomizer theme={config.customTheme} onChange={onUpdate} />}
          {tab === 'feeds'       && (
            <SourcePanel
              sources={sources ?? []}
              feedErrors={feedErrors ?? []}
              onAdd={onAddSource}
              onRemove={onRemoveSource}
              onToggle={onToggleSource}
              onUpdate={onUpdateSource}
            />
          )}
          {tab === 'templates'   && (
            <TemplateTab
              templates={scheduleTemplates ?? []}
              onCreate={onCreateScheduleTemplate}
              onDelete={onDeleteScheduleTemplate}
              error={scheduleTemplateError}
            />
          )}
          {tab === 'smartViews'  && (
            <SmartViewsTab
              categories={categories}
              resources={resources}
              schema={schema}
              items={items}
              onSaveView={onSaveView}
              savedViews={savedViews ?? []}
              onUpdateView={onUpdateView}
              onDeleteView={onDeleteView}
            />
          )}
          {tab === 'team'        && <TeamTab config={config} onUpdate={onUpdate} />}
          {tab === 'access'      && <AccessTab      config={config} onUpdate={onUpdate} />}
        </div>
      </div>
    </div>
  );
}

function SetupTab({ config, onUpdate }) {
  const selectedTheme = config.setup?.preferredTheme ?? 'corporate';
  const calendarName = config.title ?? 'My WorksCalendar';

  const setCalendarName = (name) => onUpdate(c => ({
    ...c,
    title: name,
  }));

  const setPreferredTheme = (themeId) => onUpdate(c => ({
    ...c,
    setup: { ...(c.setup ?? {}), preferredTheme: themeId },
  }));

  return (
    <div className={styles.section}>
      <p className={styles.sectionDesc}>Start setup by naming your calendar and selecting a theme.</p>
      <label className={styles.formRow}>
        <span>Calendar name</span>
        <input
          className={styles.input}
          value={calendarName}
          onChange={(e) => setCalendarName(e.target.value)}
          maxLength={64}
          placeholder="My WorksCalendar"
        />
      </label>
      <div className={styles.themeGrid}>
        {THEMES.map((theme) => (
          <button
            key={theme.id}
            className={[styles.themeCard, selectedTheme === theme.id && styles.themeCardSelected].filter(Boolean).join(' ')}
            onClick={() => setPreferredTheme(theme.id)}
            title={theme.description}
            aria-pressed={selectedTheme === theme.id}
          >
            <div className={styles.themeCardPreview} style={{ background: theme.preview.bg, borderColor: theme.preview.border }}>
              <div className={styles.themeCardAccent} style={{ background: theme.preview.accent }} />
              <div className={styles.themeCardLines}>
                <span style={{ background: theme.preview.text }} />
                <span style={{ background: theme.preview.text, width: '65%' }} />
              </div>
            </div>
            <div className={styles.themeCardTop}>
              <span>{theme.label}</span>
              {selectedTheme === theme.id && <Check size={12} />}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function SmartViewsTab({ categories, resources, schema, items, onSaveView, savedViews = [], onUpdateView, onDeleteView }) {
  const [editingId,   setEditingId]   = useState(null);
  const [confirmDel,  setConfirmDel]  = useState(null); // id to confirm deletion

  const editingView = editingId ? savedViews.find(v => v.id === editingId) : null;

  const handleUpdate = (id, name, filters, conditions) => {
    onUpdateView?.(id, { name, filters: serializeFilters(filters), conditions });
    setEditingId(null);
  };

  return (
    <div className={styles.section}>
      {/* ── Existing views list ── */}
      {savedViews.length > 0 && (
        <div className={styles.smartViewList}>
          <p className={styles.sectionDesc} style={{ marginBottom: 6 }}>Manage existing Smart Views:</p>
          {savedViews.map(view => (
            <div
              key={view.id}
              className={[styles.smartViewRow, editingId === view.id && styles.smartViewRowEditing].filter(Boolean).join(' ')}
            >
              <span className={styles.smartViewName} style={{ '--chip-color': view.color ?? '#64748b' }}>
                {view.name}
              </span>
              <div className={styles.smartViewActions}>
                <button
                  className={styles.svActionBtn}
                  onClick={() => setEditingId(prev => prev === view.id ? null : view.id)}
                  title="Edit conditions"
                  aria-label={`Edit ${view.name}`}
                  aria-pressed={editingId === view.id}
                >
                  <Pencil size={13} />
                </button>
                {confirmDel === view.id ? (
                  <>
                    <button
                      className={[styles.svActionBtn, styles.svDanger].join(' ')}
                      onClick={() => { onDeleteView?.(view.id); setConfirmDel(null); if (editingId === view.id) setEditingId(null); }}
                      title="Confirm delete"
                      aria-label={`Confirm delete ${view.name}`}
                    >
                      <Check size={13} />
                    </button>
                    <button
                      className={styles.svActionBtn}
                      onClick={() => setConfirmDel(null)}
                      title="Cancel"
                      aria-label="Cancel delete"
                    >
                      <X size={13} />
                    </button>
                  </>
                ) : (
                  <button
                    className={[styles.svActionBtn, styles.svDanger].join(' ')}
                    onClick={() => setConfirmDel(view.id)}
                    title={`Delete ${view.name}`}
                    aria-label={`Delete ${view.name}`}
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Builder (create or edit) ── */}
      <p className={styles.sectionDesc}>
        {editingView
          ? `Editing conditions for "${editingView.name}"`
          : 'Create Smart Views once categories and people are configured.'}
      </p>
      <AdvancedFilterBuilder
        key={editingId ?? '__new__'}
        schema={schema}
        items={items}
        categories={categories ?? []}
        resources={resources ?? []}
        onSave={(name, filters, conditions) => onSaveView?.(name, filters, { conditions })}
        initialName={editingView?.name ?? ''}
        initialConditions={editingView?.conditions ?? null}
        editingId={editingId}
        onUpdate={handleUpdate}
        onCancelEdit={() => setEditingId(null)}
      />
    </div>
  );
}

function TeamTab({ config, onUpdate }) {
  const teamMembers = config.team?.members ?? [];

  const updateMembers = (nextMembers) => onUpdate(c => ({
    ...c,
    team: { ...(c.team ?? {}), members: nextMembers },
    setup: { ...(c.setup ?? {}), completed: true },
  }));

  const addMember = () => {
    const nextId = Math.max(0, ...teamMembers.map((member) => Number(member.id) || 0)) + 1;
    updateMembers([...teamMembers, { id: nextId, name: '', color: '#8b5cf6', avatar: null }]);
  };

  const updateMember = (id, patch) => {
    updateMembers(teamMembers.map((member) => (member.id === id ? { ...member, ...patch } : member)));
  };

  const removeMember = (id) => updateMembers(teamMembers.filter((member) => member.id !== id));

  const handleProfileUpload = (memberId, e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      updateMember(memberId, { avatar: ev.target.result });
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className={styles.section}>
      <p className={styles.sectionDesc}>Add employee photos after your categories and Smart Views are in place.</p>
      {teamMembers.map((member) => (
        <div key={member.id} className={styles.memberRow}>
          <label className={styles.avatarPicker}>
            <div className={styles.avatarFrame}>
              {member.avatar ? (
                <img src={member.avatar} alt={`${member.name || 'Employee'} avatar`} className={styles.avatarImg} />
              ) : (
                <div className={styles.avatarFallback} style={{ backgroundColor: member.color }}>
                  {(member.name?.trim()?.[0] ?? '?').toUpperCase()}
                </div>
              )}
            </div>
            <input type="file" accept="image/*" className={styles.fileInput} onChange={(e) => handleProfileUpload(member.id, e)} />
            <span className={styles.avatarBadge}><Camera size={11} /> Photo</span>
          </label>
          <input
            className={styles.input}
            value={member.name ?? ''}
            onChange={(e) => updateMember(member.id, { name: e.target.value })}
            placeholder="Employee name"
          />
          <button className={styles.removeBtn} onClick={() => removeMember(member.id)} aria-label={`Remove ${member.name || 'employee'}`}>
            <Trash2 size={13} />
          </button>
        </div>
      ))}
      <button className={styles.addFieldBtn} onClick={addMember}><Plus size={13} /> Add employee</button>
    </div>
  );
}

function TemplateTab({ templates, onCreate, onDelete, error }) {
  const [name, setName] = useState('');
  const [visibility, setVisibility] = useState('team');
  const [title, setTitle] = useState('');
  const [startOffsetMinutes, setStartOffsetMinutes] = useState(0);
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [rrule, setRrule] = useState('FREQ=DAILY');

  function resetForm() {
    setName('');
    setVisibility('team');
    setTitle('');
    setStartOffsetMinutes(0);
    setDurationMinutes(60);
    setRrule('FREQ=DAILY');
  }

  async function handleCreate() {
    if (!onCreate) return;
    const cleanName = name.trim();
    const cleanTitle = title.trim();
    if (!cleanName || !cleanTitle) return;
    await onCreate({
      name: cleanName,
      visibility,
      entries: [{
        title: cleanTitle,
        startOffsetMinutes: Number(startOffsetMinutes) || 0,
        durationMinutes: Math.max(1, Number(durationMinutes) || 1),
        rrule: rrule.trim() || undefined,
      }],
    });
    resetForm();
  }

  return (
    <div className={styles.section}>
      <p className={styles.sectionDesc}>Create and govern schedule templates for Add Schedule flows.</p>

      {error && <div className={styles.sectionDesc} role="alert">{error}</div>}

      <label className={styles.formRow}>
        <span>Template name</span>
        <input className={styles.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Morning coverage" />
      </label>
      <div className={styles.formRow}>
        <span>Visibility</span>
        <select className={styles.select} value={visibility} onChange={(e) => setVisibility(e.target.value)}>
          <option value="private">Private</option>
          <option value="team">Team</option>
          <option value="org">Org</option>
        </select>
      </div>
      <label className={styles.formRow}>
        <span>Default entry title</span>
        <input className={styles.input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Primary shift" />
      </label>
      <label className={styles.formRow}>
        <span>Offset (minutes)</span>
        <input className={styles.input} type="number" value={startOffsetMinutes} onChange={(e) => setStartOffsetMinutes(e.target.value)} />
      </label>
      <label className={styles.formRow}>
        <span>Duration (minutes)</span>
        <input className={styles.input} type="number" min={1} value={durationMinutes} onChange={(e) => setDurationMinutes(e.target.value)} />
      </label>
      <label className={styles.formRow}>
        <span>RRULE</span>
        <input className={styles.input} value={rrule} onChange={(e) => setRrule(e.target.value)} />
      </label>
      <button className={styles.addFieldBtn} onClick={handleCreate} disabled={!onCreate}>Create template</button>

      {templates.map((template) => (
        <div key={template.id} className={styles.fieldRow}>
          <div>
            <strong>{template.name}</strong>
            <div className={styles.sectionDesc}>
              {template.visibility ?? 'org'} · {template.entries?.length ?? 0} entr{(template.entries?.length ?? 0) === 1 ? 'y' : 'ies'}
            </div>
          </div>
          <button className={styles.removeBtn} onClick={() => onDelete?.(template.id)} disabled={!onDelete}>
            <Trash2 size={13} />
          </button>
        </div>
      ))}
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
  const labels = config.filterUi?.groupLabels ?? {};
  const set = (key, val) => onUpdate(c => ({ ...c, display: { ...c.display, [key]: val } }));
  const setGroupLabel = (key, val) =>
    onUpdate(c => ({
      ...c,
      filterUi: {
        ...c.filterUi,
        groupLabels: {
          ...(c.filterUi?.groupLabels ?? {}),
          [key]: val,
        },
      },
    }));

  return (
    <div className={styles.section}>
      <div className={styles.formRow}>
        <span>Default view</span>
        <select className={styles.select} value={d.defaultView} onChange={e => set('defaultView', e.target.value)}>
          {['month','week','day','agenda','schedule','timeline'].map(v => (
            <option key={v} value={v}>
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.formRow}>
        <span>Week starts on</span>
        <select className={styles.select} value={d.weekStartDay} onChange={e => set('weekStartDay', +e.target.value)}>
          <option value={0}>Sunday</option>
          <option value={1}>Monday</option>
        </select>
      </div>

      <label className={styles.formRow}>
        <span>Day view start (hour)</span>
        <input
          type="number"
          className={styles.input}
          min={0}
          max={23}
          value={d.dayStart}
          onChange={e => set('dayStart', +e.target.value)}
          style={{ width: 72 }}
        />
      </label>

      <label className={styles.formRow}>
        <span>Day view end (hour)</span>
        <input
          type="number"
          className={styles.input}
          min={1}
          max={24}
          value={d.dayEnd}
          onChange={e => set('dayEnd', +e.target.value)}
          style={{ width: 72 }}
        />
      </label>

      <label className={styles.toggle}>
        <span>Show week numbers</span>
        <input
          type="checkbox"
          checked={!!d.showWeekNumbers}
          onChange={e => set('showWeekNumbers', e.target.checked)}
        />
        <span className={styles.toggleTrack} />
      </label>

      <label className={styles.toggle}>
        <span>Enlarge month row on hover</span>
        <input
          type="checkbox"
          checked={!!d.enlargeMonthRowOnHover}
          onChange={e => set('enlargeMonthRowOnHover', e.target.checked)}
        />
        <span className={styles.toggleTrack} />
      </label>

      <div className={styles.section} style={{ paddingTop: 12 }}>
        <p className={styles.sectionDesc}>Rename the grouped filter dropdown buttons shown to users.</p>

        <label className={styles.formRow}>
          <span>Categories label</span>
          <input
            className={styles.input}
            value={labels.categories ?? 'Categories'}
            onChange={e => setGroupLabel('categories', e.target.value)}
            placeholder="Categories"
          />
        </label>

        <label className={styles.formRow}>
          <span>People label</span>
          <input
            className={styles.input}
            value={labels.resources ?? 'People'}
            onChange={e => setGroupLabel('resources', e.target.value)}
            placeholder="People"
          />
        </label>

        <label className={styles.formRow}>
          <span>Sources label</span>
          <input
            className={styles.input}
            value={labels.sources ?? 'Sources'}
            onChange={e => setGroupLabel('sources', e.target.value)}
            placeholder="Sources"
          />
        </label>

        <label className={styles.formRow}>
          <span>More label</span>
          <input
            className={styles.input}
            value={labels.more ?? 'More'}
            onChange={e => setGroupLabel('more', e.target.value)}
            placeholder="More"
          />
        </label>
      </div>
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
