// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_PARAMS } from '@/lib/store/explore';
import { LanderDialog } from './LanderDialog';

/** The words as a reader meets them: the no-break space that keeps a number with its sign reads as a plain one. */
const asRead = (text: string) => text.replace(/\u00a0/g, ' ');

function open(params = DEFAULT_PARAMS) {
  const onPower = vi.fn();
  const onParams = vi.fn();
  const onClose = vi.fn();
  render(<LanderDialog params={params} onPower={onPower} onParams={onParams} busy={false} onClose={onClose} />);
  return { onPower, onParams, onClose };
}

describe('LanderDialog', () => {
  it('offers three landers named small, medium and large with their numbers, and says their panels are 30 % efficient', () => {
    open();
    const dialog = screen.getByRole('dialog', { name: 'The lander' });
    const presets = within(dialog).getByRole('radiogroup', { name: 'Lander' });
    expect(within(presets).getAllByRole('radio').map((r) => (r as HTMLInputElement).checked)).toEqual([true, false, false, false]);
    expect(presets.textContent).toMatch(/Small lander: 4 m² panel, uses 200 W, 2 kWh battery.*10 hours at night/);
    expect(presets.textContent).toMatch(/Medium lander: 8 m² panel, uses 400 W, 20 kWh battery/);
    expect(presets.textContent).toMatch(/Large lander: 20 m² panel, uses 500 W, 50 kWh battery.*4 days 4 hours at night/);
    expect(presets.textContent).toMatch(/Custom/);
    // The three share one panel, so it is said once, under the heading, with the number kept with its sign.
    expect(asRead(dialog.textContent!)).toContain('Pick one, or set your own numbers. All three ready-made landers use a 30 % panel.');
    expect(dialog.textContent).toContain('30\u00a0% panel');
  });

  it('applies a preset with the standard panel around it', () => {
    const { onPower } = open({ ...DEFAULT_PARAMS, power: { ...DEFAULT_PARAMS.power, panel: 'horizontal', efficiency: 0.2 } });
    fireEvent.click(screen.getByRole('radio', { name: /Medium lander: 8 m² panel, uses 400 W, 20 kWh battery/ }));
    expect(onPower).toHaveBeenLastCalledWith({ areaM2: 8, loadW: 400, batteryWh: 20000, panel: 'vertical_tracking', panelAzimuthDeg: 0, efficiency: 0.3, initialSocFraction: 1 });
  });

  it('shows Custom as checked for any other lander and opens its fields', () => {
    const { onPower, onParams } = open({ ...DEFAULT_PARAMS, power: { ...DEFAULT_PARAMS.power, loadW: 250 } });
    expect((screen.getByRole('radio', { name: /Custom/ }) as HTMLInputElement).checked).toBe(true);
    fireEvent.change(screen.getByLabelText('Battery (Wh)'), { target: { value: '5000' } });
    expect(onPower).toHaveBeenLastCalledWith({ batteryWh: 5000 });
    fireEvent.change(screen.getByLabelText('Panel efficiency (%)'), { target: { value: '25' } });
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

  it('closes from the Modal’s Close alone, with no Done button, and says in plain words how the power is worked out', () => {
    const { onClose } = open();
    expect(screen.getByRole('dialog').textContent).toMatch(/The battery fills when the panel makes more than the lander uses/);
    expect(screen.getByRole('dialog').textContent).not.toMatch(/skyline|LOLA|DE440/);
    // Close and Done were two buttons for one thing; the Modal's own Close stays, beside Escape and the backdrop.
    expect(screen.queryByRole('button', { name: 'Done' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('says when the view from a new mast height is being worked out', () => {
    render(<LanderDialog params={DEFAULT_PARAMS} onPower={vi.fn()} onParams={vi.fn()} busy onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('radio', { name: /Custom/ }));
    expect(screen.getByRole('dialog').textContent).toMatch(/the view from the new height is being worked out/);
  });
});
