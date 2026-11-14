'use client';
import { useEffect, useState } from 'react';
import { Fold } from './Fold';
import { dataBase } from '@/lib/data/base';
import { EVENT_NAMES, loadUncertainty, withinWords, type EventKind, type SiteBudget, type UncertaintyDoc } from '@/lib/uncertainty/budget';

const TH = 'border-b-2 border-ink py-2 pr-4 text-left text-[15px] font-semibold text-ink-2';
const TD = 'border-b border-line py-2 pr-4 text-[15px]';
const NUM = `${TD} text-right tabular-nums`;
const TABLE_KINDS: EventKind[] = ['sunset', 'sunrise', 'earthset', 'earthrise', 'battery_out'];
/** The four conditions the review asks for, in the order the section tells them. */
const FOUR = ['connecting_ridge', 'shackleton_center_rim_high', 'im2_athena', 'blue_ghost_m1'];

const nameOf = (s: SiteBudget) => s.label ?? s.name;
const margin = (h: number | null) => (h === null ? 'none' : `±${withinWords(h)}`);
const hours = (h: number | null) => (h === null ? '—' : `${h.toFixed(1)} h`);
const pct = (x: number | undefined) => (x === undefined ? '—' : `${x.toFixed(1)} %`);
const span = (h: number | undefined) => (h === undefined ? '—' : h >= 48 ? `${(h / 24).toFixed(1)} d` : `${h.toFixed(1)} h`);
const defaultLoad = () => loadUncertainty(dataBase());

/** A table that moves sideways inside its own box on a phone, so the page never does. */
function Table({ label, minW, children }: { label: string; minW: number; children: React.ReactNode }) {
  return (
    <div className="mt-3 overflow-x-auto">
      <table aria-label={label} className="w-full border-collapse" style={{ minWidth: minW }}>
        {children}
      </table>
    </div>
  );
}

/**
 * The Accuracy page's account of how sure the forecast's times are: at four kinds of site, the margin each event
 * carries; then, one tap away each, the three sources apart, what the terrain data does to the totals, every
 * featured site, the ground at each, and how it was all measured, with every file it read.
 */
export function UncertaintySection({ load = defaultLoad }: { load?: () => Promise<UncertaintyDoc> }) {
  const [doc, setDoc] = useState<UncertaintyDoc | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    load()
      .then((d) => live && setDoc(d))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [load]);

  const heading = (
    <h2 id="h-sure" className="display text-[26px] font-semibold leading-tight">
      How sure the times are
    </h2>
  );
  if (!doc) {
    return (
      <section id="sure" aria-labelledby="h-sure" className="panel">
        {heading}
        <p className="mt-3 text-ink-2">{failed ? 'The margins could not be loaded. Reload the page, or try again in a minute.' : 'Loading the margins…'}</p>
      </section>
    );
  }
  const four = FOUR.map((id) => doc.sites.find((s) => s.site_id === id)).filter((s): s is SiteBudget => !!s);
  const polar = doc.sites.filter((s) => s.polar);
  const years = `${doc.span.start_utc.slice(0, 4)} and ${Number(doc.span.start_utc.slice(0, 4)) + Math.round(doc.span.days / 365) - 1}`;
  return (
    <section id="sure" aria-labelledby="h-sure" className="panel">
      {heading}
      <p className="mt-3 max-w-[46em] leading-relaxed text-ink-2">
        Each time was found again with one-minute steps and with NASA&apos;s adjusted elevation maps, at every featured site through {years}. A margin adds three sources of error and
        covers 95 % of the events.
      </p>
      <Table label="Margins at four kinds of site" minW={680}>
        <thead>
          <tr>
            <th className={TH}>Site</th>
            {TABLE_KINDS.map((k) => (
              <th key={k} className={`${TH} text-right`}>
                {EVENT_NAMES[k]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {four.map((s) => (
            <tr key={s.site_id}>
              <th scope="row" className={`${TD} font-medium text-ink`}>
                {nameOf(s)}: {s.condition}
              </th>
              {TABLE_KINDS.map((k) => (
                <td key={k} className={NUM}>
                  {margin(s.events[k].shown_h)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </Table>

      <Fold label="Each source apart" className="mt-4">
        <p className="max-w-[46em] text-[15px] text-ink-2">
          The terrain data matters most near the pole, where the Sun and Earth cross the hills slowly; the hourly steps add up to an hour; the planets&apos; positions add seconds. Hourly steps: how much later the hourly forecast names an event than one-minute steps find it. Terrain data: how far the event moves with NASA&apos;s adjusted maps, and with them raised and lowered
          by their own stated height error; an event those maps do not have at all is counted as lost. Planets&apos; positions: the largest gap to JPL Horizons, as time. Each is the 95th percentile.
        </p>
        <Table label="Each source apart" minW={760}>
          <thead>
            <tr>
              {['Site', 'Event', 'Events', 'Hourly steps', 'Terrain data', 'Planets’ positions', 'Margin'].map((h, i) => (
                <th key={h} className={`${TH} ${i >= 2 ? 'text-right' : ''}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {four.flatMap((s) =>
              TABLE_KINDS.filter((k) => s.events[k].sampling.n > 0).map((k) => {
                const e = s.events[k];
                const terrain = e.terrain
                  ? `${hours(e.terrain.p95_abs_h)}${e.terrain.lost ? `, ${e.terrain.lost} lost` : ''}`
                  : `flat horizon, ${s.skyline?.allowance_h ?? 2.5} h allowed`;
                return (
                  <tr key={`${s.site_id}-${k}`}>
                    <td className={TD}>{nameOf(s)}</td>
                    <td className={TD}>{EVENT_NAMES[k]}</td>
                    <td className={NUM}>{e.sampling.n}</td>
                    <td className={NUM}>{hours(e.sampling.p95_abs_h)}</td>
                    <td className={NUM}>{terrain}</td>
                    <td className={NUM}>{e.ephemeris.p95_s === null ? '—' : `${e.ephemeris.p95_s.toFixed(1)} s`}</td>
                    <td className={`${NUM} font-semibold`}>{margin(e.shown_h)}</td>
                  </tr>
                );
              }),
            )}
          </tbody>
        </Table>
      </Fold>

      <Fold label="The totals with the adjusted maps" className="mt-1">
        <p className="max-w-[46em] text-[15px] text-ink-2">
          The same two years at one-minute steps, with the app&apos;s hills and with NASA&apos;s adjusted maps. Near the pole a skyline a fraction of a degree higher can add days to the longest night.
        </p>
        <Table label="The totals with the adjusted maps" minW={720}>
          <thead>
            <tr>
              {['Site', 'Sunlight, ours', 'Sunlight, adjusted maps', 'Longest night, ours', 'Longest night, adjusted maps', 'Earth in view, ours', 'Earth in view, adjusted maps'].map((h, i) => (
                <th key={h} className={`${TH} ${i ? 'text-right' : ''}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {polar.map((s) => {
              const ours = s.durations?.fine;
              const adj = (s.durations as { other_skylines?: Record<string, typeof ours> } | undefined)?.other_skylines?.adjusted;
              return (
                <tr key={s.site_id}>
                  <td className={TD}>{nameOf(s)}</td>
                  <td className={NUM}>{pct(ours?.sunlit_pct)}</td>
                  <td className={NUM}>{pct(adj?.sunlit_pct)}</td>
                  <td className={NUM}>{span(ours?.longest_night_h)}</td>
                  <td className={NUM}>{span(adj?.longest_night_h)}</td>
                  <td className={NUM}>{pct(ours?.earth_pct)}</td>
                  <td className={NUM}>{pct(adj?.earth_pct)}</td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Fold>

      <Fold label="Every featured site" className="mt-1">
        <Table label="Every featured site" minW={760}>
          <thead>
            <tr>
              <th className={TH}>Site</th>
              {[...TABLE_KINDS, 'power_back' as const].map((k) => (
                <th key={k} className={`${TH} text-right`}>
                  {EVENT_NAMES[k]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {doc.sites.map((s) => (
              <tr key={s.site_id}>
                <td className={TD}>{nameOf(s)}</td>
                {[...TABLE_KINDS, 'power_back' as const].map((k) => (
                  <td key={k} className={NUM}>
                    {margin(s.events[k].shown_h)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </Table>
        <p className="mt-2 text-[15px] text-ink-2">&quot;none&quot;: the event does not happen there in the two years. A point that is not in the list gets the largest margin found at the featured sites near the pole.</p>
      </Fold>

      <Fold label="The ground at each site" className="mt-1">
        <p className="max-w-[46em] text-[15px] text-ink-2">
          From NASA&apos;s adjusted south-pole maps (PGDA product 90): the height error, the slope and its error and the finest detail the map resolves at the site, the roughness over 100 m, the nearest
          permanently shadowed ground within 10 km, and how far the adjusted maps&apos; skyline lies from ours in 95 % of directions.
        </p>
        <Table label="The ground at each site" minW={820}>
          <thead>
            <tr>
              {['Site', 'Height error', 'Slope', 'Detail', 'Roughness, 100 m', 'Permanent shadow', 'Skyline gap'].map((h, i) => (
                <th key={h} className={`${TH} ${i ? 'text-right' : ''}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {polar.map((s) => {
              const q = s.terrain_quality;
              return (
                <tr key={s.site_id}>
                  <td className={TD}>{nameOf(s)}</td>
                  <td className={NUM}>{q?.height_error_m != null ? `±${q.height_error_m.toFixed(1)} m` : '—'}</td>
                  <td className={NUM}>{q?.slope_deg != null ? `${q.slope_deg.toFixed(1)}° ±${(q.slope_error_deg ?? 0).toFixed(1)}°` : '—'}</td>
                  <td className={NUM}>{q?.effective_resolution_m != null ? `${Math.round(q.effective_resolution_m)} m` : '—'}</td>
                  <td className={NUM}>{q?.roughness_100m_m != null ? `${q.roughness_100m_m.toFixed(1)} m` : '—'}</td>
                  <td className={NUM}>{q ? (q.nearest_psr_km !== null ? `${q.nearest_psr_km.toFixed(1)} km` : `beyond ${q.psr_search_km} km`) : '—'}</td>
                  <td className={NUM}>{s.skyline?.adjusted_minus_app ? `${s.skyline.adjusted_minus_app.p95_abs_deg.toFixed(2)}°` : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Fold>

      <Fold label="How it was measured" className="mt-1">
        <div className="flex max-w-[52em] flex-col gap-2 text-[15px] text-ink-2">
          {doc.method &&
            (['sampling', 'terrain', 'ephemeris', 'combination', 'not_covered'] as const).map((k) => (
              <p key={k}>
                <b className="font-semibold text-ink">{{ sampling: 'Hourly steps', terrain: 'Terrain data', ephemeris: 'Planets’ positions', combination: 'The margin', not_covered: 'Not covered' }[k]}.</b> {doc.method![k]}
              </p>
            ))}
          {doc.ephemeris && (
            <p>
              The hourly table stores the positions to {doc.ephemeris.table_rounding_deg.sun.toExponential(0)}° (Sun) and {doc.ephemeris.table_rounding_deg.earth.toExponential(0)}° (Earth) of SPICE at the same
              hours.
            </p>
          )}
          {doc.product90 && (
            <>
              <p>
                Files read from NASA&apos;s Planetary Geology, Geophysics and Geochemistry Lab ({doc.product90.citation}):
              </p>
              <ul className="list-disc pl-5">
                {doc.product90.sources.map((f) => (
                  <li key={f.name}>
                    <a href={f.url} className="underline decoration-line-strong underline-offset-4 hover:decoration-ink">
                      {f.name}
                    </a>{' '}
                    ({f.access}{f.listed_size ? `, ${f.listed_size}` : ''}): {f.use}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </Fold>
    </section>
  );
}
