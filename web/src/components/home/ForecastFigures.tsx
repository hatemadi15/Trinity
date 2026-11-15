/** The forecast's small drawings (spec 23.3): where the site is on the Moon, and what a chart shows from the site. Colours are the charts' own. */
const INK = '#f5f5f3';
const SOFT = '#c6c8cc';
const HILL = '#55585f';
const EDGE = '#dfe1e6';
const BODY = { sun: '#f3efe4', earth: '#7fa9ff' } as const;

/** The Moon as seen from Earth, south at the bottom, with the landing site marked at its lower edge. */
export function MoonLocator({ site }: { site: string }) {
  return (
    <svg viewBox="0 0 310 124" role="img" aria-label={`Where this is: ${site} is at the Moon's south pole, at the bottom edge of the Moon as seen from Earth.`} className="block w-full max-w-[310px]">
      <circle cx={58} cy={58} r={50} fill="#30333a" stroke={EDGE} strokeWidth={1} />
      <g fill="#1d1f24">
        <ellipse cx={40} cy={36} rx={17} ry={12} />
        <ellipse cx={70} cy={30} rx={12} ry={8} />
        <ellipse cx={76} cy={52} rx={10} ry={13} />
        <ellipse cx={34} cy={62} rx={9} ry={7} />
      </g>
      <text x={124} y={30} fontSize={14} fill={SOFT}>
        the Moon, seen from Earth
      </text>
      <path d="M66 104 H116" fill="none" stroke={BODY.earth} strokeWidth={1.5} />
      <circle cx={58} cy={104} r={8} fill="none" stroke={BODY.earth} strokeWidth={1.5} opacity={0.5} />
      <circle cx={58} cy={104} r={4} fill={BODY.earth} />
      <text x={124} y={98} fontSize={15} fontWeight={600} fill={INK}>
        this landing site
      </text>
      <text x={124} y={117} fontSize={14} fill={SOFT}>
        at the Moon&apos;s south pole
      </text>
    </svg>
  );
}

/** The ground from the side: the ridge the lander stands on, then the hills between it and the sky's low edge. */
const GROUND = 'M0 138 L20 128 L44 118 L72 118 L98 140 L150 148 L196 132 L232 96 L252 84 L272 98 L296 128 L330 140 L360 144';

const WORDS = {
  sun: { name: 'the Sun', up: 'above the hills: daylight', down: 'behind the hills: night' },
  earth: { name: 'Earth', up: 'above the hills: in view', down: 'behind the hills: out of view' },
} as const;

/**
 * What a forecast chart shows, drawn from the side and not to scale: a lander on the ridge looks toward the Sun (or
 * Earth) across the hills. Above the hills it is seen; lower, the hills hide it.
 */
export function SiteView({ body }: { body: 'sun' | 'earth' }) {
  const c = BODY[body];
  const w = WORDS[body];
  return (
    <svg
      viewBox="0 0 360 170"
      role="img"
      data-site-view={body}
      aria-label={`The view from the landing site, not to scale. A lander stands on a ridge and looks toward ${w.name} across the hills. When ${w.name} is ${w.up.replace(':', ', it is')}. When it is ${w.down.replace(':', ', it is')}.`}
      className="block w-full max-w-[420px]"
    >
      {/* The line of sight that clears the hills, and the one they stop. */}
      <line x1={58} y1={100} x2={326} y2={44} stroke={c} strokeWidth={1.3} opacity={0.8} />
      <line x1={58} y1={100} x2={220} y2={107} stroke={c} strokeWidth={1.3} strokeDasharray="3 5" opacity={0.8} />
      <circle cx={326} cy={44} r={22} fill={c} opacity={0.14} />
      <circle cx={326} cy={44} r={9} fill={c} />
      <circle cx={326} cy={112} r={9} fill="none" stroke={c} strokeWidth={1.6} strokeDasharray="3 4" />
      <path d={`${GROUND} L360 170 L0 170 Z`} fill={HILL} />
      <path d={GROUND} fill="none" stroke={EDGE} strokeWidth={1} />
      {/* The lander: body, legs, a mast and a panel turned to the low light. */}
      <g stroke={INK} strokeWidth={1.6} strokeLinecap="round" fill="none">
        <path d="M49 118 L53 109 M67 118 L63 109 M58 100 V92" />
        <path d="M70 96 V110" strokeWidth={3} />
      </g>
      <rect x={51} y={100} width={14} height={9} rx={1.5} fill={INK} />
      <circle cx={58} cy={91} r={2.4} fill={INK} />
      <text x={10} y={76} fontSize={15} fontWeight={600} fill={INK}>
        you are here
      </text>
      <text x={350} y={20} textAnchor="end" fontSize={15} fill={INK}>
        {w.up}
      </text>
      <text x={350} y={162} textAnchor="end" fontSize={15} fill={INK}>
        {w.down}
      </text>
    </svg>
  );
}
