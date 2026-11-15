import type { PicturesDoc } from '@/lib/data/validation';
import { picturePasses, shortPlace } from '@/lib/viz/pictures';

/** The picture shown: the Wide Angle Camera's frame of the peak near Shackleton (pipeline/scratch/accuracy_example.py draws both halves). */
export const EXAMPLE = { site_id: 'peak_near_shackleton', picture: 'WAC_MOVIE_S20090923T1216' };

const pct = (x: number) => `${Math.round(x * 100)} %`;
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const dayWords = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
/** How much longer a shadow grows for each metre of height, with the Sun this many degrees up. */
const metresPerMetre = (elDeg: number) => Math.round(1 / Math.tan((elDeg * Math.PI) / 180));

const FRAME = 'stage aspect-square w-full';
const CAPTION = 'mt-2 text-[15px] leading-snug text-ink-2';

/**
 * The check of shadows against pictures from orbit, shown on one real picture and said in a few plain sentences:
 * the camera's picture beside the app's shadows for the same minute, how to read the pair, what was compared, what
 * the share means, why the control matters and why the pictures that miss do. Every number comes from the check's
 * own table (`data/validation/images.json`), so the words cannot drift from it.
 */
export function ShadowExample({ doc }: { doc: PicturesDoc }) {
  const rule = doc.evidence.criteria;
  const rows = doc.rows;
  const row = rows.find((r) => r.site_id === EXAMPLE.site_id && r.picture === EXAMPLE.picture);
  const failing = rows.filter((r) => !picturePasses(r, rule));
  const sites = new Set(rows.map((r) => r.site_id)).size;
  const typical = pct(median(rows.map((r) => r.agree)));
  const control = pct(median(rows.map((r) => r.agree_sun_turned_90)));
  const lowSun = failing.length > 0 ? Math.max(...failing.map((r) => r.sun_el_deg)) : null;
  const site = doc.sites.find((s) => s.site_id === EXAMPLE.site_id);
  return (
    <div data-part="example" className="mt-5 grid gap-x-10 gap-y-5 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-start">
      {row && (
        <figure className="min-w-0">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              {/* eslint-disable-next-line @next/next/no-img-element -- a small bundled picture, shown at its own size */}
              <img src="/validation/shadows-camera.jpg" alt={`The camera's picture: sunlit ground and long shadows near ${site ? shortPlace(site.name) : 'the south pole'}.`} width={615} height={615} loading="lazy" className={FRAME} />
              <p className={CAPTION}>
                <span className="font-semibold text-ink">The camera.</span> NASA&apos;s orbiter, {dayWords(row.mid_utc)}, the Sun {row.sun_el_deg.toFixed(1)}° up.
              </p>
            </div>
            <div>
              {/* eslint-disable-next-line @next/next/no-img-element -- a small bundled picture, shown at its own size */}
              <img src="/validation/shadows-app.jpg" alt="The app's shadows for the same minute, with the ground the two call differently in orange along the shadows' edges." width={615} height={615} loading="lazy" className={FRAME} />
              <p className={CAPTION}>
                <span className="font-semibold text-ink">The app.</span> Its shadows for the same minute.
              </p>
            </div>
          </div>
          <figcaption data-part="how-to-read" className="mt-3 max-w-[46em] leading-relaxed text-ink">
            How to read it: pale is sunlit, dark is shadow, the same ground {site ? `${Math.round(site.map_km)} km across` : 'in both'}. Orange is the {pct(1 - row.agree)} where the app and the camera differ; they agree on{' '}
            {pct(row.agree)}.
          </figcaption>
        </figure>
      )}
      <dl data-part="explained" className="flex max-w-[46em] flex-col gap-4 leading-relaxed">
        <div>
          <dt className="font-semibold text-ink">What was compared</dt>
          <dd className="text-ink-2">
            The app&apos;s shadow map, laid over {rows.length} pictures of {sites} sites from the Lunar Reconnaissance Orbiter&apos;s cameras, each at the minute it was taken.
          </dd>
        </div>
        <div>
          <dt className="font-semibold text-ink">What {typical} means</dt>
          <dd className="text-ink-2">In the typical picture, the app and the camera call {typical} of the ground alike: both lit, or both dark.</dd>
        </div>
        <div>
          <dt className="font-semibold text-ink">The control</dt>
          <dd className="text-ink-2">With the Sun turned a quarter of the way round, the same test agrees on only {control}. So the match comes from shadows in the right place, not from the lie of the land.</dd>
        </div>
        {lowSun !== null && (
          <div>
            <dt className="font-semibold text-ink">Why {failing.length} miss</dt>
            <dd className="text-ink-2">
              {failing.length === 1 ? 'It was' : `All ${failing.length} were`} taken with the Sun {lowSun.toFixed(1)}° up or less. That low, a hill 1 m higher casts a shadow about {metresPerMetre(lowSun)} m longer, so small
              errors in height move a shadow&apos;s edge a long way.
            </dd>
          </div>
        )}
        <div>
          <dt className="font-semibold text-ink">The verdict</dt>
          <dd className="text-ink-2">
            {failing.length === 0
              ? `All ${rows.length} pictures meet the mark, set after a first look at five of them, before the rest were compared.`
              : `${rows.length - failing.length} of ${rows.length} pictures meet the mark, set after a first look at five of them, before the rest were compared. It asks for every picture, so this check misses its own mark.`}
          </dd>
        </div>
      </dl>
    </div>
  );
}
