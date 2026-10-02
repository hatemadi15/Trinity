// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PeriodControls } from './PeriodControls';

describe('PeriodControls', () => {
  it('shows the start date and the three lengths, with the chosen one checked', () => {
    render(<PeriodControls startUtc="2027-01-20T10:00:00" days={30} onChange={() => {}} />);
    expect((screen.getByLabelText('From') as HTMLInputElement).value).toBe('2027-01-20');
    // The date also in words, as the rest of the page writes it: a date box shows the browser's own order of day and month.
    expect(screen.getByText('20 January 2027')).toBeTruthy();
    const group = screen.getByRole('radiogroup', { name: 'For' });
    expect(group.textContent).toBe('14 days30 days90 days');
    expect((screen.getByRole('radio', { name: '30 days' }) as HTMLInputElement).checked).toBe(true);
  });

  it('reports a new date at midnight UTC and a new length with the same start', () => {
    const onChange = vi.fn();
    render(<PeriodControls startUtc="2027-01-20T10:00:00" days={30} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2027-03-05' } });
    expect(onChange).toHaveBeenLastCalledWith('2027-03-05T00:00:00', 30);
    fireEvent.click(screen.getByRole('radio', { name: '90 days' }));
    expect(onChange).toHaveBeenLastCalledWith('2027-01-20T10:00:00', 90);
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '' } });
    expect(onChange).toHaveBeenCalledTimes(2); // an emptied date field changes nothing
  });
});
