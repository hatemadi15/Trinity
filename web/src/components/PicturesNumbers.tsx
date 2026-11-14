import type { PictureRow, PicturesDoc } from '@/lib/data/validation';
import { picturePasses, shortPlace } from '@/lib/viz/pictures';

const TH = 'border-b-2 border-ink py-2 pr-4 text-left text-[15px] font-semibold text-ink-2';
const TD = 'border-b border-line py-2 pr-4 text-[15px]';
const NUM = `${TD} text-right tabular-nums`;
const NOTE = 'mt-3 max-w-[62em] break-words text-[15px] leading-relaxed text-ink-2';
const pctOf = (x: number | null) => (x === null ? '—' : `${(x * 100).toFixed(1)} %`);
const day = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/** The camera in words; the Narrow Angle Camera is a pair, left and right, and product 90 gives each its own picture. */
export function cameraWords(row: Pick<PictureRow, 'camera' | 'picture'>): string {
  if (row.camera === 'WAC') return 'Wide angle';
  return /RE_/.test(row.picture) ? 'Narrow angle, right' : /LE_/.test(row.picture) ? 'Narrow angle, left' : 'Narrow angle';
}

/** Which part of the mark a picture misses: the ground called alike, the lit ground or the dark ground. */
function shortfall(row: PictureRow, rule: { min_agree: number; min_found: number }): string {
  if (picturePasses(row, rule)) return 'yes';
  const parts = [
    row.agree < rule.min_agree ? 'called alike' : null,
    row.light_found !== null && row.light_found < rule.min_found ? 'lit ground' : null,
    row.shadow_found !== null && row.shadow_found < rule.min_found ? 'dark ground' : null,
  ].filter(Boolean);
  return `no: ${parts.join(' and ')}`;
}

/**
 * The numbers behind the check of shadows against pictures from orbit: every picture with its moment, its Sun and
 * how it compares, how a picture is read, how the frames were picked at each site, and where everything comes from.
 */
export function PicturesNumbers({ doc }: { doc: PicturesDoc }) {
  const rule = doc.evidence.criteria;
  const names = new Map(doc.sites.map((s) => [s.site_id, shortPlace(s.name)]));
  const [from, to] = doc.evidence.coverage.period;
  const minEl = doc.evidence.coverage.min_sun_el_deg;
  return (
    <>
      <p className="mb-3 max-w-[62em] text-[15px] leading-relaxed text-ink-2">
        How a picture is read: the app&apos;s shadow map for the moment it was taken is laid over it, the app&apos;s own pixels gathered into each of the picture&apos;s (100 m for the wide-angle camera, 20 m for the
        narrow-angle one). A pixel of the picture counts as lit when it is at least half as bright as sunlight would make that slope, the brightness of sunlight matched once a picture over the ground the app shows
        lit. Called alike is the share of the ground both show lit or both show dark; lit ground found is the share of the ground the camera shows lit that the app shows lit too, and dark ground found the same for
        dark ground. The last columns but one are the same comparison with NASA&apos;s newer south-pole terrain (product 90) and with the Sun turned a quarter of the way round, which no shadow map should match.
      </p>
      <table aria-label="Every picture against the app" className="w-full min-w-[1040px] border-collapse">
        <thead>
          <tr>
            <th className={TH}>Site</th>
            <th className={TH}>Camera</th>
            <th className={TH}>Taken (UTC)</th>
            <th className={`${TH} text-right`}>Sun up</th>
            <th className={`${TH} text-right`}>Called alike</th>
            <th className={`${TH} text-right`}>Lit ground found</th>
            <th className={`${TH} text-right`}>Dark ground found</th>
            <th className={`${TH} text-right`}>With NASA&apos;s newer terrain</th>
            <th className={`${TH} text-right`}>Sun turned a quarter</th>
            <th className={TH}>Meets the mark</th>
          </tr>
        </thead>
        <tbody>
          {doc.rows.map((r) => (
            <tr key={`${r.site_id}-${r.picture}`}>
              <td className={TD}>{names.get(r.site_id) ?? r.site_id}</td>
              <td className={TD}>{cameraWords(r)}</td>
              <td className={`${TD} tabular-nums`}>{r.mid_utc.slice(0, 16).replace('T', ' ')}</td>
              <td className={NUM}>{r.sun_el_deg.toFixed(1)}°</td>
              <td className={NUM}>{pctOf(r.agree)}</td>
              <td className={NUM}>{pctOf(r.light_found)}</td>
              <td className={NUM}>{pctOf(r.shadow_found)}</td>
              <td className={NUM}>{pctOf(r.product90.agree)}</td>
              <td className={NUM}>{pctOf(r.agree_sun_turned_90)}</td>
              <td className={TD}>{shortfall(r, rule)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3 className="mt-6 text-[17px] font-semibold text-ink">How the pictures were picked</h3>
      <p className={NOTE}>
        From the Wide Angle Camera&apos;s movie of the south pole, {day(from)} to {day(to)}: at each site, one frame for each quarter of the Sun&apos;s circle, the earliest whose picture covers the site&apos;s whole map with
        the Sun at least {minEl}° up. Every frame is one observation, placed on the map by the camera team.
      </p>
      <ul className="mt-2 flex max-w-[62em] list-disc flex-col gap-1 pl-5 text-[15px] leading-relaxed text-ink-2">
        {doc.sites.map((s) => {
          const wide = doc.rows.filter((r) => r.site_id === s.site_id && r.camera === 'WAC').length;
          return (
            <li key={s.site_id}>
              {shortPlace(s.name)} ({s.app_px_m} m terrain, a map {s.map_km} km across): {s.covered} of the month&apos;s {s.candidates} frames cover it, {s.sun_high_enough} with the Sun {minEl}° up;{' '}
              {wide === 0 ? 'none used' : `${wide} used`}.
            </li>
          );
        })}
      </ul>
      <p className={NOTE}>
        Sources: {doc.sources.join('; ')}. Made by <code>{doc.evidence.command}</code>.
      </p>
    </>
  );
}
