// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { earthLitFraction } from '@/lib/sky/earth';
import { dirAzEl } from '@/lib/sky/frames';
import type { SkyLabels } from '@/lib/sky/standRenderer';
import { createExploreStore } from '@/lib/store/explore';
import { compassWord } from '@/lib/viz/ground';
import { DEMO_KEY } from '@/lib/hooks/useDemoMode';
import { FIRST_STEP, FIRST_STEP_PHONE, FIRST_STEP_STILL, keyMoments, landerCaption, landerState, momentCaption, phoneHeadline, RESIDENT_LINE, skyLabel, starLabel, statusLine, viewCaption, WATCH_LEAD, WATCH_LEAD_STILL, watchNext, type MomentKind } from '@/lib/viz/stand';
import { openingYaw } from '@/lib/viz/standOpening';
import { fileLoaders, terrainFileLoaders, terrainPresent } from '@/test/file-loaders';
import { visibleWords, WIDE } from '@/test/visible-words';
import type { StandScene } from '@/lib/sky/standRenderer';
import { pathMarks, StandView } from './StandView';
import type { RendererLike } from './StandCanvas';

// jsdom has no PointerEvent; this one carries the pointer's id on top of the mouse event's position.
if (typeof window.PointerEvent === 'undefined') {
  class PointerEventPolyfill extends MouseEvent {
    pointerId: number;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
    }
  }
  window.PointerEvent = PointerEventPolyfill as unknown as typeof PointerEvent;
}

vi.mock('@/lib/data/sky', () => ({
  loadSkyAssets: async () => ({
    stars: { count: 0, j2000: new Float32Array(), vmag: new Float32Array(), bv: new Float32Array() },
    moon: { startMs: 0, stepMs: 1, count: 2, quats: Float32Array.from([1, 0, 0, 0, 1, 0, 0, 0]) },
    earthDayUrl: '',
    earthCloudsUrl: '',
    names: [{ index: 0, name: 'Sirius' }],
  }),
}));

// The opening's turn, counted where the view works it out: it walks the skyline in some 44,000 steps (19.4).
vi.mock('@/lib/viz/standOpening', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/viz/standOpening')>();
  return { ...real, openingYaw: vi.fn(real.openingYaw) };
});

const everywhere: SkyLabels = {
  sun: { x: 0.5, y: 0.4, visible: true },
  earth: { x: 0.7, y: 0.4, visible: true },
  stars: [{ name: 'Sirius', x: 0.3, y: 0.2, visible: true }],
  lander: { x: 0.8, y: 0.6, visible: true },
  parts: { panel: { x: 0.8, y: 0.5, visible: true }, dish: { x: 0.82, y: 0.48, visible: true }, lamp: { x: 0.78, y: 0.58, visible: true } },
  shadow: { x: 0.5, y: 0.8, visible: true, lengthM: 51.5, levelM: 51.5 },
};
const stub = () => ({ setTime: vi.fn(), setView: vi.fn(), resize: vi.fn(), render: vi.fn(), labels: () => everywhere, dispose: vi.fn() }) satisfies RendererLike;
/**
 * A line as Testing Library reads it off the page, which makes each no-break space a plain one: the lander's
 * line keeps "100 %" together with one.
 */
const asRead = (text: string) => text.replace(/\u00a0/g, ' ');

async function open(search: string, createRenderer: () => RendererLike = stub) {
  window.history.replaceState(null, '', `/explore/stand${search}`);
  const store = createExploreStore(fileLoaders());
  const view = render(<StandView store={store} createRenderer={() => createRenderer()} />);
  await waitFor(() => expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/^Landing on /), { timeout: 20_000 });
  return { store, view };
}

/** Opens today's card under the status line. */
const openCard = () => fireEvent.click(screen.getByRole('button', { name: 'More' }));

/** Waits for the first step on the line over the view, which shows once the ground has drawn (19.2). */
const firstStep = () => waitFor(() => expect(document.querySelector('[data-caption]')?.textContent).toContain(FIRST_STEP), { timeout: 10_000 });

/** A drag on the view, the first turn by hand: the first step goes for the visit (19.2). */
async function drag() {
  const view = await screen.findByRole('application', {}, { timeout: 10_000 });
  fireEvent.pointerDown(view, { pointerId: 1, clientX: 100, clientY: 100 });
  fireEvent.pointerMove(view, { pointerId: 1, clientX: 140, clientY: 100 });
  fireEvent.pointerUp(view, { pointerId: 1 });
}

/** The card's help line, which says what the first step says. */
const HELP = 'Drag to look around; pinch or scroll to zoom.';

afterEach(() => cleanup());

describe('StandView', () => {

  it('puts the answer first: from 768 px the headline leads the plate above the next step and the moment’s state ends it; a phone’s plate leads with the short headline and keeps the state in the card', async () => {
    const { store } = await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10');
    const heading = screen.getByRole('heading', { level: 1 }).textContent!;
    const title = asRead(heading);
    const more = screen.getByRole('button', { name: 'More' });
    const plate = more.closest('[data-plate]') as HTMLElement;
    const follows = (a: Node, b: Node) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    // From 768 px the headline comes first, then the next step, and last the moment's state, on a row of its own.
    const shown = within(plate).getByText(title, { selector: 'p' });
    expect(shown.className).toMatch(/\bmax-md:hidden\b/);
    const next = screen.getByRole('group', { name: 'Next step' });
    const st = store.getState();
    const lander = statusLine(st.series!, st.power, st.startUtc, 10, st.params.power.batteryWh);
    const state = within(plate).getByText(asRead(lander.text));
    expect(follows(shown, next)).toBe(true);
    expect(follows(next, state)).toBe(true);
    expect(state.parentElement).toBe(plate.lastElementChild);
    expect(state.parentElement!.className).toMatch(/\bmax-md:hidden\b/);
    // On a phone the plate leads with the headline's short form, More beside it; the page's heading keeps it whole.
    const short = within(plate).getByText(asRead(phoneHeadline(heading)), { selector: 'p' });
    expect(asRead(short.textContent!)).toBe('1 January: power for 3 days 4 hours, no radio');
    expect(short.className).toMatch(/\bmd:hidden\b/);
    expect(short.parentElement).toBe(more.parentElement);
    expect(follows(short, more)).toBe(true);
    // Today's card opens on the moment's state with its dot, then keeps the whole headline: on a phone only.
    openCard();
    const card = document.getElementById('stand-card')!;
    const first = card.firstElementChild as HTMLElement;
    expect(first.tagName).toBe('P');
    expect(asRead(first.textContent!)).toBe(asRead(lander.text));
    expect(first.querySelector('[data-tone]')!.getAttribute('data-tone')).toBe(lander.tone);
    expect(first.className).toMatch(/\bmd:hidden\b/);
    const whole = within(card).getByText(title, { selector: 'p' });
    expect(whole.className).toMatch(/\bmd:hidden\b/);
    expect(follows(first, whole)).toBe(true);
  });
  it('opens with the guides off, shows the days on the paths and the level horizon on "Show paths", which then reads "Hide paths", and hides them with the words', async () => {
    window.history.replaceState(null, '', '/explore/stand?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10');
    const store = createExploreStore(fileLoaders());
    const setGuides = vi.fn();
    let scene: StandScene | null = null;
    render(
      <StandView
        store={store}
        createRenderer={(_canvas, sc) => {
          scene = sc;
          return { ...stub(), setGuides, labels: () => ({ ...everywhere, level: { x: 0.2, y: 0.5, visible: true }, marks: (sc.marks ?? []).map((m, k) => ({ text: m.text, x: 0.25 + 0.15 * k, y: 0.3, visible: true })) }) };
        }}
      />,
    );
    const guides = await screen.findByRole('button', { name: 'Show paths' }, { timeout: 20_000 });
    // Off when the view opens: the renderer leaves out the paths and the level horizon, and keeps the rings. The button's
    // words say what it does, so it has no pressed state (19.4).
    expect(guides.getAttribute('aria-pressed')).toBeNull();
    await waitFor(() => expect(setGuides).toHaveBeenLastCalledWith(false, true, true));
    expect(document.querySelectorAll('[data-path-mark]:not([hidden])')).toHaveLength(0);
    expect(screen.getByText('Level horizon').closest('[hidden]')).not.toBeNull();
    fireEvent.click(guides);
    const hide = screen.getByRole('button', { name: 'Hide paths' });
    expect(hide.getAttribute('aria-pressed')).toBeNull();
    // A phone keeps "Paths" for the row's width; wider, the button's words are its name.
    expect([...hide.querySelectorAll('span')].map((x) => [x.className, x.textContent])).toEqual([
      ['md:hidden', 'Paths'],
      ['max-md:hidden', 'Hide paths'],
    ]);
    await waitFor(() => expect(setGuides).toHaveBeenLastCalledWith(true, true, true));
    await waitFor(() => expect(document.querySelectorAll('[data-path-mark]:not([hidden])').length).toBeGreaterThan(0));
    // The Sun sets behind the hills on 3 January and rises on the 20th; Earth rises on the 10th and sets on the 23rd.
    const marks = (scene! as StandScene).marks!;
    expect(marks.filter((m) => m.body === 'sun').map((m) => m.text)).toEqual(['Sunset, 3 Jan', 'Sunrise, 20 Jan']);
    expect(marks.filter((m) => m.body === 'earth').map((m) => m.text)).toEqual(['Earth rises, 10 Jan', 'Earth sets, 23 Jan']);
    expect([...document.querySelectorAll('[data-path-mark]')].map((n) => n.textContent)).toEqual(marks.map((m) => m.text));
    expect(screen.getByText('Level horizon').closest('[hidden]')).toBeNull();
    // Hidden with the words, the rings too; back as they were, the card and the guides with them.
    openCard();
    fireEvent.click(screen.getAllByRole('button', { name: 'Hide the words' })[0]);
    await waitFor(() => expect(setGuides).toHaveBeenLastCalledWith(false, true, false));
    await waitFor(() => expect(document.querySelectorAll('[data-path-mark]:not([hidden])')).toHaveLength(0));
    fireEvent.click(screen.getByRole('button', { name: 'Show the words' }));
    await waitFor(() => expect(setGuides).toHaveBeenLastCalledWith(true, true, true));
    expect(screen.getByRole('button', { name: 'Hide paths' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Less' })).toBeTruthy();
  }, 30_000);

  it('names each day on the paths as its flag names it, short: where the Sun sets and rises, and where Earth rises', () => {
    const at = (kind: MomentKind, label: string, hour: number, day: string) => ({ kind, label, hour, day });
    expect(
      pathMarks([at('sunset', 'Sunset', 67, '3 Jan'), at('battery-out', 'Battery runs out', 76, '4 Jan'), at('earth-in', 'Earth rises', 219, '10 Jan'), at('sun-power-back', 'Sunrise', 466, '20 Jan')]),
    ).toEqual([
      { hour: 67, body: 'sun', text: 'Sunset, 3 Jan' },
      { hour: 219, body: 'earth', text: 'Earth rises, 10 Jan' },
      { hour: 466, body: 'sun', text: 'Sunrise, 20 Jan' },
    ]);
    // A Sun below the level horizon sets, and so does one behind the hills. The power's part of a joined moment stays
    // on its flag: the path is the Sun's.
    const sets = pathMarks([at('sunset-power-off', 'Sunset and power off', 5, '2 Mar'), at('sun-back', 'Sunrise', 300, '15 Mar'), at('power-back', 'Power back', 301, '15 Mar')]);
    expect(sets.map((m) => m.text)).toEqual(['Sunset, 2 Mar', 'Sunrise, 15 Mar']);
    expect(pathMarks([at('sunset-power-off', 'Sunset and power off', 5, '2 Mar')]).map((m) => m.text)).toEqual(['Sunset, 2 Mar']);
  });

  it('opens with the lander’s power and radio at the plate’s foot, the site first, and today’s card under More, which keeps what to watch and the help line until the first step has gone (20.1)', async () => {
    const { store } = await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10');
    // The lander stands once the ground has loaded, a moment after the words: on a busy machine, later.
    await screen.findByRole('button', { name: 'Face the lander' }, { timeout: 20_000 });
    const st = store.getState();
    expect(st.cursorHour).toBe(10);
    // The headline is the page's heading for screen readers while the card is folded: both verdicts the challenge
    // asks for, and a night whose length adds up to the day the power comes back, each span on one line.
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1.textContent).toBe('Landing on 1 January: power for 3 days 4 hours, no radio contact, then 16 days without power');
    expect(h1.classList.contains('sr-only')).toBe(true);
    // At the plate's foot: the site's name (on one line, and waiting for a wider screen on a phone), then the
    // lander's power, its battery's level and its radio.
    const line = statusLine(st.series!, st.power, st.startUtc, 10, st.params.power.batteryWh);
    expect(line.text).toMatch(/^Power on, battery 100 %\. No radio: Earth is (below the horizon|behind a hill)\.$/);
    const status = screen.getByText(asRead(line.text));
    // Its dot is amber, power without radio: green is kept for radio contact, as on the time bar.
    expect(status.closest('[data-plate]')!.querySelector('[data-tone]')!.getAttribute('data-tone')).toBe('power');
    const name = within(status).getByText(/^de\sGerlache\sRim\s2\.$/);
    expect(name.classList.contains('max-md:hidden')).toBe(true);
    expect(document.body.textContent).toContain('de Gerlache Rim 2');
    // One row of buttons.
    const row = screen.getByRole('group', { name: 'Look towards' });
    // Each by its name; the hide button has no other, its visible words being its name, as speech input needs (WCAG 2.5.3).
    expect([...row.querySelectorAll('button')].map((b) => b.getAttribute('aria-label') ?? b.textContent)).toEqual(['Face the Sun', 'Face Earth', 'Face the lander', 'Look up', 'Show paths', 'Hide the words']);
    // Read as a verb, not a noun (both readers of read D1).
    expect(within(row).getByText('Turn to')).toBeTruthy();
    for (const name of ['Face the Sun', 'Face Earth', 'Face the lander', 'Look up', 'Show paths', 'Hide the words']) expect(screen.getByRole('button', { name })).toBeTruthy();
    // Today's card waits under More: where you stand, what to watch, the better day, the ways on and the help.
    expect(screen.queryByText(watchNext(st.series!, st.power, st.startUtc, 10))).toBeNull();
    expect(document.getElementById('stand-card')).toBeNull();
    const more = screen.getByRole('button', { name: 'More' });
    expect(more.getAttribute('aria-expanded')).toBe('false');
    // Opened while the first step shows over the view.
    await firstStep();
    openCard();
    expect(screen.getByRole('button', { name: 'Less' }).getAttribute('aria-expanded')).toBe('true');
    // Where you stand, and what is measured and what is added: "Hills: NASA height data." (or, without NASA
    // heights, "Ground drawn flat: no NASA heights here.") and "Small craters and rocks: added to look real."
    expect(screen.getByText(/^Standing at de\sGerlache\sRim\s2, near the Moon's south pole\. (Hills: NASA height data|Ground drawn flat: no NASA heights here)\. Small craters and rocks: added to look real\.$/)).toBeTruthy();
    // What to watch waits while the first step shows, as it says what the first step says (20.1).
    const watch = watchNext(st.series!, st.power, '2027-01-01T00:00:00', 10);
    expect(screen.queryByText(watch)).toBeNull();
    // The better landing day says why, as a comparison: the power and the radio from that landing, to the hour, as
    // the headline gives its spans and the home page's forecast gives this landing ("12 days 15 hours").
    // In the card (the next step's row on the plate carries the same words from 768 px, 18.3).
    const better = within(document.getElementById('stand-card')!).getByRole('link', { name: /^Try 20 January instead: power for 12\sdays\s15\shours, radio for 3\sdays\s5\shours$/ });
    // Each span on one line, as the headline's (no-break spaces), so "hours" never wraps onto a line of its own; a chevron
    // ends it, as the row's from 768 px (19.4), out of its name.
    expect(better.textContent).toBe('Try 20 January instead: power for 12 days 15 hours, radio for 3 days 5 hours ›');
    expect(better.getAttribute('href')).toMatch(/^\/explore\/stand\?site=de_gerlache_rim_2&start=2027-01-20/);
    expect(within(document.getElementById('stand-card')!).getByRole('link', { name: 'Change date' }).getAttribute('href')).toBe('/explore?site=de_gerlache_rim_2&start=2027-01-01&days=30');
    // So does the help line.
    expect(screen.queryByText(HELP)).toBeNull();
    // The reasons wait under "Why this happens".
    expect(screen.queryByText(/^Near the Moon's south pole the Sun never climbs high/)).toBeNull();
    expect(screen.queryByText('How we know this')).toBeNull();
    expect(screen.getByRole('slider', { name: 'Time' })).toBeTruthy();
    // No chart above it here: the time bar carries the dates, the hours the lander is off, and those it can radio home.
    expect(screen.getByTestId('dates').querySelectorAll('[data-date]').length).toBeGreaterThan(3);
    expect(screen.getByText('lander off')).toBeTruthy();
    // The key names only what the bar draws: here no radio contact while the lander has power, only the
    // contact after the night, if it survives it.
    expect(screen.queryByText('radio contact')).toBeNull();
    expect(screen.getByText('radio, if the lander survives the cold')).toBeTruthy();
    // The key moments are flags on the time bar, not a panel of their own.
    expect(screen.queryByRole('group', { name: 'Key moments' })).toBeNull();
    for (const m of keyMoments(st.series!, st.power, st.startUtc)) expect(screen.getByRole('button', { name: `${m.label}, ${m.day}` })).toBeTruthy();
    // The view opens 35 degrees left of the Sun, the Sun near its right edge: on the compass strip and the phone's note.
    const facing = compassWord((st.series!.sunAz[10] - 35 + 360) % 360);
    expect(screen.getByText(`Facing ${facing}`)).toBeTruthy();
    // On a phone the site's name goes with it, as the status line there leaves it out.
    expect(screen.getByText(`de Gerlache Rim 2, facing ${facing}`)).toBeTruthy();
    // The compass strip names the eight points along the horizon.
    await waitFor(() => expect(screen.getAllByText('N').length).toBeGreaterThan(0));
    for (const point of ['NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']) expect(screen.getAllByText(point).length).toBeGreaterThan(0);
    expect(document.querySelector('.theme-dark')).toBeTruthy();
    // The first drag takes the first step: the card gives what to watch and the help line, in its order.
    await drag();
    expect(document.querySelector('[data-caption]')).toBeNull();
    const card = document.getElementById('stand-card')!;
    const shown = [within(card).getByText(/^Standing at /), within(card).getByText(watch), better, within(card).getByText(HELP)];
    for (let k = 1; k < shown.length; k++) expect(shown[k - 1].compareDocumentPosition(shown[k]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('gives the reasons one at a time under "Why this happens", where the site lies and the pole first, the radio story after the whys and how we know last, then folds them away', async () => {
    await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10');
    openCard();
    const why = screen.getByRole('button', { name: /^Why this happens/ });
    expect(why.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(why);
    // The same button, still named for what it holds, now open: nothing beside it moves.
    expect(screen.getByRole('button', { name: /^Why this happens/ }).getAttribute('aria-expanded')).toBe('true');
    // Where the site lies first, then the pole: both readers of read 12 asked for the pole first. One reason at
    // a time, so the card never scrolls inside itself.
    const first = document.querySelector('[data-reason]')!.textContent!;
    expect(first.startsWith('de Gerlache Rim 2 lies at 88.3° S.')).toBe(true);
    expect(screen.queryByText(/^Earth hangs almost still in the Moon's sky/)).toBeNull();
    const count = screen.getByText(/^1 of \d+$/);
    const n = Number(count.textContent!.split(' of ')[1]);
    expect((screen.getByRole('button', { name: 'Previous reason' }) as HTMLButtonElement).disabled).toBe(true);
    const seen: string[] = [first];
    for (let k = 1; k < n; k++) {
      fireEvent.click(screen.getByRole('button', { name: 'Next reason' }));
      expect(screen.getByText(`${k + 1} of ${n}`)).toBeTruthy();
      seen.push(document.querySelector('[data-reason]')!.textContent!);
    }
    expect((screen.getByRole('button', { name: 'Next reason' }) as HTMLButtonElement).disabled).toBe(true);
    expect(seen[1]).toMatch(/^Near the Moon's south pole the Sun circles the sky once a month/);
    const all = seen.join(' | ');
    expect(all).toMatch(/Earth hangs almost still in the Moon's sky/);
    expect(all).toMatch(/With no air to scatter sunlight, the sky stays black by day/);
    // The radio story after the whys, without repeating the headline: when power and Earth first meet.
    expect(seen.at(-2)).toBe('The first day the lander has both power and a view of Earth is 20 January.');
    // How we know comes last, open on its page.
    expect(seen.at(-1)).toMatch(/^How we know this/);
    await waitFor(() => expect(screen.getAllByText(/small craters underfoot are drawn, not measured\./).length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole('button', { name: 'Previous reason' }));
    expect(screen.getByText(`${n - 1} of ${n}`)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Why this happens/ }));
    expect(screen.queryByRole('button', { name: 'Next reason' })).toBeNull();
    // Opened again, it starts from the first reason.
    fireEvent.click(screen.getByRole('button', { name: /^Why this happens/ }));
    expect(screen.getByText(`1 of ${n}`)).toBeTruthy();
  });

  // The two readers of read 12 disagreed on paging: one asked for a way to read all the reasons as one list.
  it('lists all the reasons at once on "Show all reasons", in the same order, and goes back to one at a time', async () => {
    await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10');
    openCard();
    fireEvent.click(screen.getByRole('button', { name: /^Why this happens/ }));
    const n = Number(screen.getByText(/^1 of \d+$/).textContent!.split(' of ')[1]);
    const card = screen.getByRole('region', { name: 'The answer for this site' });
    expect(within(card).queryByRole('list')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show all reasons' }));
    // One list, every reason in it, in order, and no pager.
    const items = within(within(card).getByRole('list')).getAllByRole('listitem');
    expect(items).toHaveLength(n);
    expect(items[0].textContent!.startsWith('de Gerlache Rim 2 lies at 88.3° S.')).toBe(true);
    expect(items[1].textContent).toMatch(/^Near the Moon's south pole the Sun circles the sky once a month/);
    expect(items.at(-1)!.textContent).toMatch(/^How we know this/);
    expect(screen.queryByRole('button', { name: 'Next reason' })).toBeNull();
    expect(screen.queryByText(/^\d+ of \d+$/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'One at a time' }));
    expect(within(card).queryByRole('list')).toBeNull();
    expect(screen.getByText(`1 of ${n}`)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Show all reasons' })).toBeTruthy();
  });

  it('keeps the links where they are when the reasons open: the better day on its own row, the why and the way back on the next', async () => {
    await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10');
    openCard();
    const better = await within(document.getElementById('stand-card')!).findByRole('link', { name: /^Try 20 January instead/ });
    expect(better.parentElement!.querySelectorAll('a, button').length).toBe(1);
    const why = screen.getByRole('button', { name: /^Why this happens/ });
    const back = within(document.getElementById('stand-card')!).getByRole('link', { name: 'Change date' });
    const row = why.parentElement!;
    expect(back.parentElement).toBe(row);
    fireEvent.click(why);
    const after = screen.getByRole('button', { name: /^Why this happens/ });
    expect(after.parentElement).toBe(row);
    expect([...row.children].indexOf(after)).toBeLessThan([...row.children].indexOf(within(document.getElementById('stand-card')!).getByRole('link', { name: 'Change date' })));
  });

  it('labels the Sun and Earth as Explore does, and follows the time', async () => {
    const { store } = await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10');
    const series = store.getState().series!;
    // The labels on the sky (the compass's end chips may say the same).
    const sky = (body: 'sun' | 'earth') => document.querySelector(`[data-sky="${body}"]`)?.textContent;
    await waitFor(() => expect(sky('sun')).toBe(skyLabel('sun', series, 10)));
    expect(sky('earth')).toBe(skyLabel('earth', series, 10));
    act(() => store.getState().setCursor(300));
    await waitFor(() => expect(screen.getByText(asRead(statusLine(series, store.getState().power, store.getState().startUtc, 300, store.getState().params.power.batteryWh).text))).toBeTruthy());
    expect(sky('sun')).toBe(skyLabel('sun', series, 300));
  });

  it('clamps an hour beyond the period to its last hour', async () => {
    const { store } = await open('?site=de_gerlache_rim_2&start=2027-01-01&days=14&hour=99999');
    expect(store.getState().cursorHour).toBe(14 * 24 - 1);
  });

  it('opens a site without polar terrain on flat ground, and says so', async () => {
    await open('?site=blue_ghost_m1&start=2025-03-02T09:00&days=14&hour=0');
    openCard();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Landing on 2 March: power for all 14\u00a0days, radio all the while');
    fireEvent.click(screen.getByRole('button', { name: /^Why this happens/ }));
    // How we know comes last among the reasons.
    while (!(screen.getByRole('button', { name: 'Next reason' }) as HTMLButtonElement).disabled) fireEvent.click(screen.getByRole('button', { name: 'Next reason' }));
    await waitFor(() => expect(screen.getAllByText(/the ground here is drawn flat/).length).toBeGreaterThan(0));
  });

  // With the terrain files the browser loads (the south cap for every site): a site far from the pole must not
  // stand on a crop of the cap's edge.
  async function openWithTerrain(search: string) {
    let scene: StandScene | null = null;
    window.history.replaceState(null, '', `/explore/stand${search}`);
    const store = createExploreStore(terrainFileLoaders());
    render(
      <StandView
        store={store}
        createRenderer={(_canvas, sc) => {
          scene = sc;
          return stub();
        }}
      />,
    );
    await waitFor(() => expect(scene).not.toBeNull(), { timeout: 30_000 });
    return { store, scene: scene! as StandScene };
  }

  it.skipIf(!terrainPresent)('opens a site far from the pole on flat ground, with the polar terrain loaded too, and says so', async () => {
    const { scene } = await openWithTerrain('?site=blue_ghost_m1&start=2025-03-02T09:00&days=14&hour=0');
    expect(scene.field.levels.length).toBe(0);
    openCard();
    expect(screen.getByText(/Ground drawn flat: no NASA heights here\./)).toBeTruthy();
  }, 40_000);

  it.skipIf(!terrainPresent)('stands a polar site on its NASA heights, the window finest', async () => {
    const { scene } = await openWithTerrain('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=0');
    expect(scene.field.levels.length).toBeGreaterThanOrEqual(2);
    expect(Math.min(...scene.field.levels.map((l) => l.cell))).toBe(20);
    openCard();
    expect(screen.getByText(/Hills: NASA height data\./)).toBeTruthy();
  }, 40_000);

  it('falls back to the horizon chart, with the same words, when the renderer cannot start', async () => {
    const { store } = await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10', () => {
      throw new Error('WebGL 2 is not available');
    });
    await waitFor(() => expect(screen.getByText(/This browser cannot draw the view from the site/)).toBeTruthy());
    expect(screen.getByRole('img', { name: /^The view all round the site/ })).toBeTruthy();
    // The note describes the view from the site, which the fallback does not show.
    openCard();
    fireEvent.click(screen.getByRole('button', { name: /^Why this happens/ }));
    while (!(screen.getByRole('button', { name: 'Next reason' }) as HTMLButtonElement).disabled) fireEvent.click(screen.getByRole('button', { name: 'Next reason' }));
    expect(screen.queryByText(/How we know this/)).toBeNull();
    const st = store.getState();
    // On the plate, as the card (open here) gives it again for a phone.
    const plate = screen.getByRole('button', { name: 'Less' }).closest<HTMLElement>('[data-plate]')!;
    expect(within(plate).getByText(asRead(statusLine(st.series!, st.power, st.startUtc, 10, st.params.power.batteryWh).text))).toBeTruthy();
  });

  it('falls back to the horizon chart when the view’s shaders fail to build, a shader fails while drawing, or the graphics context is lost', async () => {
    const fallback = /This browser cannot draw the view from the site/;
    // The shaders fail to build: the renderer's ready promise rejects.
    await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10', () => ({ ...stub(), ready: new Promise<void>((_, no) => setTimeout(() => no(new Error('A shader did not compile')), 10)) }));
    await waitFor(() => expect(screen.getByText(fallback)).toBeTruthy(), { timeout: 10_000 });
    cleanup();
    // A shader fails on its first use, after the view was ready: the renderer says so through onLost.
    const r: RendererLike = stub();
    await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10', () => r);
    await waitFor(() => expect(r.onLost).toBeTypeOf('function'));
    act(() => r.onLost!('A shader of the view did not compile'));
    await waitFor(() => expect(screen.getByText(fallback)).toBeTruthy(), { timeout: 10_000 });
    cleanup();
    // The graphics context is lost (a driver reset): nothing would ever draw again.
    await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10');
    const canvas = await waitFor(() => {
      const c = document.querySelector('canvas');
      expect(c).not.toBeNull();
      return c!;
    });
    act(() => {
      canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    });
    await waitFor(() => expect(screen.getByText(fallback)).toBeTruthy(), { timeout: 10_000 });
    // The words stay, as with any fallback.
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/^Landing on 1 January/);
  });

  it('lands on the better day in place, keeping the lander the visitor set and the drawing quality, and the address follows', async () => {
    window.history.replaceState(null, '', '/explore/stand?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10&quality=fast');
    const store = createExploreStore(fileLoaders());
    render(<StandView store={store} createRenderer={() => stub()} />);
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/^Landing on 1 January/), { timeout: 20_000 });
    // A lander of the visitor's own: a bigger battery than the default.
    act(() => store.getState().setPower({ batteryWh: store.getState().params.power.batteryWh * 3 }));
    const battery = store.getState().params.power.batteryWh;
    openCard();
    const better = await within(document.getElementById('stand-card')!).findByRole('link', { name: /^Try \d+ January instead/ });
    const start = new URL(better.getAttribute('href')!, 'http://x').searchParams.get('start')!;
    fireEvent.click(better);
    // The same page, the new period: the lander is the visitor's still, and the view opens again from its first hour.
    await waitFor(() => expect(store.getState().startUtc.slice(0, 10)).toBe(start.slice(0, 10)));
    expect(store.getState().params.power.batteryWh).toBe(battery);
    expect(store.getState().cursorHour).toBe(0);
    expect(screen.getByRole('heading', { level: 1 }).textContent).not.toMatch(/^Landing on 1 January/);
    const q = new URLSearchParams(window.location.search);
    expect(q.get('start')!.slice(0, 10)).toBe(start.slice(0, 10));
    expect(q.get('hour')).toBe('0');
    expect(q.get('quality')).toBe('fast');
  });

  it('turns the view at once, with no camera flight, when the visitor asks for reduced motion', async () => {
    const was = window.matchMedia;
    window.matchMedia = ((q: string) => ({ matches: q.includes('reduce'), media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
    try {
      const r = stub();
      const { store } = await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10', () => r);
      await waitFor(() => expect(r.setView).toHaveBeenCalled());
      const before = r.setView.mock.calls.length;
      fireEvent.click(screen.getByRole('button', { name: 'Face the lander' }));
      await waitFor(() => expect(r.setView.mock.calls.length).toBeGreaterThan(before));
      // The first frame after the press already faces the lander: no frames on the way.
      const want = (store.getState().series!.sunAz[10] - 40 + 360) % 360;
      expect(Math.abs(((r.setView.mock.calls[before][0] - want + 540) % 360) - 180)).toBeLessThan(0.01);
    } finally {
      window.matchMedia = was;
    }
  });

  it('keeps one renderer while the time moves', async () => {
    let made = 0;
    const { store } = await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10', () => {
      made++;
      return stub();
    });
    await waitFor(() => expect(made).toBe(1));
    act(() => store.getState().setCursor(40));
    act(() => store.getState().setCursor(41));
    await waitFor(() => expect(screen.getByText(asRead(statusLine(store.getState().series!, store.getState().power, store.getState().startUtc, 41, store.getState().params.power.batteryWh).text))).toBeTruthy());
    expect(made).toBe(1);
  });

  it('zooms with two fingers: spreading them narrows the view', async () => {
    const r = stub();
    await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10', () => r);
    await waitFor(() => expect(r.setView).toHaveBeenCalled());
    const canvas = screen.getByRole('application');
    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerDown(canvas, { pointerId: 2, clientX: 200, clientY: 100 });
    fireEvent.pointerMove(canvas, { pointerId: 2, clientX: 300, clientY: 100 });
    fireEvent.pointerUp(canvas, { pointerId: 2 });
    fireEvent.pointerUp(canvas, { pointerId: 1 });
    // The fingers moved twice as far apart: the view is half as wide (60° to 30°).
    await waitFor(() => expect(r.setView.mock.calls.at(-1)![2]).toBeCloseTo(30, 0));
  });

  it('does not promise radio contact while the lander is off', async () => {
    const { store } = await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=219');
    const st = store.getState();
    expect(landerState(st.power, st.startUtc, 219).on).toBe(false);
    expect(st.series!.earthVisible[219]).toBe(1);
    expect(screen.getByText(/^Power off: the battery ran out on 4 January\. Earth is in view, but the radio has no power\.$/)).toBeTruthy();
  });

  // The judge of reads 11 and 12 asked for the battery's level in the view, as on the forecast page.
  it('gives the battery’s level in the lander’s line while it has power', async () => {
    await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10');
    // Found as Testing Library reads it; on the page the percentage keeps its sign on its line.
    // After the site's name, on a wide screen: the line's own words start with the power.
    expect(screen.getByText(/^Power on, battery 100 %\./).textContent).toMatch(/\. Power on, battery 100\u00a0%\./);
  });

  it('hides the words, the buttons, the labels and the compass for a clean view, keeping a bare time bar with the moments as dots, and brings them back', async () => {
    await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10');
    await waitFor(() => expect(screen.getByText(starLabel('Sirius')).hidden).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Hide the words' }));
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    for (const name of ['Face the Sun', 'Face Earth', 'Face the lander', 'Look up']) expect(screen.queryByRole('button', { name })).toBeNull();
    expect(screen.getByRole('slider', { name: 'Time' })).toBeTruthy();
    // Nothing over the picture but the bare time bar: no labels, no compass, no key, and the key moments
    // only as dots, their words kept for screen readers, so a class can still be taken from one to the next.
    await waitFor(() => expect(screen.getByText(starLabel('Sirius')).hidden).toBe(true));
    for (const el of screen.getAllByText(/^Facing /)) expect(el.closest('[hidden]')).not.toBeNull();
    expect(screen.queryByText('lander off')).toBeNull();
    const dots = within(screen.getByRole('group', { name: 'Jump to a moment' })).getAllByRole('button');
    expect(dots.length).toBeGreaterThan(0);
    for (const b of dots) expect(b.querySelector('span')!.classList.contains('sr-only')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Show the words' }));
    expect(screen.getByRole('heading', { level: 1 })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Face Earth' })).toBeTruthy();
  });

  it('moves the focus to "Show the words" when the words hide, and back to "Hide the words" when they show, or to More below 768 px', async () => {
    await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10');
    // From 768 px (jsdom's window is 1024 px wide) the row's button hides the words, and has the focus back after.
    const hide = screen.getByRole('button', { name: 'Hide the words' });
    hide.focus();
    fireEvent.click(hide);
    const show = screen.getByRole('button', { name: 'Show the words' });
    expect(document.activeElement).toBe(show);
    fireEvent.click(show);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Hide the words' }));
    cleanup();
    // Below 768 px the row's copy is hidden: the card's hides the words, and the focus comes back to More, reading Less
    // as the card is open.
    const was = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true });
    try {
      await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10');
      openCard();
      const inCard = screen.getAllByRole('button', { name: 'Hide the words' }).find((b) => b.classList.contains('md:hidden'))!;
      inCard.focus();
      fireEvent.click(inCard);
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Show the words' }));
      fireEvent.click(screen.getByRole('button', { name: 'Show the words' }));
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Less' }));
    } finally {
      Object.defineProperty(window, 'innerWidth', { value: was, configurable: true });
    }
  });

  it('turns to the lander, which stands 40° to the left of the Sun of the hour the view opened on (on a wide screen)', async () => {
    const r = stub();
    const { store } = await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10', () => r);
    await waitFor(() => expect(r.setView).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Face the lander' }));
    const want = (store.getState().series!.sunAz[10] - 40 + 360) % 360;
    const near = () => Math.abs(((r.setView.mock.calls.at(-1)![0] - want + 540) % 360) - 180) < 1;
    await waitFor(() => expect(near()).toBe(true), { timeout: 4000 });
    // It settles there, not just passes through on the way somewhere else.
    await new Promise((done) => setTimeout(done, 700));
    expect(near()).toBe(true);
    // Zoomed in on it, the compass says so, and its parts carry their names.
    expect(screen.getByText(/^Facing [a-z-]+, zoomed in$/)).toBeTruthy();
    expect(screen.getByText(/^de Gerlache Rim 2, facing [a-z-]+, zoomed in$/)).toBeTruthy();
    for (const part of ['Solar panel', 'Radio dish', 'Power light: on']) expect(screen.getByText(part).hidden).toBe(false);
  });

  it('places the lander by the hour the view opens on: at night on Earth, 22° to its left, so the narrower view holds both', async () => {
    const r = stub();
    const { store } = await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=219', () => r);
    const st = store.getState();
    expect(st.series!.sunFraction[219]).toBe(0);
    expect(st.series!.earthVisible[219]).toBe(1);
    await waitFor(() => expect(r.setView).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Face the lander' }));
    const want = (st.series!.earthAz[219] - 22 + 360) % 360;
    const near = () => Math.abs(((r.setView.mock.calls.at(-1)![0] - want + 540) % 360) - 180) < 1;
    await waitFor(() => expect(near()).toBe(true), { timeout: 4000 });
  });

  it('looks up at the sky clear of the ground, says why the stars show there and not in Apollo\u2019s photographs, and turns "Look up" into "Look ahead"', async () => {
    const r = stub();
    await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10', () => r);
    await waitFor(() => expect(r.setView).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Look up' }));
    expect(screen.queryByRole('button', { name: 'Look up' })).toBeNull();
    // 50° up with 62° from top to bottom: the bottom edge 19° up, above the hills and any slope beside you.
    await waitFor(() => expect(r.setView.mock.calls.at(-1)![2]).toBeCloseTo(62, 0), { timeout: 4000 });
    await waitFor(() => expect(r.setView.mock.calls.at(-1)![1]).toBeCloseTo(50, 0), { timeout: 4000 });
    expect(r.setView.mock.calls.at(-1)![1] - r.setView.mock.calls.at(-1)![2] / 2).toBeGreaterThan(15);
    expect(screen.getByText(viewCaption('up', 88.28))).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Look ahead' }));
    expect(screen.getByRole('button', { name: 'Look up' })).toBeTruthy();
    expect(screen.queryByText(viewCaption('up', 88.28))).toBeNull();
  });

  it("jumps to a key moment from its flag on the time bar, turns to what it is about and says why", async () => {
    const r = stub();
    const { store } = await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10', () => r);
    await waitFor(() => expect(r.setView).toHaveBeenCalled());
    const st0 = store.getState();
    const m = keyMoments(st0.series!, st0.power, st0.startUtc).find((x) => x.kind === 'battery-out')!;
    fireEvent.click(screen.getByRole('button', { name: `${m.label}, ${m.day}` }));
    const st = store.getState();
    expect(st.power!.powered[st.cursorHour]).toBe(0);
    expect(st.power!.powered[st.cursorHour - 1]).toBe(1);
    // The battery runs out: the view turns to the lander, placed by the hour the view opened on, and a line over the
    // view says why.
    const want = (st.series!.sunAz[10] - 40 + 360) % 360;
    await waitFor(() => expect(Math.abs(((r.setView.mock.calls.at(-1)![0] - want + 540) % 360) - 180)).toBeLessThan(1), { timeout: 4000 });
    expect(screen.getByText(momentCaption(m.kind, st.series!, m.hour, -88.28))).toBeTruthy();
  });

  it('turns to Earth, narrower, from the flag where Earth sets, as from the one where it rises', async () => {
    const r = stub();
    const { store } = await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10', () => r);
    await waitFor(() => expect(r.setView).toHaveBeenCalled());
    const st = store.getState();
    const m = keyMoments(st.series!, st.power, st.startUtc).find((x) => x.kind === 'earth-out')!;
    const off = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
    // Earth sets 16° from the Sun: a view turned to the Sun, wide, would show it small at the side.
    expect(off(st.series!.sunAz[m.hour], st.series!.earthAz[m.hour])).toBeGreaterThan(10);
    fireEvent.click(screen.getByRole('button', { name: `${m.label}, ${m.day}` }));
    await waitFor(() => expect(off(r.setView.mock.calls.at(-1)![0], st.series!.earthAz[m.hour])).toBeLessThan(1), { timeout: 4000 });
    expect(r.setView.mock.calls.at(-1)![2]).toBeCloseTo(16, 0);
    expect(screen.getByText(momentCaption(m.kind, st.series!, m.hour, -88.28))).toBeTruthy();
  });

  // A key moment the time moves past (Play, the slider, a key) says why, as its flag does, but leaves the view
  // where the visitor turned it.
  it('says why when the time moves forward across a key moment, by the slider’s arrow key too, without turning the view', async () => {
    const r = stub();
    const { store } = await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10', () => r);
    await waitFor(() => expect(r.setView).toHaveBeenCalled());
    const st = store.getState();
    const moments = keyMoments(st.series!, st.power, st.startUtc);
    const slider = screen.getByRole('slider', { name: 'Time' });
    // More than two days at once, as End jumps to the last hour: every moment passed, and none said.
    fireEvent.keyDown(slider, { key: 'End' });
    expect(store.getState().cursorHour).toBe(st.series!.hours - 1);
    for (const x of moments) expect(screen.queryByText(momentCaption(x.kind, st.series!, x.hour, -88.28))).toBeNull();
    // From the hour before the battery runs out, one hour on.
    const m = moments.find((x) => x.kind === 'battery-out')!;
    act(() => store.getState().setCursor(m.hour - 1));
    const yaw = r.setView.mock.calls.at(-1)![0];
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Time' }), { key: 'ArrowRight' });
    expect(store.getState().cursorHour).toBe(m.hour);
    expect(screen.getByText(momentCaption(m.kind, st.series!, m.hour, -88.28))).toBeTruthy();
    // The view stays where it was, where the battery's flag would turn it to the lander.
    await new Promise((done) => setTimeout(done, 300));
    expect(r.setView.mock.calls.at(-1)![0]).toBeCloseTo(yaw, 6);
  });

  it('shows the first step over the view on arrival, Play and drag, phone-short below 640 px, until the first drag', async () => {
    await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10');
    // On the line over the view, once the ground has drawn (19.2).
    const plate = await waitFor(
      () => {
        const p = document.querySelector<HTMLElement>('[data-caption]');
        expect(p).not.toBeNull();
        return p!;
      },
      { timeout: 10_000 },
    );
    // The line twice, one shown per width: display: none keeps the other from a screen reader.
    expect(within(plate).getByText(FIRST_STEP).className).toBe('max-sm:hidden');
    expect(within(plate).getByText(FIRST_STEP_PHONE).className).toBe('sm:hidden');
    // The time moved by hand is not a step into the view: one hour on by the slider's arrow key, past no key moment.
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Time' }), { key: 'ArrowRight' });
    expect(within(document.querySelector<HTMLElement>('[data-caption]')!).getByText(FIRST_STEP)).toBeTruthy();
    // The first drag is a step: the line goes, and by day nothing else takes the plate.
    const view = screen.getByRole('application');
    fireEvent.pointerDown(view, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(view, { pointerId: 1, clientX: 140, clientY: 100 });
    fireEvent.pointerUp(view, { pointerId: 1 });
    expect(document.querySelector('[data-caption]')).toBeNull();
  });

  it('the first Play clears the first step for good', async () => {
    await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10');
    await waitFor(() => expect(document.querySelector('[data-caption]')?.textContent).toContain(FIRST_STEP), { timeout: 10_000 });
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(document.querySelector('[data-caption]')).toBeNull();
    // Paused, then turned to the Sun: no line over the view, the first step gone for the visit.
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    fireEvent.click(screen.getByRole('button', { name: 'Face the Sun' }));
    expect(document.querySelector('[data-caption]')).toBeNull();
  });

  it('a key moment’s line replaces the first step, and it does not come back when the line goes', async () => {
    const { store } = await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10');
    await waitFor(() => expect(document.querySelector('[data-caption]')?.textContent).toContain(FIRST_STEP), { timeout: 10_000 });
    const st = store.getState();
    const m = keyMoments(st.series!, st.power, st.startUtc).find((x) => x.kind === 'battery-out')!;
    fireEvent.click(screen.getByRole('button', { name: 'Battery runs out, 4 Jan' }));
    expect(document.querySelector('[data-caption]')!.textContent).toBe(momentCaption(m.kind, st.series!, m.hour, -88.28));
    // Turned to the Sun, the moment's line goes and the night's own line takes the plate, not the first step.
    fireEvent.click(screen.getByRole('button', { name: 'Face the Sun' }));
    expect(document.querySelector('[data-caption]')!.textContent).toBe(viewCaption('dark', -88.28));
    expect(screen.queryByText(FIRST_STEP)).toBeNull();
  });

  it('with reduced motion the first step is the drag alone, as Play is off', async () => {
    const was = window.matchMedia;
    window.matchMedia = ((q: string) => ({ matches: q.includes('reduce'), media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
    try {
      await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10');
      await waitFor(() => expect(document.querySelector('[data-caption]')).not.toBeNull(), { timeout: 10_000 });
      expect(document.querySelector('[data-caption]')!.textContent).toBe(FIRST_STEP_STILL);
      expect(screen.queryByText(/Press Play/)).toBeNull();
      expect((screen.getByRole('button', { name: 'Play' }) as HTMLButtonElement).disabled).toBe(true);
    } finally {
      window.matchMedia = was;
    }
  });

  it('with reduced motion today’s card names Next for what to watch, and not Play, as Play is off (spec 20.1, 21.1)', async () => {
    const was = window.matchMedia;
    window.matchMedia = ((q: string) => ({ matches: q.includes('reduce'), media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
    try {
      const { store } = await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10');
      await waitFor(() => expect(document.querySelector('[data-caption]')?.textContent).toBe(FIRST_STEP_STILL), { timeout: 10_000 });
      await drag();
      openCard();
      const card = document.getElementById('stand-card')!;
      expect(within(card).queryAllByText(/Press Play/)).toHaveLength(0);
      const st = store.getState();
      const watch = watchNext(st.series!, st.power, st.startUtc, 10, true);
      expect(watch.startsWith(`${WATCH_LEAD_STILL} the Sun sets`)).toBe(true);
      // Once, the same at every width.
      expect(within(card).getAllByText(watch)).toHaveLength(1);
      expect((screen.getByRole('button', { name: 'Play' }) as HTMLButtonElement).disabled).toBe(true);
    } finally {
      window.matchMedia = was;
    }
  });

  it('shows no first step while the ground builds', async () => {
    let finish = () => {};
    const ready = new Promise<void>((done) => (finish = done));
    const r = { ...stub(), ready };
    await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10', () => r);
    await waitFor(() => expect(r.resize).toHaveBeenCalled());
    expect(screen.getByText('Building the ground from NASA heights…')).toBeTruthy();
    // Nothing over the empty view while it builds: the first step waits for the ground.
    await new Promise((done) => setTimeout(done, 100));
    expect(document.querySelector('[data-caption]')).toBeNull();
    await act(async () => finish());
    await waitFor(() => expect(document.querySelector('[data-caption]')?.textContent).toContain(FIRST_STEP));
  });

  it('names the lander where it stands, with its distance', async () => {
    await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10');
    await waitFor(() => expect(screen.getByText('The lander, 16 m away')).toBeTruthy());
  });

  it('says why the lander’s solar panel stands upright when the view turns to it', async () => {
    await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Face the lander' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Face the lander' }));
    // From where you stand the view sees the panel's back (the next test): one caption says both.
    expect(screen.getByText(landerCaption(-88.28, true))).toBeTruthy();
    expect(landerCaption(-88.28, true)).toMatch(/^Its panel stands upright for a Sun this low/);
  });

  // The final review found the row over the status line and its More from 768 to about 1070 px wide.
  it('puts the row at the top right only from 1280 px wide, above the time bar below that, and sizes the card by the status line it sits under', async () => {
    await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10');
    const row = screen.getByRole('group', { name: 'Look towards' });
    expect(row.className).toMatch(/\bmax-xl:fixed\b/);
    expect(row.parentElement!.className).toMatch(/\bxl:flex-row\b/);
    expect(row.parentElement!.className).not.toMatch(/\bmd:flex-row\b/);
    openCard();
    expect(document.getElementById('stand-card')!.className).toContain('var(--status-h');
    // The caption docks on the compass plate (18.3), which sits above the row wherever the row sits above the time bar.
    act(() => fireEvent.click(screen.getByRole('button', { name: 'Look up' })));
    expect(screen.getByText(viewCaption('up', 88.28)).className).toContain('max-xl:bottom-[calc(var(--bar-h,129px)+var(--look-h,52px)+93px)]');
  });

  it('docks the caption on the compass plate from 768 px, one plate at the foot of the view, and keeps its own plate on a phone (18.3)', async () => {
    await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10');
    fireEvent.click(screen.getByRole('button', { name: 'Face Earth' }));
    const cap = screen.getByText(viewCaption('earth', -88.28)).closest<HTMLElement>('[data-caption]')!;
    expect(cap).toBeTruthy();
    // Its foot where the compass plate's top is: 14 px over the bar, then the plate's 79 px (STRIP_H).
    for (const c of ['md:rounded-b-none', 'md:border-b-0', 'bottom-[calc(var(--bar-h,129px)+93px)]', 'max-xl:bottom-[calc(var(--bar-h,129px)+var(--look-h,52px)+93px)]', 'max-md:bottom-[calc(var(--bar-h,211px)+var(--look-h,52px)+12px)]', 'w-[min(460px,calc(100vw-32px))]']) expect(cap.className).toContain(c);
    // The compass plate knows a caption sits on it.
    expect(document.querySelector('[data-strip]')!.classList.contains('border-t-0')).toBe(true);
  });

  it('keeps the moment’s state whole at the plate’s foot: the dot by its first line, its lines even, More after the headline, on an opaque plate', async () => {
    const { store } = await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=219');
    const st = store.getState();
    const line = screen.getByText(asRead(statusLine(st.series!, st.power, st.startUtc, 219, st.params.power.batteryWh).text));
    const plate = line.closest<HTMLElement>('[data-plate]')!;
    // Opaque, so no guide line shows through it (both readers of read D1).
    expect(plate.classList.contains('bg-[#060607]')).toBe(true);
    // Two even lines, not a lone word on the second, the dot leading the first; More follows the headline's last line.
    expect(line.classList.contains('text-balance')).toBe(true);
    expect(screen.getByRole('button', { name: 'More' }).classList.contains('self-end')).toBe(true);
    expect(plate.querySelector('[data-tone]')!.classList.contains('self-start')).toBe(true);
  });

  it('on a phone keeps the site’s name and the row’s "Hide words" for a wider screen, puts the row above the time bar, and "Hide the words" in the card', async () => {
    await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10');
    expect(screen.getByText(/^de\sGerlache\sRim\s2\.$/).classList.contains('max-md:hidden')).toBe(true);
    expect(screen.getByRole('button', { name: 'Hide the words' }).classList.contains('max-md:hidden')).toBe(true);
    expect(screen.getByRole('group', { name: 'Look towards' }).className).toMatch(/\bmax-xl:fixed\b/);
    openCard();
    const inCard = screen.getAllByRole('button', { name: 'Hide the words' }).find((b) => b.classList.contains('md:hidden'))!;
    expect(inCard).toBeTruthy();
    // Button words on one line; the better day is a sentence, and wraps inside the card.
    expect(within(document.getElementById('stand-card')!).getByRole('link', { name: /^Try 20 January instead/ }).className).not.toMatch(/\bwhitespace-nowrap\b/);
    expect(screen.getByRole('button', { name: /Why this happens/ }).className).toMatch(/\bwhitespace-nowrap\b/);
    expect(within(document.getElementById('stand-card')!).getByRole('link', { name: 'Change date' }).className).toMatch(/\bwhitespace-nowrap\b/);
    // The card scrolls inside itself rather than run under the buttons and the time bar.
    expect(document.getElementById('stand-card')!.className).toMatch(/\boverflow-y-auto\b/);
    fireEvent.click(inCard);
    expect(screen.getByRole('button', { name: 'Show the words' })).toBeTruthy();
  });

  it('keeps the card open and the same whatever the view does', async () => {
    const { store } = await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10');
    const st = store.getState();
    // The first step taken, so the card has all its lines (20.1).
    await drag();
    openCard();
    const watch = watchNext(st.series!, st.power, st.startUtc, 10);
    expect(screen.getByText(watch)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Face the Sun' }));
    expect(screen.getByText(/^Standing at de\sGerlache/)).toBeTruthy();
    expect(screen.getByText(watch)).toBeTruthy();
    expect(within(document.getElementById('stand-card')!).getByRole('link', { name: /^Try 20 January instead/ })).toBeTruthy();
    // The moment's state, the card's first line on a phone (19.1).
    expect(within(document.getElementById('stand-card')!).getByText(asRead(statusLine(st.series!, st.power, st.startUtc, 10, st.params.power.batteryWh).text))).toBeTruthy();
  });

  it('keeps the next step in view from 768 px: the better day in gold with its radio, then Change, holding Change site, Change date, Change lander and Compare sites, and the card leaves its own gold and way on to that row', async () => {
    await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10');
    const row = screen.getByRole('group', { name: 'Next step' });
    // A phone keeps the row in today's card, under More: the scene keeps its 55 % (17.1).
    expect(row.className).toMatch(/\bmax-md:hidden\b/);
    // Inside the status's plate, under its line.
    expect(row.closest('[data-plate]')).toBe(screen.getByRole('button', { name: 'More' }).closest('[data-plate]'));
    // The radio as today's card gives it (18.3): the desktop and the card say the same.
    const gold = within(row).getByRole('link', { name: /^Try 20 January instead: power for 12\sdays\s15\shours, (radio for \d+\sdays\s\d+\shours|no radio contact)$/ });
    expect(gold.className).toContain('text-[#f6d48a]');
    // A chevron, as the phone's chip has, so the gold reads as a way on (read D3: the judge took it for a line of text).
    expect(gold.querySelector('[aria-hidden="true"]')!.textContent!.trim()).toBe('›');
    expect(gold.getAttribute('href')).toMatch(/^\/explore\/stand\?site=de_gerlache_rim_2&start=2027-01-20/);
    // The other ways on wait under Change (20.1).
    fireEvent.click(within(row).getByRole('button', { name: 'Change' }));
    expect(within(row).getByRole('link', { name: 'Change site' }).getAttribute('href')).toBe('/sites');
    expect(within(row).getByRole('link', { name: 'Change date' }).getAttribute('href')).toBe('/explore?site=de_gerlache_rim_2&start=2027-01-01&days=30');
    expect(within(row).getByRole('button', { name: 'Change lander' })).toBeTruthy();
    expect(within(row).getByRole('button', { name: 'Compare sites' }).className).not.toContain('text-[#f6d48a]');
    // One gold action on the screen: from 768 px the card's own better day and way on are hidden.
    openCard();
    const card = document.getElementById('stand-card')!;
    expect(within(card).getByRole('link', { name: /radio for/ }).closest('div')!.className).toMatch(/\bmd:hidden\b/);
    expect(within(card).getByRole('link', { name: 'Change date' }).className).toMatch(/\bmd:hidden\b/);
    expect(within(card).getByRole('button', { name: 'Change lander' }).className).toMatch(/\bmd:hidden\b/);
  });

  it('gathers the next step’s links under one Change from 768 px, the gold link left beside it (spec 20.1)', async () => {
    const { store } = await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10');
    const row = screen.getByRole('group', { name: 'Next step' });
    // Before a tap the row holds the gold link, then Change, and nothing else: the four ways to change wait under it.
    const gold = within(row).getByRole('link', { name: /^Try 20 January instead/ });
    const change = within(row).getByRole('button', { name: 'Change' });
    expect(within(row).getAllByRole('link')).toHaveLength(1);
    expect(within(row).getAllByRole('button')).toHaveLength(1);
    expect(gold.compareDocumentPosition(change) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(row).queryByRole('link', { name: 'Change site' })).toBeNull();
    expect(within(row).queryByRole('link', { name: 'Change date' })).toBeNull();
    expect(within(row).queryByRole('button', { name: 'Change lander' })).toBeNull();
    expect(within(row).queryByRole('button', { name: 'Compare sites' })).toBeNull();
    // It looks as the row's links did: 40 px tall, 15 px, underlined, with a chevron for its state.
    for (const c of ['min-h-10', 'text-[15px]', 'underline']) expect(change.classList.contains(c)).toBe(true);
    expect(change.getAttribute('aria-expanded')).toBe('false');
    expect(change.querySelector('[aria-hidden="true"]')!.textContent).toBe('▾');
    const list = document.getElementById(change.getAttribute('aria-controls')!)!;
    expect(list.hidden).toBe(true);
    // Open, it shows the same ways in the same order and by the same names, in a plate of its own after Change, which
    // the sky's labels keep clear of: a disclosure of links and buttons, not an ARIA menu.
    fireEvent.click(change);
    expect(change.getAttribute('aria-expanded')).toBe('true');
    expect(change.querySelector('[aria-hidden="true"]')!.textContent).toBe('▴');
    expect(list.hidden).toBe(false);
    expect(list.hasAttribute('data-plate')).toBe(true);
    expect(list.classList.contains('bg-[#060607]')).toBe(true);
    expect(change.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect([...list.querySelectorAll('a, button')].map((el) => [el.tagName, el.textContent, el.getAttribute('href')])).toEqual([
      ['A', 'Change site', '/sites'],
      ['A', 'Change date', '/explore?site=de_gerlache_rim_2&start=2027-01-01&days=30'],
      ['BUTTON', 'Change lander', null],
      ['BUTTON', 'Compare sites', null],
    ]);
    for (const way of list.querySelectorAll('a, button')) for (const c of ['min-h-10', 'text-[15px]', 'underline']) expect(way.classList.contains(c)).toBe(true);
    expect(document.querySelector('[role="menu"], [role="menuitem"]')).toBeNull();
    // A press inside it keeps it open; Escape closes it and gives the focus back to Change.
    const date = within(list).getByRole('link', { name: 'Change date' });
    fireEvent.pointerDown(date);
    expect(list.hidden).toBe(false);
    date.focus();
    fireEvent.keyDown(date, { key: 'Escape' });
    expect(list.hidden).toBe(true);
    expect(change.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(change);
    // A press outside it closes it.
    fireEvent.click(change);
    fireEvent.pointerDown(document.body);
    expect(list.hidden).toBe(true);
    // So does the focus moving on past it, which it would otherwise cover, and the focus stays where it went.
    fireEvent.click(change);
    act(() => within(list).getByRole('button', { name: 'Compare sites' }).focus());
    const on = screen.getByRole('link', { name: 'Earthrise' });
    act(() => on.focus());
    expect(list.hidden).toBe(true);
    expect(document.activeElement).toBe(on);
    // So does a way chosen from it, here by the keyboard (the browser's own following of the link is left out).
    fireEvent.click(change);
    const site = within(list).getByRole('link', { name: 'Change site' });
    site.focus();
    const stay = (e: Event) => e.preventDefault();
    document.addEventListener('click', stay);
    try {
      fireEvent.click(site);
    } finally {
      document.removeEventListener('click', stay);
    }
    expect(list.hidden).toBe(true);
    // The focus waits on Change, not on a way the list has hidden.
    expect(document.activeElement).toBe(change);
    // Change lander opens the lander dialog in place, the list closing; when the dialog closes the focus is on Change.
    fireEvent.click(change);
    fireEvent.click(within(list).getByRole('button', { name: 'Change lander' }));
    expect(list.hidden).toBe(true);
    const dialog = await screen.findByRole('dialog', { name: 'The lander' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(change);
    // Compare sites adds the site to the comparison on the way there, as the gold one does.
    fireEvent.click(change);
    fireEvent.click(within(list).getByRole('button', { name: 'Compare sites' }));
    expect(list.hidden).toBe(true);
    await waitFor(() => expect(store.getState().compareIds).toContain('de_gerlache_rim_2'), { timeout: 10_000 });
    cleanup();
    // With no better day the gold is Compare sites, and Change holds the other three.
    await open('?site=de_gerlache_rim_2&start=2027-01-20&days=30&hour=10');
    const next = screen.getByRole('group', { name: 'Next step' });
    const compare = within(next).getByRole('button', { name: 'Compare sites' });
    expect(compare.className).toContain('text-[#f6d48a]');
    const other = within(next).getByRole('button', { name: 'Change' });
    expect(within(next).getAllByRole('button')).toHaveLength(2);
    expect(compare.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(other);
    expect([...document.getElementById(other.getAttribute('aria-controls')!)!.querySelectorAll('a, button')].map((el) => el.textContent)).toEqual(['Change site', 'Change date', 'Change lander']);
  }, 40_000);

  it('keeps the plate to 60 words before a tap at 1440 (spec 20.1)', async () => {
    await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10');
    // The headline, the gold link and Change, then the moment's state and the way to the evidence.
    const plate = screen.getByRole('button', { name: 'More' }).closest<HTMLElement>('[data-plate]')!;
    expect(visibleWords(plate, WIDE).length).toBeLessThanOrEqual(60);
  });

  it('links to Earthrise, How it works and Accuracy from 768 px on the plate, and in the card on a phone (19.3)', async () => {
    await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10');
    // The first step taken, so the help line the links sit above shows (20.1).
    await drag();
    openCard();
    const navs = screen.getAllByRole('navigation', { name: 'Sections' });
    expect(navs).toHaveLength(2);
    const plate = screen.getByRole('button', { name: 'Less' }).closest<HTMLElement>('[data-plate]')!;
    const card = document.getElementById('stand-card')!;
    // From 768 px at the end of the moment's state, the plate's last row; on a phone at the card's foot, before the drag line.
    const onPlate = navs.find((n) => plate.contains(n))!;
    expect(onPlate.parentElement).toBe(plate.lastElementChild);
    expect(onPlate.parentElement!.className).toMatch(/\bmax-md:hidden\b/);
    const inCard = navs.find((n) => card.contains(n))!;
    expect(inCard.className).toMatch(/\bmd:hidden\b/);
    expect(inCard.nextElementSibling!.textContent).toBe('Drag to look around; pinch or scroll to zoom.');
    for (const nav of [onPlate, inCard]) {
      expect([...nav.querySelectorAll('a')].map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
        ['Earthrise', '/'],
        ['How it works', '/learn'],
        ['Accuracy', '/validate'],
      ]);
      expect(nav.className).toContain('text-[14px]');
    }
  });

  it('keeps the status plate at its full width whatever the words, so More stays put as the night comes (18.3)', async () => {
    await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10');
    const plate = screen.getByRole('button', { name: 'More' }).closest('[data-plate]')!;
    expect(plate.className).toMatch(/\bw-full\b/);
    expect(plate.className).toContain('max-w-[860px]');
    expect(plate.className).not.toContain('md:w-fit');
  });

  it('on a phone puts the better day on the first screen as one gold chip under the plate, a link to that landing (18.3)', async () => {
    await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10');
    const chip = document.querySelector<HTMLAnchorElement>('a[data-chip]')!;
    expect(chip).toBeTruthy();
    expect(asRead(chip.textContent!)).toMatch(/^Try 20 Jan instead: power for 12 days 15 hours›$/);
    for (const c of ['md:hidden', 'min-h-8', 'text-[14px]', 'text-[#f6d48a]']) expect(chip.classList.contains(c)).toBe(true);
    // A plate, so no label of the sky sits on it and the view's room starts under it; it grows if its words wrap (19.4).
    expect(chip.hasAttribute('data-plate')).toBe(true);
    expect(chip.classList.contains('h-8')).toBe(false);
    expect(chip.getAttribute('href')).toMatch(/^\/explore\/stand\?site=de_gerlache_rim_2&start=2027-01-20(T\d\d:\d\d)?&days=30&hour=0$/);
    // Inside the answer's section, so the view's measured top (--top-h) takes it in.
    expect(chip.closest('section[aria-label="The answer for this site"]')).toBeTruthy();
    // It lands on the better day in place, as the row's link does.
    fireEvent.click(chip);
    await waitFor(() => expect(window.location.search).toMatch(/start=2027-01-20/), { timeout: 10_000 });
  });

  it('on a phone puts the chip away while today’s card is open, which carries the better day itself, and gives the card Change site and Compare sites (17.1; read D3)', async () => {
    await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10');
    expect(document.querySelector('a[data-chip]')).toBeTruthy();
    openCard();
    expect(document.querySelector('a[data-chip]')).toBeNull();
    const card = document.getElementById('stand-card')!;
    expect(within(card).getByRole('link', { name: 'Change site' }).getAttribute('href')).toBe('/sites');
    expect(within(card).getByRole('link', { name: 'Change site' }).className).toMatch(/\bmd:hidden\b/);
    expect(within(card).getByRole('button', { name: 'Compare sites' }).className).toMatch(/\bmd:hidden\b/);
    fireEvent.click(screen.getByRole('button', { name: 'Less' }));
    expect(document.querySelector('a[data-chip]')).toBeTruthy();
  });

  it('shows no chip when no landing day is better', async () => {
    await open('?site=de_gerlache_rim_2&start=2027-01-20&days=30&hour=10');
    expect(document.querySelector('a[data-chip]')).toBeNull();
  });

  it('leads what to watch with Play and Next, once, the same at every width, once the first step has gone (18.2, 20.1, 21.1)', async () => {
    await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10');
    // While the first step shows over the view, the card leaves the line out in both its forms, and the help line with it.
    await firstStep();
    openCard();
    expect(screen.queryAllByText(/^Press Play, or Next on the time bar/)).toHaveLength(0);
    expect(screen.queryByText(HELP)).toBeNull();
    // After the first drag, both.
    await drag();
    expect(screen.getByText(HELP)).toBeTruthy();
    const line = screen.getByText(/^Press Play, or Next on the time bar, to watch: the Sun sets/);
    expect(line.textContent!.startsWith(WATCH_LEAD)).toBe(true);
    // Once, shown at every width, and read as it is shown.
    expect(screen.getAllByText(/^Press Play, or Next on the time bar/)).toHaveLength(1);
    expect(line.className).not.toMatch(/hidden/);
    expect(line.getAttribute('aria-hidden')).toBeNull();
  });

  it('opens the lander dialog in place from Change lander under Change, the verdict follows the lander chosen there, the view keeps its renderer, and the focus comes back to Change (18.3, 20.1)', async () => {
    const setScene = vi.fn();
    const make = vi.fn(() => ({ ...stub(), setScene }));
    await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10', make);
    const before = screen.getByRole('heading', { level: 1 }).textContent;
    const row = screen.getByRole('group', { name: 'Next step' });
    const button = within(row).getByRole('button', { name: 'Change' });
    fireEvent.click(button);
    fireEvent.click(within(row).getByRole('button', { name: 'Change lander' }));
    const dialog = await screen.findByRole('dialog', { name: 'The lander' });
    const other = within(within(dialog).getByRole('radiogroup', { name: 'Lander' })).getAllByRole('radio').find((r) => !(r as HTMLInputElement).checked)!;
    fireEvent.click(other);
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 }).textContent).not.toBe(before), { timeout: 20_000 });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(button);
    // The new lander's scene is swapped into the renderer the view has, not drawn by a new one (the final review).
    await waitFor(() => expect(setScene).toHaveBeenCalled());
    expect(make).toHaveBeenCalledTimes(1);
  });

  it('on a phone, closing the lander dialog opened from today’s card gives the focus back to that button (the final review)', async () => {
    await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10');
    openCard();
    const button = within(document.getElementById('stand-card')!).getByRole('button', { name: 'Change lander' });
    fireEvent.click(button);
    const dialog = await screen.findByRole('dialog', { name: 'The lander' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(button);
  });

  it('opens with Brighter picture on from ?bright=1 and keeps it for the visit', async () => {
    window.sessionStorage.removeItem('earthrise-bright');
    const setBright = vi.fn();
    try {
      await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10&bright=1', () => ({ ...stub(), setBright }));
      // A capture or a rehearsal link opens bright with no press of the toggle: the renderer is told so, and the toggle says it.
      await waitFor(() => expect(setBright).toHaveBeenLastCalledWith(true));
      openCard();
      expect(screen.getByRole('button', { name: 'Brighter picture' }).getAttribute('aria-pressed')).toBe('true');
      // The tab keeps it, as if the toggle had been pressed.
      expect(window.sessionStorage.getItem('earthrise-bright')).toBe('1');
    } finally {
      window.sessionStorage.removeItem('earthrise-bright');
    }
  });

  it('opens with Brighter picture on from ?bright=1 even where storage is blocked', async () => {
    // A private window: nothing can be read or written, so the address alone has to say it.
    const real = Object.getOwnPropertyDescriptor(window, 'sessionStorage');
    Object.defineProperty(window, 'sessionStorage', {
      get() {
        throw new Error('blocked');
      },
      configurable: true,
    });
    try {
      await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10&bright=1');
      openCard();
      expect(screen.getByRole('button', { name: 'Brighter picture' }).getAttribute('aria-pressed')).toBe('true');
    } finally {
      // Put back what was there, so the tests after this one still have a storage.
      if (real) Object.defineProperty(window, 'sessionStorage', real);
      else Reflect.deleteProperty(window, 'sessionStorage');
    }
  });

  it('brightens the picture for projectors from today’s card, keeps it for the visit, and never throws without storage (18.3)', async () => {
    window.sessionStorage.removeItem('earthrise-bright');
    const setBright = vi.fn();
    await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10', () => ({ ...stub(), setBright }));
    await waitFor(() => expect(setBright).toHaveBeenLastCalledWith(false));
    openCard();
    const b = screen.getByRole('button', { name: 'Brighter picture' });
    expect(b.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(b);
    expect(b.getAttribute('aria-pressed')).toBe('true');
    // A toggle's words never change with its state.
    expect(b.textContent).toBe('Brighter picture');
    await waitFor(() => expect(setBright).toHaveBeenLastCalledWith(true));
    expect(window.sessionStorage.getItem('earthrise-bright')).toBe('1');
    cleanup();
    // Kept for the visit.
    await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10', () => ({ ...stub(), setBright }));
    openCard();
    expect(screen.getByRole('button', { name: 'Brighter picture' }).getAttribute('aria-pressed')).toBe('true');
    await waitFor(() => expect(setBright).toHaveBeenLastCalledWith(true));
    window.sessionStorage.removeItem('earthrise-bright');
    cleanup();
    // Storage blocked (a private window): the toggle still works for the page.
    const real = Object.getOwnPropertyDescriptor(window, 'sessionStorage');
    Object.defineProperty(window, 'sessionStorage', {
      get() {
        throw new Error('blocked');
      },
      configurable: true,
    });
    try {
      await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10');
      openCard();
      const again = screen.getByRole('button', { name: 'Brighter picture' });
      expect(again.getAttribute('aria-pressed')).toBe('false');
      fireEvent.click(again);
      expect(again.getAttribute('aria-pressed')).toBe('true');
    } finally {
      // Put back what was there, so the tests after this one still have a storage.
      if (real) Object.defineProperty(window, 'sessionStorage', real);
      else Reflect.deleteProperty(window, 'sessionStorage');
    }
  });

  it('turns the opening up to 30° towards the skyline’s highest point, the Sun and the lander kept in frame (18.4)', async () => {
    // First, with the site's own skyline, a daytime hour of the period at which the turn is not zero.
    const first = await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10');
    const st = first.store.getState();
    const mask = { az0: 0, step: 360 / st.mask!.length, el: st.mask! };
    const halfW = (Math.atan(Math.tan((60 * Math.PI) / 360) * (window.innerWidth / window.innerHeight)) * 180) / Math.PI;
    const turns = (h: number) => Math.abs(((openingYaw(st.series!, h, false, true, mask, halfW) - openingYaw(st.series!, h, false, true) + 540) % 360) - 180);
    let hour = -1;
    for (let h = 0; h < st.series!.hours && hour < 0; h++) if (st.series!.sunFraction[h] > 0 && turns(h) > 0.5) hour = h;
    expect(hour).toBeGreaterThanOrEqual(0);
    cleanup();
    // The view opens turned by that much: the stand view hands the skyline and the view's half-width to openingYaw.
    const r = stub();
    const { store } = await open(`?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=${hour}`, () => r);
    await waitFor(() => expect(r.setView).toHaveBeenCalled());
    const s = store.getState();
    expect(r.setView.mock.calls[0][0]).toBeCloseTo(openingYaw(s.series!, hour, false, true, mask, halfW), 3);
    expect(turns(hour)).toBeGreaterThan(0.5);
  });

  it('works out the opening’s turn once for the view, not again each hour the time moves (19.4)', async () => {
    const r = stub();
    const { store } = await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10', () => r);
    await waitFor(() => expect(r.setView).toHaveBeenCalled());
    const turns = vi.mocked(openingYaw).mock.calls.length;
    // Play moves the time twelve times a second: the skyline's walk must not run with it.
    for (const h of [11, 12, 13, 14]) act(() => store.getState().setCursor(h));
    const st = store.getState();
    await waitFor(() => expect(screen.getByText(asRead(statusLine(st.series!, st.power, st.startUtc, 14, st.params.power.batteryWh).text))).toBeTruthy());
    expect(vi.mocked(openingYaw).mock.calls.length).toBe(turns);
  });

  it('keeps the lander’s feet in sight after Turn to Lander: the look asks the view to fit them', async () => {
    await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10');
    // The lander stands once the ground has loaded, a moment after the words.
    fireEvent.click(await screen.findByRole('button', { name: 'Face the lander' }, { timeout: 20_000 }));
    await waitFor(() => expect(document.querySelector('canvas')!.getAttribute('data-fit')).toBe('1'));
  });

  it('makes Compare sites the gold action when no landing day is better, and adds the site to the comparison on the way there', async () => {
    // From 20 January, the better day of the January period, no later landing is better. If the answer still
    // names one, take a site and period the file's tests already use without a better day, and ledger a Ruling.
    const { store } = await open('?site=de_gerlache_rim_2&start=2027-01-20&days=30&hour=10');
    const row = screen.getByRole('group', { name: 'Next step' });
    expect(within(row).queryByRole('link', { name: /^Try / })).toBeNull();
    const compare = within(row).getByRole('button', { name: 'Compare sites' });
    expect(compare.className).toContain('text-[#f6d48a]');
    fireEvent.click(compare);
    await waitFor(() => expect(store.getState().compareIds).toContain('de_gerlache_rim_2'), { timeout: 10_000 });
  });

  it('lands on the better day in place from the row too', async () => {
    const { store } = await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10');
    fireEvent.click(within(screen.getByRole('group', { name: 'Next step' })).getByRole('link', { name: /^Try 20 January instead/ }));
    await waitFor(() => expect(store.getState().startUtc).toMatch(/^2027-01-20/), { timeout: 10_000 });
    expect(window.location.search).toMatch(/start=2027-01-20/);
  });

  it('opens a tall screen with the lander near the middle and the Sun towards the right edge', async () => {
    const was = { w: window.innerWidth, h: window.innerHeight };
    Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 844, configurable: true });
    try {
      const r = stub();
      const { store } = await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=0', () => r);
      await waitFor(() => expect(r.setView).toHaveBeenCalled());
      const sunAz = store.getState().series!.sunAz[0];
      const rel = (az: number) => ((((sunAz - az + 540) % 360) + 360) % 360) - 180;
      // The view 15 degrees left of the Sun; the lander 20 degrees left of it, 5 degrees left of the middle.
      expect(rel(r.setView.mock.calls[0][0])).toBeCloseTo(15, 0);
      fireEvent.click(screen.getByRole('button', { name: 'Face the lander' }));
      await waitFor(() => expect(rel(r.setView.mock.calls.at(-1)![0])).toBeCloseTo(20, 0), { timeout: 4000 });
    } finally {
      Object.defineProperty(window, 'innerWidth', { value: was.w, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: was.h, configurable: true });
    }
  });

  it('says Earthlight tints the ground blue only while Earth is lit enough to, and a thin crescent gives little light', async () => {
    const { store } = await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=219');
    const s = store.getState().series!;
    const lit = (h: number) => earthLitFraction(dirAzEl(s.sunAz[h], s.sunEl[h]), dirAzEl(s.earthAz[h], s.earthEl[h]));
    // 10 January, Earth well lit; 20 January before sunrise, a thin crescent: both at night with Earth in view.
    expect([s.sunFraction[219], s.earthVisible[219], s.sunFraction[460], s.earthVisible[460]]).toEqual([0, 1, 0, 1]);
    expect(lit(219)).toBeGreaterThanOrEqual(0.25);
    expect(lit(460)).toBeLessThan(0.25);
    // The first step holds the line over the view on arrival (19.2); the first turn by hand gives it to the night's.
    fireEvent.keyDown(await screen.findByRole('application', {}, { timeout: 10_000 }), { key: 'ArrowLeft' });
    expect(screen.getByText(viewCaption('earthlight', -88.28))).toBeTruthy();
    act(() => store.getState().setCursor(460));
    await waitFor(() => expect(screen.getByText(viewCaption('faint', -88.28))).toBeTruthy());
    expect(screen.queryByText(viewCaption('earthlight', -88.28))).toBeNull();
  });

  it('opens a night with Earth up on Earth, narrower, so it shows large', async () => {
    const r = stub();
    await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=219', () => r);
    await waitFor(() => expect(r.setView).toHaveBeenCalled());
    // 44° high: Earth and the lander's feet both fit under the status line and over the time bar (read D1).
    expect(r.setView.mock.calls[0][2]).toBe(44);
  });

  it('says, facing the lander, that it is the back of its panel the view sees', async () => {
    await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Face the lander' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Face the lander' }));
    expect(screen.getByText(/you see its back, as its cells face the Sun\.$/)).toBeTruthy();
  });

  it('marks the radio contact after the night as only if the lander survives it, and says the clock is Earth’s', async () => {
    await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10');
    // The battery runs out on 4 January; the contact from 20 January needs the lander to live through the night.
    await waitFor(() => expect(screen.getByText('radio, if the lander survives the cold')).toBeTruthy());
    expect(screen.getByText(/\(Earth time\)/)).toBeTruthy();
  });

  it('names your own shadow and its length with the guides, and leaves it out without them', async () => {
    const r = stub();
    await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10', () => r);
    await waitFor(() => expect(r.render).toHaveBeenCalled());
    expect(screen.getByText(/^Your shadow/).hidden).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Show paths' }));
    // With the height it is worked out for, so a reader can check the Sun's height from it.
    await waitFor(() => expect(screen.getByText('Your shadow, about 52 m long (you are 1.8 m tall)').hidden).toBe(false));
  });

  it('keeps "Building the ground" up until the renderer has its shaders ready, then shows the view', async () => {
    let finish = () => {};
    const ready = new Promise<void>((done) => (finish = done));
    const r = { ...stub(), ready };
    await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10', () => r);
    await waitFor(() => expect(r.resize).toHaveBeenCalled());
    expect(screen.getByText('Building the ground from NASA heights…')).toBeTruthy();
    // No label floats over the empty view while it builds.
    await new Promise((done) => setTimeout(done, 100));
    expect(screen.getByText(starLabel('Sirius')).hidden).toBe(true);
    await act(async () => finish());
    await waitFor(() => expect(screen.queryByText('Building the ground from NASA heights…')).toBeNull());
    await waitFor(() => expect(screen.getByText(starLabel('Sirius')).hidden).toBe(false));
  });

  it('lets the renderer go when the view closes', async () => {
    const r = stub();
    const { view } = await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10', () => r);
    await waitFor(() => expect(r.setTime).toHaveBeenCalled());
    view.unmount();
    expect(r.dispose).toHaveBeenCalled();
  });

  it('opens with the Sun near the right of a wide view, not straight ahead, so the ground before it is lit from the side', async () => {
    const r = stub();
    const { store } = await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=0', () => r);
    await waitFor(() => expect(r.setView).toHaveBeenCalled());
    const sunAz = store.getState().series!.sunAz[0];
    const rel = ((((sunAz - r.setView.mock.calls[0][0] + 540) % 360) + 360) % 360) - 180;
    expect(rel).toBeCloseTo(35, 0);
  });

  it('asks for the resident in its scene, and not in demo mode or with bright=1', async () => {
    /** The scene the view hands its renderer for the hero month with `extra` in the address. */
    const sceneAt = async (extra: string) => {
      window.history.replaceState(null, '', `/explore/stand?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10${extra}`);
      let scene: StandScene | null = null;
      const view = render(
        <StandView
          store={createExploreStore(fileLoaders())}
          createRenderer={(_canvas, sc) => {
            scene = sc;
            return stub();
          }}
        />,
      );
      await waitFor(() => expect(scene).not.toBeNull(), { timeout: 20_000 });
      view.unmount();
      return scene! as StandScene;
    };
    try {
      expect((await sceneAt('')).resident).toBe(true);
      // Not in the pitch's tabs, which show the forecast (spec 20.2), nor in the video's capture links.
      expect((await sceneAt('&demo=1')).resident).toBe(false);
      expect((await sceneAt('&bright=1')).resident).toBe(false);
      // Demo mode kept for the tab, as the pages in the app frame keep it, until the address turns it off.
      window.sessionStorage.setItem(DEMO_KEY, '1');
      expect((await sceneAt('')).resident).toBe(false);
      expect((await sceneAt('&demo=0')).resident).toBe(true);
    } finally {
      window.sessionStorage.removeItem(DEMO_KEY);
      window.sessionStorage.removeItem('earthrise-bright');
    }
  }, 60_000);

  it('says it found the resident once, in the line over the view', async () => {
    // Renderers whose labels put the resident's shell in the middle of the view from their second frame on.
    const made: RendererLike[] = [];
    const finding = () => {
      let frames = 0;
      const r = { ...stub(), labels: () => ({ ...everywhere, resident: { x: 0.5, y: 0.55, visible: frames++ > 0 } }) };
      made.push(r);
      return r;
    };
    const { store } = await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10', finding);
    await waitFor(() => expect(document.querySelector('[data-caption]')?.textContent).toBe(RESIDENT_LINE), { timeout: 10_000 });
    // Another period, the better day, whose view finds it again: the line is said once a visit, and the first step,
    // which it took the place of, is gone for the visit too.
    openCard();
    fireEvent.click(await within(document.getElementById('stand-card')!).findByRole('link', { name: /^Try \d+ January instead/ }));
    await waitFor(() => expect(store.getState().startUtc.slice(0, 10)).not.toBe('2027-01-01'));
    await waitFor(() => expect(made.length).toBeGreaterThanOrEqual(2));
    const last = made.at(-1)!;
    await waitFor(() => expect((last.render as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(6));
    const line = document.querySelector('[data-caption]')?.textContent ?? '';
    expect(line).not.toBe(RESIDENT_LINE);
    expect(line).not.toContain(FIRST_STEP);
  }, 60_000);

  it('keeps a key moment’s line when the resident comes into view under it, and says it found the resident once that line has gone', async () => {
    // The resident comes into the middle of the view only once `seen` says so, as a flag turns the view onto it.
    let seen = false;
    const r = { ...stub(), labels: () => ({ ...everywhere, resident: { x: 0.5, y: 0.55, visible: seen } }) };
    const { store } = await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10', () => r);
    await waitFor(() => expect(document.querySelector('[data-caption]')?.textContent).toContain(FIRST_STEP), { timeout: 10_000 });
    const st = store.getState(), m = keyMoments(st.series!, st.power, st.startUtc).find((x) => x.kind === 'battery-out')!;
    fireEvent.click(screen.getByRole('button', { name: 'Battery runs out, 4 Jan' }));
    seen = true;
    // Frames go by with it in view: the moment's line stays.
    const drawn = r.render.mock.calls.length;
    await waitFor(() => expect(r.render.mock.calls.length).toBeGreaterThan(drawn + 6));
    expect(document.querySelector('[data-caption]')!.textContent).toBe(momentCaption(m.kind, st.series!, m.hour, -88.28));
    // Turned to the Sun, the moment's line goes: the resident, still in view, is said.
    fireEvent.click(screen.getByRole('button', { name: 'Face the Sun' }));
    await waitFor(() => expect(document.querySelector('[data-caption]')?.textContent).toBe(RESIDENT_LINE));
  }, 60_000);
});
