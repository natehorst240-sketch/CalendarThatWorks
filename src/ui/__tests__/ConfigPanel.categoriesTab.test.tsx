// @vitest-environment happy-dom
/**
 * CategoriesTab — Assets Tab Phase 1 Sprint 4 PR A.
 *
 * Verifies the owner-editable CategoriesConfig surface. The tab mutates
 * config.categoriesConfig via onUpdate; WorksCalendar merges it with prop-
 * level overrides before handing to AssetsView.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';

import { CategoriesTab } from '../ConfigPanel';
import { DEFAULT_CATEGORIES } from '../../types/assets.ts';

function renderTab({ initialConfig = {}, onUpdate }: any = {}) {
  let currentConfig = { ...initialConfig };
  const update = onUpdate ?? vi.fn(updater => {
    currentConfig = typeof updater === 'function' ? updater(currentConfig) : { ...currentConfig, ...updater };
  });
  const utils = render(<CategoriesTab config={currentConfig} onUpdate={update} />);
  return { ...utils, update, getConfig: () => currentConfig };
}

describe('CategoriesTab — defaults', () => {
  it('renders DEFAULT_CATEGORIES when config.categoriesConfig is unset', () => {
    renderTab();
    for (const cat of DEFAULT_CATEGORIES) {
      expect(screen.getByLabelText(`Label for ${cat.id}`)).toHaveValue(cat.label);
      expect(screen.getByLabelText(`Id for ${cat.label}`)).toHaveValue(cat.id);
    }
  });

  it('defaults pillStyle to "hue"', () => {
    renderTab();
    expect(screen.getByLabelText('Pill style')).toHaveValue('hue');
  });

  it('defaults defaultCategoryId to the first category id', () => {
    renderTab();
    expect(screen.getByLabelText('Default category')).toHaveValue(DEFAULT_CATEGORIES[0].id);
  });
});

describe('CategoriesTab — mutations', () => {
  it('editing a category label writes config.categoriesConfig.categories', () => {
    const { getConfig } = renderTab();
    const labelInput = screen.getByLabelText('Label for training');
    fireEvent.change(labelInput, { target: { value: 'Pilot Training' } });

    const cats = getConfig().categoriesConfig.categories;
    const training = cats.find(c => c.id === 'training');
    expect(training.label).toBe('Pilot Training');
  });

  it('editing a color writes the new hex value', () => {
    const { getConfig } = renderTab();
    const colorInput = screen.getByLabelText('Color for Training');
    fireEvent.change(colorInput, { target: { value: '#ff0000' } });

    const cats = getConfig().categoriesConfig.categories;
    expect(cats.find(c => c.id === 'training').color).toBe('#ff0000');
  });

  it('toggling disabled flag persists', () => {
    const { getConfig } = renderTab();
    const checkbox = screen.getAllByLabelText(/Disabled/i)[0];
    fireEvent.click(checkbox);
    expect(getConfig().categoriesConfig.categories[0].disabled).toBe(true);
  });

  it('Add category appends a new row', () => {
    const { getConfig } = renderTab();
    fireEvent.click(screen.getByRole('button', { name: /Add category/i }));
    const cats = getConfig().categoriesConfig.categories;
    expect(cats).toHaveLength(DEFAULT_CATEGORIES.length + 1);
    expect(cats[cats.length - 1].id).toMatch(/^category-/);
  });

  it('Remove button drops the category', () => {
    const { getConfig } = renderTab();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Training' }));
    const cats = getConfig().categoriesConfig.categories;
    expect(cats.find(c => c.id === 'training')).toBeUndefined();
    expect(cats).toHaveLength(DEFAULT_CATEGORIES.length - 1);
  });

  it('changing pillStyle persists', () => {
    const { getConfig } = renderTab();
    fireEvent.change(screen.getByLabelText('Pill style'), { target: { value: 'stripe' } });
    expect(getConfig().categoriesConfig.pillStyle).toBe('stripe');
  });

  it('changing default category persists', () => {
    const { getConfig } = renderTab();
    fireEvent.change(screen.getByLabelText('Default category'), { target: { value: 'pr' } });
    expect(getConfig().categoriesConfig.defaultCategoryId).toBe('pr');
  });

  it('Reset restores the shipped defaults', () => {
    const { getConfig } = renderTab({
      initialConfig: {
        categoriesConfig: {
          categories: [{ id: 'custom', label: 'Custom', color: '#123456' }],
          pillStyle: 'border',
        },
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    const cats = getConfig().categoriesConfig.categories;
    expect(cats).toHaveLength(DEFAULT_CATEGORIES.length);
    expect(cats[0].id).toBe(DEFAULT_CATEGORIES[0].id);
    expect(getConfig().categoriesConfig.pillStyle).toBe('hue');
  });
});

describe('CategoriesTab — preserves existing config', () => {
  it('reads an existing custom categoriesConfig without mutating on render', () => {
    const existing = {
      categories: [
        { id: 'alpha', label: 'Alpha', color: '#aabbcc' },
        { id: 'beta',  label: 'Beta',  color: '#112233' },
      ],
      pillStyle: 'stripe',
      defaultCategoryId: 'beta',
    };
    const { update } = renderTab({ initialConfig: { categoriesConfig: existing } });
    expect(screen.getByLabelText('Label for alpha')).toHaveValue('Alpha');
    expect(screen.getByLabelText('Pill style')).toHaveValue('stripe');
    expect(screen.getByLabelText('Default category')).toHaveValue('beta');
    expect(update).not.toHaveBeenCalled();
  });
});
