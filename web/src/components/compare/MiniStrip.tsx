import type { Series } from '@/lib/engine/metrics';

/** The hours where `on` holds, as [from, to) runs. */
function runs(n: number, on: (h: number) => boolean): [number, number][] {
  const out: [number, number][] = [];
  let from = -1;
  for (let h = 0; h <= n; h++) {
    const yes = h < n && on(h);
    if (yes && from < 0) from = h;
    if (!yes && from >= 0) {
      out.push([from, h]);
      from = -1;
    }
  }
  return out;
}

/**
 * A site's period in two thin rows on the stage: gold where any of the Sun shows, blue where Earth is
 * in view. Small enough for a table row; the row's figures carry the numbers.
 */
export function MiniStrip({ series, name, period }: { series: Series; name: string; period: string }) {
  const n = series.hours;
  const sun = runs(n, (h) => series.sunFraction[h] > 0);
  const earth = runs(n, (h) => series.earthVisible[h] === 1);
  return (
    <div role="img" aria-label={`The Sun and Earth at ${name} over ${period}: gold while the Sun shows, blue while Earth is in view`} className="stage h-[30px] w-[150px]">
      <svg viewBox={`0 0 ${n} 30`} preserveAspectRatio="none" aria-hidden="true" className="absolute inset-0 h-full w-full">
        {sun.map(([a, b]) => (
          <rect key={`s${a}`} x={a} y={5} width={b - a} height={8} fill="var(--stage-sun)" />
        ))}
        {earth.map(([a, b]) => (
          <rect key={`e${a}`} x={a} y={17} width={b - a} height={8} fill="var(--stage-earth)" />
        ))}
      </svg>
    </div>
  );
}
