'use client';
import { useState } from 'react';
import type { Site } from '@/lib/data/loaders';
import { normalizeLon } from '@/lib/engine/geometry';

const GROUPS: [string, string][] = [
  ['classic', 'Classic south-pole sites'],
  ['clps_landed', 'CLPS landings'],
  ['reference', 'Reference'],
  ['custom', 'Custom'],
];

export function SiteSelect({
  sites,
  value,
  onSelect,
  onCustom,
  customError,
  busy,
}: {
  sites: Site[];
  value: string | null;
  onSelect: (id: string) => void;
  onCustom: (lat: number, lon: number) => void;
  customError: string | null;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [lat, setLat] = useState('-89.5');
  const [lon, setLon] = useState('0');
  const latNum = Number(lat);
  const lonNum = Number(lon);
  const valid = Number.isFinite(latNum) && Number.isFinite(lonNum) && latNum >= -90 && latNum <= 90;
  return (
    <div className="flex flex-wrap items-end gap-4">
      <label className="flex flex-col gap-1 text-sm text-ink-2">
        Site
        <select
          value={value ?? ''}
          onChange={(e) => onSelect(e.target.value)}
          className="min-w-[280px] rounded-md border border-line bg-panel px-2 py-1 text-ink"
        >
          {GROUPS.map(([cat, label]) => {
            const items = sites.filter((s) => s.category === cat && s.polar);
            return items.length ? (
              <optgroup key={cat} label={label}>
                {items.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </optgroup>
            ) : null;
          })}
        </select>
      </label>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="rounded-md border border-line px-3 py-1 text-sm text-ink-2 hover:text-ink"
      >
        Custom site
      </button>
      {open && (
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) onCustom(latNum, normalizeLon(lonNum));
          }}
        >
          <label className="flex flex-col gap-1 text-sm text-ink-2">
            Latitude
            <input
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              inputMode="decimal"
              className="w-28 rounded-md border border-line bg-panel px-2 py-1 text-ink"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-ink-2">
            Longitude
            <input
              value={lon}
              onChange={(e) => setLon(e.target.value)}
              inputMode="decimal"
              className="w-28 rounded-md border border-line bg-panel px-2 py-1 text-ink"
            />
          </label>
          <button
            type="submit"
            disabled={!valid || busy}
            className="rounded-md bg-sun px-3 py-1 text-sm font-medium text-night hover:bg-sun-bright disabled:opacity-50"
          >
            {busy ? 'Computing…' : 'Compute skyline'}
          </button>
          {customError && (
            <p role="alert" className="basis-full text-sm text-bad">
              {customError}. Custom sites need LOLA coverage south of 60°S.
            </p>
          )}
        </form>
      )}
    </div>
  );
}
