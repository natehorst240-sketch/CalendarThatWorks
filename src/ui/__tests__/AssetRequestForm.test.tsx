// @vitest-environment happy-dom
/**
 * AssetRequestForm — submits a new event at approvalStage=requested so the
 * existing approvals state machine handles the rest.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';
import React from 'react';

import AssetRequestForm from '../AssetRequestForm';

const assets = [
  { id: 'n100aa', label: 'N100AA', meta: { sublabel: 'CJ3' } },
  { id: 'n200bb', label: 'N200BB', meta: { sublabel: 'Phenom' } },
];

const categories = [
  { id: 'maintenance',       label: 'Maintenance' },
  { id: 'pr',                label: 'PR' },
  { id: 'training',          label: 'Training' },
  { id: 'aircraft-movement', label: 'Aircraft Movement' },
];

function renderForm(props = {}) {
  return render(
    <AssetRequestForm
      assets={assets}
      categories={categories}
      onSubmit={vi.fn()}
      onClose={vi.fn()}
      {...props}
    />,
  );
}

describe('AssetRequestForm', () => {
  it('renders the restricted category list (no other categories leak in)', () => {
    renderForm();
    const select = screen.getByLabelText(/Category/);
    const optionLabels = Array.from(select.querySelectorAll('option')).map(o => o.textContent);
    expect(optionLabels).toEqual(['Maintenance', 'PR', 'Training', 'Aircraft Movement']);
  });

  it('renders the asset registry as dropdown options', () => {
    renderForm();
    const select = screen.getByLabelText(/Asset/);
    const optionLabels = Array.from(select.querySelectorAll('option')).map(o => o.textContent);
    expect(optionLabels).toEqual(['N100AA', 'N200BB']);
  });

  it('validates required fields before submit', () => {
    const onSubmit = vi.fn();
    renderForm({ onSubmit });
    fireEvent.click(screen.getByRole('button', { name: 'Submit Request' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Title is required')).toBeInTheDocument();
  });

  it('submits a payload with approvalStage=requested', () => {
    const onSubmit = vi.fn();
    renderForm({ onSubmit });
    fireEvent.change(screen.getByLabelText(/Title/),    { target: { value: 'A-check' } });
    fireEvent.change(screen.getByLabelText(/Asset/),    { target: { value: 'n200bb' } });
    fireEvent.change(screen.getByLabelText(/Category/), { target: { value: 'maintenance' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit Request' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const payload = onSubmit.mock.calls[0][0]!;
    expect(payload.title).toBe('A-check');
    expect(payload.resource).toBe('n200bb');
    expect(payload.category).toBe('maintenance');
    expect(payload.meta.approvalStage.stage).toBe('requested');
    expect(typeof payload.meta.approvalStage.updatedAt).toBe('string');
    expect(payload.start).toBeInstanceOf(Date);
    expect(payload.end).toBeInstanceOf(Date);
    expect(payload.end.getTime()).toBeGreaterThan(payload.start.getTime());
  });

  it('rejects end-before-start', () => {
    const onSubmit = vi.fn();
    renderForm({ onSubmit });
    fireEvent.change(screen.getByLabelText(/Title/), { target: { value: 'bad window' } });
    fireEvent.change(screen.getByLabelText(/Start/), { target: { value: '2026-05-01T12:00' } });
    fireEvent.change(screen.getByLabelText(/End/),   { target: { value: '2026-05-01T10:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit Request' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('End must be after start')).toBeInTheDocument();
  });

  it('pre-fills the asset when initialAssetId is provided', () => {
    renderForm({ initialAssetId: 'n200bb' });
    expect((screen.getByLabelText(/Asset/) as HTMLInputElement).value).toBe('n200bb');
  });

  it('includes notes in meta when provided', () => {
    const onSubmit = vi.fn();
    renderForm({ onSubmit });
    fireEvent.change(screen.getByLabelText(/Title/),    { target: { value: 'Ferry flight' } });
    fireEvent.change(screen.getByLabelText(/Category/), { target: { value: 'aircraft-movement' } });
    fireEvent.change(screen.getByLabelText(/Notes/),    { target: { value: 'KPHX → KBOS repositioning' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit Request' }));

    const payload = onSubmit.mock.calls[0][0]!;
    expect(payload.meta.notes).toBe('KPHX → KBOS repositioning');
    expect(payload.meta.approvalStage.stage).toBe('requested');
  });

  it('omits notes from meta when the field is blank', () => {
    const onSubmit = vi.fn();
    renderForm({ onSubmit });
    fireEvent.change(screen.getByLabelText(/Title/), { target: { value: 'training' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit Request' }));
    const payload = onSubmit.mock.calls[0][0]!;
    expect(payload.meta).not.toHaveProperty('notes');
  });
});

/**
 * requirementTemplates wire dynamic role slots onto the form. When the
 * selected asset's `meta.assetTypeId` matches a template entry the form
 * must render an input per role, block submission until each is filled,
 * and ship the values inside `meta.requirements` keyed by role id.
 */
describe('AssetRequestForm — requirementTemplates', () => {
  const typedAssets = [
    { id: 'n100aa', label: 'N100AA', meta: { assetTypeId: 'aircraft' } },
    { id: 'truck1', label: 'Truck 1', meta: { assetTypeId: 'vehicle' } },
    { id: 'unknown', label: 'Untyped' },
  ];

  const requirementTemplates = {
    aircraft: {
      roles: [
        { id: 'pilot', label: 'Pilot' },
        { id: 'medic', label: 'Medic' },
      ],
      requiresApproval: true,
    },
    vehicle: {
      roles: [{ id: 'driver', label: 'Driver' }],
      requiresApproval: false,
    },
  };

  function renderWithTemplates(overrides: Record<string, unknown> = {}) {
    return render(
      <AssetRequestForm
        assets={typedAssets}
        categories={categories}
        requirementTemplates={requirementTemplates}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
        {...overrides}
      />,
    );
  }

  it('renders one slot input per role for the selected asset type', () => {
    renderWithTemplates({ initialAssetId: 'n100aa' });
    expect(screen.getByLabelText(/Pilot/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Medic/)).toBeInTheDocument();
    // Driver belongs to the vehicle template, not aircraft.
    expect(screen.queryByLabelText(/Driver/)).not.toBeInTheDocument();
  });

  it('shows the approval-required notice when the template asks for it', () => {
    renderWithTemplates({ initialAssetId: 'n100aa' });
    expect(screen.getByText(/needs approval before it’s confirmed/i)).toBeInTheDocument();
  });

  it('hides the approval notice when the template does not require it', () => {
    renderWithTemplates({ initialAssetId: 'truck1' });
    expect(screen.queryByText(/needs approval before it’s confirmed/i)).not.toBeInTheDocument();
  });

  it('blocks submission until every required role is filled', () => {
    const onSubmit = vi.fn();
    renderWithTemplates({ initialAssetId: 'n100aa', onSubmit });

    fireEvent.change(screen.getByLabelText(/Title/), { target: { value: 'EMS run' } });
    fireEvent.change(screen.getByLabelText(/Category/), { target: { value: 'training' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit Request' }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Pilot is required')).toBeInTheDocument();
    expect(screen.getByText('Medic is required')).toBeInTheDocument();
  });

  it('submits filled role values inside meta.requirements keyed by role id', () => {
    const onSubmit = vi.fn();
    renderWithTemplates({ initialAssetId: 'n100aa', onSubmit });

    fireEvent.change(screen.getByLabelText(/Title/),    { target: { value: 'EMS run' } });
    fireEvent.change(screen.getByLabelText(/Category/), { target: { value: 'training' } });
    fireEvent.change(screen.getByLabelText(/Pilot/),    { target: { value: 'Alex' } });
    fireEvent.change(screen.getByLabelText(/Medic/),    { target: { value: 'Priya' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit Request' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const payload = onSubmit.mock.calls[0][0]!;
    expect(payload.meta.requirements).toEqual({ pilot: 'Alex', medic: 'Priya' });
    // approvalStage is still attached on top of the new requirements field.
    expect(payload.meta.approvalStage.stage).toBe('requested');
  });

  it('renders no slots when the selected asset has no assetTypeId', () => {
    renderWithTemplates({ initialAssetId: 'unknown' });
    expect(screen.queryByLabelText(/Pilot/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Driver/)).not.toBeInTheDocument();
    expect(screen.queryByText(/needs approval/i)).not.toBeInTheDocument();
  });

  it('omits meta.requirements entirely when no template matches the asset', () => {
    const onSubmit = vi.fn();
    renderWithTemplates({ initialAssetId: 'unknown', onSubmit });

    fireEvent.change(screen.getByLabelText(/Title/), { target: { value: 'misc' } });
    fireEvent.change(screen.getByLabelText(/Category/), { target: { value: 'training' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit Request' }));

    const payload = onSubmit.mock.calls[0][0]!;
    expect(payload.meta).not.toHaveProperty('requirements');
  });
});
