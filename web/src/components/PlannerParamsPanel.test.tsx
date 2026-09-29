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

  it('shows the fixed-azimuth field only for the fixed vertical panel', () => {
    const params = { ...DEFAULT_PARAMS, power: { ...DEFAULT_PARAMS.power, panel: 'vertical' as const } };
    render(<PlannerParamsPanel params={params} onParams={vi.fn()} onPower={vi.fn()} busy={true} />);
    fireEvent.click(screen.getByRole('button', { name: /Planner settings/ }));
    expect(screen.getByLabelText('Panel faces azimuth (°)')).toBeTruthy();
    expect(screen.getByText(/computing…/)).toBeTruthy();
  });
});
