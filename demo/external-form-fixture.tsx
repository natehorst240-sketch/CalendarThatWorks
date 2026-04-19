// @ts-nocheck — demo fixture, re-typed after Phase 2 d.ts regeneration
import { StrictMode, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CalendarExternalForm } from '../src/index.ts';

const FIELDS = [
  { name: 'title', label: 'Title', type: 'text', required: true },
  { name: 'start', label: 'Start', type: 'datetime-local', required: true },
  { name: 'end', label: 'End', type: 'datetime-local', required: true },
  {
    name: 'category',
    label: 'Category',
    type: 'select',
    required: true,
    options: [
      { label: 'Meeting', value: 'Meeting' },
      { label: 'Incident', value: 'Incident' },
    ],
  },
];

function ExternalFormFixtureApp() {
  const [submitCount, setSubmitCount] = useState(0);
  const [mode, setMode] = useState('success');
  const [lastSuccessId, setLastSuccessId] = useState('');
  const [lastError, setLastError] = useState('');

  const adapter = useMemo(() => ({
    async submitEvent(payload) {
      setSubmitCount((prev) => prev + 1);
      if (mode === 'failure') {
        throw new Error('Simulated network failure');
      }

      return {
        id: `ext-${payload.title.toLowerCase().replace(/\s+/g, '-')}`,
      };
    },
  }), [mode]);

  return (
    <main style={{ maxWidth: 720, margin: '24px auto', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <h1>External Form Fixture</h1>
      <p data-testid="adapter-mode">Adapter mode: <strong>{mode}</strong></p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button type="button" onClick={() => setMode('success')}>Use success adapter</button>
        <button type="button" onClick={() => setMode('failure')}>Use failing adapter</button>
      </div>

      <CalendarExternalForm
        adapter={adapter}
        fields={FIELDS}
        submitLabel="Submit external event"
        onSuccess={(result) => {
          setLastSuccessId(result?.id || 'unknown');
          setLastError('');
        }}
        onError={(error) => {
          setLastError(error instanceof Error ? error.message : 'Unknown submit error');
        }}
      />

      <section style={{ marginTop: 16, padding: 12, border: '1px solid #cbd5e1', borderRadius: 8 }}>
        <p data-testid="submit-count">Submit attempts: {submitCount}</p>
        <p role="status">Last success id: {lastSuccessId || 'none'}</p>
        <p data-testid="last-error">Last error: {lastError || 'none'}</p>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ExternalFormFixtureApp />
  </StrictMode>,
);
