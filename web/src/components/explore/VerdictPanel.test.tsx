// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Answer } from '@/lib/viz/answer';
import { PHONE, visibleWords, WIDE } from '@/test/visible-words';
import { PlannerChat } from '../PlannerChat';
import { VerdictPanel } from './VerdictPanel';

const night: Answer = {
  tone: 'bad',
  kind: 'night',
  title: 'Landing at de Gerlache Rim 2 on 1 January: power for 3 days 4 hours, then night',
  sentences: [
    'No radio contact: Earth is out of view for all 3 days 4 hours with power.',
    'The Sun sets behind the hills on 3 January, and the night lasts 16 days 15 hours.',
    'As the Sun set, the panel already gave less than the lander uses, so the battery covers only the first 9 hours of the night; power comes back on 20 January.',
  ],
  better: { hour: 466, startUtc: '2027-01-20T10:00:00', label: 'Land on 20 January instead', note: 'From 20 January, 10:00 UTC: power for 12 days 15 hours in a row.' },
  hint: null,
  poweredHours: 76,
  contactHours: 0,
};
const good: Answer = { tone: 'good', kind: 'all', title: 'Landing at de Gerlache Rim 2 on 1 January: power for all 30 days', sentences: ['The Sun never sets in these 30 days.'], better: null, hint: null, poweredHours: 720, contactHours: 324 };
const stuck: Answer = { ...night, better: null, hint: 'No landing date in these 30 days gives more power here. To get through the night, choose a bigger battery (Lander, above) or a shorter stay.' };

// The words nearbyWords writes for the rim summit, a derived high point.
const summit = { words: 'Nearby, de Gerlache rim summit (12 km away, unchecked for landing) keeps power for all 30 days from the same landing day.', name: 'de Gerlache rim summit', href: '/explore?site=de_gerlache_center_rim_high&start=2027-01-01&days=30' };
const stand = '/explore/stand?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10';

function show(answer: Answer, yearNote: string | null = null, nearby: Parameters<typeof VerdictPanel>[0]['nearby'] = null, standLink?: string) {
  const onLand = vi.fn();
  const onCompare = vi.fn();
  const onYear = vi.fn();
  render(<VerdictPanel answer={answer} onLand={onLand} onCompare={onCompare} onYear={onYear} yearNote={yearNote} nearby={nearby} standLink={standLink} />);
  return { onLand, onCompare, onYear };
}

describe('VerdictPanel', () => {
  it('names its NASA data at its foot: the positions, the hills on the site’s grid and the Horizons check, as every panel does', () => {
    render(<VerdictPanel answer={night} onLand={vi.fn()} onCompare={vi.fn()} onYear={vi.fn()} yearNote={null} site={{ lat: -88.28, polar: true }} />);
    const row = screen.getByLabelText('Data sources');
    expect([...row.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['JPL DE440', 'NASA LRO LOLA 20 m', 'checked: JPL Horizons']);
    expect(screen.getByRole('link', { name: 'checked: JPL Horizons' }).getAttribute('href')).toBe('/validate');
    // The row is the panel's last word, under the 12-month search.
    expect(row.parentElement!.lastElementChild).toBe(row);
  });

  it('leads the page with the answer in words, which names the site and the landing day', () => {
    show(night);
    const h1 = screen.getByRole('heading', { level: 1 });
    // A site's number stays with its name ("Rim 2" never breaks across lines), and a phone gets a size that wraps calmly.
    expect(h1.textContent).toBe('Landing at de Gerlache Rim\u00a02 on 1 January: power for 3 days 4 hours, then night');
    expect(h1.className).toMatch(/(^| )text-\[24px\]/);
    expect(screen.getByText(/The Sun sets behind the hills on 3 January/)).toBeTruthy();
    expect(screen.getByText(/covers only the first 9 hours of the night/)).toBeTruthy();
    expect(screen.getByRole('region', { name: 'The answer' }).getAttribute('data-tone')).toBe('bad');
  });

  it('gives its first sentence a line of its own, and folds the reasons behind "Why this happens" right after it (spec 20.1)', () => {
    show(night);
    const lead = screen.getByText('No radio contact: Earth is out of view for all 3 days 4 hours with power.');
    expect(lead.tagName).toBe('P');
    expect(lead.className).toMatch(/\bfont-medium\b/);
    const reasons = screen.getByText(/^The Sun sets behind the hills on 3 January, .* power comes back on 20 January\.$/);
    expect(reasons.tagName).toBe('P');
    // The stand view's words for its reasons, straight under the first sentence.
    const why = screen.getByRole('button', { name: 'Why this happens' });
    expect(lead.nextElementSibling!.contains(why)).toBe(true);
    // The reasons stay in the page, so a search still finds them, but show only once the button opens them.
    const fold = document.getElementById(why.getAttribute('aria-controls')!)!;
    expect(fold.contains(reasons)).toBe(true);
    expect(why.getAttribute('aria-expanded')).toBe('false');
    expect(fold.hidden).toBe(true);
    fireEvent.click(why);
    expect(why.getAttribute('aria-expanded')).toBe('true');
    expect(fold.hidden).toBe(false);
  });

  it('has no fold for an answer of one sentence: there are no reasons to open', () => {
    show(good);
    expect(screen.getByText('The Sun never sets in these 30 days.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Why this happens' })).toBeNull();
  });

  it('keeps the answer to 110 words before a tap, at 1440 and on a phone (spec 20.1)', () => {
    // The pitch's first screen: de Gerlache Rim 2 from 1 January, with the better day, the rim summit nearby and the way to stand there.
    render(<VerdictPanel answer={night} onLand={vi.fn()} onCompare={vi.fn()} onYear={vi.fn()} yearNote={null} nearby={summit} standLink={stand} site={{ lat: -88.28, polar: true }} />);
    const panel = screen.getByRole('region', { name: 'The answer' });
    for (const width of [WIDE, PHONE]) expect(visibleWords(panel, width).length).toBeLessThanOrEqual(110);
  });

  it('makes the better landing date the one gold button, with what it gives', () => {
    const { onLand, onCompare } = show(night);
    const gold = screen.getByRole('button', { name: 'Land on 20 January instead' });
    expect(gold.className).toMatch(/btn-primary/);
    expect(document.querySelectorAll('.btn-primary')).toHaveLength(1);
    fireEvent.click(gold);
    expect(onLand).toHaveBeenCalledWith('2027-01-20T10:00:00');
    expect(screen.getByText('From 20 January, 10:00 UTC: power for 12 days 15 hours in a row.')).toBeTruthy();
    // One way forward: with a better date there is no second button beside it.
    expect(screen.queryByRole('button', { name: 'Compare sites' })).toBeNull();
    expect(onCompare).not.toHaveBeenCalled();
  });

  it('makes "Compare sites" the gold button when no date does better, and says what else to try', () => {
    show(stuck);
    expect(screen.getByRole('button', { name: 'Compare sites' }).className).toMatch(/btn-primary/);
    expect(document.querySelectorAll('.btn-primary')).toHaveLength(1);
    expect(screen.getByText(/choose a bigger battery \(Lander, above\) or a shorter stay/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Land on/ })).toBeNull();
  });

  it('shows a good answer in the good tone with an icon and words', () => {
    show(good);
    const panel = screen.getByRole('region', { name: 'The answer' });
    expect(panel.getAttribute('data-tone')).toBe('good');
    expect(panel.querySelector('svg')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/power for all 30 days/);
  });

  it('states a bad answer calmly: a plain panel, the heading in ink and an empty battery in the bad colour', () => {
    show(night);
    const panel = screen.getByRole('region', { name: 'The answer' });
    // The plain panel of the page (surface, hairline edge), like the numbers beside it.
    expect(panel.className).toMatch(/\bpanel\b/);
    expect(panel.className).not.toMatch(/bad-bg|good-bg/);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1.closest('.text-bad')).toBeNull();
    // A two-line title breaks evenly, never leaving one word on its own line; on a phone it is smaller.
    expect(h1.className).toMatch(/\btext-balance\b/);
    expect(h1.classList.contains('text-[24px]')).toBe(true);
    expect(h1.classList.contains('sm:text-[32px]')).toBe(true);
    const icon = panel.querySelector('[data-icon]')!;
    expect(icon.getAttribute('data-icon')).toBe('battery-empty');
    expect(icon.closest('.text-bad')).toBeTruthy();
  });

  it('marks a good answer with a full battery in the good colour', () => {
    show(good);
    const icon = screen.getByRole('region', { name: 'The answer' }).querySelector('[data-icon]')!;
    expect(icon.getAttribute('data-icon')).toBe('battery-full');
    expect(icon.closest('.text-good')).toBeTruthy();
  });

  it('fills the height of its row, with the 12-month search at the foot', () => {
    show(night);
    const panel = screen.getByRole('region', { name: 'The answer' });
    expect(panel.className).toMatch(/\bflex-col\b/);
    expect(screen.getByRole('button', { name: 'Find the best date in the next 12 months' }).closest('p')!.className).toMatch(/\bmt-auto\b/);
  });

  it('offers a better place nearby in a sentence with a link to it', () => {
    show(night, null, { words: 'Nearby, de Gerlache rim summit (12 km away) keeps power for all 30 days from the same landing day.', name: 'de Gerlache rim summit', href: '/explore?site=de_gerlache_center_rim_high&start=2027-01-01&days=30' });
    const panel = screen.getByRole('region', { name: 'The answer' });
    expect(panel.textContent).toMatch(/Nearby, de Gerlache rim summit \(12 km away\) keeps power for all 30 days from the same landing day\./);
    const link = screen.getByRole('link', { name: 'Explore de Gerlache rim summit' });
    expect(link.getAttribute('href')).toBe('/explore?site=de_gerlache_center_rim_high&start=2027-01-01&days=30');
    expect(link.className).toMatch(/\bunderline\b/);
  });

  it('makes the better place nearby the gold action when no landing day does better', () => {
    show(stuck, null, { words: 'Nearby, de Gerlache rim summit (12 km away) keeps power for all 30 days from the same landing day.', name: 'de Gerlache rim summit', href: '/explore?site=de_gerlache_center_rim_high&start=2027-01-01&days=30' });
    const gold = screen.getByRole('link', { name: 'Explore de Gerlache rim summit' });
    expect(gold.className).toMatch(/btn-primary/);
    expect(document.querySelectorAll('.btn-primary')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Compare sites' })).toBeNull();
    // The sentence that says why sits right above the button.
    expect(gold.closest('section')!.textContent).toMatch(/Nearby, de Gerlache rim summit \(12 km away\) keeps power for all 30 days/);
  });

  it('offers to stand at the site as an outlined button after the nearby line, never a second gold action (both readers, part C read 1)', () => {
    show(night, null, summit, stand);
    const link = screen.getByRole('link', { name: 'Stand at the site' });
    expect(link.getAttribute('href')).toBe(stand);
    // The app's best view reads as a way in, not a footnote: the plain button, 44 px tall; the gold stays the better day's.
    expect(link.className).toMatch(/\bbtn\b/);
    expect(link.className).toMatch(/\bbtn-sm\b/);
    expect(link.className).not.toMatch(/\bbtn-primary\b/);
    expect(document.querySelectorAll('.btn-primary')).toHaveLength(1);
    // Under the answer: after the better place nearby, before the 12-month search at the foot.
    const nearby = screen.getByRole('link', { name: 'Explore de Gerlache rim summit' });
    expect(nearby.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const year = screen.getByRole('button', { name: 'Find the best date in the next 12 months' });
    expect(link.compareDocumentPosition(year) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('offers no way to stand at the site when it is given none', () => {
    show(night, null, summit);
    expect(screen.queryByRole('link', { name: 'Stand at the site' })).toBeNull();
  });

  it('the answer links to the assistant and moves the focus to its box', async () => {
    render(
      <>
        <VerdictPanel answer={night} onLand={vi.fn()} onCompare={vi.fn()} onYear={vi.fn()} yearNote={null} />
        <PlannerChat ask={vi.fn()} navigate={vi.fn()} />
      </>,
    );
    const link = screen.getByRole('link', { name: 'Or ask in plain words' });
    expect(link.getAttribute('href')).toBe('#ask');
    expect(screen.getByRole('region', { name: 'Ask in plain words' }).id).toBe('ask');
    // A plain underlined link beside the 12-month search, never a second gold action.
    expect(link.className).toMatch(/\bunderline\b/);
    expect(link.className).not.toMatch(/\bbtn/);
    expect(link.closest('p')).toBe(screen.getByRole('button', { name: 'Find the best date in the next 12 months' }).closest('p'));
    fireEvent.click(link);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Ask the assistant')));
  });

  it('offers the search over the next 12 months and reports what it found', () => {
    const { onYear } = show(night, 'Best landing in the next 12 months: 12 Oct 2027, power for 13 d 21 h, Earth in view 80 % of that time.');
    fireEvent.click(screen.getByRole('button', { name: 'Find the best date in the next 12 months' }));
    expect(onYear).toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toMatch(/12 Oct 2027/);
  });
});
