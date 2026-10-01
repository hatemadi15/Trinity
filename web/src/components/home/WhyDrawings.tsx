import type { CSSProperties, ReactNode } from 'react';

/**
 * Three small drawings for "Why the south pole is hard". Illustrations, not data: they always sit on
 * the dark stage colours, whatever the theme. Their labels are page text laid over the drawing, so the
 * words keep their size when the drawing gets smaller.
 */

function Frame({ children, labels }: { children: ReactNode; labels: ReactNode }) {
  return (
    <div aria-hidden="true" className="relative overflow-hidden rounded-xl" style={{ background: 'var(--stage)' }}>
      <svg viewBox="0 0 380 190" className="block w-full">
        {children}
      </svg>
      {labels}
    </div>
  );
}

function Label({ children, soft = false, className = '', style }: { children: ReactNode; soft?: boolean; className?: string; style?: CSSProperties }) {
  return (
    <span data-label="" className={`block whitespace-nowrap ${soft ? 'text-stage-ink-2' : 'text-stage-ink'} ${className}`} style={{ fontSize: soft ? 14 : 15, lineHeight: '21px', ...style }}>
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

/** A lit peak and a point in its shadow, with the real pair of numbers from the catalogue. */
export function HillsDecide({ rimPct, sitePct, km }: { rimPct: number; sitePct: number; km: number }) {
  const rim = rimPct >= 99.95 ? 'crater rim: sunlight all month' : `crater rim: ${Math.round(rimPct)} %`;
  return (
    <Frame
      labels={
        <>
          <Label className="absolute right-[3%] top-[9%]">{rim}</Label>
          <Label className="absolute right-[3%] top-[52%]">{`${km} km away: ${sitePct} %`}</Label>
        </>
      }
    >
      <path d="M0 150 L 70 146 L 130 80 L 176 62 L 214 96 L 262 150 L 380 146 L 380 190 L 0 190 Z" fill="var(--hill)" />
      <path d="M214 96 L 262 150 L 380 146 L 380 190 L 262 190 Z" fill="#17181a" />
      <circle cx="38" cy="96" r="11" fill="var(--stage-sun)" />
      <line x1="52" y1="94" x2="170" y2="64" stroke="var(--stage-sun)" strokeWidth="1.5" strokeDasharray="4 5" />
      <circle cx="176" cy="60" r="6" fill="#46c98b" />
      <circle cx="310" cy="146" r="6" fill="#ff7d72" />
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
