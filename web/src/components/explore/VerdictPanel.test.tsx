// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Answer } from '@/lib/viz/answer';
import { VerdictPanel } from './VerdictPanel';

const night: Answer = {
  tone: 'bad',
  kind: 'night',
  title: 'Power for 3 days 4 hours, then night',
  sentences: ['The Sun sets on 3 January and stays behind the hills for 16 days 15 hours.', 'The battery covers the first 9 hours; the lander is back on 20 January.'],
  better: { hour: 466, startUtc: '2027-01-20T10:00:00', label: 'Land on 20 January instead', note: 'From 20 January, 10:00 UTC: power for 12 days 15 hours in a row.' },
  hint: null,
};
const good: Answer = { tone: 'good', kind: 'all', title: 'Keeps power for all 30 days', sentences: ['The Sun never sets in these 30 days.'], better: null, hint: null };
const stuck: Answer = { ...night, better: null, hint: 'No landing date in these 30 days gives more power here. A shorter stay or a bigger battery may.' };

function show(answer: Answer, yearNote: string | null = null) {
  const onLand = vi.fn();
  const onCompare = vi.fn();
  const onYear = vi.fn();
  render(<VerdictPanel siteName="de Gerlache Rim 2" answer={answer} onLand={onLand} onCompare={onCompare} onYear={onYear} yearNote={yearNote} />);
  return { onLand, onCompare, onYear };
}

describe('VerdictPanel', () => {
  it('leads the page with the answer in words, named for the site', () => {
    show(night);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1.textContent).toBe('de Gerlache Rim 2: Power for 3 days 4 hours, then night');
    expect(screen.getByText(/The Sun sets on 3 January/)).toBeTruthy();
    expect(screen.getByText(/The battery covers the first 9 hours/)).toBeTruthy();
    expect(screen.getByRole('region', { name: 'The answer' }).getAttribute('data-tone')).toBe('bad');
  });

  it('makes the better landing date the one gold button, with what it gives', () => {
    const { onLand, onCompare } = show(night);
    const gold = screen.getByRole('button', { name: 'Land on 20 January instead' });
    expect(gold.className).toMatch(/btn-primary/);
    expect(document.querySelectorAll('.btn-primary')).toHaveLength(1);
    fireEvent.click(gold);
    expect(onLand).toHaveBeenCalledWith('2027-01-20T10:00:00');
    expect(screen.getByText('From 20 January, 10:00 UTC: power for 12 days 15 hours in a row.')).toBeTruthy();
    const compare = screen.getByRole('button', { name: 'Compare sites' });
    expect(compare.className).not.toMatch(/btn-primary/);
    fireEvent.click(compare);
    expect(onCompare).toHaveBeenCalled();
  });

  it('makes "Compare sites" the gold button when no date does better, and says what else to try', () => {
    show(stuck);
    expect(screen.getByRole('button', { name: 'Compare sites' }).className).toMatch(/btn-primary/);
    expect(document.querySelectorAll('.btn-primary')).toHaveLength(1);
    expect(screen.getByText(/A shorter stay or a bigger battery may/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Land on/ })).toBeNull();
  });

  it('shows a good answer in the good tone with an icon and words', () => {
    show(good);
    const panel = screen.getByRole('region', { name: 'The answer' });
    expect(panel.getAttribute('data-tone')).toBe('good');
    expect(panel.querySelector('svg')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/Keeps power for all 30 days/);
  });

  it('offers the search over the next 12 months and reports what it found', () => {
    const { onYear } = show(night, 'Best landing in the next 12 months: 12 Oct 2027, power for 13 d 21 h, Earth in view 80 % of that time.');
    fireEvent.click(screen.getByRole('button', { name: 'Find the best date in the next 12 months' }));
    expect(onYear).toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toMatch(/12 Oct 2027/);
  });
});
