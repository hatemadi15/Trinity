// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ENERGY_ONLY, POWER_ASSUMPTIONS, POWER_SCOPE_LINE, PowerScope } from './PowerScope';

describe('PowerScope', () => {
  it('names the four assumptions behind the power figures: the load, the panel, the battery and one shared height', () => {
    const all = POWER_ASSUMPTIONS.join(' ');
    expect(all).toMatch(/constant load/);
    expect(all).toMatch(/constant panel efficiency/);
    expect(all).toMatch(/ideal battery/);
    expect(all).toMatch(/no loss to cold or age/);
    expect(all).toMatch(/one height for the panel and the radio/i);
  });

  it('keeps electrical energy apart from staying warm through the night and starting again after it', () => {
    expect(ENERGY_ONLY).toMatch(/electrical energy/);
    expect(ENERGY_ONLY).toMatch(/warm enough through the night/);
    expect(ENERGY_ONLY).toMatch(/starts again after it/);
    expect(POWER_SCOPE_LINE).toMatch(/constant load.*constant panel efficiency.*ideal battery.*one mast height/);
  });

  it('never says the lander survives, lives or is safe', () => {
    for (const text of [...POWER_ASSUMPTIONS, ENERGY_ONLY, POWER_SCOPE_LINE]) expect(text).not.toMatch(/\b(survives?|lives|safe|safely|guarantee[sd]?|alive)\b/i);
  });

  it('shows the assumptions as a list under a plain lead, then the energy line, in text of 14 px or more', () => {
    const { container } = render(<PowerScope />);
    expect(screen.getAllByRole('listitem')).toHaveLength(POWER_ASSUMPTIONS.length);
    expect(screen.getByText(ENERGY_ONLY)).toBeTruthy();
    for (const el of container.querySelectorAll('[class*="text-["]')) expect(el.className).not.toMatch(/text-\[(1[0-3]|[0-9])px\]/);
  });
});
