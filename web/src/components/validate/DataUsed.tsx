/**
 * The datasets the app and its checks draw on, one row each: the dataset, who made it and what Earthrise uses it
 * for. docs/data-credits.md gives each one's files and citation; the links are the sources it names.
 */
export const DATASETS: { name: string; by: string; use: string; href?: string }[] = [
  {
    name: 'LRO LOLA elevation: 20 m, 80 m and 240 m grids',
    by: "NASA's Lunar Orbiter Laser Altimeter team",
    use: 'The hills around every site: skylines, shadow maps and the 3D terrain.',
    href: 'https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/',
  },
  {
    name: 'LOLA south pole terrain, adjusted (product 90)',
    by: "NASA Goddard's Planetary Geodesy Data Archive",
    use: 'How sure the times are: the skylines traced again on a second terrain model and its stated error.',
    href: 'https://pgda.gsfc.nasa.gov/products/90',
  },
  {
    name: 'JPL DE440 and SPICE kernels',
    by: 'NASA Jet Propulsion Laboratory',
    use: 'Where the Sun and Earth are, seen from the Moon, hour by hour.',
    href: 'https://naif.jpl.nasa.gov/pub/naif/generic_kernels/',
  },
  {
    name: 'JPL Horizons',
    by: 'NASA Jet Propulsion Laboratory',
    use: 'The first check, and its live re-check from this page.',
    href: 'https://ssd-api.jpl.nasa.gov/doc/horizons.html',
  },
  {
    name: 'LROC camera pictures: the south pole movie and two narrow-angle pictures',
    by: 'NASA Goddard and Arizona State University',
    use: 'The check of where shadows fall.',
    href: 'https://pds.mcp.nasa.gov/data/store/img/lunar_reconnaissance_orbiter/pds4/lroc/lro-l-lroc-5-rdr/LROLRC_2001/DATA/BDR/WAC_POLE/WAC_POLE_MOVIE_SOUTH/',
  },
  {
    name: 'LOLA polar illumination maps, 60 m',
    by: "NASA's Lunar Orbiter Laser Altimeter team",
    use: 'The check of how much sunlight a site gets.',
    href: 'https://pgda.gsfc.nasa.gov/products/69',
  },
  {
    name: 'LRO Diviner polar resource product',
    by: "The LRO Diviner team, through NASA's Planetary Data System",
    use: 'The modelled cold traps near each polar site.',
    href: 'https://pds-geosciences.wustl.edu/lro/urn-nasa-pds-lro_diviner_derived1/data_derived_prp/',
  },
  {
    name: 'Mission records: IM-1, IM-2 and Blue Ghost Mission 1',
    by: 'NASA and the companies that flew them',
    use: "Past missions: each one's reported end beside our predicted sunset.",
  },
];

const LINK = 'underline decoration-line-strong underline-offset-4 hover:decoration-ink';

/** "Data used": a compact panel of the datasets, two to a row on a wide screen. */
export function DataUsed() {
  return (
    <section aria-labelledby="h-data" className="panel">
      <h2 id="h-data" className="display text-[26px] font-semibold">
        Data used
      </h2>
      <ul className="mt-4 grid gap-x-10 md:grid-cols-2">
        {DATASETS.map((d) => (
          <li key={d.name} className="border-t border-line py-3">
            <p className="font-semibold text-ink">
              {d.href ? (
                <a href={d.href} target="_blank" rel="noreferrer" className={LINK}>
                  {d.name}
                </a>
              ) : (
                d.name
              )}
            </p>
            <p className="text-[15px] text-ink-2">{d.by}</p>
            <p className="mt-1 text-[15px] leading-relaxed text-ink">{d.use}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
