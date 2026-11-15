'use client';
import { useState } from 'react';
import { SitePicker } from '../explore/SitePicker';
import { siteLabel, type Site } from '@/lib/data/loaders';
import { NEARBY_KM } from '@/lib/scenario/nearby';
import { periodProblem } from '@/lib/scenario/period';
import { slipLabel } from '@/lib/scenario/scenario';
import { landingShort, type Column } from '@/lib/viz/compare';
import { landingTitle } from './ScenarioCard';

const UNITS = { days: 24, hours: 1 } as const;
const CHOICE = 'flex min-w-0 flex-col gap-2';
const LABEL = 'flex flex-col gap-1 text-[15px] text-ink-2';

/**
 * "Add a landing": three plain ways to put another landing beside the ones on the page, each a copy of one of them
 * (the visitor's own, unless they choose another) with one thing moved: the date, the place to the best one nearby, or
 * the place and the date both. Each says what it does and what it keeps.
 */
export function AddLanding({
  id,
  cols,
  sites,
  searching,
  onLater,
  onNearby,
  onAny,
}: {
  id: string;
  cols: Column[];
  sites: Site[];
  /** A nearby search is under way. */
  searching: boolean;
  onLater: (from: string, hours: number) => void;
  onNearby: (from: string) => void;
  onAny: (from: string, siteId: string, startUtc: string) => void;
}) {
  const [fromId, setFromId] = useState(cols[0].scenario.id);
  const from = cols.find((c) => c.scenario.id === fromId) ?? cols[0];
  const [n, setN] = useState('5');
  const [unit, setUnit] = useState<keyof typeof UNITS>('days');
  const [way, setWay] = useState<'later' | 'earlier'>('later');
  const count = Number(n);
  const valid = Number.isInteger(count) && count >= 1 && count <= (unit === 'days' ? 365 : 999);
  const hours = (way === 'later' ? 1 : -1) * count * UNITS[unit];
  // Any place and date: the place and the day start as the landing's own, until one is chosen.
  const [siteId, setSiteId] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [ownHint, setOwnHint] = useState(false);
  const site = sites.find((x) => x.id === (siteId ?? from.scenario.siteId)) ?? from.site;
  const day = date ?? from.scenario.startUtc.slice(0, 10);
  const startUtc = `${day}T${from.scenario.startUtc.slice(11, 19)}`;
  const dayOk = /^\d{4}-\d{2}-\d{2}$/.test(day);
  const problem = dayOk ? periodProblem(startUtc, from.scenario.days) : 'Choose a landing date.';
  const same = site.id === from.scenario.siteId && startUtc === from.scenario.startUtc;

  return (
    <section id={id} aria-labelledby={`${id}-h`} className="flex flex-col gap-5 sm:rounded-lg sm:border sm:border-line-strong sm:bg-surface sm:px-6 sm:py-5">
      <div>
        <h3 id={`${id}-h`} className="display text-[21px] font-semibold">
          Add a landing to compare
        </h3>
        {cols.length > 1 ? (
          <label className={`${LABEL} mt-2 max-w-[420px]`}>
            Start from a copy of
            <select value={from.scenario.id} onChange={(e) => setFromId(e.target.value)} className="field h-11">
              {cols.map((c, i) => (
                <option key={c.scenario.id} value={c.scenario.id}>
                  {landingTitle(i)}: {c.scenario.label}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="mt-1 text-ink-2">Each is a copy of your landing with one thing moved.</p>
        )}
      </div>
      <div className="grid gap-x-8 gap-y-6 md:grid-cols-2">
        <form
          aria-labelledby={`${id}-later`}
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) onLater(from.scenario.id, hours);
          }}
          className={CHOICE}
        >
          <h4 id={`${id}-later`} className="font-semibold text-ink">
            Same place, later date
          </h4>
          <p className="text-[15px] text-ink-2">What if the landing is late? The place and the lander stay; only the date moves.</p>
          <div className="flex flex-wrap items-end gap-2">
            <label className={LABEL}>
              Move the landing by
              <input type="number" min={1} max={unit === 'days' ? 365 : 999} step={1} value={n} onChange={(e) => setN(e.target.value)} className="field h-11 w-[84px]" />
            </label>
            <label className={LABEL}>
              <span className="sr-only">Days or hours</span>
              <select value={unit} onChange={(e) => setUnit(e.target.value as keyof typeof UNITS)} className="field h-11">
                <option value="days">days</option>
                <option value="hours">hours</option>
              </select>
            </label>
            <label className={LABEL}>
              <span className="sr-only">Later or earlier</span>
              <select value={way} onChange={(e) => setWay(e.target.value as 'later' | 'earlier')} className="field h-11">
                <option value="later">later</option>
                <option value="earlier">earlier</option>
              </select>
            </label>
            <button type="submit" disabled={!valid} className="btn">
              {valid ? `Add a landing ${slipLabel(hours)}` : 'Add a landing'}
            </button>
          </div>
        </form>
        <div role="group" aria-labelledby={`${id}-nearby`} className={CHOICE}>
          <h4 id={`${id}-nearby`} className="font-semibold text-ink">
            A place nearby, same date
          </h4>
          <p className="text-[15px] text-ink-2">
            Looks at the listed sites within {NEARBY_KM} km and adds the one that works best, if it works better. The date and the lander stay.
          </p>
          <p>
            <button type="button" onClick={() => onNearby(from.scenario.id)} disabled={searching} className="btn">
              {searching ? 'Looking nearby…' : 'Find the best place nearby'}
            </button>
          </p>
        </div>
        <form
          aria-labelledby={`${id}-any`}
          onSubmit={(e) => {
            e.preventDefault();
            if (!problem && !same) onAny(from.scenario.id, site.id, startUtc);
          }}
          className={`${CHOICE} md:col-span-2`}
        >
          <h4 id={`${id}-any`} className="font-semibold text-ink">
            Any place and date
          </h4>
          <p className="text-[15px] text-ink-2">Choose a site from the list and a landing date. The lander and the length of stay are kept.</p>
          <div className="flex flex-wrap items-end gap-3">
            <SitePicker site={site} sites={sites} onSite={setSiteId} onOwn={() => setOwnHint(true)} />
            <label className={LABEL}>
              Landing date (UTC)
              <input type="date" value={day} onChange={(e) => setDate(e.target.value)} className="field w-[190px]" />
            </label>
            <button type="submit" disabled={!!problem || same} className="btn">
              Add this landing
            </button>
          </div>
          <p role="status" className={`text-[15px] ${problem ? 'text-bad' : 'text-ink-2'}`}>
            {problem ?? (same ? 'Choose another place or date: this one is already the landing copied.' : `${siteLabel(site)}, ${landingShort(startUtc)}.`)}
          </p>
          {ownHint && <p className="text-[15px] text-ink-2">For a point of your own, choose it on the map in Explore and press “Compare from here”.</p>}
        </form>
      </div>
    </section>
  );
}
