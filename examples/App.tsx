/**
 * WorksCalendar — Examples Showcase
 *
 * Run locally:
 *   npm run examples
 *
 * Then open http://localhost:3001
 */
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { DemoLanding }            from './00-DemoLanding';
import { GettingStarted }          from './01-GettingStarted';
import { BasicCalendar }           from './02-BasicCalendar';
import { WithFilters }             from './03-WithFilters';
import { TimelineScheduler }       from './04-TimelineScheduler';
import { CustomFilters }           from './05-CustomFilters';
import { TeamCalendar }            from './06-TeamCalendar';
import { MultiSource }             from './07-MultiSource';
import { ShiftCoverageTracking }   from './08-ShiftCoverageTracking';
import { GroupingExample }         from './09-Grouping';
import { DragAndDropExample }      from './10-DragAndDrop';
import { MapExample }              from './11-Map';
import { MaintenanceAndInvoicingExample } from './11-MaintenanceAndInvoicing';
import { BasicUsageExample }       from './basic-usage';
import { SetupWizardExample }      from './setup-wizard';
import { AdvancedFiltersExample }  from './advanced-filters';
import { LocalDataAdapterExample } from './data-adapter-local';
import { ExternalFormExample }     from './external-form';
import { AssetsDemoExample }       from './assets-demo';

// ── Nav config ────────────────────────────────────────────────────────────────
const EXAMPLES = [
  {
    id:    'demo-landing',
    label: 'Demo Landing',
    tag:   'Start here',
    desc:  'Polished entry page for first-time visitors. Jump to schedule, filters, saved views, and docs.',
    component: DemoLanding,
  },
  {
    id:    'getting-started',
    label: 'Getting Started',
    tag:   '5 min',
    desc:  'Minimum viable calendar — just events and a container.',
    component: GettingStarted,
  },
  {
    id:    'basic-calendar',
    label: 'Basic Calendar',
    tag:   'Categories + Callbacks',
    desc:  'Categorized events, theme switching, save/move/delete callbacks.',
    component: BasicCalendar,
  },
  {
    id:    'with-filters',
    label: 'Filtered Calendar',
    tag:   'Built-in filters',
    desc:  'Rich event dataset. The filter bar appears automatically from your category and resource fields.',
    component: WithFilters,
  },
  {
    id:    'timeline',
    label: 'Timeline / Scheduler',
    tag:   'Resource rows',
    desc:  'One row per team member. Drag bars to reassign resources and reschedule.',
    component: TimelineScheduler,
  },
  {
    id:    'custom-filters',
    label: 'Custom Filter Schema',
    tag:   'priority · owner · tags',
    desc:  'Extend the default schema with priorityField, ownerField, and tagsField. Active filters appear as removable pills.',
    component: CustomFilters,
  },
  {
    id:    'team-calendar',
    label: 'Team Calendar',
    tag:   'Multi-source',
    desc:  'Three team calendars merged into one. Tag events with _sourceId and source filter pills appear automatically.',
    component: TeamCalendar,
  },
  {
    id:    'basic-usage-modern',
    label: 'Basic Usage (New)',
    tag:   'Docs refresh',
    desc:  'Minimal modern example used by README/docs updates.',
    component: BasicUsageExample,
  },
  {
    id:    'setup-wizard',
    label: 'Setup Wizard',
    tag:   'Owner onboarding',
    desc:  'Demonstrates owner-first setup flow and persisted onboarding state.',
    component: SetupWizardExample,
  },
  {
    id:    'advanced-filters-new',
    label: 'Advanced Filters',
    tag:   'Smart views',
    desc:  'Schema extensions with priority/owner/tags fields.',
    component: AdvancedFiltersExample,
  },
  {
    id:    'data-adapter-local',
    label: 'Data Adapter (Local)',
    tag:   'External form',
    desc:  'CalendarExternalForm with localStorage adapter.',
    component: LocalDataAdapterExample,
  },
  {
    id:    'external-form',
    label: 'External Form',
    tag:   'Standalone intake',
    desc:  'Standalone external event request form with async adapter.',
    component: ExternalFormExample,
  },
  {
    id:    'multi-source',
    label: 'Multi-Source Timeline',
    tag:   'Sources + timeline',
    desc:  'Timeline view with four simulated calendar feeds. Filter by source, resource, or combine both.',
    component: MultiSource,
  },
  {
    id:    'shift-coverage',
    label: 'Shift Coverage Tracking',
    tag:   'PTO · coverage · on-call',
    desc:  'Mark on-call shifts as PTO or Unavailable, pick up uncovered shifts, and track who is covering for whom.',
    component: ShiftCoverageTracking,
  },
  {
    id:    'grouping',
    label: 'Grouping & Sort',
    tag:   '1-, 2-, 3-level',
    desc:  'Story patterns for infinite grouping: single/nested groupBy, showAllGroups, multi-field sort, saved views.',
    component: GroupingExample,
  },
  {
    id:    'drag-and-drop',
    label: 'DnD Between Groups',
    tag:   'onEventGroupChange',
    desc:  'Drag an event across groups (agenda) or rows (timeline) to reassign. Patches flow through engine validation.',
    component: DragAndDropExample,
  },
  {
    id:    'map',
    label: 'Map View',
    tag:   'Optional plugin',
    desc:  'Geographic plot of events with meta.coords. Renders an install hint until maplibre-gl + react-map-gl are installed.',
    component: MapExample,
  },
  {
    id:    'maintenance-invoicing',
    label: 'Maintenance & Invoicing',
    tag:   'Asset health · CSV export',
    desc:  'Asset-row badges show due/overdue maintenance; completing service in the form auto-stamps next-due. One-click CSV export for invoices and maintenance log.',
    component: MaintenanceAndInvoicingExample,
  },
];

// ── Sidebar ───────────────────────────────────────────────────────────────────
function Sidebar({ active, onSelect }) {
  return (
    <nav style={{
      width: 240, flexShrink: 0,
      background: '#0f172a',
      borderRight: '1px solid #1e293b',
      display: 'flex', flexDirection: 'column',
      overflow: 'auto',
    }}>
      <div style={{ padding: '20px 16px 12px' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9', letterSpacing: '-0.01em' }}>
          WorksCalendar
        </div>
        <div style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>
          Examples
        </div>
      </div>

      <div style={{ padding: '0 8px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {EXAMPLES.map(ex => (
          <button
            key={ex.id}
            onClick={() => onSelect(ex.id)}
            style={{
              textAlign: 'left', border: 'none', cursor: 'pointer',
              padding: '10px 12px', borderRadius: 8,
              background: active === ex.id ? '#1e293b' : 'transparent',
              display: 'flex', flexDirection: 'column', gap: 3,
              transition: 'background 0.15s',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{
                fontSize: 13, fontWeight: active === ex.id ? 600 : 400,
                color: active === ex.id ? '#f1f5f9' : '#94a3b8',
              }}>
                {ex.label}
              </span>
              <span style={{
                fontSize: 9, fontWeight: 600, textTransform: 'uppercase',
                letterSpacing: '0.06em', padding: '1px 5px',
                borderRadius: 4,
                background: active === ex.id ? '#334155' : '#1e293b',
                color: '#64748b',
              }}>
                {ex.tag}
              </span>
            </div>
            <span style={{ fontSize: 11, color: '#475569', lineHeight: 1.4 }}>
              {ex.desc}
            </span>
          </button>
        ))}
      </div>

      <div style={{ marginTop: 'auto', padding: 16, borderTop: '1px solid #1e293b' }}>
        <div style={{ fontSize: 10, color: '#334155', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
          Install
        </div>
        <code style={{
          display: 'block', padding: '7px 10px', borderRadius: 6,
          background: '#1e293b', color: '#7dd3fc', fontSize: 11,
          fontFamily: 'monospace',
        }}>
          npm install works-calendar
        </code>
      </div>
    </nav>
  );
}

// ── Source hint ───────────────────────────────────────────────────────────────
function SourceHint({ id }) {
  const file = {
    'getting-started': '01-GettingStarted.jsx',
    'demo-landing':    '00-DemoLanding.jsx',
    'basic-calendar':  '02-BasicCalendar.jsx',
    'with-filters':    '03-WithFilters.jsx',
    'timeline':        '04-TimelineScheduler.jsx',
    'custom-filters':  '05-CustomFilters.jsx',
    'team-calendar':   '06-TeamCalendar.jsx',
    'multi-source':         '07-MultiSource.jsx',
    'shift-coverage':       '08-ShiftCoverageTracking.jsx',
    'grouping':             '09-Grouping.jsx',
    'drag-and-drop':        '10-DragAndDrop.jsx',
    'map':                  '11-Map.jsx',
    'maintenance-invoicing': '11-MaintenanceAndInvoicing.jsx',
    'basic-usage-modern':   'basic-usage.jsx',
    'setup-wizard':         'setup-wizard.jsx',
    'advanced-filters-new': 'advanced-filters.jsx',
    'data-adapter-local':   'data-adapter-local.jsx',
    'external-form':        'external-form.jsx',
  }[id];

  return (
    <div style={{
      padding: '6px 16px',
      background: '#f8fafc',
      borderBottom: '1px solid #e2e8f0',
      display: 'flex', alignItems: 'center', gap: 8,
      flexShrink: 0,
    }}>
      <span style={{ fontSize: 11, color: '#94a3b8' }}>Source:</span>
      <code style={{ fontSize: 11, color: '#334155', fontFamily: 'monospace' }}>
        examples/{file}
      </code>
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────
function App() {
  const [active, setActive] = useState('demo-landing');
  const example = EXAMPLES.find(e => e.id === active);
  const Component = example.component;

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar active={active} onSelect={setActive} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <SourceHint id={active} />
        <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
          <Component onNavigate={setActive} />
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode><App /></StrictMode>
);
