// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Answer } from '@/lib/viz/answer';
import { PHONE, visibleWords, WIDE } from '@/test/visible-words';
import { VerdictPanel } from './VerdictPanel';

const night: Answer = {
  tone: 'bad',
  kind: 'night',
  title: 'Landing at de Gerlache Rim 2 on 1 January: power for 3 days 4 hours, then night',
  sentences: [
    'No radio contact: Earth is out of view for all 3 days 4 hours with power.',
    'The Sun sets behind the hills on 3 January, and the night lasts 16 days 15 hours.',
    'As the Sun set, the panel already gave less than the lander uses, so the battery covers only the first 9 hours of the night; power comes back on 20 January, if the lander survives the cold and starts again.',
  ],
  better: { hour: 466, startUtc: '2027-01-20T10:00:00', label: 'Land on 20 January instead', note: 'From 20 January, 10:00 UTC: power for 12 days 15 hours in a row.' },
  hint: null,
  poweredHours: 76,
  contactHours: 0,
};
const sure = { lines: ['Sunset 3 Jan 19:00 UTC, within about 1.5 h.', 'Battery runs out 4 Jan 04:00 UTC, within about 1 h.'], basis: 'Measured at this site.', widest: 1.5 };
const summit = { words: 'Nearby: de Gerlache rim summit (12 km) has power all 30 days.', name: 'de Gerlache rim summit', href: '/explore?site=de_gerlache_center_rim_high&start=2027-01-01&days=30' };

describe('VerdictPanel with its margins', () => {
  it('puts how sure the times are right under the reasons, folded, and stays within 110 words before a tap', () => {
    render(<VerdictPanel answer={night} onLand={vi.fn()} onCompare={vi.fn()} onYear={vi.fn()} yearNote={null} nearby={summit} standLink="/explore/stand?site=de_gerlache_rim_2" site={{ lat: -88.28, polar: true }} sure={sure} />);
    const panel = screen.getByRole('region', { name: 'The answer' });
    const why = within(panel).getByRole('button', { name: 'Why this happens' });
    const how = within(panel).getByRole('button', { name: 'Times ±1.5 h' });
    expect(why.compareDocumentPosition(how) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(how.getAttribute('aria-expanded')).toBe('false');
    for (const width of [WIDE, PHONE]) expect(visibleWords(panel, width).length).toBeLessThanOrEqual(110);
  });

  it('shows no margins when it is given none', () => {
    render(<VerdictPanel answer={night} onLand={vi.fn()} onCompare={vi.fn()} onYear={vi.fn()} yearNote={null} />);
    expect(screen.queryByRole('button', { name: /^Times ±/ })).toBeNull();
  });
});
