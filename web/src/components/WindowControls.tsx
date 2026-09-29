'use client';
import { WINDOW_DAYS, type WindowDays } from '@/lib/store/explore';

export function WindowControls({
  startUtc,
  days,
  onWindow,
  onBestWindow,
  bestWindowNote,
}: {
  startUtc: string;
  days: WindowDays;
  onWindow: (startUtc: string, days: WindowDays) => void;
  /** When given, shows the best-window button for the current window length. */
  onBestWindow?: (days: WindowDays) => void;
  bestWindowNote?: string | null;
}) {
  return (
    <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
      <label className="flex flex-col gap-1 text-sm text-ink-2">
        Start date (UTC)
        <input
          type="date"
          value={startUtc.slice(0, 10)}
          min="2024-01-02"
          max="2036-12-30"
          onChange={(e) => e.target.value && onWindow(`${e.target.value}T00:00:00`, days)}
          className="rounded-md border border-line bg-panel px-2 py-1 text-ink"
        />
      </label>
      <fieldset className="flex items-center gap-1 text-sm">
        <legend className="mb-1 text-ink-2">Window</legend>
        {WINDOW_DAYS.map((d) => (
          <label
            key={d}
            className={`cursor-pointer rounded-md border px-3 py-1 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-sun-bright ${
              d === days ? 'border-sun bg-panel text-ink' : 'border-line text-ink-2'
            }`}
          >
            <input
              type="radio"
              name="window"
              className="sr-only"
              checked={d === days}
              onChange={() => onWindow(startUtc, d)}
              aria-label={`${d} days`}
            />
            {d} days
          </label>
        ))}
      </fieldset>
      {onBestWindow && (
        <div className="flex max-w-[320px] flex-col gap-1">
          <button
            type="button"
            onClick={() => onBestWindow(days)}
            className="w-fit rounded-md border border-sun px-3 py-1 text-sm text-ink hover:bg-panel"
          >
            Best {days}-day window from here
          </button>
          {bestWindowNote && <span className="text-xs text-ink-3">{bestWindowNote}</span>}
        </div>
      )}
    </div>
  );
}
