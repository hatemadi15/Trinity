// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import LearnPage from './page';

describe('How it works', () => {
  it('opens with the home page\'s three drawings and what each says', () => {
    render(<LearnPage />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('How it works');
    const why = screen.getByRole('region', { name: 'Why the south pole is hard' });
    expect(within(why).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['The Sun never climbs', 'The hills decide', 'Earth sets too']);
    expect(why.querySelectorAll('svg').length).toBeGreaterThanOrEqual(3);
  });

  it('gives the science behind the three facts, for a class', () => {
    render(<LearnPage />);
    const science = screen.getByRole('region', { name: 'The science behind the three facts' });
    expect(within(science).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Why the Sun stays low', 'Why Earth rises and sets so slowly', 'How to read the grey in the charts', 'The battery sum']);
    expect(science.textContent).toMatch(/tilted only about 1\.5°/);
    expect(science.textContent).toMatch(/23\.4°, which is why we have seasons/);
    expect(science.textContent).toMatch(/libration/);
    expect(science.textContent).toMatch(/2,000 ÷ 200 = 10 hours/);
  });

  it('walks through the screens in five numbered steps, in the order a visitor meets them', () => {
    render(<LearnPage />);
    const steps = within(screen.getByRole('list', { name: 'Five steps' })).getAllByRole('listitem');
    expect(steps.map((s) => s.querySelector('h3')!.textContent)).toEqual(['Choose a landing site', 'Read the answer', 'See why, hour by hour', 'Look at the ground', 'Compare and check']);
    expect(steps[2].textContent).toMatch(/Times are in UTC, the clock time at Greenwich on Earth: the Moon keeps no clock of its own\./);
    expect(steps[3].textContent).toMatch(/shadow map/);
    expect(steps[0].textContent).toMatch(/Picking a site opens Explore on that day\./);
    expect(steps[1].textContent).toMatch(/lands on the first day of the period/);
    expect(steps[3].textContent).toMatch(/View all round unrolls the horizon/);
    expect(steps[4].textContent).toMatch(/Accuracy/);
  });

  it('ends on one gold way in, to the site list, and has no Learn mode', () => {
    render(<LearnPage />);
    const gold = screen.getByRole('main').querySelectorAll('.btn-primary');
    expect(gold).toHaveLength(1);
    expect(gold[0].textContent).toBe('Choose a landing site');
    expect(gold[0].getAttribute('href')).toBe('/sites');
    expect(screen.getByRole('main').textContent).not.toMatch(/Learn mode|sky dome|skyline|timeline bars/);
  });
});
