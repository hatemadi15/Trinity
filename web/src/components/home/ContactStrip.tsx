import type { HomeContact, Stretch } from '@/lib/viz/homeContact';
import { dayMonth, spanShort, spanWords } from '@/lib/viz/format';

/** Where a stretch lies across the strip, as the forecast rows above place their hours: hour h at (h + 0.5) / n. */
const place = (s: Stretch, n: number) => {
  const left = s.from === 0 ? 0 : ((s.from + 0.5) / n) * 100;
  const right = s.to >= n ? 100 : ((s.to + 0.5) / n) * 100;
  return { left: `${left}%`, width: `${right - left}%` };
};

/** The hours between a lane's stretches. */
const gaps = (on: Stretch[], n: number): Stretch[] => {
  const out: Stretch[] = [];
  let at = 0;
  for (const s of on) {
    if (s.from > at) out.push({ from: at, to: s.from });
    at = s.to;
  }
  if (at < n) out.push({ from: at, to: n });
  return out;
};

const WHY = { earth: 'Earth out of view', power: 'Earth in view, but no power: night' } as const;
/** A lane's track: a step lighter than the panel, so an empty hour still reads as part of the lane. */
const LANE = 'relative overflow-hidden bg-white/[0.09]';
const NAME = 'mb-2 flex flex-wrap items-center gap-x-2.5 px-[var(--chart-inset)] text-[16px] font-semibold text-stage-ink';
const SWATCH = 'block size-3.5 shrink-0 rounded-[3px]';
/** A word inside a lane; on a phone the lanes are too short for words, and the list under the strip says them. A lit stretch has dark words, an empty one light. */
const SEG = 'absolute inset-y-0 flex items-center justify-center overflow-hidden px-2 text-[14px] max-md:text-[0px]';
const ON = `${SEG} whitespace-nowrap font-semibold leading-none text-[#0b0c0f]`;
const OFF = `${SEG} border-r border-stage text-center leading-tight text-stage-ink-2 last:border-r-0`;

/**
 * Radio contact over the month, as three lanes on the forecast's own time scale (spec 23.2): sunlight on the site (a
 * solar lander's power), Earth in view, and the hours with both, which alone are contact. Each lane has its own
 * colour, the ones the view from the site uses: warm white for sunlight, blue for Earth, green for contact. The hours
 * without contact each say what is missing, so Earth in view is never read as contact by itself.
 */
export function ContactStrip({ contact, startUtc }: { contact: HomeContact; startUtc: string }) {
  const n = contact.hours;
  const range = (s: Stretch) => `${dayMonth(startUtc, s.from)} to ${dayMonth(startUtc, Math.min(s.to, n - 1))}`;
  const said = [
    `Radio contact needs power and Earth in view at once: ${contact.both.length ? contact.both.map((s) => `${range(s)}, ${spanWords(s.to - s.from)}`).join('; ') : 'never this month'}.`,
    ...contact.none.map((s) => `${range(s)}: no contact, ${WHY[s.why]}.`),
  ].join(' ');
  /** The dates under the strip, every five days, as the charts above mark them. */
  const days = Array.from({ length: Math.ceil(n / 120) }, (_, i) => i * 120);
  return (
    <div data-contact-strip="">
      <p className="sr-only">{said}</p>
      <div aria-hidden="true">
        <p className={NAME}>
          <i className={`${SWATCH} bg-stage-sun`} />
          Power <span className="font-normal text-stage-ink-2">sunlight on the site</span>
        </p>
        <div data-lane="power" className={`${LANE} h-8`}>
          {gaps(contact.sunlight, n).map((s) => (
            <span key={s.from} className={OFF} style={place(s, n)}>
              night: no power
            </span>
          ))}
          {contact.sunlight.map((s) => (
            <span key={s.from} className={`${ON} bg-stage-sun`} style={place(s, n)}>
              sunlight
            </span>
          ))}
        </div>
        <p className={`${NAME} mt-6`}>
          <i className={`${SWATCH} bg-stage-earth`} />
          Earth in view
        </p>
        <div data-lane="earth" className={`${LANE} h-8`}>
          {gaps(contact.earth, n).map((s) => (
            <span key={s.from} className={OFF} style={place(s, n)}>
              out of view
            </span>
          ))}
          {contact.earth.map((s) => (
            <span key={s.from} className={`${ON} bg-stage-earth`} style={place(s, n)}>
              Earth in view
            </span>
          ))}
        </div>
        <p className={`${NAME} mt-6`}>
          <i className={`${SWATCH} bg-stage-good`} />
          Radio contact <span className="font-normal text-stage-ink-2">both at once</span>
        </p>
        <div data-lane="contact" className={`${LANE} h-12`}>
          {contact.none.map((s) => (
            <span key={s.from} data-no-contact={s.why} className={OFF} style={place(s, n)}>
              {WHY[s.why]}
            </span>
          ))}
          {contact.both.map((s) => (
            <span key={s.from} data-contact="" className="absolute inset-y-0 bg-stage-good" style={place(s, n)} />
          ))}
        </div>
        {/* The contact's own words stand under it, held inside the screen on a phone. */}
        <div className="relative mt-3 h-12">
          {contact.both.map((s) => (
            <p key={s.from} className="absolute w-max -translate-x-1/2 text-center text-[15px] leading-tight text-stage-ink-2" style={{ left: `clamp(80px, ${(((s.from + s.to) / 2 + 0.5) / n) * 100}%, calc(100% - 80px))` }}>
              <b className="display block text-[28px] font-normal leading-none text-stage-good">{spanShort(s.to - s.from)}</b>
              {range(s)}
            </p>
          ))}
        </div>
        <div data-strip-dates="" className="relative mt-3 h-8 border-t border-stage-raised-line text-[15px] text-stage-ink-2">
          {days.map((h, i) => (
            <span key={h} className={`absolute top-1.5 ${i === 0 ? 'left-[var(--chart-inset)]' : '-translate-x-1/2'} ${i % 2 ? 'max-md:hidden' : ''}`} style={i === 0 ? undefined : { left: `${(h / n) * 100}%` }}>
              {dayMonth(startUtc, h)}
            </span>
          ))}
        </div>
        {/* On a phone the reasons do not fit in the lane: they are listed under it, in the month's order. */}
        <ul className="space-y-1 px-[var(--chart-inset)] pb-5 pt-2 text-[15px] text-stage-ink-2 md:hidden">
          {contact.none.map((s) => (
            <li key={s.from}>
              <span className="mono text-stage-ink">{range(s)}</span> {WHY[s.why]}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
