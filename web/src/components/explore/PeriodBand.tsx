'use client';
import { useId, useState, type RefObject } from 'react';
import { PeriodControls } from '@/components/PeriodControls';
import { siteLabel, type Site } from '@/lib/data/loaders';
import type { PowerConfig } from '@/lib/engine/power';
import { landerName, presetOf } from '@/lib/lander';
import type { WindowDays } from '@/lib/store/explore';
import { startWords } from '@/lib/period';
import { SitePicker } from './SitePicker';

const TAG = 'shrink-0 rounded-full border border-line px-2.5 py-0.5 text-[15px] text-ink-2';

/**
 * The band on one line, as a phone shows it (spec 6): "de Gerlache Rim 2, 30 days from 1 January 2027, 00:00 UTC,
 * small lander". A ready-made lander by its size; any other is a custom lander.
 */
export function periodLine(label: string, startUtc: string, days: number, power: PowerConfig): string {
  const preset = presetOf(power);
  return `${label}, ${days} days from ${startWords(startUtc)}, ${preset ? `${preset.id} lander` : 'custom lander'}`;
}

/** The four things a forecast is for, in one row: the landing site (a drop-down, on this page), the start, the length and the lander. */
export function PeriodBand({
  site,
  sites,
  onSite,
  onOwn,
  startUtc,
  days,
  onWindow,
  power,
  onLander,
  landerRef,
}: {
  site: Site;
  /** The catalogue the site drop-down lists; a custom place is never in it. */
  sites: Site[];
  /** A site chosen in the drop-down: it loads in place, with the dates and the lander kept. */
  onSite: (id: string) => void;
  /** "Your own site…": the page opens its own-site fields. */
  onOwn: () => void;
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
        <SitePicker site={site} sites={sites} onSite={onSite} onOwn={onOwn} />
        {/* The lander is the period controls' next field, so the row they end with (the shift) comes after it. */}
        <PeriodControls startUtc={startUtc} days={days} onChange={onWindow}>
          <div className="flex min-w-0 flex-[1.8_1_250px] flex-col gap-1.5 text-[15px] text-ink-2">
            <span aria-hidden="true">Lander</span>
            <button ref={landerRef} type="button" onClick={onLander} aria-haspopup="dialog" aria-label={`${lander}. Change`} className="field flex h-auto min-h-[52px] min-w-0 items-center gap-3 py-2 text-left text-base text-ink">
              {/* The name wraps at every width, not only on a phone: it now carries the lander's name and its numbers, and a cut name would hide the battery.
                  A no-break space keeps each number with its unit, as it keeps "30 %" together, so a line never ends on "200" with the "W" on the next. */}
              <span className="grow">{lander.replace(/(\d) /g, '$1\u00a0')}</span>
              <span className={TAG}>change</span>
            </button>
          </div>
        </PeriodControls>
      </div>
    </section>
  );
}
