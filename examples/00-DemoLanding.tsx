import { useMemo } from 'react';

const CARD_STYLE = {
  background: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: 12,
  padding: 16,
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
};

function DemoCard({ title, body, cta, onClick }) {
  return (
    <article style={CARD_STYLE}>
      <h3 style={{ margin: 0, fontSize: 15, color: '#0f172a' }}>{title}</h3>
      <p style={{ margin: 0, fontSize: 13, color: '#475569', lineHeight: 1.45 }}>{body}</p>
      <button
        type="button"
        onClick={onClick}
        style={{
          marginTop: 'auto',
          alignSelf: 'flex-start',
          border: '1px solid #cbd5e1',
          background: '#f8fafc',
          color: '#0f172a',
          borderRadius: 8,
          padding: '7px 10px',
          fontSize: 12,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        {cta}
      </button>
    </article>
  );
}

export function DemoLanding({ onNavigate }) {
  const sections = useMemo(() => ([
    {
      title: 'Schedule demo',
      body: 'See employee rows, shift coverage, PTO, and availability from the Schedule timeline workflow.',
      cta: 'Open schedule demo',
      target: 'timeline',
    },
    {
      title: 'Filter demo',
      body: 'Show how teams slice a single calendar by source, category, owner, and tags in seconds.',
      cta: 'Open filter demo',
      target: 'with-filters',
    },
    {
      title: 'Saved views demo',
      body: 'Demonstrate reusable smart views so each team can jump to the right context instantly.',
      cta: 'Open saved views demo',
      target: 'advanced-filters-new',
    },
    {
      title: 'Shift coverage workflow',
      body: 'Walk through employee action card requests and automatic uncovered-shift handling.',
      cta: 'Open coverage demo',
      target: 'shift-coverage',
    },
  ]), []);

  return (
    <main style={{
      minHeight: '100%',
      padding: '28px 24px 36px',
      background: 'linear-gradient(180deg, #f8fafc 0%, #ffffff 35%)',
      color: '#0f172a',
    }}>
      <header style={{ maxWidth: 920 }}>
        <div style={{
          fontSize: 11,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: '#64748b',
          fontWeight: 700,
        }}>
          Public demo
        </div>
        <h1 style={{ margin: '8px 0 10px', fontSize: 32, lineHeight: 1.15 }}>
          Understand WorksCalendar in under 30 seconds.
        </h1>
        <p style={{ margin: 0, maxWidth: 760, fontSize: 15, color: '#475569', lineHeight: 1.6 }}>
          Start with a focused walkthrough: schedule operations, filtering, saved views, and shift coverage.
          Use these as the fastest way to explain what the product does to a first-time visitor.
        </p>
      </header>

      <section style={{
        marginTop: 22,
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 12,
        maxWidth: 980,
      }}>
        {sections.map((section) => (
          <DemoCard
            key={section.title}
            title={section.title}
            body={section.body}
            cta={section.cta}
            onClick={() => onNavigate?.(section.target)}
          />
        ))}
      </section>

      <section style={{
        marginTop: 20,
        maxWidth: 980,
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: 12,
      }}>
        <article style={CARD_STYLE}>
          <h3 style={{ margin: 0, fontSize: 14 }}>Docs links</h3>
          <p style={{ margin: 0, fontSize: 13, color: '#475569', lineHeight: 1.5 }}>
            Product behavior reference for demos:
          </p>
          <ul style={{ margin: 0, paddingLeft: 16, fontSize: 13, color: '#334155', lineHeight: 1.6 }}>
            <li><code>docs/ScheduleWorkflow.md</code></li>
            <li><code>docs/Filtering.md</code></li>
            <li><code>docs/AdvancedFilters.md</code></li>
          </ul>
        </article>

        <article style={CARD_STYLE}>
          <h3 style={{ margin: 0, fontSize: 14 }}>Examples index</h3>
          <p style={{ margin: 0, fontSize: 13, color: '#475569', lineHeight: 1.5 }}>
            Continue through focused examples from the sidebar or start with:
          </p>
          <ul style={{ margin: 0, paddingLeft: 16, fontSize: 13, color: '#334155', lineHeight: 1.6 }}>
            <li><code>examples/04-TimelineScheduler.jsx</code></li>
            <li><code>examples/03-WithFilters.jsx</code></li>
            <li><code>examples/advanced-filters.jsx</code></li>
          </ul>
        </article>
      </section>
    </main>
  );
}
