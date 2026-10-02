/** Key samples drawn on the stage, as the pictures draw their lines. */
export function Swatch({ color }: { color: string }) {
  return (
    <span aria-hidden="true" className="flex h-5 w-9 shrink-0 items-center justify-center rounded bg-stage">
      <svg width={26} height={8}>
        <line x1={2} y1={4} x2={24} y2={4} stroke={color} strokeWidth={3.4} strokeLinecap="round" />
      </svg>
    </span>
  );
}

/** The dotted sample in both colours, as the pictures draw a hidden Sun and a hidden Earth. */
export function DottedSwatch() {
  return (
    <span aria-hidden="true" className="flex h-5 w-9 shrink-0 items-center justify-center rounded bg-stage">
      <svg width={26} height={12}>
        <line x1={2} y1={3.5} x2={24} y2={3.5} stroke="var(--stage-sun)" strokeWidth={2.2} strokeDasharray="2 6" strokeLinecap="round" />
        <line x1={2} y1={8.5} x2={24} y2={8.5} stroke="var(--stage-earth)" strokeWidth={2.2} strokeDasharray="2 6" strokeLinecap="round" />
      </svg>
    </span>
  );
}

/** The grey of the hills with their lit edge. */
export function HillSwatch() {
  return (
    <span aria-hidden="true" data-swatch="" className="flex h-5 w-9 shrink-0 items-center justify-center rounded bg-stage">
      <span className="block h-2.5 w-6 rounded-sm bg-hill" style={{ borderTop: '1.5px solid var(--hill-edge)' }} />
    </span>
  );
}
