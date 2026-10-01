/** A blue disc above a curved horizon line: Earth over the lunar limb. */
export function BrandMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="23.5" cy="9" r="4.8" fill="var(--stage-earth)" />
      <path d="M2 27 C 9 16.5, 23 14.5, 30.5 20" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
    </svg>
  );
}
