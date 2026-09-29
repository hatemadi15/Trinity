'use client';
import { useState } from 'react';
import type { Summary } from '@/lib/engine/metrics';
import type { PowerResult } from '@/lib/engine/power';
import { hoursLabel, pct } from '@/lib/viz/format';
import { VerdictChip } from './VerdictChip';

/** Plain-language notes shown under the tiles in Learn mode. */
const LEARN_NOTES: Record<string, string> = {
  'Sun above the skyline': 'share of hours with any sunlight on the panels',
  'Longest night': 'the longest stretch without sunlight; the battery must last this long',
  'Earth in view': 'share of hours a radio can see Earth directly',
  'Longest Earth gap': 'the longest silence without direct contact',
};

export function SummaryTiles({ summary, power, audience = 'planner' }: { summary: Summary; power?: PowerResult | null; audience?: 'planner' | 'learn' }) {
  const [table, setTable] = useState(false);
  let rows: [string, string, string][] = [
    ['Sun above the skyline', pct(summary.illumFraction), 'share of hours with any part of the Sun visible'],
    ['Longest night', hoursLabel(summary.longestDarkH), 'longest run of unlit hours'],
    ['Earth in view', pct(summary.earthVisFraction), 'share of hours with Earth above the skyline'],
    ['Longest Earth gap', hoursLabel(summary.longestEarthGapH), 'longest run without direct line of sight'],
    ['Both at once', pct(summary.jointFraction), 'lit and in contact with Earth'],
  ];
  if (power) {
    rows.push(['Lowest battery', pct(power.socMin), 'lowest state of charge in the window']);
    rows.push(['Hours without full power', hoursLabel(power.brownoutHours), 'battery empty and load not met']);
  }
  if (audience === 'learn') {
    rows = rows.filter(([k]) => k in LEARN_NOTES).map(([k, v]) => [k, v, LEARN_NOTES[k]]);
  }
  return (
    <section aria-label="Summary" className="flex flex-col gap-3">
      {power && <VerdictChip power={power} />}
      {table ? (
        <table className="w-full text-sm">
          <tbody>
            {rows.map(([k, v, note]) => (
              <tr key={k} className="border-t border-line">
                <th scope="row" className="py-1 text-left font-normal text-ink-2">
                  {k}
                </th>
                <td className="py-1 text-right font-medium">{v}</td>
                <td className="py-1 pl-3 text-ink-3">{note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
          {rows.map(([k, v, note]) => (
            <div key={k} className="border-t border-line pt-2">
              <dt className="text-sm text-ink-2">{k}</dt>
              <dd className="font-display text-2xl font-semibold leading-tight">{v}</dd>
              <dd className="text-xs text-ink-3">{note}</dd>
            </div>
          ))}
        </dl>
      )}
      <button
        type="button"
        onClick={() => setTable((t) => !t)}
        className="w-fit text-xs text-ink-2 underline-offset-4 hover:underline"
      >
        {table ? 'Show as tiles' : 'Show as table'}
      </button>
    </section>
  );
}
