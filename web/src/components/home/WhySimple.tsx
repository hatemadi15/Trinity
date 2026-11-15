import Link from 'next/link';
import { Reveal } from '@/components/Reveal';
import { SectionHead } from '@/components/SectionHead';
import { HOME } from '@/lib/data/home';
import { dateLong, dayMonth } from '@/lib/viz/format';
import { whyDrawings } from '@/lib/viz/why';

const LINK = 'font-semibold underline decoration-[1.5px] underline-offset-4 transition-colors hover:decoration-accent';
const CARD = 'group grid gap-4 md:grid-cols-[380px_1fr] md:items-center md:gap-8 xl:block xl:space-y-5';
const H3 = 'display text-[30px] leading-tight transition-colors duration-300 group-hover:text-accent-ink';
const ANSWER = 'mt-2 text-lg leading-relaxed text-ink-2';
/** A drawing's own black plate; How it works frames the same drawings itself (WhySection) and passes its own. */
const PANEL = 'stage block aspect-[360/230] w-full';
/** A drawing's words: large enough to read on a phone, where the drawing is the screen's width. */
const WORD = { fontSize: 15, fill: '#f5f5f3' } as const;
const SOFT = { fontSize: 15, fill: '#c6c8cc' } as const;
const SUN = '#f3efe4';
const EARTH = '#7fa9ff';
const GROUND = '#55585f';
const EDGE = '#dfe1e6';

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
export function LowSun({ high, low, site, className = PANEL }: { high: number; low: number; site: string; className?: string }) {
  const o = { x: 44, y: 188 };
  const a = ray(o.x, o.y, 168, high);
  const b = ray(o.x, o.y, 262, low);
  return (
    <svg viewBox="0 0 360 230" role="img" aria-label={`How high the Sun gets, drawn to scale. Where ${site} landed, far from the pole, the Sun climbs high in the sky. Near the south pole it stays just above the ground.`} className={className}>
      <rect x={0} y={188} width={360} height={42} fill={GROUND} opacity={0.55} />
      <line x1={0} x2={360} y1={188} y2={188} stroke={EDGE} strokeWidth={1} />
      <line x1={o.x} y1={o.y} x2={a.x} y2={a.y} stroke="#c6c8cc" strokeWidth={1.2} strokeDasharray="3 5" />
      <circle cx={a.x} cy={a.y} r={9} fill="none" stroke="#c6c8cc" strokeWidth={1.5} />
      <text x={a.x + 18} y={a.y + 5} {...SOFT}>the Sun where {site} landed</text>
      <line x1={o.x} y1={o.y} x2={b.x} y2={b.y} stroke={SUN} strokeWidth={1.4} />
      <Sun x={b.x} y={b.y} />
      <text x={346} y={b.y - 26} textAnchor="end" {...WORD} fontWeight={600}>the Sun at the south pole</text>
      <circle cx={o.x} cy={o.y} r={4} fill="#f5f5f3" />
    </svg>
  );
}

/** A low Sun, a hill, and two places: the summit stands in the light, the ground behind the hill in its shadow. */
export function HillShadow({ km, dark, className = PANEL }: { km: number; dark: string; className?: string }) {
  return (
    <svg viewBox="0 0 360 230" role="img" aria-label={`A low Sun and two hills, not to scale. One hilltop stands above the other hill's shadow and has sunlight all month. A place ${km} km away, behind the hill, is dark ${dark}.`} className={className}>
      <line x1={332} y1={96} x2={150.4} y2={137.5} stroke={SUN} strokeWidth={1.2} opacity={0.7} />
      <line x1={332} y1={96} x2={95} y2={80} stroke={SUN} strokeWidth={1.2} opacity={0.7} />
      <Sun x={332} y={96} />
      <path d="M0 175 L40 150 L95 80 L130 120 L165 150 L200 160 L235 150 L262 112 L290 150 L330 170 L360 175 L360 230 L0 230 Z" fill="#3a3d44" />
      {/* The slopes the Sun reaches are bright; the ground under the ray that grazes the hill's top stays dark. */}
      <path d="M95 80 L130 120 L150.4 137.5 M262 112 L290 150 L330 170 L360 175" fill="none" stroke={SUN} strokeWidth={3.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={95} cy={80} r={5} fill={SUN} />
      <text x={12} y={52} {...WORD} fontWeight={600}>sunlight all month</text>
      <circle cx={200} cy={160} r={5} fill="#000" stroke={EARTH} strokeWidth={2.5} />
      <text x={200} y={204} textAnchor="middle" {...WORD}>{km} km away: dark {dark}</text>
    </svg>
  );
}

/** Earth half risen over the hills: it rises and sets in one place, and is hidden when below them. */
export function EarthPeek({ className = PANEL }: { className?: string }) {
  return (
    <svg viewBox="0 0 360 230" role="img" aria-label="Earth half risen over the hills. It stays in one part of the sky and moves a little up and down, so sometimes it is above the hills and sometimes hidden behind them." className={className}>
      <line x1={248} x2={248} y1={96} y2={132} stroke="#c6c8cc" strokeWidth={1.4} />
      <path d="M242 103 L248 94 L254 103 M242 125 L248 134 L254 125" fill="none" stroke="#c6c8cc" strokeWidth={1.4} />
      <g className="motion-safe:animate-[earth-peek_7s_ease-in-out_infinite_alternate]">
        <circle cx={196} cy={150} r={40} fill={EARTH} opacity={0.16} />
        <circle cx={196} cy={150} r={24} fill={EARTH} />
        <path d="M196 126 a24 24 0 0 1 0 48 a34 34 0 0 0 0 -48 Z" fill="#000" opacity={0.35} />
      </g>
      <path d="M0 168 L46 150 L92 160 L140 146 L196 152 L252 142 L300 156 L360 148 L360 230 L0 230 Z" fill={GROUND} stroke={EDGE} strokeWidth={1} />
      <text x={14} y={36} {...WORD} fontWeight={600}>Earth, peeking over the hills</text>
    </svg>
  );
}

/**
 * "Why the south pole?" on the home page (spec 23.3): five questions a child could ask, each answered in short
 * sentences and everyday words, with no units or science terms; three have a drawing with one idea each, true to the
 * month's figures. How it works shows the same drawings with one more sentence each, and keeps the charts by direction and height behind a fold (WhySection).
 */
export function WhySimple({ n }: { n?: string }) {
  const { pair, sky } = HOME;
  const { sun } = whyDrawings();
  const km = Math.round(pair.distance_km);
  const month = dateLong(sky.start_utc, 0).replace(/^\d+ /, '');
  /** The forecast site's long night, in the month's own days: "from 3 to 20 January". */
  const dark = sky.night ? `from ${dayMonth(sky.start_utc, sky.night.sunset_hour).replace(/ .*/, '')} to ${dateLong(sky.start_utc, sky.night.sunrise_hour)}` : 'for part of the month';
  return (
    <section id="why" aria-labelledby="h-why" className="wrap scroll-mt-8">
      <SectionHead
        id="h-why"
        n={n}
        kicker="Why go there"
        title={
          <>
            Why the <em>south pole?</em>
          </>
        }
      />
      <Reveal className="mt-8 max-w-[40em]">
        <h3 className={H3}>Why is NASA looking at the Moon&apos;s south pole?</h3>
        <p className={ANSWER}>
          Ice has been found in its darkest, coldest craters. One day that frozen water could give astronauts water, air and rocket fuel. And some hilltops there stay in sunlight for a whole
          month, which a lander needs for power.
        </p>
      </Reveal>
      <div className="mt-12 grid gap-10 xl:grid-cols-3">
        <Reveal className={CARD}>
          <LowSun high={sun.contrast.peak} low={sun.highest.el} site={sun.contrast.site} />
          <div>
            <h3 className={H3}>Why is landing there hard?</h3>
            <p className={ANSWER}>The Sun never climbs high. It slides round the sky close to the ground, so hills throw very long shadows. A lander runs on sunlight: in shadow it has no power.</p>
          </div>
        </Reveal>
        <Reveal className={CARD} delay={120}>
          <HillShadow km={km} dark={dark.replace(/^from /, '')} />
          <div>
            <h3 className={H3}>Why do the hills matter so much?</h3>
            <p className={ANSWER}>
              Two places close together can get very different light. In {month} 2027 one hilltop has sunlight all month. A ridge {km} km away is dark {dark}.
            </p>
          </div>
        </Reveal>
        <Reveal className={CARD} delay={240}>
          <EarthPeek />
          <div>
            <h3 className={H3}>Why does Earth matter?</h3>
            <p className={ANSWER}>The lander talks to us by radio. It can only do that while Earth is in its sky, above the hills, and it has power.</p>
          </div>
        </Reveal>
      </div>
      <Reveal className="mt-12 max-w-[40em]">
        <h3 className={H3}>So what does Earthrise do?</h3>
        <p className={ANSWER}>
          It works out, hour by hour, when a spot has sunlight and when it can call home. Then planners can pick the place and the day.{' '}
          <Link href="/learn" className={LINK}>
            How it works
          </Link>{' '}
          has the science.
        </p>
      </Reveal>
    </section>
  );
}
