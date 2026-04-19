// @vitest-environment happy-dom
/**
 * Unit tests for the three extracted EventForm section components:
 *   RecurrenceSection, CategorySection, CustomFieldsSection
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';

import { RecurrenceSection } from '../EventFormSections/RecurrenceSection';
import { CategorySection } from '../EventFormSections/CategorySection';
import { CustomFieldsSection } from '../EventFormSections/CustomFieldsSection';

/* ═══════════════════════════════════════════════════════════════════════════
   RecurrenceSection
═══════════════════════════════════════════════════════════════════════════ */

describe('RecurrenceSection', () => {
  function renderRecurrence(props: any = {}) {
    return render(
      <RecurrenceSection
        preset={props.preset ?? 'none'}
        customRrule={props.customRrule ?? ''}
        onPresetChange={props.onPresetChange ?? vi.fn()}
        onCustomRruleChange={props.onCustomRruleChange ?? vi.fn()}
      />,
    );
  }

  it('renders the preset select', () => {
    renderRecurrence();
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('shows all preset options', () => {
    renderRecurrence();
    expect(screen.getByRole('option', { name: 'Does not repeat' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Daily' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Custom RRULE' })).toBeInTheDocument();
  });

  it('does not show custom RRULE input when preset is not "custom"', () => {
    renderRecurrence({ preset: 'daily' });
    expect(screen.queryByPlaceholderText(/FREQ=WEEKLY/)).not.toBeInTheDocument();
  });

  it('shows custom RRULE input when preset is "custom"', () => {
    renderRecurrence({ preset: 'custom', customRrule: 'FREQ=HOURLY' });
    expect(screen.getByDisplayValue('FREQ=HOURLY')).toBeInTheDocument();
  });

  it('calls onPresetChange when preset changes', () => {
    const onPresetChange = vi.fn();
    const onCustomRruleChange = vi.fn();
    renderRecurrence({ onPresetChange, onCustomRruleChange });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'daily' } });
    expect(onPresetChange).toHaveBeenCalledWith('daily');
  });

  it('clears customRrule when switching away from "custom"', () => {
    const onCustomRruleChange = vi.fn();
    renderRecurrence({ preset: 'custom', onCustomRruleChange });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'daily' } });
    expect(onCustomRruleChange).toHaveBeenCalledWith('');
  });

  it('does NOT clear customRrule when switching to "custom"', () => {
    const onCustomRruleChange = vi.fn();
    renderRecurrence({ preset: 'none', customRrule: 'FREQ=HOURLY', onCustomRruleChange });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'custom' } });
    expect(onCustomRruleChange).not.toHaveBeenCalled();
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   CategorySection
═══════════════════════════════════════════════════════════════════════════ */

describe('CategorySection', () => {
  function renderCategory(props: any = {}) {
    return render(
      <CategorySection
        value={props.value ?? ''}
        allCats={props.allCats ?? ['Ops', 'On-call']}
        onAddCategory={props.onAddCategory}
        onChange={props.onChange ?? vi.fn()}
      />,
    );
  }

  it('renders the category select with all options', () => {
    renderCategory();
    expect(screen.getByRole('option', { name: 'Ops' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'On-call' })).toBeInTheDocument();
  });

  it('calls onChange when selection changes', () => {
    const onChange = vi.fn();
    renderCategory({ onChange });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Ops' } });
    expect(onChange).toHaveBeenCalledWith('Ops');
  });

  it('hides the + button when onAddCategory is undefined', () => {
    renderCategory({ onAddCategory: undefined });
    expect(screen.queryByRole('button', { name: 'Add category' })).not.toBeInTheDocument();
  });

  it('shows the + button when onAddCategory is provided', () => {
    renderCategory({ onAddCategory: vi.fn() });
    expect(screen.getByRole('button', { name: 'Add category' })).toBeInTheDocument();
  });

  it('opens the add-category input on + button click', () => {
    renderCategory({ onAddCategory: vi.fn() });
    fireEvent.click(screen.getByRole('button', { name: 'Add category' }));
    expect(screen.getByPlaceholderText('New category name')).toBeInTheDocument();
  });

  it('calls onAddCategory and closes on Add button click', () => {
    const onAddCategory = vi.fn();
    renderCategory({ onAddCategory });
    fireEvent.click(screen.getByRole('button', { name: 'Add category' }));
    const input = screen.getByPlaceholderText('New category name');
    fireEvent.change(input, { target: { value: 'Maintenance' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(onAddCategory).toHaveBeenCalledWith('Maintenance');
    expect(screen.queryByPlaceholderText('New category name')).not.toBeInTheDocument();
  });

  it('closes the add-category input on Escape', () => {
    renderCategory({ onAddCategory: vi.fn() });
    fireEvent.click(screen.getByRole('button', { name: 'Add category' }));
    fireEvent.keyDown(screen.getByPlaceholderText('New category name'), { key: 'Escape' });
    expect(screen.queryByPlaceholderText('New category name')).not.toBeInTheDocument();
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   CustomFieldsSection
═══════════════════════════════════════════════════════════════════════════ */

describe('CustomFieldsSection', () => {
  const BASE_PROPS = {
    category: 'Ops',
    metaValues: {},
    errors: {},
    onMetaChange: vi.fn(),
  };

  it('renders nothing when there are no custom fields', () => {
    const { container } = render(<CustomFieldsSection {...BASE_PROPS} customFields={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders a text input for a text field', () => {
    render(
      <CustomFieldsSection
        {...BASE_PROPS}
        customFields={[{ name: 'tailNo', type: 'text', required: false }]}
      />,
    );
    expect(screen.getByLabelText('tailNo')).toBeInTheDocument();
  });

  it('renders a number input for a number field', () => {
    render(
      <CustomFieldsSection
        {...BASE_PROPS}
        customFields={[{ name: 'seats', type: 'number', required: false }]}
      />,
    );
    expect(screen.getByRole('spinbutton')).toBeInTheDocument();
  });

  it('shows required indicator for required fields', () => {
    render(
      <CustomFieldsSection
        {...BASE_PROPS}
        customFields={[{ name: 'tailNo', type: 'text', required: true }]}
      />,
    );
    expect(screen.getByText('*')).toBeInTheDocument();
  });

  it('displays an error message when errors has a matching key', () => {
    render(
      <CustomFieldsSection
        {...BASE_PROPS}
        customFields={[{ name: 'tailNo', type: 'text', required: true }]}
        errors={{ meta_tailNo: 'tailNo is required' }}
      />,
    );
    expect(screen.getByText('tailNo is required')).toBeInTheDocument();
  });

  it('calls onMetaChange with the field name and new value', () => {
    const onMetaChange = vi.fn();
    render(
      <CustomFieldsSection
        {...BASE_PROPS}
        onMetaChange={onMetaChange}
        customFields={[{ name: 'tailNo', type: 'text', required: false }]}
      />,
    );
    fireEvent.change(screen.getByLabelText('tailNo'), { target: { value: 'N123AB' } });
    expect(onMetaChange).toHaveBeenCalledWith('tailNo', 'N123AB');
  });

  it('renders a select field with options', () => {
    render(
      <CustomFieldsSection
        {...BASE_PROPS}
        customFields={[{ name: 'status', type: 'select', options: 'ok,warn,fail', required: false }]}
      />,
    );
    expect(screen.getByRole('option', { name: 'ok' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'warn' })).toBeInTheDocument();
  });

  it('renders a textarea for a textarea field', () => {
    render(
      <CustomFieldsSection
        {...BASE_PROPS}
        customFields={[{ name: 'notes', type: 'textarea', required: false }]}
      />,
    );
    expect(screen.getByRole('textbox', { name: 'notes' })).toBeInTheDocument();
  });
});
