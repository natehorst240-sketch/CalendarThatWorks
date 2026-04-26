// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom';
import { MaintenanceBadge } from '../MaintenanceBadge';
import { AssetMaintenanceBadges } from '../AssetMaintenanceBadges';
import type { MaintenanceRule } from '../../types/maintenance';

const oilChange: MaintenanceRule = {
  id: 'oil-10k',
  assetType: 'truck',
  title: 'Oil change',
  interval:      { miles: 10_000 },
  warningWindow: { miles: 2_000  },
};

const dot: MaintenanceRule = {
  id: 'dot-annual',
  assetType: 'truck',
  title: 'DOT',
  interval:      { days: 365 },
  warningWindow: { days: 30  },
};

describe('MaintenanceBadge', () => {
  it('renders rule title and a positive remaining for ok status', () => {
    render(<MaintenanceBadge rule={oilChange} due={{ status: 'ok', miles: { remaining: 5_500 } }} />);
    const el = screen.getByRole('status');
    expect(el).toHaveAttribute('data-status', 'ok');
    expect(el.getAttribute('aria-label')).toMatch(/Oil change/);
    expect(el.textContent).toContain('Oil change');
    expect(el.textContent).toContain('5.5k mi');
  });

  it('renders "X late" when overdue', () => {
    render(<MaintenanceBadge rule={oilChange} due={{ status: 'overdue', miles: { remaining: -1_500 } }} />);
    const el = screen.getByRole('status');
    expect(el).toHaveAttribute('data-status', 'overdue');
    expect(el.textContent).toContain('1.5k mi late');
    expect(el.getAttribute('aria-label')).toMatch(/overdue/);
  });

  it('falls back to no detail when DueResult has no dimensions', () => {
    render(<MaintenanceBadge rule={oilChange} due={{ status: 'unknown' }} />);
    const el = screen.getByRole('status');
    expect(el).toHaveAttribute('data-status', 'unknown');
    expect(el.textContent).toBe('Oil change');
  });

  it('uses the worst dimension when multiple are present', () => {
    render(
      <MaintenanceBadge
        rule={dot}
        due={{ status: 'overdue', miles: { remaining: 5_000 }, days: { remaining: -10 } }}
      />,
    );
    expect(screen.getByRole('status').textContent).toContain('10 d late');
  });

  it('honors a custom label override', () => {
    render(<MaintenanceBadge rule={oilChange} due={{ status: 'ok' }} label="custom" />);
    expect(screen.getByRole('status').textContent).toContain('custom');
  });
});

describe('AssetMaintenanceBadges', () => {
  it('renders nothing when there are no rules', () => {
    const { container } = render(<AssetMaintenanceBadges rules={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('computes a chip per rule using current meter and last service', () => {
    render(
      <AssetMaintenanceBadges
        rules={[oilChange]}
        currentMeter={{ type: 'miles', value: 109_000 }}
        lastServiceByRule={{ 'oil-10k': { meterAtService: 100_000 } }}
      />,
    );
    const el = screen.getByRole('status');
    expect(el).toHaveAttribute('data-status', 'due-soon');
  });

  it('sorts overdue first, then due-soon, then ok', () => {
    const r1: MaintenanceRule = { id: 'r1', assetType: 't', title: 'A-ok',     interval: { miles: 10_000 }, warningWindow: { miles: 1_000 } };
    const r2: MaintenanceRule = { id: 'r2', assetType: 't', title: 'B-soon',   interval: { miles: 10_000 }, warningWindow: { miles: 5_000 } };
    const r3: MaintenanceRule = { id: 'r3', assetType: 't', title: 'C-overdue',interval: { miles: 10_000 }, warningWindow: { miles: 1_000 } };
    render(
      <AssetMaintenanceBadges
        rules={[r1, r2, r3]}
        currentMeter={{ type: 'miles', value: 100_500 }}
        lastServiceByRule={{
          r1: { meterAtService: 95_000 },  // 4500 remaining → ok
          r2: { meterAtService: 95_000 },  // 4500 remaining → due-soon (window 5000)
          r3: { meterAtService: 90_000 },  // -500 remaining → overdue
        }}
      />,
    );
    const statuses = screen.getAllByRole('status').map(el => el.getAttribute('data-status'));
    expect(statuses).toEqual(['overdue', 'due-soon', 'ok']);
  });

  it('truncates with a "+N" overflow chip when max is set', () => {
    const rules: MaintenanceRule[] = Array.from({ length: 5 }, (_, i) => ({
      id: `r${i}`, assetType: 't', title: `R${i}`, interval: { miles: 10_000 },
    }));
    render(<AssetMaintenanceBadges rules={rules} max={2} />);
    const statuses = screen.getAllByRole('status');
    expect(statuses).toHaveLength(2);
    expect(screen.getByLabelText(/3 more/)).toBeInTheDocument();
  });

  it('hides healthy chips when hideHealthy is true', () => {
    const ok:  MaintenanceRule = { id: 'ok',  assetType: 't', title: 'OK',  interval: { miles: 10_000 } };
    const bad: MaintenanceRule = { id: 'bad', assetType: 't', title: 'BAD', interval: { miles: 10_000 } };
    render(
      <AssetMaintenanceBadges
        rules={[ok, bad]}
        currentMeter={{ type: 'miles', value: 100_500 }}
        lastServiceByRule={{
          ok:  { meterAtService: 95_000 },  // 4500 remaining → ok
          bad: { meterAtService: 90_000 },  // -500 remaining → overdue
        }}
        hideHealthy
      />,
    );
    const statuses = screen.getAllByRole('status');
    expect(statuses).toHaveLength(1);
    expect(statuses[0]!).toHaveAttribute('data-status', 'overdue');
  });
});
