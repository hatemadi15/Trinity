// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PHONE, visibleWords, WIDE } from '@/test/visible-words';
import LearnPage from './page';

const CAP = 50;

describe('How it works', () => {
  it('keeps the projector tip one tap away, under the title: the toggle is its question', () => {
    render(<LearnPage />);
    const toggle = screen.getByRole('button', { name: /^Showing it to a class\?/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    const tip = document.getElementById(toggle.getAttribute('aria-controls')!)!;
    expect(tip.hidden).toBe(true);
    fireEvent.click(toggle);
    expect(tip.hidden).toBe(false);
    expect(tip.textContent).toBe('On a projector, zoom the page to 150 % (Ctrl and +, or ⌘ and + on a Mac): the words, the charts and the views all grow, and nothing runs off the side.');
    expect(screen.getByRole('heading', { level: 1 }).compareDocumentPosition(toggle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(document.body.textContent).toMatch(/whether they have set behind the hills/);
  });

  it('says once that the data is NASA\'s, in the offline section, and leaves the south-pole section\'s intro to the home page', () => {
    render(<LearnPage />);
    expect(screen.getByRole('heading', { level: 1 }).parentElement!.textContent).not.toMatch(/Everything comes from NASA data/);
    expect(screen.getByRole('region', { name: 'Running it offline' }).textContent).toMatch(/computed in the browser from NASA data/);
    expect(document.body.textContent).not.toMatch(/Three facts decide whether a lander lives/);
  });

  it('keeps the title block to 50 words, at 1440 and on a phone (spec 20.1)', () => {
    render(<LearnPage />);
    const top = screen.getByRole('main').firstElementChild!;
    for (const width of [WIDE, PHONE]) expect(visibleWords(top, width).length).toBeLessThanOrEqual(CAP);
  });

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
    // Accuracy holds checks and context, not one NASA source for every step.
    expect(steps[4].textContent).toMatch(/Accuracy shows what each check establishes, what it was tested on and what it leaves out, with past missions as context, and lets you rerun one check live\./);
    // The ground's tabs by the names they carry on the page.
    expect(steps[3].textContent).toMatch(/The 3D view from above shows the same light on the hills\./);
    expect(steps[3].textContent).toMatch(/The horizon chart unrolls the horizon/);
    expect(steps[3].textContent).not.toMatch(/View all round|3D shows/);
    expect(steps[4].textContent).toMatch(/Accuracy/);
  });

  it('says how it runs offline, under its own heading, where the home page’s "run it offline" link lands', () => {
    render(<LearnPage />);
    const offline = screen.getByRole('region', { name: 'Running it offline' });
    expect(offline.id).toBe('offline');
    expect(offline.textContent).toMatch(/Everything is computed in the browser/);
    expect(offline.textContent).toMatch(/with the Wi-Fi off/);
    expect(offline.textContent).toMatch(/The live re-check against JPL Horizons on the Accuracy page is the one thing that needs a connection\./);
    expect(within(offline).getByRole('link', { name: /README/ }).getAttribute('href')).toBe('https://github.com/hatemadi15/Trinity#readme');
    // The page still ends on the steps and their one gold way in.
    expect(offline.compareDocumentPosition(screen.getByRole('list', { name: 'Five steps' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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
