// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { readJson } from '@/lib/engine/__tests__/helpers';
import { PHONE, visibleWords, WIDE } from '@/test/visible-words';
import { PeriodControls } from './PeriodControls';

const box = (name: string) => screen.getByLabelText(name) as HTMLInputElement;
const from = () => box('From');
const time = () => box('Landing time, UTC');
const length = () => box('For');
const note = () => screen.queryByRole('status')?.textContent ?? null;

describe('PeriodControls', () => {
  it('shows the landing date and hour in UTC and the length in days, each in its own box', () => {
    const { container } = render(<PeriodControls startUtc="2027-01-20T10:00:00" days={30} onChange={() => {}} />);
    expect([from().value, time().value, length().value]).toEqual(['2027-01-20', '10:00', '30']);
    // The date also in words, as the rest of the page writes it: a date box shows the browser's own order of day and
    // month, and a time box may show a 12-hour clock.
    expect(screen.getByText('20 January 2027, 10:00')).toBeTruthy();
    // The time box is labelled UTC on the page, and takes whole hours, as the Sun and Earth table is hourly.
    expect(screen.getByText('UTC').tagName).toBe('LABEL');
    expect(time().type).toBe('time');
    expect(time().step).toBe('3600');
    expect(time().getAttribute('aria-describedby')).toBeTruthy();
    expect(document.getElementById(time().getAttribute('aria-describedby')!)!.textContent).toBe('Whole hours in UTC: the Sun and Earth table is hourly, so minutes round to the nearest hour.');
    // Any whole number of days from 2 to 90, with the bounds on the page.
    expect([length().type, length().min, length().max, length().step]).toEqual(['number', '2', '90', '1']);
    expect(screen.getByText('(2–90)')).toBeTruthy();
    // Every word before a tap, at a phone's width and at 1440: no more than the three lengths and their labels took.
    for (const width of [WIDE, PHONE]) expect(visibleWords(container, width)).toEqual(['From', '20', 'January', '2027,', '10:00', 'UTC', 'For', '(2–90)', 'days', 'Shift', 'by…']);
  });

  it('reports a new date with the same hour, a new hour on the same date, and a new length from the same landing', () => {
    const onChange = vi.fn();
    render(<PeriodControls startUtc="2027-01-20T10:00:00" days={30} onChange={onChange} />);
    fireEvent.change(from(), { target: { value: '2027-03-05' } });
    expect(onChange).toHaveBeenLastCalledWith('2027-03-05T10:00:00', 30);
    fireEvent.change(time(), { target: { value: '17:00' } });
    expect(onChange).toHaveBeenLastCalledWith('2027-01-20T17:00:00', 30);
    fireEvent.change(length(), { target: { value: '7' } });
    expect(onChange).toHaveBeenLastCalledWith('2027-01-20T10:00:00', 7);
    for (const b of [from(), time(), length()]) fireEvent.change(b, { target: { value: '' } });
    expect(onChange).toHaveBeenCalledTimes(3); // an emptied box changes nothing
  });

  it('rounds minutes typed in the time box to the nearest hour, as the engine does, and says so', () => {
    const onChange = vi.fn();
    const { rerender } = render(<PeriodControls startUtc="2027-01-20T10:00:00" days={30} onChange={onChange} />);
    fireEvent.change(time(), { target: { value: '17:40' } });
    expect(onChange).toHaveBeenLastCalledWith('2027-01-20T18:00:00', 30);
    // The page moves to the rounded hour, and the sentence stays with it.
    rerender(<PeriodControls startUtc="2027-01-20T18:00:00" days={30} onChange={onChange} />);
    expect(time().value).toBe('18:00');
    expect(note()).toBe('The Sun and Earth table is hourly, so 17:40 is read as 18:00 UTC.');
    // Any other change of period leaves the sentence behind.
    rerender(<PeriodControls startUtc="2027-01-21T18:00:00" days={30} onChange={onChange} />);
    expect(note()).toBeNull();
  });

  it('keeps a cleared time box or a length out of bounds until the box is left, then shows the period again and says why', () => {
    const onChange = vi.fn();
    render(<PeriodControls startUtc="2027-01-20T10:00:00" days={30} onChange={onChange} />);
    fireEvent.change(time(), { target: { value: '' } });
    expect(time().value).toBe('');
    fireEvent.blur(time());
    expect(time().value).toBe('10:00');
    expect(note()).toBeNull();
    // On the way to 14, "1" is held; 91, 7.5 and 0 are lengths no period has.
    for (const value of ['1', '91', '7.5', '0']) {
      fireEvent.change(length(), { target: { value } });
      expect(length().value).toBe(value);
      fireEvent.blur(length());
      expect(length().value).toBe('30');
      expect(note()).toBe('A period is 2 to 90 whole days.');
    }
    expect(onChange).not.toHaveBeenCalled();
  });

  it('holds a length that runs past the Sun and Earth table, and names the latest landing for it', () => {
    const onChange = vi.fn();
    render(<PeriodControls startUtc="2036-12-20T00:00:00" days={7} onChange={onChange} />);
    fireEvent.change(length(), { target: { value: '30' } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.blur(length());
    expect(length().value).toBe('7');
    expect(note()).toBe('A 30-day period from 20 December 2036, 00:00 UTC runs past 31 December 2036, where the Sun and Earth table ends. The latest landing for 30 days is 2 December 2036, 00:00 UTC.');
  });

  it('moves the landing an hour or a day either way, across midnight too, keeping the length', () => {
    const onChange = vi.fn();
    const { rerender } = render(<PeriodControls startUtc="2027-01-20T23:00:00" days={7} onChange={onChange} />);
    const press = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
    press('One hour later');
    expect(onChange).toHaveBeenLastCalledWith('2027-01-21T00:00:00', 7);
    press('One hour earlier');
    expect(onChange).toHaveBeenLastCalledWith('2027-01-20T22:00:00', 7);
    press('One day later');
    expect(onChange).toHaveBeenLastCalledWith('2027-01-21T23:00:00', 7);
    press('One day earlier');
    expect(onChange).toHaveBeenLastCalledWith('2027-01-19T23:00:00', 7);
    // At the latest landing for the length, a later landing stays where it is, and says why.
    onChange.mockClear();
    rerender(<PeriodControls startUtc="2036-12-25T00:00:00" days={7} onChange={onChange} />);
    press('One day later');
    expect(onChange).not.toHaveBeenCalled();
    expect(note()).toBe('The Sun and Earth table ends on 31 December 2036, so a 7-day period can start no later than 25 December 2036, 00:00 UTC: the landing stays there.');
  });

  it('shifts the landing by any number of days or hours, one tap away, and stops at the end of the table with a plain sentence', () => {
    const onChange = vi.fn();
    const { rerender } = render(<PeriodControls startUtc="2027-01-20T17:00:00" days={7} onChange={onChange} />);
    const fold = screen.getByRole('button', { name: 'Shift by…' });
    const panel = document.getElementById(fold.getAttribute('aria-controls')!)!;
    expect(panel.hidden).toBe(true);
    fireEvent.click(fold);
    const shift = within(panel);
    fireEvent.change(shift.getByLabelText('Shift by'), { target: { value: '5' } });
    fireEvent.click(shift.getByRole('button', { name: '5 days later' }));
    expect(onChange).toHaveBeenLastCalledWith('2027-01-25T17:00:00', 7);
    fireEvent.click(shift.getByRole('radio', { name: 'hours' }));
    fireEvent.change(shift.getByLabelText('Shift by'), { target: { value: '6' } });
    fireEvent.click(shift.getByRole('button', { name: '6 hours earlier' }));
    expect(onChange).toHaveBeenLastCalledWith('2027-01-20T11:00:00', 7);
    // A cleared or broken amount moves nothing.
    onChange.mockClear();
    for (const value of ['', '0', '2.5']) {
      fireEvent.change(shift.getByLabelText('Shift by'), { target: { value } });
      for (const b of shift.getAllByRole('button')) fireEvent.click(b);
    }
    expect(onChange).not.toHaveBeenCalled();
    // Ten days later from 20 December 2036 runs past the end: the landing stops at the latest one a week allows.
    rerender(<PeriodControls startUtc="2036-12-20T00:00:00" days={7} onChange={onChange} />);
    fireEvent.click(shift.getByRole('radio', { name: 'days' }));
    fireEvent.change(shift.getByLabelText('Shift by'), { target: { value: '10' } });
    fireEvent.click(shift.getByRole('button', { name: '10 days later' }));
    expect(onChange).toHaveBeenLastCalledWith('2036-12-25T00:00:00', 7);
    rerender(<PeriodControls startUtc="2036-12-25T00:00:00" days={7} onChange={onChange} />);
    expect(note()).toBe('The Sun and Earth table ends on 31 December 2036, so a 7-day period can start no later than 25 December 2036, 00:00 UTC: the landing moved there.');
  });

  it('names every control for the keyboard and a screen reader', () => {
    render(<PeriodControls startUtc="2027-01-20T10:00:00" days={30} onChange={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Shift by…' }));
    expect(screen.getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent)).toEqual([
      'One day earlier',
      'One day later',
      'One hour earlier',
      'One hour later',
      'Shift by…▴',
      '1 day earlier',
      '1 day later',
    ]);
    for (const b of screen.getAllByRole('button')) expect(b.getAttribute('type')).toBe('button');
    expect(screen.getAllByRole('radio').map((r) => (r as HTMLInputElement).labels?.[0]?.textContent)).toEqual(['days', 'hours']);
  });

  it('lets a year be typed digit by digit: the box keeps each partial year, and only the whole date moves the period', () => {
    const onChange = vi.fn();
    render(<PeriodControls startUtc="2025-01-15T00:00:00" days={30} onChange={onChange} />);
    // The browser reports the year after each digit typed: 0002, 0020, 0202, then 2027.
    for (const value of ['0002-01-15', '0020-01-15', '0202-01-15', '2027-01-15']) {
      fireEvent.change(from(), { target: { value } });
      expect(from().value).toBe(value);
    }
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('2027-01-15T00:00:00', 30);
  });

  it("keeps a date the period cannot take in the box until the box is left, then shows the period's date again and says why", () => {
    const onChange = vi.fn();
    render(<PeriodControls startUtc="2027-01-20T10:00:00" days={30} onChange={onChange} />);
    // A whole date whose 30 days run past the table's end, then an emptied box.
    fireEvent.change(from(), { target: { value: '2036-12-20' } });
    expect(from().value).toBe('2036-12-20');
    fireEvent.blur(from());
    expect(from().value).toBe('2027-01-20');
    expect(note()).toMatch(/^A 30-day period from 20 December 2036, 10:00 UTC runs past 31 December 2036/);
    fireEvent.change(from(), { target: { value: '' } });
    fireEvent.blur(from());
    expect(from().value).toBe('2027-01-20');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows a new date that comes from outside over one still being typed', () => {
    const onChange = vi.fn();
    const { rerender } = render(<PeriodControls startUtc="2027-01-20T10:00:00" days={30} onChange={onChange} />);
    fireEvent.change(from(), { target: { value: '0202-01-20' } });
    // A landing date, the assistant or a link moves the period while the box still holds a partial year.
    rerender(<PeriodControls startUtc="2027-03-04T06:00:00" days={30} onChange={onChange} />);
    expect([from().value, time().value]).toEqual(['2027-03-04', '06:00']);
    expect(screen.getByText('4 March 2027, 06:00')).toBeTruthy();
    fireEvent.blur(from());
    expect(from().value).toBe('2027-03-04');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('offers only starts whose period ends inside the Sun and Earth table, and lands a late hour on the latest one', () => {
    // The table's end, worked out from its header: hourly rows from its first hour, so a period must end by the hour after the last.
    const header = readJson<{ t0_utc: string; step_s: number; n: number }>('data', 'ephemeris', 'moon_me_2024_2036_1h.json');
    const end = Date.parse(`${header.t0_utc}Z`) + header.n * header.step_s * 1000;
    const lastStart = (days: number) => new Date(end - days * 86_400_000).toISOString().slice(0, 10);
    expect(lastStart(90)).toBe('2036-10-03');
    const onChange = vi.fn();
    const { rerender } = render(<PeriodControls startUtc="2027-01-20T10:00:00" days={90} onChange={onChange} />);
    expect(from().max).toBe(lastStart(90));
    expect(from().min).toBe('2024-01-02');
    // A year typed digit by digit passes through dates outside the table (0002, 0020, 0202 on the way to 2025): none moves the period.
    for (const value of ['0002-01-15', '0202-01-15', '2023-12-31', '2036-10-04', '2037-01-01', '20300-01-15']) fireEvent.change(from(), { target: { value } });
    expect(onChange).not.toHaveBeenCalled();
    // The last date at 10:00 would run ten hours past the end: the landing goes to 00:00 that day, and says so.
    fireEvent.change(from(), { target: { value: '2036-10-03' } });
    expect(onChange).toHaveBeenLastCalledWith('2036-10-03T00:00:00', 90);
    rerender(<PeriodControls startUtc="2036-10-03T00:00:00" days={90} onChange={onChange} />);
    expect(note()).toBe('The Sun and Earth table ends on 31 December 2036, so a 90-day period can start no later than 3 October 2036, 00:00 UTC: the landing moved there.');
    for (const days of [14, 30, 7] as const) {
      rerender(<PeriodControls startUtc="2027-01-20T10:00:00" days={days} onChange={onChange} />);
      expect(from().max).toBe(lastStart(days));
    }
    expect(from().max).toBe('2036-12-25');
  });
});
