// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WindowControls } from './WindowControls';

describe('WindowControls', () => {
  it('reports window length and start date changes', () => {
    const onWindow = vi.fn();
    render(<WindowControls startUtc="2027-01-01T00:00:00" days={30} onWindow={onWindow} />);
    fireEvent.click(screen.getByRole('radio', { name: '14 days' }));
    expect(onWindow).toHaveBeenCalledWith('2027-01-01T00:00:00', 14);
    fireEvent.change(screen.getByLabelText('Start date (UTC)'), { target: { value: '2027-03-05' } });
    expect(onWindow).toHaveBeenCalledWith('2027-03-05T00:00:00', 30);
  });
  it('gives the window radios a visible focus style on their label', () => {
    render(<WindowControls startUtc="2027-01-01T00:00:00" days={30} onWindow={() => {}} />);
    const radio = screen.getByRole('radio', { name: '14 days' });
    expect(radio.closest('label')?.className).toMatch(/focus-visible/);
  });
});
