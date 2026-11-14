import { describe, expect, it, vi } from 'vitest';
import { hasFile } from '../engine/__tests__/helpers';
import { LANDER_PRESETS } from '../lander';
import { exploreHref, standHref } from '../links';
import { createExploreStore, DEFAULT_PARAMS, type ExploreState } from '../store/explore';
import { fileLoaders } from '@/test/file-loaders';
import { withSettings } from './settings';

const haveData = hasFile('data', 'ephemeris', 'moon_me_2024_2036_1h.f32') && hasFile('data', 'masks', 'haworth.json');

/** A skyline that depends on where it is seen from and how high, as the worker's does: lower hills from a taller mast. */
function worker() {
  return vi.fn(async (lat: number, lon: number, mastM: number) => ({
    mask: Float64Array.from({ length: 720 }, (_, i) => Math.max(0, 2.5 - 0.3 * mastM + 1.5 * Math.sin(i / 40 + lon / 20))),
    siteHeightM: 100 + mastM,
    failedTiles: 0,
  }));
}

/** A browser opened afresh: a new store on the real catalogue and sky, with the defaults. */
async function freshBrowser(computeMask = worker()) {
  const store = createExploreStore(fileLoaders({ computeMask }));
  await store.getState().init();
  return { store, computeMask };
}

/** Everything a visitor reads off Explore for one site and period: the settings and the figures worked out from them. */
function figures(s: ExploreState) {
  return {
    siteId: s.siteId,
    startUtc: s.startUtc,
    days: s.days,
    params: s.params,
    mast: s.maskMeta?.mastM,
    summary: s.summary,
    power: s.power && { socMin: s.power.socMin, brownoutHours: s.power.brownoutHours, firstBrownoutHour: s.power.firstBrownoutHour, meanPowerW: s.power.meanPowerW, energyWh: Array.from(s.power.energyWh) },
    contacts: s.contacts,
    best: s.best,
  };
}

/** The address's query, as a fresh page reads it from window.location.search. */
const search = (href: string) => href.slice(href.indexOf('?'));

describe.skipIf(!haveData)('a shared link in a fresh browser', () => {
  it('opens a catalogue site on the same settings and the same figures: a 5 m mast, the medium lander, Earth 2° clear of the hills', async () => {
    const { store: a } = await freshBrowser();
    await a.getState().selectSite('haworth');
    a.getState().setPower(LANDER_PRESETS.find((p) => p.id === 'medium')!.power);
    a.getState().setParams({ mastM: 5, minEarthElDeg: 2 });
    await a.getState().waitForMask();
    const sent = a.getState();
    expect(sent.maskMeta?.mastM).toBe(5);
    const link = withSettings(exploreHref(sent.siteId!, sent.startUtc, sent.days), sent.params);
    expect(link).toBe('/explore?site=haworth&start=2027-01-01&days=30&area=8&load=400&battery=20000&mast=5&earthmin=2');

    const { store: b, computeMask } = await freshBrowser();
    await b.getState().applyQuery(search(link));
    await b.getState().waitForMask();
    expect(figures(b.getState())).toEqual(figures(sent));
    // The skyline from the 5 m mast is worked out once.
    expect(computeMask).toHaveBeenCalledTimes(1);
    expect(computeMask).toHaveBeenCalledWith(sent.site!.lat, sent.site!.lon, 5);
  });

  it('opens a clicked point the same way, its skyline worked out from the mast the link names', async () => {
    const { store: a } = await freshBrowser();
    a.getState().setParams({ mastM: 5 });
    a.getState().setPower({ panel: 'vertical', panelAzimuthDeg: 90, loadW: 150, initialSocFraction: 0.6 });
    await a.getState().waitForMask();
    await a.getState().selectCustom(-89.5, 10);
    a.getState().setWindow('2027-03-01T00:00:00', 14);
    const sent = a.getState();
    expect(sent.siteId).toBe('custom_-89.5000_10.0000');
    const link = withSettings(exploreHref(sent.siteId!, sent.startUtc, sent.days), sent.params);
    expect(link).toBe('/explore?site=custom_-89.5000_10.0000&start=2027-03-01&days=14&panel=vertical&facing=90&load=150&charge=0.6&mast=5');

    const { store: b, computeMask } = await freshBrowser();
    await b.getState().applyQuery(search(link));
    await b.getState().waitForMask();
    expect(figures(b.getState())).toEqual(figures(sent));
    // The point is worked out from 5 m only. While it is, the site shown before it is asked for at 5 m too: the
    // skyline queue asks for the shown site's skyline at the chosen height until the point replaces it.
    expect(computeMask).toHaveBeenCalledWith(-89.5, 10, 5);
    expect(computeMask).not.toHaveBeenCalledWith(-89.5, 10, 2);
  });

  it('gives the view from the site the same settings as Explore', async () => {
    const { store: a } = await freshBrowser();
    a.getState().setPower({ batteryWh: 9000 });
    a.getState().setParams({ minEarthElDeg: 1.5 });
    const sent = a.getState();
    const link = withSettings(standHref(sent.siteId!, sent.startUtc, sent.days, 40), sent.params);
    expect(link).toBe('/explore/stand?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=40&battery=9000&earthmin=1.5');
    const { store: b } = await freshBrowser();
    await b.getState().applyQuery(search(link));
    expect(figures(b.getState())).toEqual(figures(sent));
  });

  it('changes the mast of the site already shown when the link names only the mast', async () => {
    const { store: b, computeMask } = await freshBrowser();
    await b.getState().applyQuery('?mast=4');
    await b.getState().waitForMask();
    expect(b.getState().params.mastM).toBe(4);
    expect(b.getState().maskMeta?.mastM).toBe(4);
    expect(computeMask).toHaveBeenCalledTimes(1);
  });

  it('opens the requirements a link names, so a colleague’s browser ranks the landing times the same', async () => {
    const { store: a } = await freshBrowser();
    a.getState().setPower({ loadW: 300 });
    a.getState().setRequirements({ minPoweredH: 120, contactWithinH: 0, maxOutageH: 72 });
    const sent = a.getState();
    const link = withSettings(exploreHref(sent.siteId!, sent.startUtc, sent.days), sent.params, sent.requirements);
    expect(link).toBe('/explore?site=de_gerlache_rim_2&start=2027-01-01&days=30&load=300&minpower=120&earthby=0&maxgap=72');
    const { store: b } = await freshBrowser();
    await b.getState().applyQuery(search(link));
    expect(b.getState().requirements).toEqual(sent.requirements);
    expect(figures(b.getState())).toEqual(figures(sent));
    // A link that names no requirement keeps the ones the visit has; a malformed one is left out.
    await b.getState().applyQuery('?site=haworth&start=2027-02-01&days=14');
    expect(b.getState().requirements).toEqual(sent.requirements);
    await b.getState().applyQuery('?minpower=lots&mincontact=24');
    expect(b.getState().requirements).toEqual({ ...sent.requirements, minPoweredContactH: 24 });
  });

  it('keeps the settings a visit already has when a link inside the app names none, and old links still open', async () => {
    const { store } = await freshBrowser();
    store.getState().setPower({ loadW: 400 });
    await store.getState().applyQuery('?site=haworth&start=2027-02-01&days=14');
    const s = store.getState();
    expect(s.siteId).toBe('haworth');
    expect(s.days).toBe(14);
    expect(s.params).toEqual({ ...DEFAULT_PARAMS, power: { ...DEFAULT_PARAMS.power, loadW: 400 } });
  });
});
