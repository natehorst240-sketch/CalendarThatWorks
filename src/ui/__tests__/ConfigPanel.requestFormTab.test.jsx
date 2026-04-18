// @vitest-environment happy-dom
/**
 * RequestFormTab — ticket #134-12.
 *
 * Owner-editable RequestForm schema. Writes to `config.requestForm.fields`;
 * RequestForm.jsx consumes the same block at render time. These specs pin
 * the CRUD contract so the integration matrix (#134-16) can depend on a
 * stable shape.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';

import { RequestFormTab } from '../ConfigPanel.jsx';

function renderTab({ initialConfig = {}, onUpdate } = {}) {
  let currentConfig = { ...initialConfig };
  const update = onUpdate ?? vi.fn(updater => {
    currentConfig = typeof updater === 'function'
      ? updater(currentConfig)
      : { ...currentConfig, ...updater };
  });
  const utils = render(<RequestFormTab config={currentConfig} onUpdate={update} />);
  const rerender = () =>
    utils.rerender(<RequestFormTab config={currentConfig} onUpdate={update} />);
  return { ...utils, update, getConfig: () => currentConfig, rerender };
}

const seededConfig = {
  requestForm: {
    fields: [
      { key: 'title',  label: 'Title',  type: 'text',     required: true },
      { key: 'start',  label: 'Starts', type: 'datetime', required: true },
      { key: 'notes',  label: 'Notes',  type: 'textarea', required: false },
    ],
  },
};

describe('RequestFormTab — rendering', () => {
  it('renders one row per seeded field', () => {
    renderTab({ initialConfig: seededConfig });
    expect(screen.getByLabelText('Label for title')).toHaveValue('Title');
    expect(screen.getByLabelText('Label for start')).toHaveValue('Starts');
    expect(screen.getByLabelText('Label for notes')).toHaveValue('Notes');
  });

  it('renders no field rows when config.requestForm is unset', () => {
    renderTab();
    expect(screen.queryByLabelText(/^Label for /)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add field/i })).toBeInTheDocument();
  });
});

describe('RequestFormTab — CRUD', () => {
  it('Add field appends a text field with a fresh key', () => {
    const { getConfig, rerender } = renderTab({ initialConfig: seededConfig });
    fireEvent.click(screen.getByRole('button', { name: /Add field/i }));
    rerender();
    const { fields } = getConfig().requestForm;
    expect(fields).toHaveLength(4);
    expect(fields[3]).toMatchObject({
      key: 'field-4',
      label: 'Field 4',
      type: 'text',
      required: false,
    });
  });

  it('editing the label persists to config', () => {
    const { getConfig, rerender } = renderTab({ initialConfig: seededConfig });
    fireEvent.change(screen.getByLabelText('Label for notes'), {
      target: { value: 'Comments' },
    });
    rerender();
    expect(getConfig().requestForm.fields[2].label).toBe('Comments');
  });

  it('changing field type swaps render-time inputs', () => {
    const { getConfig, rerender } = renderTab({ initialConfig: seededConfig });
    fireEvent.change(screen.getByLabelText('Type for Title'), {
      target: { value: 'select' },
    });
    rerender();
    expect(getConfig().requestForm.fields[0].type).toBe('select');
    // Options input now appears for this row.
    expect(screen.getByLabelText('Options for Title')).toBeInTheDocument();
  });

  it('toggling required writes through', () => {
    const { getConfig, rerender } = renderTab({ initialConfig: seededConfig });
    const notesRequired = screen.getByLabelText('Required for Notes');
    expect(notesRequired).not.toBeChecked();
    fireEvent.click(notesRequired);
    rerender();
    expect(getConfig().requestForm.fields[2].required).toBe(true);
  });

  it('Move down swaps order', () => {
    const { getConfig, rerender } = renderTab({ initialConfig: seededConfig });
    fireEvent.click(screen.getByLabelText('Move Title down'));
    rerender();
    expect(getConfig().requestForm.fields.map(f => f.key)).toEqual([
      'start', 'title', 'notes',
    ]);
  });

  it('Move up on the topmost row is disabled', () => {
    renderTab({ initialConfig: seededConfig });
    expect(screen.getByLabelText('Move Title up')).toBeDisabled();
  });

  it('Remove field drops the row from config', () => {
    const { getConfig, rerender } = renderTab({ initialConfig: seededConfig });
    fireEvent.click(screen.getByLabelText('Remove Notes'));
    rerender();
    const { fields } = getConfig().requestForm;
    expect(fields).toHaveLength(2);
    expect(fields.map(f => f.key)).toEqual(['title', 'start']);
  });
});
