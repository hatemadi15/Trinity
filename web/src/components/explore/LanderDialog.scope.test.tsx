// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ENERGY_ONLY, POWER_ASSUMPTIONS } from '@/components/PowerScope';
import { DEFAULT_PARAMS } from '@/lib/store/explore';
import { LanderDialog } from './LanderDialog';

describe('LanderDialog and the power model’s scope', () => {
  it('states what the power figures assume and that they count energy only, for a ready-made lander and for custom numbers', () => {
    render(<LanderDialog params={DEFAULT_PARAMS} onPower={vi.fn()} onParams={vi.fn()} busy={false} onClose={vi.fn()} />);
    const dialog = screen.getByRole('dialog', { name: 'The lander' });
    for (const line of POWER_ASSUMPTIONS) expect(within(dialog).getByText(line)).toBeTruthy();
    expect(within(dialog).getByText(ENERGY_ONLY)).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: /Custom/ }));
    expect(within(dialog).getByText(ENERGY_ONLY)).toBeTruthy();
  });
});
