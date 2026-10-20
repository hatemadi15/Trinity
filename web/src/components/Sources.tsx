import Link from 'next/link';

/** The datasets a panel can draw on, by short key. docs/data-credits.md gives each one's source and citation. */
export type SourceKey = 'lola' | 'lola80' | 'illumination' | 'de440' | 'horizons' | 'artemis' | 'clps' | 'moonkit' | 'bluemarble' | 'stars';

/**
 * Each dataset in the shortest honest form. LOLA is named by its grid, as a reader can check it: 20 m near
 * the pole, 80 m where a panel knows it reads the coarser grid.
 */
export const SOURCE_LABELS: Record<SourceKey, string> = {
  lola: 'NASA LRO LOLA 20 m',
  lola80: 'NASA LRO LOLA 80 m',
  illumination: 'LOLA illumination map',
  de440: 'JPL DE440',
  horizons: 'checked: JPL Horizons',
  artemis: 'Artemis III regions',
  clps: 'CLPS mission records',
  moonkit: 'NASA CGI Moon Kit',
  bluemarble: 'NASA Blue Marble',
  stars: 'Yale Bright Star Catalogue',
};

/** The check is a link because the Accuracy page shows it row by row. */
const HREF: Partial<Record<SourceKey, string>> = { horizons: '/validate' };

/** South of this latitude a site's hills start on the 20 m grid, as the engine reads them (bandsForSite in engine/horizon.ts). */
const FINE_GRID_LAT = -87.55;

/**
 * The LOLA grids the hills of these places are read from, the finer first: 20 m south of 87.55° S, 80 m
 * farther out. A place off the polar grids adds none, because its horizon is taken as flat.
 */
export function lolaFor(...sites: { lat: number; polar: boolean }[]): SourceKey[] {
  const polar = sites.filter((s) => s.polar);
  const grids: SourceKey[] = [];
  if (polar.some((s) => s.lat <= FINE_GRID_LAT)) grids.push('lola');
  if (polar.some((s) => s.lat > FINE_GRID_LAT)) grids.push('lola80');
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
        return (
          <li key={k}>
            {href ? (
              // A link inside a row of pills is not standalone: it underlines only under the pointer.
              <Link href={href} className={`${PILL} underline-offset-4 hover:text-ink hover:underline`}>
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
