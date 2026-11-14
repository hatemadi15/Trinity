// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { PicturesDoc } from '@/lib/data/validation';
import { readJson } from '@/lib/engine/__tests__/helpers';
import { PicturesNumbers } from './PicturesNumbers';

const doc = readJson<PicturesDoc>('data', 'validation', 'images.json');

describe('PicturesNumbers', () => {
  it('lists every picture with its moment, its Sun and how the app and the camera compare, in plain columns', () => {
    render(<PicturesNumbers doc={doc} />);
    const table = screen.getByRole('table', { name: 'Every picture against the app' });
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
      'Site',
      'Camera',
      'Taken (UTC)',
      'Sun up',
      'Called alike',
      'Lit ground found',
      'Dark ground found',
      "With NASA's newer terrain",
      'Sun turned a quarter',
      'Meets the mark',
    ]);
    expect(within(table).getAllByRole('row')).toHaveLength(doc.rows.length + 1);
    const first = doc.rows[0];
    const row = within(table).getAllByRole('row')[1];
    expect(row.textContent).toContain('Connecting Ridge');
    expect(row.textContent).toContain('Wide angle');
    expect(row.textContent).toContain(first.mid_utc.slice(0, 16).replace('T', ' '));
    expect(row.textContent).toContain(`${first.sun_el_deg.toFixed(1)}°`);
    expect(row.textContent).toContain(`${(first.agree * 100).toFixed(1)} %`);
    expect(row.textContent).toContain(`${(first.product90.agree * 100).toFixed(1)} %`);
    expect(row.textContent).toContain(`${(first.agree_sun_turned_90 * 100).toFixed(1)} %`);
  });

  it('marks the pictures that fall short, and says which ground the app missed', () => {
    render(<PicturesNumbers doc={doc} />);
    const table = screen.getByRole('table', { name: 'Every picture against the app' });
    const marks = within(table).getAllByRole('row').slice(1).map((r) => r.lastElementChild!.textContent);
    expect(marks.filter((m) => m === 'yes')).toHaveLength(17);
    expect(marks.filter((m) => m === 'no: lit ground')).toHaveLength(3);
  });

  it('says how a pixel is judged lit, how the frames were picked, and where every picture comes from', () => {
    const { container } = render(<PicturesNumbers doc={doc} />);
    const text = container.textContent ?? '';
    expect(text).toMatch(/at least half as bright as sunlight would make that slope/);
    expect(text).toMatch(/one frame for each quarter of the Sun's circle/);
    for (const source of doc.sources) expect(text).toContain(source);
    expect(text).toContain(doc.evidence.command);
    expect(text).toContain('Peak near Cabeus B');
  });
});
