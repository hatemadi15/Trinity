import Link from 'next/link';

/** The datasets a panel can draw on, by short key. docs/data-credits.md gives each one's source and citation. */
export type SourceKey = 'lola' | 'lola80' | 'lola240' | 'illumination' | 'diviner' | 'de440' | 'horizons' | 'artemis' | 'clps' | 'landers' | 'moonkit' | 'bluemarble' | 'stars';

/**
 * Each dataset in the shortest honest form. LOLA is named by its grid, as a reader can check it: 20 m near
 * the pole, 80 m where a panel knows it reads the coarser grid.
 */
export const SOURCE_LABELS: Record<SourceKey, string> = {
  lola: 'NASA LRO LOLA 20 m',
  lola80: 'NASA LRO LOLA 80 m',
  lola240: 'NASA LRO LOLA 240 m',
  illumination: 'LOLA illumination map',
  diviner: 'LRO Diviner temperature model',
  de440: 'JPL DE440',
  horizons: 'checked: JPL Horizons',
  artemis: 'Artemis III regions',
  clps: 'CLPS mission records',
  landers: 'LROC and NSSDCA lander positions',
  moonkit: 'NASA CGI Moon Kit',
  bluemarble: 'NASA Blue Marble',
  stars: 'Yale Bright Star Catalogue',
};

/**
 * The check is a link because the Accuracy page shows it row by row. The modelled cold traps link to the Diviner product
 * they are read from, as docs/data-credits.md gives it.
 */
const HREF: Partial<Record<SourceKey, string>> = { horizons: '/validate', diviner: 'https://pds-geosciences.wustl.edu/lro/urn-nasa-pds-lro_diviner_derived1/data_derived_prp/' };

/** South of this latitude a site's hills start on the 20 m grid, as the engine reads them (bandsForSite in engine/horizon.ts). */
const FINE_GRID_LAT = -87.55;
/** The 80 m grid stops at 80° S: north of it the engine marches the whole skyline on the 240 m grid. */
const EDGE_80M_LAT = -80;

/**
 * The LOLA grids the hills of these places are read from, the finer first: 20 m south of 87.55° S, 80 m
 * to 80° S, 240 m from there to 60° S. A place off the polar grids adds none, because its horizon is taken as flat.
 */
export function lolaFor(...sites: { lat: number; polar: boolean }[]): SourceKey[] {
  const polar = sites.filter((s) => s.polar);
  const grids: SourceKey[] = [];
  if (polar.some((s) => s.lat <= FINE_GRID_LAT)) grids.push('lola');
  if (polar.some((s) => s.lat > FINE_GRID_LAT && s.lat <= EDGE_80M_LAT)) grids.push('lola80');
  if (polar.some((s) => s.lat > EDGE_80M_LAT)) grids.push('lola240');
  return grids;
}

/** An outline with no fill, so the row stays quieter than the panel's own figures. */
const PILL = 'block whitespace-nowrap rounded-full border border-line px-2.5 py-0.5';

/**
 * One row at the foot of a panel that names the data the panel draws on, one pill per dataset. A key it
 * does not know draws nothing, and a row with no pill left is not drawn.
 */
export function Sources({ of }: { of: SourceKey[] }) {
  // A key named twice is still one dataset, so it gets one pill.
  const keys = [...new Set(of)].filter((k) => Object.hasOwn(SOURCE_LABELS, k));
  if (keys.length === 0) return null;
  return (
    <ul aria-label="Data sources" className="mt-4 flex flex-wrap gap-2 text-[14px] text-ink-2">
      {keys.map((k) => {
        const href = HREF[k];
        // A link inside a row of pills is not standalone: it underlines only under the pointer.
        const linkClass = `${PILL} underline-offset-4 hover:text-ink hover:underline`;
        return (
          <li key={k}>
            {href?.startsWith('https://') ? (
              // Another site's page opens beside this one, so the planner keeps their place.
              <a href={href} target="_blank" rel="noreferrer" className={linkClass}>
                {SOURCE_LABELS[k]}
              </a>
            ) : href ? (
              <Link href={href} className={linkClass}>
                {SOURCE_LABELS[k]}
              </Link>
            ) : (
              <span className={PILL}>{SOURCE_LABELS[k]}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
