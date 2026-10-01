'use client';
import Link from 'next/link';
import type { RefObject } from 'react';
import { PeriodControls } from '@/components/PeriodControls';
import { siteLabel, type Site } from '@/lib/data/loaders';
import type { PowerConfig } from '@/lib/engine/power';
import { landerName } from '@/lib/lander';
import type { WindowDays } from '@/lib/store/explore';

function Chevron() {
  return (
    <svg viewBox="0 0 16 16" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-ink-3" aria-hidden="true">
      <path d="M3 6l5 5 5-5" />
    </svg>
  );
}

const TAG = 'shrink-0 rounded-full border border-line px-2.5 py-0.5 text-[15px] text-ink-2';

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
  return (
    <section aria-label="What this forecast is for" className="flex flex-wrap items-end gap-4">
      <div className="flex min-w-[250px] flex-[1.2] flex-col gap-1.5 text-[15px] text-ink-2">
        <span aria-hidden="true">Landing site</span>
        <Link href="/sites" aria-label={`Landing site: ${label}. Change site`} className="field flex items-center gap-3 text-base text-ink">
          <span className="grow truncate font-medium">{label}</span>
          <span className={TAG}>change site</span>
          <Chevron />
        </Link>
      </div>
      <PeriodControls startUtc={startUtc} days={days} onChange={onWindow} />
      <div className="flex min-w-[250px] flex-1 flex-col gap-1.5 text-[15px] text-ink-2">
        <span aria-hidden="true">Lander</span>
        <button ref={landerRef} type="button" onClick={onLander} aria-haspopup="dialog" aria-label={`Lander: ${lander}. Change`} className="field flex items-center gap-3 text-left text-base text-ink">
          <span className="grow truncate">{lander}</span>
          <span className={TAG}>change</span>
          <Chevron />
        </button>
      </div>
    </section>
  );
}
