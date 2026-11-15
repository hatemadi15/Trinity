import type { HomeContact, Stretch } from '@/lib/viz/homeContact';
import { dayMonth, spanShort, spanWords } from '@/lib/viz/format';

/** Where a stretch lies across the strip, as the forecast rows above place their hours: hour h at (h + 0.5) / n. */
const place = (s: Stretch, n: number) => {
  const left = s.from === 0 ? 0 : ((s.from + 0.5) / n) * 100;
  const right = s.to >= n ? 100 : ((s.to + 0.5) / n) * 100;
  return { left: `${left}%`, width: `${right - left}%` };
};

const WHY = { earth: 'Earth out of view', power: 'Earth in view, but no power: night' } as const;
const LANE = 'relative h-3 bg-white/[0.07]';
const NAME = 'mb-2 px-[var(--chart-inset)] text-[15px] font-semibold text-stage-ink';

/**
 * Radio contact over the month, as three lanes on the forecast's own time scale (spec 23.2): sunlight on the site (a
 * solar lander's power), Earth in view, and the hours with both, which alone are contact. The hours without contact
 * each say what is missing, so Earth in view is never read as contact by itself.
 */
export function ContactStrip({ contact, startUtc }: { contact: HomeContact; startUtc: string }) {
  const n = contact.hours;
  const range = (s: Stretch) => `${dayMonth(startUtc, s.from)} to ${dayMonth(startUtc, Math.min(s.to, n - 1))}`;
  const said = [
    `Radio contact needs power and Earth in view at once: ${contact.both.length ? contact.both.map((s) => `${range(s)}, ${spanWords(s.to - s.from)}`).join('; ') : 'never this month'}.`,
    ...contact.none.map((s) => `${range(s)}: no contact, ${WHY[s.why]}.`),
  ].join(' ');
  return (
    <div data-contact-strip="">
      <p className="sr-only">{said}</p>
      <div aria-hidden="true">
        <p className={NAME}>
          Power <span className="font-normal text-stage-ink-2">sunlight on the site</span>
        </p>
        <div className={LANE}>
          {contact.sunlight.map((s) => (
            <span key={s.from} className="absolute inset-y-0 bg-stage-sun" style={place(s, n)} />
          ))}
        </div>
        <p className={`${NAME} mt-5`}>Earth in view</p>
        <div className={LANE}>
          {contact.earth.map((s) => (
            <span key={s.from} className="absolute inset-y-0 bg-stage-earth/60" style={place(s, n)} />
          ))}
        </div>
        <p className={`${NAME} mt-5 text-[#cfe0ff]`}>
          Radio contact <span className="font-normal text-stage-ink-2">both at once</span>
        </p>
        <div className="relative h-11 bg-white/[0.07]">
          {contact.none.map((s) => (
            <span key={s.from} data-no-contact={s.why} className="absolute inset-y-0 flex items-center justify-center overflow-hidden border-r border-stage px-2 text-center text-[14px] leading-tight text-stage-ink-2 last:border-r-0" style={place(s, n)}>
              <span className="max-md:hidden">{WHY[s.why]}</span>
            </span>
          ))}
          {contact.both.map((s) => (
            <span key={s.from} data-contact="" className="absolute inset-y-0 bg-stage-earth shadow-[0_0_28px_2px_rgba(127,169,255,0.75)]" style={place(s, n)} />
          ))}
        </div>
        {/* The contact's own words stand under it, held inside the screen on a phone. */}
        <div className="relative mt-2 h-12">
          {contact.both.map((s) => (
            <p key={s.from} className="absolute w-max -translate-x-1/2 text-center text-[15px] leading-tight text-stage-ink-2" style={{ left: `clamp(80px, ${(((s.from + s.to) / 2 + 0.5) / n) * 100}%, calc(100% - 80px))` }}>
              <b className="display block text-[26px] font-normal leading-none text-[#cfe0ff] text-glow">{spanShort(s.to - s.from)}</b>
              {range(s)}
            </p>
          ))}
        </div>
        {/* On a phone the reasons do not fit in the lane: they are listed under it, in the month's order. */}
        <ul className="mt-3 space-y-1 px-[var(--chart-inset)] text-[15px] text-stage-ink-2 md:hidden">
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
