'use client';
import Link from 'next/link';
import { useId, useState, type RefObject } from 'react';
import { PeriodControls } from '@/components/PeriodControls';
import { siteLabel, type Site } from '@/lib/data/loaders';
import type { PowerConfig } from '@/lib/engine/power';
import { landerName, presetOf } from '@/lib/lander';
import type { WindowDays } from '@/lib/store/explore';
import { dateLong } from '@/lib/viz/format';

const TAG = 'shrink-0 rounded-full border border-line px-2.5 py-0.5 text-[15px] text-ink-2';

/**
 * The band on one line, as a phone shows it (spec 6): "de Gerlache Rim 2, 30 days from 1 January 2027, small
 * lander". A ready-made lander by its size; any other is a custom lander.
 */
export function periodLine(label: string, startUtc: string, days: number, power: PowerConfig): string {
  const preset = presetOf(power);
  return `${label}, ${days} days from ${dateLong(startUtc, 0)} ${startUtc.slice(0, 4)}, ${preset ? `${preset.id} lander` : 'custom lander'}`;
}

/** The four things a forecast is for, in one row: the landing site, the start, the length and the lander. */
export function PeriodBand({
  site,
  startUtc,
  days,
  onWindow,
  power,
  onLander,
  landerRef,
}: {
  site: Site;
  startUtc: string;
  days: WindowDays;
  onWindow: (startUtc: string, days: WindowDays) => void;
  power: PowerConfig;
  onLander: () => void;
  landerRef?: RefObject<HTMLButtonElement | null>;
}) {
  const label = siteLabel(site);
  const lander = landerName(power);
  const [open, setOpen] = useState(false);
  const fieldsId = useId();
  return (
    <section aria-label="What this forecast is for" className="flex min-w-0 flex-wrap items-end gap-4">
      {/* On a phone the four fields fold into this one line, so the answer is on the first screen (spec 6). */}
      <p className="flex w-full flex-wrap items-baseline gap-x-2 text-base text-ink-2 sm:hidden">
        <span>{periodLine(label, startUtc, days, power)}:</span>
        <button type="button" aria-expanded={open} aria-controls={fieldsId} onClick={() => setOpen((o) => !o)} className="min-h-11 font-semibold text-ink underline underline-offset-4">
          {open ? 'done' : 'change'}
        </button>
      </p>
      <div id={fieldsId} className={`contents ${open ? '' : 'max-sm:hidden'}`}>
        <div className="flex min-w-0 flex-[1_1_250px] flex-col gap-1.5 text-[15px] text-ink-2">
          <span aria-hidden="true">Landing site</span>
          <Link href="/sites" aria-label={`Landing site: ${label}. Change site`} className="field flex min-w-0 items-center gap-3 text-base text-ink">
            <span className="grow truncate font-medium">{label}</span>
            <span className={TAG}>change site</span>
          </Link>
        </div>
        <PeriodControls startUtc={startUtc} days={days} onChange={onWindow} />
        <div className="flex min-w-0 flex-[1.8_1_250px] flex-col gap-1.5 text-[15px] text-ink-2">
          <span aria-hidden="true">Lander</span>
          <button ref={landerRef} type="button" onClick={onLander} aria-haspopup="dialog" aria-label={`Lander: ${lander}. Change`} className="field flex min-w-0 items-center gap-3 text-left text-base text-ink max-sm:h-auto max-sm:min-h-[52px] max-sm:py-2">
            {/* On a phone the name wraps rather than cut "2 kWh" to "2 kW…". */}
            <span className="grow truncate max-sm:overflow-visible max-sm:whitespace-normal">{lander}</span>
            <span className={TAG}>change</span>
          </button>
        </div>
      </div>
    </section>
  );
}
