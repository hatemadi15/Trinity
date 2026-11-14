/**
 * What the power figures assume, and what they leave out, in the same words wherever the lander is set or its
 * power is shown: the lander dialog, Explore's numbers, the verdict and the brief.
 */
export const POWER_ASSUMPTIONS = [
  'A constant load: the lander uses the same power every hour, day and night.',
  'A constant panel efficiency: the panel turns the same share of sunlight into power, whatever its temperature or age.',
  'An ideal battery: it gives back all it stores, with no loss to cold or age.',
  'One height for the panel and the radio: both look over the hills from the top of the mast.',
];

/** Electrical energy is not thermal survival or a restart after the night. */
export const ENERGY_ONLY = 'These figures count electrical energy only. They do not show whether the lander stays warm enough through the night, or whether it starts again after it.';

/** The same in one line, for the printed brief. */
export const POWER_SCOPE_LINE =
  'The power figures assume a constant load, a constant panel efficiency, an ideal battery (no loss to cold or age) and one mast height shared by the panel and the radio.';

export function PowerScope({ className = '' }: { className?: string }) {
  return (
    <div className={`text-[15px] text-ink-2 ${className}`}>
      <p>The power figures assume:</p>
      <ul className="mt-1 list-disc pl-5">
        {POWER_ASSUMPTIONS.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <p className="mt-2 text-ink">{ENERGY_ONLY}</p>
    </div>
  );
}
