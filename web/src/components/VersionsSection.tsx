'use client';
import { useEffect, useState } from 'react';
import { Fold } from './Fold';
import { dataBase } from '@/lib/data/base';
import { loadEnsembleIndex, type EnsembleIndex } from '@/lib/ensemble/versions';
import { ABOUT, LIMITS } from '@/lib/ensemble/words';
import { siteBudget, type UncertaintyDoc } from '@/lib/uncertainty/budget';
import { useUncertainty } from '@/lib/uncertainty/useUncertainty';

const TH = 'border-b-2 border-ink py-2 pr-4 text-left text-[15px] font-semibold text-ink-2';
const TD = 'border-b border-line py-2 pr-4 text-[15px]';
const NUM = `${TD} text-right tabular-nums`;
const GRIDS = ['20', '80', '240'] as const;
const defaultLoad = () => loadEnsembleIndex(dataBase());

const m = (x: number) => `${x.toFixed(x < 1 ? 2 : 1)} m`;
const deg = (x: number) => `${x < 0.1 ? x.toFixed(3) : x.toFixed(2)}°`;
const share = (x: number | undefined) => (x === undefined ? '—' : `${Math.round(x * 100)} %`);
/** A ratio to the stated error; past a hundred the stated error is a few ten-thousandths of a degree and the ratio says little more. */
const ratioWords = (x: number | undefined) => (x === undefined ? '—' : x > 100 ? 'over 100×' : `${x.toFixed(1)}×`);
const days = (h: number) => (h >= 48 ? `${(h / 24).toFixed(1)} d` : `${h.toFixed(0)} h`);

/** A table that moves sideways inside its own box on a phone, so the page never does, and says so there. */
function Table({ label, minW, children }: { label: string; minW: number; children: React.ReactNode }) {
  return (
    <div className="mt-3 overflow-x-auto">
      <p className="mb-2 text-[15px] text-ink-2 sm:hidden">Swipe the table sideways to see every column.</p>
      <table aria-label={label} className="w-full border-collapse" style={{ minWidth: minW }}>
        {children}
      </table>
    </div>
  );
}

/**
 * Why the app's own skyline falls outside the versions where it does: the site's own height, which the older maps put
 * further from product 90's than the versions move a site, named site by site from the budget's heights.
 */
export function outsideWords(doc: EnsembleIndex, budget: UncertaintyDoc | null): string {
  const off = doc.sites.flatMap((s) => {
    const b = siteBudget(budget, s.site_id);
    const app = b?.skyline?.site_height_app_m;
    const adj = b?.skyline?.site_height_adjusted_m;
    if (s.app_inside_p05_p95 === undefined || s.app_inside_p05_p95 >= 0.6 || app === undefined || adj === undefined) return [];
    const d = app - adj;
    return Math.abs(d) >= 1 ? [`${b?.label ?? b?.name} ${Math.abs(d).toFixed(1)} m ${d < 0 ? 'lower' : 'higher'}`] : [];
  });
  if (!off.length) return 'The app’s own skyline falls among the versions in most directions at every site.';
  const list = off.length === 1 ? off[0] : `${off.slice(0, -1).join(', ')} and ${off[off.length - 1]}`;
  return `Where the app’s skyline falls outside the versions, it is mostly the site itself: the older maps put ${list} than product 90 does, more than the versions move a site. A point chosen as the highest of the older map, as the derived rim summits were, is where that map’s own error is most likely to be upward.`;
}

/**
 * The Accuracy page's part on the terrain versions: how far two generations of NASA's south-pole maps differ against the
 * error the newer one states, the error model fitted to that, what the versions drawn from it show at each polar site
 * (how widely the skyline spreads, whether the app's own skyline falls among them, the longest night across them), and
 * what they cannot show.
 */
export function VersionsSection({ load = defaultLoad, uncertainty }: { load?: () => Promise<EnsembleIndex>; uncertainty?: () => Promise<UncertaintyDoc> }) {
  const [doc, setDoc] = useState<EnsembleIndex | null>(null);
  const [failed, setFailed] = useState(false);
  const budget = useUncertainty(uncertainty);
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
    <h2 id="h-versions" className="display text-[26px] font-semibold leading-tight">
      Terrain versions
    </h2>
  );
  if (!doc) {
    return (
      <section id="versions" aria-labelledby="h-versions" className="panel">
        {heading}
        <p className="mt-3 text-ink-2">{failed ? 'The terrain versions could not be loaded. Reload the page, or try again in a minute.' : 'Loading the terrain versions…'}</p>
      </section>
    );
  }
  const g80 = doc.model['80'];
  const n = doc.versions_per_site;
  const inside = doc.sites.map((s) => s.app_inside_p05_p95).filter((x): x is number => x !== undefined);
  const medianInside = inside.length ? [...inside].sort((a, b) => a - b)[Math.floor(inside.length / 2)] : null;
  return (
    <section id="versions" aria-labelledby="h-versions" className="panel">
      {heading}
      <p className="mt-3 max-w-[46em] leading-relaxed text-ink-2">
        Two generations of NASA&apos;s south-pole maps, made from the same laser shots, differ by {m(g80.difference_rms_m.median)} on the 80 m grid: {Math.round(g80.difference_over_stated_error.median)} times the error the newer one states. Each of the {doc.sites.length} polar sites has {n} versions of the ground drawn with errors that large, to see how far its results move.
      </p>
      <Table label="The error model fitted to the two generations" minW={720}>
        <thead>
          <tr>
            {['Grid', 'Maps differ by', 'Stated error', 'Ratio', 'Correlated over', 'Within the fitted error'].map((h, i) => (
              <th key={h} className={`${TH} ${i ? 'text-right' : ''}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {GRIDS.filter((k) => doc.model[k]).map((k) => {
            const r = doc.model[k];
            return (
              <tr key={k}>
                <th scope="row" className={`${TD} text-left font-medium text-ink`}>
                  {k} m
                </th>
                <td className={NUM}>{m(r.difference_rms_m.median)}</td>
                <td className={NUM}>{m(r.stated_error_rms_m.median)}</td>
                <td className={NUM}>{Math.round(r.difference_over_stated_error.median)}×</td>
                <td className={NUM}>{Math.round(r.length_m)} m</td>
                <td className={NUM}>
                  {share(r.within_1_sigma)} within 1σ, {share(r.within_2_sigma)} within 2σ
                </td>
              </tr>
            );
          })}
        </tbody>
      </Table>
      <p className="mt-3 max-w-[46em] text-[15px] leading-relaxed text-ink-2">
        Root mean square over the sites. On the 80 m grid the fitted error is {m(g80.sigma.a_m)} on level ground, growing with the slope ({g80.sigma.b_m.toFixed(1)} m times its tangent) and with the stated error ({g80.sigma.c.toFixed(1)} times
        it); it stops being correlated within about a pixel ({Math.round(g80.length_m)} m), so neighbouring points of the ground are off by different amounts. A Gaussian error would put 68 % and 95 % of the differences within one and two of its sigmas.
      </p>

      <Fold label="What the versions show" className="mt-4">
        <p className="max-w-[46em] text-[15px] text-ink-2">
          For each site: how far the versions&apos; skylines spread (their standard deviation in each of 720 directions, the median and the 95th percentile over directions), against the skyline error product 90 states; how often the app&apos;s
          own skyline, from the older maps, lies within the versions&apos; middle 90 %, which a model that captured everything would make about 90 % of directions{medianInside !== null ? ` (the median site: ${share(medianInside)})` : ''}; and the
          longest night of two years at one-minute steps across the versions.
        </p>
        <Table label="What the versions show at each site" minW={860}>
          <thead>
            <tr>
              {['Site', 'Skyline spread, median', 'Skyline spread, 95th percentile', 'Spread over stated error', 'App’s skyline within the versions', 'Longest night, app', 'Longest night, versions'].map((h, i) => (
                <th key={h} className={`${TH} ${i ? 'text-right' : ''}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {doc.sites.map((s) => {
              const b = siteBudget(budget, s.site_id);
              const night = b?.durations?.fine?.longest_night_h;
              const v = b?.durations?.versions?.longest_night_h;
              return (
                <tr key={s.site_id}>
                  <td className={TD}>{b?.label ?? b?.name ?? s.site_id}</td>
                  <td className={NUM}>{deg(s.sd_deg.median)}</td>
                  <td className={NUM}>{deg(s.sd_deg.p95)}</td>
                  <td className={NUM}>{ratioWords(s.sd_over_stated_sigma?.median)}</td>
                  <td className={NUM}>{share(s.app_inside_p05_p95)}</td>
                  <td className={NUM}>{night === undefined ? '—' : days(night)}</td>
                  <td className={NUM}>{v ? (Math.abs(v.p95 - v.p05) < 0.5 ? days(v.median) : `${days(v.p05)} to ${days(v.p95)}`) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </Table>
        <p className="mt-2 max-w-[46em] text-[15px] text-ink-2">
          {outsideWords(doc, budget)} The night ranges cover the 5th to 95th percentile of the versions.
        </p>
      </Fold>

      <Fold label="What they cannot show" className="mt-1">
        <div className="flex max-w-[46em] flex-col gap-2 text-[15px] text-ink-2">
          <p>{ABOUT}</p>
          <p>{LIMITS}</p>
          <p>{doc.not_captured}</p>
        </div>
      </Fold>

      <Fold label="How they were made" className="mt-1">
        <div className="flex max-w-[52em] flex-col gap-2 text-[15px] text-ink-2">
          <p>{doc.method}</p>
          <p>
            {n} versions per site, {doc.sites.length} sites, from a fixed seed; {Math.round(doc.bytes / 1000)} kB in all ({doc.source}). Made by the pipeline&apos;s ensemble command after its error-model command; the uncertainty budget&apos;s terrain
            part now also takes each event&apos;s spread over the versions.
          </p>
        </div>
      </Fold>
    </section>
  );
}
