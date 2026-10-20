'use client';
import Link from 'next/link';
import { useRef, useState, type ReactNode } from 'react';
import { Modal } from '@/components/Modal';
import { lolaFor, Sources } from '@/components/Sources';
import type { Site } from '@/lib/data/loaders';
import { timeWithPower } from '@/lib/engine/landing';
import type { Summary } from '@/lib/engine/metrics';
import type { PowerResult } from '@/lib/engine/power';
import { batteryHours, landerLine } from '@/lib/lander';
import type { MaskMeta, PlannerParams } from '@/lib/store/explore';
import { pct, pct0, spanShort } from '@/lib/viz/format';

const ICON = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };

function Line({ icon, title, note, value, unit }: { icon: ReactNode; title: string; note: string; value: string; unit?: ReactNode }) {
  return (
    <div className="flex items-center gap-3.5 border-t border-line py-3 first:border-t-0 first:pt-0">
      <span className="shrink-0">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{title}</span>
        <span className="block text-[15px] text-ink-2">{note}</span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block display text-[28px] font-semibold leading-none">{value}</span>
        {unit && <span className="mt-1 ml-auto block max-w-[7.5em] text-[15px] text-ink-2">{unit}</span>}
      </span>
    </div>
  );
}

const QUIET = 'min-h-[40px] font-medium text-ink underline decoration-[1.5px] underline-offset-4 hover:decoration-2 disabled:text-ink-3 disabled:no-underline';

function coordinates(site: Site): string {
  const lat = `${Math.abs(site.lat).toFixed(3)}° ${site.lat < 0 ? 'S' : 'N'}`;
  const lon = `${Math.abs(site.lon).toFixed(3)}° ${site.lon < 0 ? 'W' : 'E'}`;
  return `${lat}, ${lon}`;
}

/** The three numbers behind the answer, and every other number behind "All numbers". */
export function NumbersCard({
  site,
  summary,
  power,
  params,
  days,
  maskMeta,
  contactHours,
}: {
  site: Site;
  summary: Summary;
  power: PowerResult;
  params: PlannerParams;
  days: number;
  maskMeta: MaskMeta | null;
  /** Hours with power that have Earth in view: the contact the verdict speaks of. */
  contactHours: number;
}) {
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const dark = batteryHours(params.power);
  const withPower = timeWithPower(power);
  const hills =
    maskMeta?.source === 'flat'
      ? 'flat: this place lies outside the polar elevation maps'
      : maskMeta?.source === 'computed'
        ? 'from NASA elevation data, worked out in your browser'
        : 'from NASA elevation data, worked out ahead of time';
  const rows: [string, string, string][] = [
    ['Sunlight', pct(summary.illumFraction), 'share of the hours with any part of the Sun above the hills'],
    ['Longest night', spanShort(summary.longestDarkH), 'the longest stretch with the Sun set'],
    ['Contact with Earth', pct(summary.earthVisFraction), 'share of the hours with Earth in view for a direct radio link'],
    ['Longest time without Earth', spanShort(summary.longestEarthGapH), 'the longest stretch with Earth set'],
    ['Sunlight and Earth together', pct(summary.jointFraction), 'share of the hours with both'],
    ['Time with power from the start', withPower >= summary.hours ? `all ${days} days` : spanShort(withPower), 'until the battery first runs out'],
    ['Time without power', spanShort(power.brownoutHours), 'hours the lander is off in the period'],
    ['Lowest battery', `${Math.round(power.socMin * 100)} %`, 'the lowest charge in the period'],
    ['Average power from the panel', `${Math.round(power.meanPowerW)} W`, landerLine(params.power)],
    ['Mast', `${params.mastM} m`, 'the height the Sun and Earth are seen from'],
    ['Earth counts as in view', `${params.minEarthElDeg}° or more above the hills`, 'a radio needs a little clearance'],
    ['Height of the hills', hills, maskMeta && maskMeta.failedTiles > 0 ? `${maskMeta.failedTiles} pieces of the elevation map could not be loaded; some hills may be missing` : 'in 720 directions around the site'],
    [
      'Where',
      coordinates(site),
      `${maskMeta ? `${maskMeta.siteHeightM.toFixed(0)} m above the Moon's mean radius` : ''}${site.approximate ? `${maskMeta ? '; ' : ''}the centre of the region, read from NASA's map to about 5 km` : ''}`,
    ],
  ];
  return (
    <section aria-label="The numbers" className="panel flex flex-col">
      <Line
        icon={
          <svg {...ICON} className="text-sun-ink">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" />
          </svg>
        }
        title="Sunlight"
        note={`share of the ${days} days with the Sun above the hills`}
        value={pct0(summary.illumFraction)}
      />
      <Line
        icon={
          <svg {...ICON} className="text-earth-ink">
            <circle cx="12" cy="12" r="9" />
            <path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18" />
          </svg>
        }
        title="Radio contact while it has power"
        note={
          contactHours > 0 || summary.earthVisFraction === 0
            ? `Earth is in view ${pct0(summary.earthVisFraction)} of the ${days} days in all`
            : `Earth is in view ${pct0(summary.earthVisFraction)} of the ${days} days, but not while the lander has power`
        }
        value={contactHours > 0 ? spanShort(contactHours) : 'none'}
      />
      <Line
        icon={
          <svg {...ICON} className="text-ink-3">
            <rect x="2.5" y="7" width="16.5" height="10" rx="2.2" />
            <path d="M21.5 10.5v3" />
          </svg>
        }
        title="Lander"
        note={landerLine(params.power)}
        value={Number.isFinite(dark) ? spanShort(dark) : 'no load'}
        unit={
          <>
            of battery <span className="whitespace-nowrap">when full</span>
          </>
        }
      />
      <p className="mt-auto flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-2">
        <button ref={opener} type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" className={QUIET}>
          All numbers
        </button>
        <Link href="/brief" className={`${QUIET} inline-flex items-center`}>
          Printable brief
        </Link>
      </p>
      {/* DE440 gives every figure and LOLA the hills on the site's grid; the Sun's and Earth's directions are checked against JPL Horizons. */}
      <Sources of={['de440', ...lolaFor(site), 'horizons']} />
      {open && (
        <Modal title="All numbers" onClose={() => setOpen(false)} returnFocus={opener} wide>
          <p className="mt-2 text-ink-2">
            {site.label ?? site.name}, {days} days.
          </p>
          <table className="mt-4 w-full border-collapse text-left">
            <tbody>
              {rows.map(([label, value, note]) => (
                <tr key={label} className="border-t border-line align-top">
                  <th scope="row" className="py-2.5 pr-4 font-medium">
                    {label}
                  </th>
                  <td className="py-2.5 pr-4 font-semibold">{value}</td>
                  <td className="py-2.5 text-[15px] text-ink-2">{note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Modal>
      )}
    </section>
  );
}
