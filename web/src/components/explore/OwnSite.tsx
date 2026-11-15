'use client';
import { useId, useState, type MouseEvent, type RefObject } from 'react';
import { useStore, type StoreApi } from 'zustand';
import { ReliefMap } from '@/components/ReliefMap';
import { HOME } from '@/lib/data/home';
import { hasNo, missingPart } from '@/lib/data/parts';
import { R_MOON_KM } from '@/lib/engine/constants';
import { landerName } from '@/lib/lander';
import { FIRST_START, periodDays, periodProblem } from '@/lib/period';
import { DAYS_RANGE } from '@/lib/planner-ranges';
import type { ExploreState } from '@/lib/store/explore';
import { checkPick } from '@/lib/viz/pick';
import { reliefUV } from '@/lib/viz/relief';
import { pickProblem } from '@/lib/viz/terrain';

const DEG = Math.PI / 180;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const HOURS = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`);

/** What the place fields must hold, said when they do not. */
export const WHERE_PROBLEM = 'This tool covers the Moon south of 60° S. Give a latitude between -90 and -60, and a longitude in degrees.';

/**
 * The latitude and longitude under a point of the relief picture of the south pole (`u`, `v` as fractions from its top
 * left): the inverse of reliefUV, to three decimals, as the fields show it.
 */
export function reliefLatLon(u: number, v: number, halfKm: number): { lat: number; lon: number } {
  const x = (u - 0.5) * 2 * halfKm;
  const y = (0.5 - v) * 2 * halfKm;
  const rho = Math.hypot(x, y);
  const lat = (2 * Math.atan(rho / (2 * R_MOON_KM))) / DEG - 90;
  const lon = rho === 0 ? 0 : Math.atan2(x, y) / DEG;
  return { lat: Math.round(lat * 1000) / 1000, lon: Math.round(lon * 1000) / 1000 };
}

/**
 * A place of the visitor's own, in the same checks as the Sites page's "Somewhere else" made: any point south of 60° S,
 * its hills traced from NASA elevation data in the worker. `guided` is `/explore?own=1`: nothing is filled in, and
 * three short steps ask where, when and with which lander. Without it (the site drop-down's "Your own site…") only
 * where is asked, and the dates and the lander stay.
 */
export function OwnSite({
  store,
  guided = false,
  onDone,
  onCancel,
  onLander,
  landerRef,
}: {
  store: StoreApi<ExploreState>;
  guided?: boolean;
  /** The place is worked out and shown: the page becomes the usual Explore for it. */
  onDone: () => void;
  onCancel?: () => void;
  /** Opens the lander's settings (the guided steps' third). */
  onLander?: () => void;
  landerRef?: RefObject<HTMLButtonElement | null>;
}) {
  const busy = useStore(store, (s) => s.maskBusy);
  const power = useStore(store, (s) => s.params.power);
  const id = useId();
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');
  const [date, setDate] = useState('');
  const [hour, setHour] = useState('');
  const [days, setDays] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const half = HOME.relief.half_km;

  async function submit() {
    const pick = lat.trim() === '' || lon.trim() === '' ? { ok: false as const } : checkPick(Number(lat), Number(lon));
    if (!pick.ok || pick.lat < -90) {
      setProblem(WHERE_PROBLEM);
      return;
    }
    if (guided) {
      if (!DATE.test(date) || hour === '') {
        setProblem('Choose the landing date and its hour.');
        return;
      }
      const n = periodDays(days);
      if (n === null) {
        setProblem(`Choose how many days: ${DAYS_RANGE.min} to ${DAYS_RANGE.max}.`);
        return;
      }
      const start = `${date}T${hour}:00`;
      const bad = periodProblem(start, n);
      if (bad) {
        setProblem(bad);
        return;
      }
      store.getState().setWindow(start, n);
    }
    setProblem(null);
    setWorking(true);
    await store.getState().selectCustom(pick.lat, pick.lon);
    setWorking(false);
    const failed = store.getState().customError;
    // Without the height tiles (a copy set up with the committed data alone) no new place can be traced: say so, and that
    // the list still works, rather than show the file that was not there.
    if (failed && missingPart(failed) === 'tiles') setProblem(`That place cannot be worked out here: ${hasNo('tiles')}. The places in the list work without them.`);
    else if (failed) setProblem(pickProblem(failed));
    else onDone();
  }

  // A press on the map fills the two fields; a pin's own link is left alone.
  const onMap = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target instanceof Element && e.target.closest('a')) return;
    const r = e.currentTarget.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    const p = reliefLatLon((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height, half);
    setLat(String(p.lat));
    setLon(String(p.lon));
    setProblem(null);
  };
  const typed = lat.trim() !== '' && lon.trim() !== '' ? checkPick(Number(lat), Number(lon)) : null;
  const mark = typed?.ok ? reliefUV(typed.lat, typed.lon, half) : null;
  const marked = mark !== null && mark.u >= 0 && mark.u <= 1 && mark.v >= 0 && mark.v <= 1;

  const where = (
    <div className="flex flex-wrap items-end gap-4">
      <label className="flex flex-col gap-1.5 text-[15px] text-ink-2">
        Latitude (°)
        <input value={lat} onChange={(e) => setLat(e.target.value)} inputMode="text" placeholder="-90 to -60" autoComplete="off" className="field w-40" />
      </label>
      <label className="flex flex-col gap-1.5 text-[15px] text-ink-2">
        Longitude (°)
        <input value={lon} onChange={(e) => setLon(e.target.value)} inputMode="text" placeholder="-180 to 180" autoComplete="off" className="field w-40" />
      </label>
    </div>
  );
  const go = (
    <button type="submit" disabled={busy || working} className="btn btn-primary h-[52px]">
      {busy || working ? 'Working it out…' : 'Work it out'}
    </button>
  );
  const alert = problem && (
    <p role="alert" className="basis-full text-bad">
      {problem}
    </p>
  );
  const caveat = <p className="text-[15px] text-ink-2">Your own point is not checked for landing. Tracing its hills takes a few seconds.</p>;

  if (!guided) {
    return (
      <section aria-labelledby={`${id}-title`} className="panel">
        <h2 id={`${id}-title`} className="display text-[23px] font-semibold">
          Your own site
        </h2>
        <p className="mt-1 text-ink-2">Any point south of 60° S. The dates and the lander stay as they are.</p>
        <form
          className="mt-3 flex flex-wrap items-end gap-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {where}
          {go}
          {onCancel && (
            <button type="button" onClick={onCancel} className="btn h-[52px]">
              Cancel
            </button>
          )}
          {alert}
        </form>
        <div className="mt-3">{caveat}</div>
      </section>
    );
  }

  const STEP = 'flex gap-4 border-t border-line py-5 first:border-t-0 first:pt-0';
  const NUM = 'display flex size-9 shrink-0 items-center justify-center rounded-full border border-line-strong text-[17px] font-semibold text-ink';
  return (
    <form
      aria-label="Your own site"
      className="panel grid gap-x-10 gap-y-6 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)]"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div>
        {/* The map takes a press as the fields take a number: it covers 250 km round the pole. */}
        <div data-part="own-map" onClick={onMap} className="relative cursor-crosshair">
          <ReliefMap pins={[]} />
          {marked && <i data-part="own-mark" aria-hidden="true" className="pointer-events-none absolute block size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-stage bg-stage-sun" style={{ left: `${mark.u * 100}%`, top: `${mark.v * 100}%` }} />}
        </div>
        <p className="mt-2 text-[15px] text-ink-2">Press the map to point at a place near the pole, or type it.</p>
      </div>
      <div>
        <ol className="flex flex-col">
          <li className={STEP}>
            <span aria-hidden="true" className={NUM}>
              1
            </span>
            <div className="min-w-0 grow">
              <h2 className="text-[19px] font-semibold text-ink">Where</h2>
              <p className="mb-3 mt-0.5 text-[15px] text-ink-2">Any point south of 60° S. East is positive.</p>
              {where}
            </div>
          </li>
          <li className={STEP}>
            <span aria-hidden="true" className={NUM}>
              2
            </span>
            <div className="min-w-0 grow">
              <h2 className="text-[19px] font-semibold text-ink">When</h2>
              <p className="mb-3 mt-0.5 text-[15px] text-ink-2">The landing, in UTC, and how many days to forecast.</p>
              <div className="flex flex-wrap items-end gap-4">
                <label className="flex flex-col gap-1.5 text-[15px] text-ink-2">
                  Landing date
                  <input type="date" value={date} min={FIRST_START.slice(0, 10)} max="2036-12-29" onChange={(e) => setDate(e.target.value)} className="field w-48" />
                </label>
                <label className="flex flex-col gap-1.5 text-[15px] text-ink-2">
                  Hour (UTC)
                  <select value={hour} onChange={(e) => setHour(e.target.value)} className="field w-36">
                    <option value="">Choose…</option>
                    {HOURS.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-[15px] text-ink-2">
                  {`Days (${DAYS_RANGE.min}–${DAYS_RANGE.max})`}
                  <input type="number" inputMode="numeric" min={DAYS_RANGE.min} max={DAYS_RANGE.max} step={DAYS_RANGE.step} value={days} onChange={(e) => setDays(e.target.value)} className="field w-28" />
                </label>
              </div>
            </div>
          </li>
          <li className={STEP}>
            <span aria-hidden="true" className={NUM}>
              3
            </span>
            <div className="min-w-0 grow">
              <h2 className="text-[19px] font-semibold text-ink">Lander</h2>
              <p className="mb-3 mt-0.5 text-[15px] text-ink-2">This is the starting lander, not yours yet. Change it now or later.</p>
              <button ref={landerRef} type="button" onClick={onLander} aria-haspopup="dialog" aria-label={`${landerName(power)}. Change`} className="field flex h-auto min-h-[52px] w-full max-w-[520px] items-center gap-3 py-2 text-left text-base text-ink">
                <span className="grow">{landerName(power).replace(/(\d) /g, '$1 ')}</span>
                <span className="shrink-0 rounded-full border border-line px-2.5 py-0.5 text-[15px] text-ink-2">change</span>
              </button>
            </div>
          </li>
        </ol>
        <div className="mt-2 flex flex-wrap items-center gap-4 border-t border-line pt-5">
          {go}
          {onCancel && (
            <button type="button" onClick={onCancel} className="btn h-[52px]">
              Cancel
            </button>
          )}
          {alert}
        </div>
        <div className="mt-3">{caveat}</div>
      </div>
    </form>
  );
}
