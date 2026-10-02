// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_PARAMS } from '@/lib/store/explore';
import { LanderDialog } from './LanderDialog';

function open(params = DEFAULT_PARAMS) {
  const onPower = vi.fn();
  const onParams = vi.fn();
  const onClose = vi.fn();
  render(<LanderDialog params={params} onPower={onPower} onParams={onParams} busy={false} onClose={onClose} />);
  return { onPower, onParams, onClose };
}

describe('LanderDialog', () => {
  it('offers three landers named by their numbers, with the current one checked', () => {
    open();
    const dialog = screen.getByRole('dialog', { name: 'The lander' });
    const presets = within(dialog).getByRole('radiogroup', { name: 'Lander' });
    expect(within(presets).getAllByRole('radio').map((r) => (r as HTMLInputElement).checked)).toEqual([true, false, false, false]);
    expect(presets.textContent).toMatch(/4 m² panel, uses 200 W, 2 kWh battery.*10 hours in the dark/);
    expect(presets.textContent).toMatch(/20 m² panel, uses 500 W, 50 kWh battery.*4 days 4 hours in the dark/);
    expect(presets.textContent).toMatch(/Custom/);
  });

  it('applies a preset with the standard panel around it', () => {
    const { onPower } = open({ ...DEFAULT_PARAMS, power: { ...DEFAULT_PARAMS.power, panel: 'horizontal', efficiency: 0.2 } });
    fireEvent.click(screen.getByRole('radio', { name: /8 m² panel, uses 400 W, 20 kWh battery/ }));
    expect(onPower).toHaveBeenLastCalledWith({ areaM2: 8, loadW: 400, batteryWh: 20000, panel: 'vertical_tracking', panelAzimuthDeg: 0, efficiency: 0.3, initialSocFraction: 1 });
  });

  it('shows Custom as checked for any other lander and opens its fields', () => {
    const { onPower, onParams } = open({ ...DEFAULT_PARAMS, power: { ...DEFAULT_PARAMS.power, loadW: 250 } });
    expect((screen.getByRole('radio', { name: /Custom/ }) as HTMLInputElement).checked).toBe(true);
    fireEvent.change(screen.getByLabelText('Battery (Wh)'), { target: { value: '5000' } });
    expect(onPower).toHaveBeenLastCalledWith({ batteryWh: 5000 });
    fireEvent.change(screen.getByLabelText('Cell efficiency (%)'), { target: { value: '25' } });
    expect(onPower).toHaveBeenLastCalledWith({ efficiency: 0.25 });
    fireEvent.click(screen.getByRole('radio', { name: 'Flat on the deck' }));
    expect(onPower).toHaveBeenLastCalledWith({ panel: 'horizontal' });
    fireEvent.change(screen.getByLabelText('Mast height (m)'), { target: { value: '5' } });
    expect(onParams).toHaveBeenLastCalledWith({ mastM: 5 });
    fireEvent.change(screen.getByLabelText('Earth at least this high above the hills (°)'), { target: { value: '2' } });
    expect(onParams).toHaveBeenLastCalledWith({ minEarthElDeg: 2 });
  });

  it('keeps the custom fields closed for a preset until Custom is chosen', () => {
    open();
    expect(screen.queryByLabelText('Battery (Wh)')).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: /Custom/ }));
    expect(screen.getByLabelText('Battery (Wh)')).toBeTruthy();
    expect(screen.queryByLabelText('Panel faces (° from north)')).toBeNull(); // only for the upright fixed panel
  });

  it('closes from its button and says in plain words how the power is worked out', () => {
    const { onClose } = open();
    expect(screen.getByRole('dialog').textContent).toMatch(/The battery fills when the panel makes more than the lander uses/);
    expect(screen.getByRole('dialog').textContent).not.toMatch(/skyline|LOLA|DE440/);
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('says when the view from a new mast height is being worked out', () => {
    render(<LanderDialog params={DEFAULT_PARAMS} onPower={vi.fn()} onParams={vi.fn()} busy onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('radio', { name: /Custom/ }));
    expect(screen.getByRole('dialog').textContent).toMatch(/the view from the new height is being worked out/);
  });
});
