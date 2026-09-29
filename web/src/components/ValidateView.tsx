'use client';
import { useEffect, useState } from 'react';
import { AppFrame } from './AppFrame';
import { dataBase, loadEphemerisFromUrl } from '@/lib/data/loaders';
import { exploreStore } from '@/lib/store/explore';
import { loadValidation, type BackcastRow, type ValidationDocs } from '@/lib/data/validation';
import type { HorizonsBody } from '@/lib/horizons/query';
import { recheckSite, type RecheckResult } from '@/lib/horizons/recheck';

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

/** Within this many hours of the predicted sunset, a reported mission end counts as agreeing with the prediction. */
const SUNSET_AGREEMENT_H = 6;

/** One sentence for the backcast table: who ended at sunset, and who died early with a stated reason. */
function backcastVerdict(rows: BackcastRow[]): string {
  const dated = rows.filter((r) => r.end_minus_sunset_h !== null);
  if (dated.length === 0) return 'No landed mission has a reported end yet.';
  const agreed = dated.filter((r) => Math.abs(r.end_minus_sunset_h!) <= SUNSET_AGREEMENT_H);
  const early = dated.filter((r) => r.end_minus_sunset_h! < -SUNSET_AGREEMENT_H);
  const parts: string[] = [];
  if (agreed.length > 0) {
    const worst = Math.max(...agreed.map((r) => Math.abs(r.end_minus_sunset_h!)));
    parts.push(`${agreed.map((r) => r.name).join(' and ')} ended within ${worst.toFixed(1)} h of the predicted sunset`);
  }
  if (early.length > 0) {
    parts.push(
      `${early.map((r) => r.name).join(' and ')} died early for known reasons (notes below), so their rows only show that the Sun was still up`,
    );
  }
  return parts.join('; ') + '.';
}

interface TestBadge {
  generated_utc: string;
  web: { files: number; tests: number };
  pipeline: { tests: number };
}

const exp1 = (x: number) => `${x.toExponential(1)}°`;
const pctOf = (x: number) => `${(x * 100).toFixed(1)} %`;
const signedHours = (h: number) => `${h >= 0 ? '+' : '−'}${Math.abs(h).toFixed(1)} h`;
const utcShort = (iso: string | null) => (iso ? iso.replace('T', ' ').replace(':00Z', ' UTC').replace('Z', ' UTC') : '—');

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
        <div role="alert" className="mx-6 my-10 max-w-prose border-l-2 border-bad pl-4 text-ink-2">
          <p className="text-ink">The validation tables are missing.</p>
          <p className="mt-2 text-sm">
            Run <code className="text-ink">uv run python -m lunar_pipeline.cli validate</code> then{' '}
            <code className="text-ink">uv run python -m lunar_pipeline.cli sync-local</code> inside <code className="text-ink">pipeline/</code> and reload. ({error})
          </p>
        </div>
      </AppFrame>
    );
  }
  if (!docs) {
    return (
      <AppFrame>
        <p className="px-6 py-10 text-ink-2">Loading validation tables…</p>
      </AppFrame>
    );
  }
  const { horizons, mazarico, backcasts } = docs;
  const covered = mazarico.rows.filter((r) => r.covered && r.delta_points !== undefined);
  const worstMaz = covered.reduce((a, r) => (Math.abs(r.delta_points!) > Math.abs(a.delta_points!) ? r : a), covered[0]);
  const within5 = covered.filter((r) => Math.abs(r.delta_points!) <= 5).length;
  const worstTwo = [...covered].sort((a, b) => Math.abs(b.delta_points!) - Math.abs(a.delta_points!)).slice(0, 2);
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

  return (
    <AppFrame>
      <main className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-6">
        <header className="flex flex-col gap-2">
          <h1 className="font-display text-3xl font-semibold">Validate</h1>
          <p className="max-w-prose text-ink-2">
            Three checks a planner can rerun: our Sun and Earth directions against JPL Horizons, our sunlit fractions against the LOLA
            illumination map, and predicted sunsets against what happened to three CLPS landers.
          </p>
          {badge && (
            <p className="text-sm text-ink-3">
              Automated tests: {badge.web.tests} in the web engine and app ({badge.web.files} files), {badge.pipeline.tests} in the Python pipeline; last counted{' '}
              {utcShort(badge.generated_utc)}.
            </p>
          )}
        </header>

        <section aria-labelledby="h-horizons" className="flex flex-col gap-3">
          <h2 id="h-horizons" className="font-display text-xl font-semibold">
            Do we point where JPL points?
          </h2>
          <p className="text-sm text-ink-2">
            Worst difference over {horizons.n_rows} rows: {exp1(horizons.max_abs_delta_el_deg)} in elevation, {exp1(horizons.max_abs_delta_az_cos_el_deg)} in azimuth
            (target 0.01°). Sun and Earth as seen from six sites, 2025–2026, every 30 days, JPL Horizons observer tables with <code>CENTER=coord@301</code>.
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-ink-2">
                <th className="py-1 pr-3 font-normal">Site</th>
                <th className="py-1 pr-3 font-normal">Body</th>
                <th className="py-1 pr-3 text-right font-normal">Rows</th>
                <th className="py-1 pr-3 text-right font-normal">Worst Δ elevation</th>
                <th className="py-1 pr-3 text-right font-normal">Worst Δ azimuth · cos el</th>
                <th className="py-1 font-normal">Query</th>
              </tr>
            </thead>
            <tbody>
              {horizons.sites.map((s) => (
                <tr key={`${s.site_id}-${s.body}`} className="border-b border-line/50">
                  <td className="py-1 pr-3">{s.name}</td>
                  <td className="py-1 pr-3">{s.body === 'SUN' ? 'Sun' : 'Earth'}</td>
                  <td className="py-1 pr-3 text-right tabular-nums">{s.n_rows}</td>
                  <td className="py-1 pr-3 text-right tabular-nums">{exp1(s.max_abs_delta_el_deg)}</td>
                  <td className="py-1 pr-3 text-right tabular-nums">{exp1(s.max_abs_delta_az_cos_el_deg)}</td>
                  <td className="py-1">
                    <a href={s.query_url} target="_blank" rel="noreferrer" className="text-ink-2 underline-offset-4 hover:underline">
                      JPL query
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void runRecheck()}
              disabled={live.state === 'busy'}
              className="rounded-md border border-sun px-3 py-1 text-sm text-ink hover:bg-panel disabled:opacity-50"
            >
              Re-check with JPL now
            </button>
            <span className="text-sm text-ink-2" aria-live="polite">
              {live.state === 'idle' && `Queries JPL for the Sun at ${liveSite.name} at eight epochs in 2026 (about 12 s at most).`}
              {live.state === 'busy' && 'Asking JPL…'}
              {live.state === 'done' &&
                (live.result.ok
                  ? `${live.result.n} epochs, worst ${exp1(live.result.worstEl)} in elevation, ${exp1(live.result.worstAzCosEl)} in azimuth (${(live.result.ms / 1000).toFixed(1)} s)`
                  : `${live.result.message}; showing the stored comparison`)}
            </span>
          </div>
        </section>

        <section aria-labelledby="h-mazarico" className="flex flex-col gap-3">
          <h2 id="h-mazarico" className="font-display text-xl font-semibold">
            Do we light what LOLA lights?
          </h2>
          <p className="text-sm text-ink-2">
            Our sunlit fraction, hourly {mazarico.period[0].slice(0, 10)} to {mazarico.period[1].slice(0, 10)} with a 2 m mast, against the LOLA average-visibility map (
            <code>{mazarico.product}</code>, 60 m/px, south of 85°S). {within5} of {covered.length} covered sites are within 5 points; worst{' '}
            {worstMaz ? `${worstMaz.delta_points! >= 0 ? '+' : '−'}${Math.abs(worstMaz.delta_points!).toFixed(1)} points at ${worstMaz.name}` : '—'}. The two largest misses,{' '}
            {worstTwo.map((r) => r.name).join(' and ')}, are narrow high features, most likely the map’s 60 m sampling of 20 m peaks; the map also averages a
            different span of years and sees no mast.
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-ink-2">
                <th className="py-1 pr-3 font-normal">Site</th>
                <th className="py-1 pr-3 text-right font-normal">Ours</th>
                <th className="py-1 pr-3 text-right font-normal">LOLA map</th>
                <th className="py-1 text-right font-normal">Difference</th>
              </tr>
            </thead>
            <tbody>
              {mazarico.rows.map((r) => (
                <tr key={r.site_id} className="border-b border-line/50">
                  <td className="py-1 pr-3">{r.name}</td>
                  {r.covered && r.delta_points !== undefined ? (
                    <>
                      <td className="py-1 pr-3 text-right tabular-nums">{pctOf(r.ours_fraction!)}</td>
                      <td className="py-1 pr-3 text-right tabular-nums">{pctOf(r.map_fraction!)}</td>
                      <td className="py-1 text-right tabular-nums">
                        {r.delta_points >= 0 ? '+' : '−'}
                        {Math.abs(r.delta_points).toFixed(1)} pts
                      </td>
                    </>
                  ) : (
                    <td colSpan={3} className="py-1 text-ink-3">
                      not covered by the 85°S map
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section aria-labelledby="h-backcasts" className="flex flex-col gap-3">
          <h2 id="h-backcasts" className="font-display text-xl font-semibold">
            Did the landers die when the Sun set?
          </h2>
          <p className="text-sm text-ink-2">
            Predicted local sunset after each CLPS landing (hourly, the site&apos;s LOLA skyline where we have one, a flat horizon for the mare site)
            against the reported end of the mission. {backcastVerdict(backcasts.rows)}
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-ink-2">
                <th className="py-1 pr-3 font-normal">Mission</th>
                <th className="py-1 pr-3 font-normal">Landed</th>
                <th className="py-1 pr-3 text-right font-normal">Sun at landing</th>
                <th className="py-1 pr-3 font-normal">Predicted sunset</th>
                <th className="py-1 pr-3 font-normal">Reported end</th>
                <th className="py-1 pr-3 text-right font-normal">End − sunset</th>
                <th className="py-1 font-normal">Skyline</th>
              </tr>
            </thead>
            <tbody>
              {backcasts.rows.map((r: BackcastRow) => (
                <tr key={r.site_id} className="border-b border-line/50">
                  <td className="py-1 pr-3">{r.name}</td>
                  <td className="py-1 pr-3 tabular-nums">{utcShort(r.landed_utc)}</td>
                  <td className="py-1 pr-3 text-right tabular-nums">{r.sun_el_at_landing_deg.toFixed(1)}°</td>
                  <td className="py-1 pr-3 tabular-nums">{utcShort(r.sunset_utc)}</td>
                  <td className="py-1 pr-3 tabular-nums">{utcShort(r.mission_end_utc)}</td>
                  <td className="py-1 pr-3 text-right tabular-nums">{r.end_minus_sunset_h === null ? '—' : signedHours(r.end_minus_sunset_h)}</td>
                  <td className="py-1">{r.skyline === 'lola' ? 'LOLA' : 'flat'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="flex flex-col gap-2 text-sm">
            {backcasts.rows.map((r) => (
              <li key={r.site_id} className="flex flex-col gap-0.5">
                <span className="text-ink-2">
                  {r.name}: {r.mission_note ?? 'no note for this mission yet'}
                </span>
                <span className="text-xs text-ink-3">Source: {r.mission_end_source ?? 'not recorded'}</span>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="h-budget" className="flex flex-col gap-2">
          <h2 id="h-budget" className="font-display text-xl font-semibold">
            Error budget
          </h2>
          <p className="max-w-prose text-sm text-ink-2">
            Sun and Earth directions: ephemeris &lt; 0.01° (the Horizons rows above show {exp1(horizons.max_abs_delta_el_deg)}). Terrain skyline: 0.05–0.15° from
            LOLA posts of 20–240 m with 1–2 m height noise, reproduced by the browser engine to 0.01°. Event timing (sunrise, sunset, Earth rise): ±15–60
            minutes near the pole, where the Sun moves 0.5° per hour along the horizon and the series is hourly.
          </p>
        </section>
      </main>
    </AppFrame>
  );
}
