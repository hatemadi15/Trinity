// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { readJson } from '@/lib/engine/__tests__/helpers';
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

  it('lets a year be typed digit by digit: the box keeps each partial year, and only the whole date moves the period', () => {
    const onChange = vi.fn();
    render(<PeriodControls startUtc="2025-01-15T00:00:00" days={30} onChange={onChange} />);
    const from = screen.getByLabelText('From') as HTMLInputElement;
    // The browser reports the year after each digit typed: 0002, 0020, 0202, then 2027.
    for (const value of ['0002-01-15', '0020-01-15', '0202-01-15', '2027-01-15']) {
      fireEvent.change(from, { target: { value } });
      expect(from.value).toBe(value);
    }
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('2027-01-15T00:00:00', 30);
  });

  it("keeps a date the period cannot take in the box until the box is left, then shows the period's date again", () => {
    const onChange = vi.fn();
    render(<PeriodControls startUtc="2027-01-20T10:00:00" days={30} onChange={onChange} />);
    const from = screen.getByLabelText('From') as HTMLInputElement;
    // A whole date whose 30 days run past the table's end, then an emptied box.
    for (const value of ['2036-12-20', '']) {
      fireEvent.change(from, { target: { value } });
      expect(from.value).toBe(value);
      fireEvent.blur(from);
      expect(from.value).toBe('2027-01-20');
    }
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows a new date that comes from outside over one still being typed', () => {
    const onChange = vi.fn();
    const { rerender } = render(<PeriodControls startUtc="2027-01-20T10:00:00" days={30} onChange={onChange} />);
    const from = screen.getByLabelText('From') as HTMLInputElement;
    fireEvent.change(from, { target: { value: '0202-01-20' } });
    // A landing date, the assistant or a link moves the period while the box still holds a partial year.
    rerender(<PeriodControls startUtc="2027-03-04T00:00:00" days={30} onChange={onChange} />);
    expect(from.value).toBe('2027-03-04');
    expect(screen.getByText('4 March 2027')).toBeTruthy();
    fireEvent.blur(from);
    expect(from.value).toBe('2027-03-04');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('offers only starts whose period ends inside the Sun and Earth table, and ignores any other date', () => {
    // The table's end, worked out from its header: hourly rows from its first hour, so a period must end by the hour after the last.
    const header = readJson<{ t0_utc: string; step_s: number; n: number }>('data', 'ephemeris', 'moon_me_2024_2036_1h.json');
    const end = Date.parse(`${header.t0_utc}Z`) + header.n * header.step_s * 1000;
    const lastStart = (days: number) => new Date(end - days * 86_400_000).toISOString().slice(0, 10);
    expect(lastStart(90)).toBe('2036-10-03');
    const onChange = vi.fn();
    const { rerender } = render(<PeriodControls startUtc="2027-01-20T10:00:00" days={90} onChange={onChange} />);
    const from = screen.getByLabelText('From') as HTMLInputElement;
    expect(from.max).toBe(lastStart(90));
    expect(from.min).toBe('2024-01-02');
    // A year typed digit by digit passes through dates outside the table (0002, 0020, 0202 on the way to 2025): none moves the period.
    for (const value of ['0002-01-15', '0202-01-15', '2023-12-31', '2036-10-04', '2037-01-01', '20300-01-15']) fireEvent.change(from, { target: { value } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(from, { target: { value: '2036-10-03' } });
    expect(onChange).toHaveBeenLastCalledWith('2036-10-03T00:00:00', 90);
    for (const days of [14, 30] as const) {
      rerender(<PeriodControls startUtc="2027-01-20T10:00:00" days={days} onChange={onChange} />);
      expect(from.max).toBe(lastStart(days));
    }
    expect(from.max).toBe('2036-12-02');
  });
});
