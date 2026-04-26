// @vitest-environment happy-dom
/**
 * Step 7 of SetupLanding — "Assets & Requirements".
 *
 * Covers the three things the step has to do that nothing else in setup
 * could do before:
 *   1. let owners declare what kinds of things they book (asset types),
 *   2. seed concrete assets under each type, and
 *   3. capture per-type requirement templates (required roles + approval).
 *
 * The result payload is what WorksCalendar persists into config, so these
 * assertions also pin the wizard → config contract.
 */
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';

import SetupLanding from '../SetupLanding';
import type { SetupLandingResult } from '../SetupLanding';

/** Click the welcome screen "Start" button and step forward to step 7. */
function advanceToAssetsStep() {
  // Welcome → step 1
  fireEvent.click(screen.getByRole('button', { name: /Start setup guide/i }));
  // Step 1 → 7 via Next. Anchored regex avoids matching view-card descriptions
  // that legitimately contain the word "next" ("…what is coming up next").
  for (let i = 0; i < 6; i++) {
    fireEvent.click(screen.getByRole('button', { name: /^Next$/ }));
  }
}

describe('SetupLanding — Assets & Requirements step', () => {
  it('renders the four default asset types with a per-type card each', () => {
    render(<SetupLanding onFinish={vi.fn()} onSkip={vi.fn()} />);
    advanceToAssetsStep();

    // Default labels live in editable inputs, so query by value rather than text.
    expect(screen.getByDisplayValue('Aircraft')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Vehicle')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Equipment')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Room')).toBeInTheDocument();
  });

  it('writes assetTypes, assetSeeds, and requirementTemplates into the finish payload', () => {
    const onFinish = vi.fn<(r: SetupLandingResult) => void>();
    const { container } = render(<SetupLanding onFinish={onFinish} onSkip={vi.fn()} />);
    advanceToAssetsStep();

    // Locate the Aircraft type card by walking up from its name input. Every
    // type renders the same suggested-role chips, so we must scope the chip
    // queries to the matching card or we'll pick the wrong card's chip.
    const aircraftNameInput = screen.getByDisplayValue('Aircraft') as HTMLInputElement;
    const aircraftCard = aircraftNameInput.closest(`[class*="assetTypeCard"]`) as HTMLElement;
    expect(aircraftCard).toBeTruthy();
    void container;

    // Add an aircraft asset under that card.
    fireEvent.click(within(aircraftCard).getByRole('button', { name: /Add aircraft/i }));
    fireEvent.change(within(aircraftCard).getByLabelText(/Name for asset/i), {
      target: { value: 'N100AA' },
    });

    // Add Pilot + Medic via the suggested role chips inside the card.
    fireEvent.click(within(aircraftCard).getByRole('button', { name: /Pilot/ }));
    fireEvent.click(within(aircraftCard).getByRole('button', { name: /Medic/ }));

    // Toggle "Requires approval" on for the Aircraft card.
    fireEvent.click(within(aircraftCard).getByRole('checkbox', {
      name: /Requires approval before it’s confirmed/i,
    }));

    // Finish.
    fireEvent.click(screen.getByRole('button', { name: /I’m done/i }));

    expect(onFinish).toHaveBeenCalledTimes(1);
    const result = onFinish.mock.calls[0]![0];

    // Types: 4 defaults preserved.
    expect(result.assetTypes.map(t => t.id)).toEqual([
      'aircraft', 'vehicle', 'equipment', 'room',
    ]);

    // Seeds: only the one we added, scoped to the aircraft type id.
    expect(result.assetSeeds).toHaveLength(1);
    expect(result.assetSeeds[0]).toMatchObject({
      label: 'N100AA',
      assetTypeId: 'aircraft',
    });

    // Templates: aircraft has Pilot + Medic and requiresApproval=true.
    // Other types contributed nothing → no entry emitted.
    expect(Object.keys(result.requirementTemplates)).toEqual(['aircraft']);
    const tpl = result.requirementTemplates['aircraft']!;
    expect(tpl.roles.map(r => r.id)).toEqual(['pilot', 'medic']);
    expect(tpl.requiresApproval).toBe(true);
  });

  it('drops empty seeds and types so the host never sees half-filled rows', () => {
    const onFinish = vi.fn<(r: SetupLandingResult) => void>();
    render(<SetupLanding onFinish={onFinish} onSkip={vi.fn()} />);
    advanceToAssetsStep();

    // Add an asset row but never type a name into it.
    fireEvent.click(screen.getByRole('button', { name: /Add aircraft/i }));

    // Blank out the "Vehicle" type label — the wizard should drop it.
    fireEvent.change(screen.getByDisplayValue('Vehicle'), { target: { value: '' } });

    fireEvent.click(screen.getByRole('button', { name: /I’m done/i }));

    const result = onFinish.mock.calls[0]![0];
    expect(result.assetSeeds).toEqual([]);
    expect(result.assetTypes.map(t => t.id)).not.toContain('vehicle');
    // The blanked type also stays out of templates — i.e. no entry under
    // any falsy / blank key.
    expect(Object.keys(result.requirementTemplates).every(k => k.length > 0)).toBe(true);
  });

  it('hydrates types and templates from existing config so re-running setup is non-destructive', () => {
    const onFinish = vi.fn<(r: SetupLandingResult) => void>();
    const existingTypes = [
      { id: 'aircraft', label: 'Aircraft' },
      { id: 'drone',    label: 'Drone' },
    ];
    const existingTemplates = {
      aircraft: {
        roles: [{ id: 'pilot', label: 'Pilot' }, { id: 'medic', label: 'Medic' }],
        requiresApproval: true,
      },
      drone: {
        roles: [{ id: 'operator', label: 'Operator' }],
        requiresApproval: false,
      },
    };

    render(
      <SetupLanding
        onFinish={onFinish}
        onSkip={vi.fn()}
        initialAssetTypes={existingTypes}
        initialRequirementTemplates={existingTemplates}
      />,
    );
    advanceToAssetsStep();

    // The hydrated types render as editable inputs — the wizard does not
    // fall back to its hardcoded defaults when initial config is supplied.
    expect(screen.getByDisplayValue('Aircraft')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Drone')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('Vehicle')).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue('Equipment')).not.toBeInTheDocument();

    // Existing role pills appear inside the matching card. Querying scoped
    // to each card, since "Pilot" / "Operator" also exist as suggestion
    // chips on other cards.
    const aircraftCard = (screen.getByDisplayValue('Aircraft') as HTMLInputElement)
      .closest(`[class*="assetTypeCard"]`) as HTMLElement;
    const droneCard = (screen.getByDisplayValue('Drone') as HTMLInputElement)
      .closest(`[class*="assetTypeCard"]`) as HTMLElement;

    // Selected role pills carry the rolePillSelected class; suggestion
    // chips carry rolePillSuggest. Match the persisted-pill class so we
    // don't accept the "+ Pilot" add-button as proof of hydration.
    const aircraftSelectedPills = aircraftCard.querySelectorAll(`[class*="rolePillSelected"]`);
    const droneSelectedPills    = droneCard.querySelectorAll(`[class*="rolePillSelected"]`);
    expect(Array.from(aircraftSelectedPills).map(n => n.textContent)).toEqual(
      expect.arrayContaining([expect.stringContaining('Pilot'), expect.stringContaining('Medic')]),
    );
    expect(Array.from(droneSelectedPills).map(n => n.textContent)).toEqual(
      expect.arrayContaining([expect.stringContaining('Operator')]),
    );

    // The aircraft "Requires approval" checkbox is pre-checked from config.
    const aircraftApproval = within(aircraftCard).getByRole('checkbox', {
      name: /Requires approval before it’s confirmed/i,
    }) as HTMLInputElement;
    expect(aircraftApproval.checked).toBe(true);

    // Finishing without touching anything must echo the hydrated state back,
    // so handleSetupFinish persists exactly what was already in config.
    fireEvent.click(screen.getByRole('button', { name: /I’m done/i }));
    const result = onFinish.mock.calls[0]![0];
    expect(result.assetTypes).toEqual(existingTypes);
    expect(result.requirementTemplates).toEqual(existingTemplates);
  });

  it('lets owners add a custom asset type from the input row', () => {
    const onFinish = vi.fn<(r: SetupLandingResult) => void>();
    render(<SetupLanding onFinish={onFinish} onSkip={vi.fn()} />);
    advanceToAssetsStep();

    const newTypeInput = screen.getByLabelText(/New asset type name/i);
    fireEvent.change(newTypeInput, { target: { value: 'Drone' } });
    fireEvent.click(screen.getByRole('button', { name: /Add type/i }));

    // The new card renders with an editable name input pre-filled "Drone".
    expect(screen.getByDisplayValue('Drone')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /I’m done/i }));
    const result = onFinish.mock.calls[0]![0];
    expect(result.assetTypes.map(t => t.id)).toContain('drone');
  });
});
