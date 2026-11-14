import type { CSSProperties, ReactNode } from 'react';

/**
 * Three small drawings for "Why the south pole is hard". Illustrations, not data: they always sit on
 * the black stage, whatever the theme. Their labels are page text laid over the drawing, so the words
 * keep their size when the drawing gets smaller. Every drawing starts with its own title line, and names
 * what is in it where it stands (spec 23): the Sun, Earth, the Moon's ground and hills, a lander.
 *
 * Each plays what it says while the pointer is on its card (spec 23, a `group` around it): the Sun runs its low
 * circle, the light runs to the summit, Earth bobs behind the hills and the radio flickers. Still otherwise, and
 * with reduced motion.
 */
const ANT = 'group-hover:animate-[dash_1.4s_linear_infinite]';
const VIEW = '0 0 380 230';

function Frame({ children, labels }: { children: ReactNode; labels: ReactNode }) {
  return (
    <div aria-hidden="true" className="stage transition-[border-color,box-shadow] duration-500 group-hover:border-[#7fa9ff]/60 group-hover:shadow-[0_0_40px_-14px_rgba(127,169,255,0.7)]">
      <svg viewBox={VIEW} className="block w-full">
        {children}
      </svg>
      {labels}
    </div>
  );
}

function Label({ children, soft = false, chip = false, className = '', style }: { children: ReactNode; soft?: boolean; chip?: boolean; className?: string; style?: CSSProperties }) {
  return (
    <span
      data-label=""
      className={`block whitespace-nowrap ${soft ? 'text-stage-ink-2' : 'text-stage-ink'} ${chip ? 'rounded-[5px] bg-stage/80 px-1.5' : ''} ${className}`}
      style={{ fontSize: 15, lineHeight: '21px', ...style }}
    >
      {children}
    </span>
  );
}

/** A small solar lander standing on the ground at x, y: legs, body, its panel on a mast and, if asked, a dish. */
function Lander({ x, y, dish = false }: { x: number; y: number; dish?: boolean }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d="M-8 0 L-4 -7 M8 0 L4 -7" stroke="#c6c8cc" strokeWidth="1.6" strokeLinecap="round" />
      <rect x="-6" y="-14" width="12" height="8" rx="1.5" fill="#d9dbe0" />
      <line x1="0" y1="-14" x2="0" y2="-22" stroke="#c6c8cc" strokeWidth="1.4" />
      <rect x="-10" y="-27" width="20" height="5" rx="1" fill="#3f6fe0" stroke="#a8c6ff" strokeWidth="0.8" />
      {dish && (
        <>
          <line x1="4" y1="-14" x2="9" y2="-21" stroke="#c6c8cc" strokeWidth="1.4" />
          <path d="M5.5 -23.5 a5 5 0 0 0 7 4" fill="none" stroke="#e6e7ea" strokeWidth="1.6" strokeLinecap="round" />
        </>
      )}
    </g>
  );
}

/** A short line from a label to what it names. */
const Lead = ({ d }: { d: string }) => <path d={d} fill="none" stroke="var(--stage-ink-2)" strokeOpacity="0.7" strokeWidth="1" />;

/** The Sun's monthly path: a low circle around the horizon, round a lander at the pole. */
export function SunNeverClimbs() {
  return (
    <Frame
      labels={
        <>
          <div className="absolute left-[5%] top-[7%]">
            <Label>The Sun&apos;s path over one month</Label>
            <Label soft>a low circle around the horizon</Label>
          </div>
          <Label chip className="absolute left-[84%] top-[36%] -translate-x-1/2 font-semibold">
            Sun
          </Label>
          <Label chip soft className="absolute left-1/2 top-[79%] -translate-x-1/2">
            a lander at the south pole
          </Label>
          <Label soft className="absolute bottom-[3%] left-[4%]">
            the Moon&apos;s ground and hills
          </Label>
        </>
      }
    >
      {/* The far half of the Sun's path, behind the hills; the hills; the near half, in front of them. */}
      <path d="M40 150 A150 22 0 0 1 340 150" fill="none" stroke="var(--stage-sun)" strokeWidth="2" strokeDasharray="3 6" className={ANT} />
      {/* The Sun before the hills, so at the front of its path it dips behind them. */}
      <circle cx="318" cy="136" r="11" fill="var(--stage-sun)" className="group-hover:animate-[orbit-sun_6s_ease-in-out_infinite]" style={{ filter: 'drop-shadow(0 0 6px rgba(243,239,228,0.8))' }} />
      <path d="M0 158 C 60 146, 110 164, 170 154 S 290 144, 380 156 L 380 230 L 0 230 Z" fill="var(--hill)" />
      <path d="M40 150 A150 22 0 0 0 340 150" fill="none" stroke="var(--stage-sun)" strokeOpacity="0.55" strokeWidth="2" strokeDasharray="3 6" className={ANT} />
      <Lander x={190} y={156} />
      <Lead d="M318 105 L318 123" />
    </Frame>
  );
}

/**
 * A lit peak and a point in its shadow, with the real pair of numbers from the catalogue. `site` is the
 * short name of the shaded point, as the page names it. Numbers keep their unit on the same line.
 */
export function HillsDecide({ rimPct, sitePct, km, site = 'Rim 2' }: { rimPct: number; sitePct: number; km: number; site?: string }) {
  const rim = rimPct >= 99.95 ? 'sunlit all month' : `sunlit ${Math.round(rimPct)} % of the month`;
  return (
    <Frame
      labels={
        <>
          <Label className="absolute left-[5%] top-[7%]">{`The same month, ${km} km apart`}</Label>
          {/* Right of the green dot on the peak, on two short lines so they stay clear of it; and inside the shadow under the red dot. */}
          <div className="absolute right-[3%] top-[22%] text-right">
            <Label className="font-semibold">rim summit</Label>
            <Label>{rim}</Label>
          </div>
          <Label chip className="absolute left-[3%] top-[62%] font-semibold">
            Sun, low
          </Label>
          <Label chip soft className="absolute left-[61%] top-[63%]">
            shadow of the rim
          </Label>
          <Label chip className="absolute bottom-[3%] right-[3%]">{`${site}: sunlit ${sitePct} % of the month`}</Label>
        </>
      }
    >
      <path d="M0 186 L 70 182 L 130 104 L 176 86 L 214 122 L 262 186 L 380 182 L 380 230 L 0 230 Z" fill="var(--hill)" />
      <path d="M214 122 L 262 186 L 380 182 L 380 230 L 262 230 Z" fill="#17181a" />
      <circle cx="38" cy="122" r="11" fill="var(--stage-sun)" style={{ filter: 'drop-shadow(0 0 6px rgba(243,239,228,0.8))' }} />
      <line x1="52" y1="119" x2="170" y2="88" stroke="var(--stage-sun)" strokeWidth="1.5" strokeDasharray="4 5" className={ANT} />
      <Lander x={176} y={86} />
      <circle data-place="rim" cx="176" cy="96" r="8" fill="#63d39b" stroke="var(--stage-ink)" strokeWidth="1.5" className="origin-center [transform-box:fill-box] transition-transform duration-500 group-hover:scale-125" />
      <circle data-place="site" cx="310" cy="182" r="8" fill="#ff8a80" stroke="var(--stage-ink)" strokeWidth="1.5" />
    </Frame>
  );
}

/** Earth above the hills and, dotted, below them; a lander's radio reaches it only while it is above. */
export function EarthSetsToo() {
  return (
    <Frame
      labels={
        <>
          <div className="absolute left-[5%] top-[7%]">
            <Label>Earth stays in one direction</Label>
            <Label soft>and bobs above and below the hills</Label>
          </div>
          <Label chip className="absolute left-[75%] top-[33%] font-semibold">
            Earth
          </Label>
          <Label chip soft className="absolute left-[3%] top-[84%]">
            lander
          </Label>
          <Label chip soft className="absolute bottom-[3%] right-[3%]">
            below the hills: no radio
          </Label>
        </>
      }
    >
      {/* Earth before the hills, so as it bobs down it goes behind them. */}
      <circle cx="250" cy="100" r="13" fill="var(--stage-earth)" className="group-hover:animate-[bob_3.2s_ease-in-out_infinite]" style={{ filter: 'drop-shadow(0 0 8px rgba(127,169,255,0.8))' }} />
      <path d="M0 164 C 70 152, 120 172, 190 158 S 300 146, 380 162 L 380 230 L 0 230 Z" fill="var(--hill)" />
      <Lander x={70} y={160} dish />
      {/* The radio, from the lander's dish towards Earth, while Earth is in view. */}
      <g fill="none" stroke="var(--stage-earth)" strokeWidth="1.6" strokeLinecap="round" className="group-hover:animate-[pulse-dot_1.2s_ease-in-out_infinite]">
        <path d="M92 132 q8 -8 16 -6" opacity="0.9" />
        <path d="M98 122 q13 -12 26 -10" opacity="0.6" />
        <path d="M104 112 q18 -16 36 -14" opacity="0.35" />
      </g>
      <path d="M286 186 L 286 98 M 279 107 L 286 98 L 293 107 M 279 177 L 286 186 L 293 177" stroke="var(--stage-ink)" strokeOpacity="0.8" strokeWidth="2" fill="none" />
      <circle cx="250" cy="190" r="13" fill="none" stroke="var(--stage-earth)" strokeWidth="2" strokeDasharray="3 4" className="transition-opacity duration-300 group-hover:opacity-0" />
    </Frame>
  );
}
