'use client';
import { useState } from 'react';
import type { Summary } from '@/lib/engine/metrics';
import { hoursLabel, pct } from '@/lib/viz/format';

export function SummaryTiles({ summary }: { summary: Summary }) {
  const [table, setTable] = useState(false);
  const rows: [string, string, string][] = [
    ['Sun above the skyline', pct(summary.illumFraction), 'share of hours with any part of the Sun visible'],
    ['Longest night', hoursLabel(summary.longestDarkH), 'longest run of unlit hours'],
    ['Earth in view', pct(summary.earthVisFraction), 'share of hours with Earth above the skyline'],
    ['Longest Earth gap', hoursLabel(summary.longestEarthGapH), 'longest run without direct line of sight'],
    ['Both at once', pct(summary.jointFraction), 'lit and in contact with Earth'],
  ];
  return (
    <section aria-label="Summary" className="flex flex-col gap-3">
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
