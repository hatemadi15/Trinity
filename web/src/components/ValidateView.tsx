'use client';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { AppFrame } from './AppFrame';
import { dataBase, loadEphemerisFromUrl } from '@/lib/data/loaders';
import { degreesText } from '@/lib/data/home';
import { exploreStore } from '@/lib/store/explore';
import { loadValidation, type BackcastRow, type ValidationDocs } from '@/lib/data/validation';
import type { HorizonsBody } from '@/lib/horizons/query';
import { recheckSite, type RecheckResult } from '@/lib/horizons/recheck';
import { checkCards, type CheckCard } from '@/lib/viz/checks';

type Recheck = (site: { lat: number; lon: number }, body: HorizonsBody, epochsUtc: string[]) => Promise<RecheckResult>;

/** Eight epochs across 2026 (seven equal intervals) for the live JPL comparison. */
export const RECHECK_EPOCHS = ['2026-01-01T00:00:00', '2026-02-22T03:00:00', '2026-04-15T06:00:00', '2026-06-06T09:00:00', '2026-07-28T12:00:00', '2026-09-18T15:00:00', '2026-11-09T18:00:00', '2026-12-31T21:00:00'];

/** Module-scope defaults: a stable identity, so the loading effect runs once per mount and not on every render. */
const defaultLoad = () => loadValidation(dataBase());

async function defaultRecheck(site: { lat: number; lon: number }, body: HorizonsBody, epochs: string[]): Promise<RecheckResult> {
  // The Explore store may already hold the ephemeris (same tab, earlier visit); otherwise fetch it once here.
  const eph = exploreStore.getState().eph ?? (await loadEphemerisFromUrl(dataBase()));
  return recheckSite(site, body, epochs, eph);
}

interface TestBadge {
  generated_utc: string;
  web: { files: number; tests: number };
  pipeline: { tests: number };
}

const exp1 = (x: number) => `${x.toExponential(1)}°`;
const pctOf = (x: number) => `${(x * 100).toFixed(1)} %`;
const signedHours = (h: number) => `${h >= 0 ? '+' : '−'}${Math.abs(h).toFixed(1)} h`;
const utcShort = (iso: string | null) => (iso ? iso.replace('T', ' ').replace(':00Z', ' UTC').replace('Z', ' UTC') : '—');
const TH = 'border-b-2 border-ink py-2 pr-4 text-left text-[15px] font-semibold text-ink-2';
const TD = 'border-b border-line py-2 pr-4 text-[15px]';
const NUM = `${TD} text-right tabular-nums`;

function Mark({ pass }: { pass: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="currentColor" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {pass ? <path d="M4 12.5l5 5L20 6.5" /> : <path d="M6 6l12 12M18 6L6 18" />}
    </svg>
  );
}

/** One check: its pass mark, figure and sentence, anything it adds (the live re-check), and its numbers on request. */
function CheckPanel({ card, extra, children }: { card: CheckCard; extra?: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <section aria-labelledby={`${id}-h`} className="panel">
      <h2 id={`${id}-h`} className="display text-[26px] font-semibold leading-tight">
        {card.title}
      </h2>
      <p className={`mt-2 flex items-center gap-2 font-semibold ${card.pass ? 'text-good' : 'text-bad'}`}>
        <Mark pass={card.pass} />
        {card.mark}
      </p>
      <p className="mt-3 flex flex-wrap items-baseline gap-x-3">
        <span className="display text-[40px] leading-none tabular-nums">{card.figure}</span>
        <span className="text-ink-2">{card.figureWords}</span>
      </p>
      <p className="mt-3 max-w-[62em] leading-relaxed text-ink-2">{card.sentence}</p>
      {extra}
      <button type="button" aria-expanded={open} aria-controls={`${id}-n`} onClick={() => setOpen((v) => !v)} className="btn mt-4">
        {open ? 'Hide the numbers' : 'Show the numbers'}
      </button>
      {open && <p className="mt-3 text-[15px] text-ink-2 sm:hidden">Swipe the table sideways to see every column.</p>}
      <div id={`${id}-n`} hidden={!open} className="mt-4 overflow-x-auto">
        {open && children}
      </div>
    </section>
  );
}

/**
 * Accuracy: the three checks of the home page's table, each with a pass mark, its headline figure,
 * one plain sentence and the full table on request; the live re-check with JPL sits in the first.
 * Then the error budget and the count of automated tests.
 */
export function ValidateView({ load = defaultLoad, recheck = defaultRecheck }: { load?: () => Promise<ValidationDocs>; recheck?: Recheck }) {
  const [docs, setDocs] = useState<ValidationDocs | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState<{ state: 'idle' } | { state: 'busy' } | { state: 'done'; result: RecheckResult }>({ state: 'idle' });
  const [badge, setBadge] = useState<TestBadge | null>(null);

  useEffect(() => {
    let cancelled = false;
    load()
      .then((d) => {
        if (!cancelled) setDocs(d);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    fetch('/validation/tests.json')
      .then((r) => (r.ok ? (r.json() as Promise<TestBadge>) : null))
      .then((b) => {
        if (!cancelled && b) setBadge(b);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [load]);

  if (error) {
    return (
      <AppFrame>
        <main className="wrap py-12">
          <div role="alert" className="max-w-prose border-l-2 border-bad pl-4 text-ink-2">
            <p className="text-ink">The validation tables are missing.</p>
            <p className="mt-2 text-[15px]">
              Run <code className="text-ink">uv run python -m lunar_pipeline.cli validate</code> then <code className="text-ink">uv run python -m lunar_pipeline.cli sync-local</code> inside{' '}
              <code className="text-ink">pipeline/</code> and reload. ({error})
            </p>
          </div>
        </main>
      </AppFrame>
    );
  }
  if (!docs) {
    return (
      <AppFrame>
        <main className="wrap py-12">
          <p className="text-ink-2">Loading the checks…</p>
        </main>
      </AppFrame>
    );
  }
  const { horizons, mazarico, backcasts } = docs;
  const [directions, sunlight, nights] = checkCards(docs);
  const liveSite = horizons.sites.find((s) => s.site_id === 'shackleton_center') ?? horizons.sites[0];

  async function runRecheck() {
    setLive({ state: 'busy' });
    try {
      const result = await recheck({ lat: liveSite.lat, lon: liveSite.lon }, 'SUN', RECHECK_EPOCHS);
      setLive({ state: 'done', result });
    } catch (err) {
      // A thrown error (for example the ephemeris failing to load) must not leave the button disabled.
      setLive({ state: 'done', result: { ok: false, message: err instanceof Error ? err.message : String(err) } });
    }
  }

  const recheckBlock = (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <button type="button" onClick={() => void runRecheck()} disabled={live.state === 'busy'} className="btn btn-primary">
        Re-check with JPL now
      </button>
      <span className="text-[15px] text-ink-2" aria-live="polite">
        {live.state === 'idle' && `Asks JPL for the Sun at ${liveSite.name} at eight moments in 2026 (about 12 s at most).`}
        {live.state === 'busy' && 'Asking JPL…'}
        {live.state === 'done' &&
          (live.result.ok
            ? `${live.result.n} epochs, worst ${exp1(live.result.worstEl)} in elevation, ${exp1(live.result.worstAzCosEl)} in azimuth (${(live.result.ms / 1000).toFixed(1)} s)`
            : `${live.result.message}; showing the stored comparison`)}
      </span>
    </div>
  );

  return (
    <AppFrame>
      <main className="wrap flex flex-col gap-6 pb-14 pt-8">
        <div>
          <h1 className="display text-[44px] leading-tight sm:text-[56px]">Accuracy</h1>
          <p className="mt-3 max-w-[42em] text-lg leading-relaxed text-ink-2">Each step of the forecast is checked against an independent NASA source. The smaller the gap, the better.</p>
          {badge && (
            <p className="mt-2 text-[15px] text-ink-2">
              {badge.web.tests} automated tests in the app and {badge.pipeline.tests} in the data pipeline check the sums on every change; last counted {utcShort(badge.generated_utc)}.
            </p>
          )}
        </div>

        <CheckPanel card={directions} extra={recheckBlock}>
          <table className="w-full min-w-[640px] border-collapse">
            <thead>
              <tr>
                <th className={TH}>Site</th>
                <th className={TH}>Body</th>
                <th className={`${TH} text-right`}>Rows</th>
                <th className={`${TH} text-right`}>Largest gap in height</th>
                <th className={`${TH} text-right`}>Largest gap in direction</th>
                <th className={TH}>Query</th>
              </tr>
            </thead>
            <tbody>
              {horizons.sites.map((s) => (
                <tr key={`${s.site_id}-${s.body}`}>
                  <td className={TD}>{s.name}</td>
                  <td className={TD}>{s.body === 'SUN' ? 'Sun' : 'Earth'}</td>
                  <td className={NUM}>{s.n_rows}</td>
                  <td className={NUM}>{exp1(s.max_abs_delta_el_deg)}</td>
                  <td className={NUM}>{exp1(s.max_abs_delta_az_cos_el_deg)}</td>
                  <td className={TD}>
                    <a href={s.query_url} target="_blank" rel="noreferrer" className="underline decoration-line-strong underline-offset-4 hover:decoration-ink">
                      JPL query
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CheckPanel>

        <CheckPanel card={sunlight}>
          <p className="mb-3 text-[15px] text-ink-2">
            Our sunlit share, hourly {mazarico.period[0].slice(0, 10)} to {mazarico.period[1].slice(0, 10)} with a 2 m mast, against the map <code>{mazarico.product}</code> (60 m per pixel, south of 85° S).
          </p>
          <table className="w-full min-w-[520px] border-collapse">
            <thead>
              <tr>
                <th className={TH}>Site</th>
                <th className={`${TH} text-right`}>Ours</th>
                <th className={`${TH} text-right`}>NASA&apos;s map</th>
                <th className={`${TH} text-right`}>Gap</th>
              </tr>
            </thead>
            <tbody>
              {mazarico.rows.map((r) => (
                <tr key={r.site_id}>
                  <td className={TD}>{r.name}</td>
                  {r.covered && r.delta_points !== undefined ? (
                    <>
                      <td className={NUM}>{pctOf(r.ours_fraction!)}</td>
                      <td className={NUM}>{pctOf(r.map_fraction!)}</td>
                      <td className={NUM}>
                        {r.delta_points >= 0 ? '+' : '−'}
                        {Math.abs(r.delta_points).toFixed(1)} points
                      </td>
                    </>
                  ) : (
                    <td colSpan={3} className={`${TD} text-ink-2`}>
                      not covered by the 85°S map
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </CheckPanel>

        <CheckPanel card={nights}>
          <table className="w-full min-w-[760px] border-collapse">
            <thead>
              <tr>
                <th className={TH}>Mission</th>
                <th className={TH}>Landed</th>
                <th className={`${TH} text-right`}>Sun at landing</th>
                <th className={TH}>Predicted sunset</th>
                <th className={TH}>Reported end</th>
                <th className={`${TH} text-right`}>End − sunset</th>
                <th className={TH}>Horizon</th>
              </tr>
            </thead>
            <tbody>
              {backcasts.rows.map((r: BackcastRow) => (
                <tr key={r.site_id}>
                  <td className={TD}>{r.name}</td>
                  <td className={`${TD} tabular-nums`}>{utcShort(r.landed_utc)}</td>
                  <td className={NUM}>{r.sun_el_at_landing_deg.toFixed(1)}°</td>
                  <td className={`${TD} tabular-nums`}>{utcShort(r.sunset_utc)}</td>
                  <td className={`${TD} tabular-nums`}>{utcShort(r.mission_end_utc)}</td>
                  <td className={NUM}>{r.end_minus_sunset_h === null ? '—' : signedHours(r.end_minus_sunset_h)}</td>
                  <td className={TD}>{r.skyline === 'lola' ? 'measured hills' : 'flat'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="mt-4 flex flex-col gap-3 text-[15px]">
            {backcasts.rows.map((r) => (
              <li key={r.site_id} className="flex flex-col gap-0.5">
                <span className="text-ink">
                  {r.name}: {r.mission_note ?? 'no note for this mission yet'}
                </span>
                <span className="text-ink-2">Source: {r.mission_end_source ?? 'not recorded'}</span>
              </li>
            ))}
          </ul>
        </CheckPanel>

        <section aria-labelledby="h-budget" className="panel">
          <h2 id="h-budget" className="display text-[26px] font-semibold">
            How far off the forecast can be
          </h2>
          <ul className="mt-3 flex max-w-[62em] flex-col gap-2 leading-relaxed text-ink-2">
            <li>Sunrise, sunset and Earth rising or setting: within 15 to 60 minutes near the pole, where the Sun moves half a degree an hour along the horizon and the forecast is hourly.</li>
            <li>Directions to the Sun and Earth: under 0.01° (the first check finds {degreesText(horizons.max_abs_delta_el_deg)}).</li>
            <li>The height of the hills around a site: 0.05 to 0.15°, because NASA&apos;s elevation maps are 1 to 2 m uncertain; the app follows them to 0.01°.</li>
          </ul>
        </section>
      </main>
    </AppFrame>
  );
}
