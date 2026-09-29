// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SiteSelect } from './SiteSelect';

const sites = [
  { id: 'a', name: 'Site A', lat: -89, lon: 0, category: 'classic', polar: true, source: '' },
  { id: 'b', name: 'Site B', lat: -85, lon: 10, category: 'clps_landed', polar: true, source: '' },
];

describe('SiteSelect', () => {
  it('selects featured sites and submits a custom site', () => {
    const onSelect = vi.fn();
    const onCustom = vi.fn();
    render(<SiteSelect sites={sites} value="a" onSelect={onSelect} onCustom={onCustom} customError={null} busy={false} />);
    fireEvent.change(screen.getByLabelText('Site'), { target: { value: 'b' } });
    expect(onSelect).toHaveBeenCalledWith('b');
    fireEvent.click(screen.getByRole('button', { name: 'Custom site' }));
    fireEvent.change(screen.getByLabelText('Latitude'), { target: { value: '-88.5' } });
    fireEvent.change(screen.getByLabelText('Longitude'), { target: { value: '200' } });
    fireEvent.click(screen.getByRole('button', { name: 'Compute skyline' }));
    expect(onCustom).toHaveBeenCalledWith(-88.5, -160);
  });
  it('custom site form shows the coverage error', () => {
    render(
      <SiteSelect
        sites={sites}
        value="a"
        onSelect={() => {}}
        onCustom={() => {}}
        customError="no DEM coverage north of 60S (lat 18.56)"
        busy={false}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Custom site' }));
    expect(screen.getByRole('alert').textContent).toMatch(/no DEM coverage/);
  });
});
