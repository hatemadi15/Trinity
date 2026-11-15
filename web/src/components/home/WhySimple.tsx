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

/** A drawing's sky: left out, the flat black plate of the home page; "stars", a night sky with faint stars, a glow by the Sun or Earth and textured grey ground (How it works). */
export type DrawingSky = 'stars';

/** A small repeatable generator, so a drawing's stars and stones stand in the same places on the server and in the browser. */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Box = [x: number, y: number, w: number, h: number];
const inside = (x: number, y: number, boxes: Box[]) => boxes.some(([bx, by, bw, bh]) => x >= bx && x <= bx + bw && y >= by && y <= by + bh);

/**
 * The night sky behind a drawing: black falling to a deep blue at the horizon, faint still stars that keep clear of
 * the drawing's words (`clear`), and a soft glow round the Sun or Earth. Decoration only: it says nothing the drawing does not.
 */
function NightSky({ id, seed, floor, glow, clear = [] }: { id: string; seed: number; floor: number; glow: { x: number; y: number; r: number; colour: string; strength?: number }; clear?: Box[] }) {
  const rnd = seeded(seed);
  const stars: { x: number; y: number; r: number; o: number; blue: boolean }[] = [];
  for (let i = 0; i < 400 && stars.length < 46; i++) {
    const x = 4 + rnd() * 352, y = 4 + rnd() * (floor - 8), size = rnd(), o = rnd(), blue = rnd() < 0.25;
    if (inside(x, y, clear) || Math.hypot(x - glow.x, y - glow.y) < 26) continue;
    stars.push({ x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, r: size > 0.9 ? 1.1 : size > 0.55 ? 0.8 : 0.55, o: Math.round((0.28 + o * 0.5) * 100) / 100, blue });
  }
  return (
    <g aria-hidden="true" data-sky="stars">
      <defs>
        <linearGradient id={`${id}-night`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#000" />
          <stop offset="0.55" stopColor="#03060d" />
          <stop offset="1" stopColor="#0b1524" />
        </linearGradient>
        <radialGradient id={`${id}-glow`}>
          <stop offset="0" stopColor={glow.colour} stopOpacity={glow.strength ?? 0.3} />
          <stop offset="0.45" stopColor={glow.colour} stopOpacity={(glow.strength ?? 0.3) * 0.3} />
          <stop offset="1" stopColor={glow.colour} stopOpacity={0} />
        </radialGradient>
        <linearGradient id={`${id}-ground`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6c7078" />
          <stop offset="0.5" stopColor="#484b52" />
          <stop offset="1" stopColor="#25272c" />
        </linearGradient>
      </defs>
      <rect x={0} y={0} width={360} height={230} fill={`url(#${id}-night)`} />
      {stars.map((s, i) => (
        <circle key={i} cx={s.x} cy={s.y} r={s.r} fill={s.blue ? '#a8c6ff' : '#f5f5f3'} opacity={s.o} />
      ))}
      <circle cx={glow.x} cy={glow.y} r={glow.r} fill={`url(#${id}-glow)`} />
    </g>
  );
}

/** Lunar ground under a drawing's words: fine stones and a few shallow craters, darker than the ground they lie on so the words over them keep their contrast. */
function Regolith({ seed, top, clip, clear = [] }: { seed: number; top: (x: number) => number; clip?: string; clear?: Box[] }) {
  const rnd = seeded(seed);
  const stones: { x: number; y: number; r: number; o: number; light: boolean }[] = [];
  for (let i = 0; i < 400 && stones.length < 70; i++) {
    const x = rnd() * 360, t = rnd(), size = rnd(), o = rnd(), light = rnd() < 0.3;
    const y = top(x) + 4 + t * (226 - top(x) - 4);
    if (inside(x, y, clear)) continue;
    stones.push({ x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, r: 0.5 + size * 0.7, o: Math.round((0.18 + o * 0.3) * 100) / 100, light });
  }
  const craters: { x: number; y: number; rx: number }[] = [];
  for (let i = 0; i < 60 && craters.length < 4; i++) {
    const x = 20 + rnd() * 320, t = rnd(), rx = 7 + rnd() * 9;
    const y = top(x) + 10 + t * Math.max(0, 214 - top(x) - 10);
    if (y > 222 || inside(x, y, clear.map(([bx, by, bw, bh]): Box => [bx - rx, by - 4, bw + rx * 2, bh + 8]))) continue;
    craters.push({ x: Math.round(x), y: Math.round(y), rx: Math.round(rx) });
  }
  return (
    <g aria-hidden="true" data-ground="regolith" clipPath={clip ? `url(#${clip})` : undefined}>
      {craters.map((c, i) => (
        <g key={i}>
          <ellipse cx={c.x} cy={c.y} rx={c.rx} ry={c.rx * 0.28} fill="#000" opacity={0.28} />
          <path d={`M${c.x - c.rx} ${c.y} A${c.rx} ${c.rx * 0.28} 0 0 0 ${c.x + c.rx} ${c.y}`} fill="none" stroke="#dfe1e6" strokeWidth={0.7} opacity={0.3} />
        </g>
      ))}
      {stones.map((s, i) => (
        <circle key={i} cx={s.x} cy={s.y} r={s.r} fill={s.light ? '#dfe1e6' : '#000'} opacity={s.light ? s.o * 0.6 : s.o} />
      ))}
    </g>
  );
}

function Sun({ x, y, r = 9 }: { x: number; y: number; r?: number }) {
  return (
    <>
      <circle cx={x} cy={y} r={r * 2.4} fill={SUN} opacity={0.14} />
      <circle cx={x} cy={y} r={r} fill={SUN} />
    </>
  );
}

/** The Sun at the pole, at its highest of the month, beside the Sun's noon height at a site far from the pole: both at their true angles. */
export function LowSun({ high, low, site, className = PANEL, sky }: { high: number; low: number; site: string; className?: string; sky?: DrawingSky }) {
  const o = { x: 44, y: 188 };
  const a = ray(o.x, o.y, 168, high);
  const b = ray(o.x, o.y, 262, low);
  return (
    <svg viewBox="0 0 360 230" role="img" aria-label={`How high the Sun gets, drawn to scale. Where ${site} landed, far from the pole, the Sun climbs high in the sky. Near the south pole it stays just above the ground.`} className={className}>
      {sky && <NightSky id="lowsun" seed={11} floor={188} glow={{ x: b.x, y: b.y, r: 84, colour: SUN }} clear={[[a.x - 14, a.y - 16, 360, 32], [150, b.y - 44, 210, 26]]} />}
      {sky ? <rect x={0} y={188} width={360} height={42} fill="url(#lowsun-ground)" opacity={0.8} /> : <rect x={0} y={188} width={360} height={42} fill={GROUND} opacity={0.55} />}
      {sky && <Regolith seed={12} top={() => 188} />}
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
export function HillShadow({ km, dark, className = PANEL, sky }: { km: number; dark: string; className?: string; sky?: DrawingSky }) {
  const hills = 'M0 175 L40 150 L95 80 L130 120 L165 150 L200 160 L235 150 L262 112 L290 150 L330 170 L360 175 L360 230 L0 230 Z';
  return (
    <svg viewBox="0 0 360 230" role="img" aria-label={`A low Sun and two hills, not to scale. One hilltop stands above the other hill's shadow and has sunlight all month. A place ${km} km away, behind the hill, is dark ${dark}.`} className={className}>
      {sky && <NightSky id="hills" seed={23} floor={150} glow={{ x: 332, y: 96, r: 90, colour: SUN }} clear={[[6, 34, 160, 26]]} />}
      <line x1={332} y1={96} x2={150.4} y2={137.5} stroke={SUN} strokeWidth={1.2} opacity={0.7} />
      <line x1={332} y1={96} x2={95} y2={80} stroke={SUN} strokeWidth={1.2} opacity={0.7} />
      <Sun x={332} y={96} />
      <path d={hills} fill={sky ? 'url(#hills-rock)' : '#3a3d44'} />
      {sky && (
        <>
          <defs>
            <linearGradient id="hills-rock" gradientUnits="userSpaceOnUse" x1="0" y1="80" x2="0" y2="230">
              <stop offset="0" stopColor="#50545c" />
              <stop offset="0.5" stopColor="#3a3d44" />
              <stop offset="1" stopColor="#23252a" />
            </linearGradient>
            <clipPath id="hills-clip">
              <path d={hills} />
            </clipPath>
          </defs>
          <Regolith seed={24} clip="hills-clip" top={(x) => (x < 95 ? 175 - (x / 95) * 60 : x < 262 ? 130 + Math.abs(x - 180) * 0.1 : 150)} clear={[[110, 186, 180, 26], [186, 146, 28, 28]]} />
        </>
      )}
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
export function EarthPeek({ className = PANEL, sky }: { className?: string; sky?: DrawingSky }) {
  return (
    <svg viewBox="0 0 360 230" role="img" aria-label="Earth half risen over the hills. It stays in one part of the sky and moves a little up and down, so sometimes it is above the hills and sometimes hidden behind them." className={className}>
      {sky && <NightSky id="earth" seed={37} floor={150} glow={{ x: 196, y: 150, r: 96, colour: EARTH, strength: 0.34 }} clear={[[8, 18, 240, 28], [236, 88, 24, 52]]} />}
      <line x1={248} x2={248} y1={96} y2={132} stroke="#c6c8cc" strokeWidth={1.4} />
      <path d="M242 103 L248 94 L254 103 M242 125 L248 134 L254 125" fill="none" stroke="#c6c8cc" strokeWidth={1.4} />
      <g className="motion-safe:animate-[earth-peek_7s_ease-in-out_infinite_alternate]">
        <circle cx={196} cy={150} r={40} fill={EARTH} opacity={0.16} />
        <circle cx={196} cy={150} r={24} fill={EARTH} />
        <path d="M196 126 a24 24 0 0 1 0 48 a34 34 0 0 0 0 -48 Z" fill="#000" opacity={0.35} />
      </g>
      <path d="M0 168 L46 150 L92 160 L140 146 L196 152 L252 142 L300 156 L360 148 L360 230 L0 230 Z" fill={sky ? 'url(#earth-ground)' : GROUND} stroke={EDGE} strokeWidth={1} />
      {sky && <Regolith seed={38} top={() => 170} />}
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
