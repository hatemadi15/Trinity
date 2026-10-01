import type { CSSProperties, ReactNode } from 'react';

/**
 * Three small drawings for "Why the south pole is hard". Illustrations, not data: they always sit on
 * the black stage, whatever the theme. Their labels are page text laid over the drawing, so the words
 * keep their size when the drawing gets smaller. Every drawing starts with its own title line.
 */

function Frame({ children, labels }: { children: ReactNode; labels: ReactNode }) {
  return (
    <div aria-hidden="true" className="stage">
      <svg viewBox="0 0 380 190" className="block w-full">
        {children}
      </svg>
      {labels}
    </div>
  );
}

function Label({ children, soft = false, className = '', style }: { children: ReactNode; soft?: boolean; className?: string; style?: CSSProperties }) {
  return (
    <span data-label="" className={`block whitespace-nowrap ${soft ? 'text-stage-ink-2' : 'text-stage-ink'} ${className}`} style={{ fontSize: 15, lineHeight: '21px', ...style }}>
      {children}
    </span>
  );
}

/** The Sun's monthly path: a low circle around the horizon. */
export function SunNeverClimbs() {
  return (
    <Frame
      labels={
        <div className="absolute left-[5%] top-[9%]">
          <Label>The Sun&apos;s path over one month</Label>
          <Label soft>a low circle around the horizon</Label>
        </div>
      }
    >
      <ellipse cx="190" cy="118" rx="150" ry="20" fill="none" stroke="var(--stage-sun)" strokeWidth="2" strokeDasharray="3 6" />
      <path d="M0 132 C 60 120, 110 138, 170 128 S 290 118, 380 130 L 380 190 L 0 190 Z" fill="var(--hill)" />
      <circle cx="318" cy="107" r="11" fill="var(--stage-sun)" />
    </Frame>
  );
}

/**
 * A lit peak and a point in its shadow, with the real pair of numbers from the catalogue. `site` is the
 * short name of the shaded point, as the page names it. Numbers keep their unit on the same line.
 */
export function HillsDecide({ rimPct, sitePct, km, site = 'Rim 2' }: { rimPct: number; sitePct: number; km: number; site?: string }) {
  const rim = rimPct >= 99.95 ? 'sunlit all month' : `sunlit ${Math.round(rimPct)}\u00a0% of the month`;
  return (
    <Frame
      labels={
        <>
          <Label className="absolute left-[5%] top-[9%]">{`The same month, ${km} km apart`}</Label>
          {/* Right of the green dot on the peak, on two short lines so they stay clear of it; and inside the shadow under the red dot. */}
          <div className="absolute right-[3%] top-[22%] text-right">
            <Label className="font-semibold">rim summit</Label>
            <Label>{rim}</Label>
          </div>
          <Label className="absolute bottom-[4%] right-[3%] rounded-[5px] bg-stage/80 px-1.5">{`${site}: sunlit ${sitePct}\u00a0% of the month`}</Label>
        </>
      }
    >
      <path d="M0 150 L 70 146 L 130 80 L 176 62 L 214 96 L 262 150 L 380 146 L 380 190 L 0 190 Z" fill="var(--hill)" />
      <path d="M214 96 L 262 150 L 380 146 L 380 190 L 262 190 Z" fill="#17181a" />
      <circle cx="38" cy="96" r="11" fill="var(--stage-sun)" />
      <line x1="52" y1="94" x2="170" y2="64" stroke="var(--stage-sun)" strokeWidth="1.5" strokeDasharray="4 5" />
      <circle data-place="rim" cx="176" cy="60" r="8" fill="#46c98b" stroke="var(--stage-ink)" strokeWidth="1.5" />
      <circle data-place="site" cx="310" cy="146" r="8" fill="#ff7d72" stroke="var(--stage-ink)" strokeWidth="1.5" />
    </Frame>
  );
}

/** Earth above the hills and, dotted, below them. */
export function EarthSetsToo() {
  return (
    <Frame
      labels={
        <div className="absolute left-[5%] top-[9%]">
          <Label>Earth stays in one direction</Label>
          <Label soft>and bobs above and below the hills</Label>
        </div>
      }
    >
      <path d="M0 128 C 70 116, 120 136, 190 122 S 300 110, 380 126 L 380 190 L 0 190 Z" fill="var(--hill)" />
      <circle cx="250" cy="92" r="13" fill="var(--stage-earth)" />
      <path d="M286 150 L 286 86 M 279 95 L 286 86 L 293 95 M 279 141 L 286 150 L 293 141" stroke="var(--stage-ink)" strokeOpacity="0.8" strokeWidth="2" fill="none" />
      <circle cx="250" cy="152" r="13" fill="none" stroke="var(--stage-earth)" strokeWidth="2" strokeDasharray="3 4" />
    </Frame>
  );
}
