import Link from 'next/link';
import { Reveal } from '@/components/Reveal';
import { SectionHead } from '@/components/SectionHead';
import { HOME } from '@/lib/data/home';
import { whyDrawings } from '@/lib/viz/why';

const LINK = 'font-semibold underline decoration-[1.5px] underline-offset-4 transition-colors hover:decoration-accent';
const CARD = 'group grid gap-4 md:grid-cols-[380px_1fr] md:items-center md:gap-8 xl:block xl:space-y-5';
const H3 = 'display text-[30px] leading-tight transition-colors duration-300 group-hover:text-accent-ink';
const PANEL = 'stage block aspect-[360/230] w-full';
/** A drawing's words: large enough to read on a phone, where the drawing is the screen's width. */
const WORD = { fontSize: 15, fill: '#f5f5f3' } as const;
const SOFT = { fontSize: 15, fill: '#c6c8cc' } as const;
const SUN = '#f3efe4';
const EARTH = '#7fa9ff';
const GROUND = '#55585f';
const EDGE = '#dfe1e6';
/** A number and its percent sign stay on one line. */
const pct = (n: number) => `${n} %`;
const deg1 = (v: number) => `${(Math.round(v * 10) / 10).toFixed(1)}°`;

/** A point `r` px from (x, y), `el` degrees above the level: the drawings' heights are true angles. */
const ray = (x: number, y: number, r: number, el: number) => ({ x: x + r * Math.cos((el * Math.PI) / 180), y: y - r * Math.sin((el * Math.PI) / 180) });

function Sun({ x, y, r = 9 }: { x: number; y: number; r?: number }) {
  return (
    <>
      <circle cx={x} cy={y} r={r * 2.4} fill={SUN} opacity={0.14} />
      <circle cx={x} cy={y} r={r} fill={SUN} />
    </>
  );
}

/** The Sun at the pole, at its highest of the month, beside the Sun's noon height at a site far from the pole: both at their true angles. */
function LowSun({ high, low, site }: { high: number; low: number; site: string }) {
  const o = { x: 44, y: 188 };
  const a = ray(o.x, o.y, 168, high);
  const b = ray(o.x, o.y, 262, low);
  return (
    <svg viewBox="0 0 360 230" role="img" aria-label={`The Sun's height, drawn to scale. At ${site} the Sun climbs to about ${high}° at noon. At de Gerlache Rim 2, near the south pole, it never stands higher than ${deg1(low)} in January 2027: it skims the horizon.`} className={PANEL}>
      <rect x={0} y={188} width={360} height={42} fill={GROUND} opacity={0.55} />
      <line x1={0} x2={360} y1={188} y2={188} stroke={EDGE} strokeWidth={1} />
      <line x1={o.x} y1={o.y} x2={a.x} y2={a.y} stroke="#c6c8cc" strokeWidth={1.2} strokeDasharray="3 5" />
      <circle cx={a.x} cy={a.y} r={9} fill="none" stroke="#c6c8cc" strokeWidth={1.5} />
      <text x={a.x + 18} y={a.y + 5} {...SOFT}>{site}&apos;s Sun: {high}° up</text>
      <line x1={o.x} y1={o.y} x2={b.x} y2={b.y} stroke={SUN} strokeWidth={1.4} />
      <Sun x={b.x} y={b.y} />
      <text x={346} y={b.y - 26} textAnchor="end" {...WORD} fontWeight={600}>South pole: {deg1(low)} at most</text>
      <circle cx={o.x} cy={o.y} r={4} fill="#f5f5f3" />
    </svg>
  );
}

/** A low Sun, a hill, and two places: the summit stands in the light, the ground behind the hill in its shadow. */
function HillShadow({ km, sitePct, rimPct }: { km: number; sitePct: number; rimPct: number }) {
  const rim = rimPct >= 99.95 ? 'sunlight all month' : `sunlight ${pct(Math.round(rimPct))} of the month`;
  return (
    <svg viewBox="0 0 360 230" role="img" aria-label={`A low Sun and a hill, not to scale. A summit stands above the hill's shadow and has ${rim}; a site ${km} km away, behind the hill, has sunlight ${Math.round(sitePct)} % of the month.`} className={PANEL}>
      <line x1={332} y1={96} x2={150.4} y2={137.5} stroke={SUN} strokeWidth={1.2} opacity={0.7} />
      <line x1={332} y1={96} x2={95} y2={80} stroke={SUN} strokeWidth={1.2} opacity={0.7} />
      <Sun x={332} y={96} />
      <path d="M0 175 L40 150 L95 80 L130 120 L165 150 L200 160 L235 150 L262 112 L290 150 L330 170 L360 175 L360 230 L0 230 Z" fill="#3a3d44" />
      {/* The slopes the Sun reaches are bright; the ground under the ray that grazes the hill's top stays dark. */}
      <path d="M95 80 L130 120 L150.4 137.5 M262 112 L290 150 L330 170 L360 175" fill="none" stroke={SUN} strokeWidth={3.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={95} cy={80} r={5} fill={SUN} />
      <text x={12} y={52} {...WORD} fontWeight={600}>Summit: {rim}</text>
      <circle cx={200} cy={160} r={5} fill="#000" stroke={EARTH} strokeWidth={2.5} />
      <text x={200} y={204} textAnchor="middle" {...WORD}>{km} km away: sunlit {pct(Math.round(sitePct))} of the month</text>
    </svg>
  );
}

/** Earth half risen over the hills: it rises and sets in one place, and is hidden when below them. */
function EarthPeek({ earthPct }: { earthPct: number }) {
  return (
    <svg viewBox="0 0 360 230" role="img" aria-label={`Earth half risen over the hills. From de Gerlache Rim 2 it stays in one direction and moves a little up and down: it is in view ${Math.round(earthPct)} % of January 2027, and below the hills the rest.`} className={PANEL}>
      <line x1={248} x2={248} y1={96} y2={132} stroke="#c6c8cc" strokeWidth={1.4} />
      <path d="M242 103 L248 94 L254 103 M242 125 L248 134 L254 125" fill="none" stroke="#c6c8cc" strokeWidth={1.4} />
      <g className="motion-safe:animate-[earth-peek_7s_ease-in-out_infinite_alternate]">
        <circle cx={196} cy={150} r={40} fill={EARTH} opacity={0.16} />
        <circle cx={196} cy={150} r={24} fill={EARTH} />
        <path d="M196 126 a24 24 0 0 1 0 48 a34 34 0 0 0 0 -48 Z" fill="#000" opacity={0.35} />
      </g>
      <path d="M0 168 L46 150 L92 160 L140 146 L196 152 L252 142 L300 156 L360 148 L360 230 L0 230 Z" fill={GROUND} stroke={EDGE} strokeWidth={1} />
      <text x={14} y={36} {...WORD} fontWeight={600}>Earth: in view {pct(Math.round(earthPct))} of the month</text>
      <text x={180} y={204} textAnchor="middle" {...SOFT}>behind the hills the rest</text>
    </svg>
  );
}

/**
 * "Why the south pole is hard" on the home page (spec 23.3): three drawings a newcomer reads at a glance, one idea
 * each, with the month's real figures and no axes. The charts of the same three facts, by direction and height, are
 * on How it works (WhySection).
 */
export function WhySimple({ n }: { n?: string }) {
  const { pair, sky } = HOME;
  const { sun } = whyDrawings();
  const km = Math.round(pair.distance_km);
  return (
    <section id="why" aria-labelledby="h-why" className="wrap scroll-mt-8">
      <SectionHead
        id="h-why"
        n={n}
        kicker="Why it is hard"
        title={
          <>
            Why the south pole is <em>hard</em>
          </>
        }
        lede={
          <>
            Three facts decide a lander&apos;s power and signal.{' '}
            <Link href="/learn" className={LINK}>
              How it works
            </Link>{' '}
            has the science.
          </>
        }
      />
      <div className="mt-10 grid gap-10 xl:grid-cols-3">
        <Reveal className={CARD}>
          <LowSun high={sun.contrast.peak} low={sun.highest.el} site={sun.contrast.site} />
          <div>
            <h3 className={H3}>The Sun never climbs</h3>
            <p className="mt-2 text-ink-2">It circles the horizon once a month, a few degrees up at most.</p>
          </div>
        </Reveal>
        <Reveal className={CARD} delay={120}>
          <HillShadow km={km} sitePct={pair.site_sun_pct} rimPct={pair.rim_sun_pct} />
          <div>
            <h3 className={H3}>The hills decide</h3>
            <p className="mt-2 text-ink-2">
              A low Sun hides behind any hill. The forecast&apos;s site is {km} km from that summit.
            </p>
          </div>
        </Reveal>
        <Reveal className={CARD} delay={240}>
          <EarthPeek earthPct={sky.earth_pct} />
          <div>
            <h3 className={H3}>Earth sets too</h3>
            <p className="mt-2 text-ink-2">Earth stays in one place, rising and setting behind the hills.</p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
