// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_PARAMS } from '@/lib/store/explore';
import { PlannerParamsPanel } from './PlannerParamsPanel';

describe('PlannerParamsPanel', () => {
  it('is collapsed by default and reports edits through the callbacks', () => {
    const onParams = vi.fn();
    const onPower = vi.fn();
    render(<PlannerParamsPanel params={DEFAULT_PARAMS} onParams={onParams} onPower={onPower} busy={false} />);
    const toggle = screen.getByRole('button', { name: /Planner settings/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByLabelText('Load (W)')).toBeNull();
    fireEvent.click(toggle);
    fireEvent.change(screen.getByLabelText('Load (W)'), { target: { value: '350' } });
    expect(onPower).toHaveBeenCalledWith({ loadW: 350 });
    fireEvent.change(screen.getByLabelText('Minimum Earth elevation (°)'), { target: { value: '5' } });
    expect(onParams).toHaveBeenCalledWith({ minEarthElDeg: 5 });
    fireEvent.click(screen.getByLabelText('Two-axis tracking'));
    expect(onPower).toHaveBeenCalledWith({ panel: 'full_tracking' });
    fireEvent.change(screen.getByLabelText('Mast height (m)'), { target: { value: '6' } });
    expect(onParams).toHaveBeenCalledWith({ mastM: 6 });
    fireEvent.change(screen.getByLabelText('Cell efficiency (%)'), { target: { value: '25' } });
    expect(onPower).toHaveBeenCalledWith({ efficiency: 0.25 });
  });

  it('ignores out-of-range or non-numeric input', () => {
    const onPower = vi.fn();
    render(<PlannerParamsPanel params={DEFAULT_PARAMS} onParams={vi.fn()} onPower={onPower} busy={false} />);
    fireEvent.click(screen.getByRole('button', { name: /Planner settings/ }));
    fireEvent.change(screen.getByLabelText('Battery (Wh)'), { target: { value: '-5' } });
    fireEvent.change(screen.getByLabelText('Battery (Wh)'), { target: { value: 'abc' } });
    fireEvent.change(screen.getByLabelText('Battery (Wh)'), { target: { value: '' } });
    expect(onPower).not.toHaveBeenCalled();
  });

  it('lets a value be typed through out-of-range intermediates and reverts an invalid value on blur', () => {
    const onPower = vi.fn();
    render(<PlannerParamsPanel params={DEFAULT_PARAMS} onParams={vi.fn()} onPower={onPower} busy={false} />);
    fireEvent.click(screen.getByRole('button', { name: /Planner settings/ }));
    const battery = screen.getByLabelText('Battery (Wh)') as HTMLInputElement;
    fireEvent.change(battery, { target: { value: '5' } });
    expect(battery.value).toBe('5');
    expect(onPower).not.toHaveBeenCalled();
    fireEvent.change(battery, { target: { value: '500' } });
    expect(battery.value).toBe('500');
    expect(onPower).toHaveBeenCalledWith({ batteryWh: 500 });
    fireEvent.change(battery, { target: { value: '7' } });
    expect(battery.value).toBe('7');
    fireEvent.blur(battery);
    expect(battery.value).toBe('2000'); // the prop did not change in this test: an invalid draft reverts to it
  });

  it('shows the fixed-azimuth field only for the fixed vertical panel', () => {
    const params = { ...DEFAULT_PARAMS, power: { ...DEFAULT_PARAMS.power, panel: 'vertical' as const } };
    render(<PlannerParamsPanel params={params} onParams={vi.fn()} onPower={vi.fn()} busy={true} />);
    fireEvent.click(screen.getByRole('button', { name: /Planner settings/ }));
    expect(screen.getByLabelText('Panel faces azimuth (°)')).toBeTruthy();
    expect(screen.getByText(/computing…/)).toBeTruthy();
  });
});
